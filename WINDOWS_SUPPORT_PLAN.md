# Windows Support Plan — MeetNote Live Coach

## Context

The app is fully working on **macOS**. Audio capture (mic + system) is done by a **native
Swift bridge** (`swift-bridge/`, using `ScreenCaptureKit` + `AVAudioEngine`) spawned as a
subprocess by `main.js`. Everything else is cross-platform:
- Electron shell, renderer UI, overlay (`setContentProtection` works on Windows too)
- Record mode → **Render cloud** backend (`/api/transcription/audio`) — platform-agnostic ✅
- Live mode → **localhost** FastAPI backend (WS + faster-whisper/Groq) — platform-agnostic ✅
  (just needs Python running on the machine, or deployed to cloud)

**The only Windows gap: native audio capture.** On Windows the Swift bridge can't run, so:
- `swift-capture-start` throws *"only available on macOS"* (main.js).
- Record mode currently has **no Windows capture** → no mic/system audio.
- Live mode's renderer capture (`getUserMedia` mic + `getDisplayMedia` loopback) **can work on
  Windows** with changes, since it's Chromium-based, not Swift.

This plan adds Windows capture for **both** modes.

---

## Strategy: two layers

### Layer 1 (fastest win) — Live mode on Windows via Electron `getDisplayMedia`
Live mode already streams audio from the **renderer** (mic getUserMedia + system loopback),
NOT the Swift bridge. On Windows, Electron supports **loopback audio** capture via
`session.setDisplayMediaRequestHandler(... { audio: 'loopback' })` — already partly wired in
`main.js` `configureDisplayMediaCapture()`. So:
- **Mic (YOU):** `navigator.mediaDevices.getUserMedia({audio})` — works on Windows as-is.
- **System (OTHER):** `getDisplayMedia` with `audio: 'loopback'` — captures what's playing
  (the other person in Meet). Windows Electron supports loopback since Electron 31+.

**Work needed (small):**
1. In `beginLiveSession`, on Windows use `getDisplayMedia({ audio: true, video: {...} })` for the
   system stream instead of the mac persistent-system-stream path. Drop the video track, keep audio.
2. `configureDisplayMediaCapture()` already returns `audio: 'loopback'` — verify it fires on Windows.
3. Tag frames `0x01`/`0x02` exactly as now → backend already handles dual-speaker.
→ **Live mode + coaching overlay works on Windows with ~1 day of work, no native code.**

### Layer 2 (record mode) — native Windows capture helper
Record mode needs a single mixed `.m4a`/`.wav` of mic + system. Build a small **Windows capture
helper** mirroring the Swift bridge's stdin/stdout JSON protocol, so `main.js` can spawn it the
same way (`swift-capture-start/stop` → `win-capture-start/stop`).

**Options for the helper (pick one):**
- **A. C# / .NET + NAudio (recommended).** `WasapiLoopbackCapture` (system audio) +
  `WaveInEvent` (mic), mix, write WAV/MP3. Mature, ~200 lines. Ship as a self-contained .exe.
- **B. Rust + cpal/wasapi.** Smaller binary, more effort.
- **C. Pure Electron renderer (reuse Layer 1) for record too** — capture both via Web Audio,
  `MediaRecorder` to webm, upload. No native helper at all. Lowest effort, slightly less robust
  than WASAPI but fully cross-platform.

**Recommended: C for v1** (reuse the live-mode capture for record mode on Windows — record =
"capture the same mixed stream, upload at end instead of streaming"). Add native NAudio helper
(A) later only if loopback quality is insufficient.

---

## Concrete implementation steps

1. **Capture abstraction in `main.js`:** add `process.platform === 'win32'` branches alongside
   the existing `!== 'darwin'` guards so Windows takes the Electron-capture path, not the Swift path.
2. **`beginLiveSession` (renderer):** branch capture acquisition by platform:
   - mac → current Swift-parity persistent-system-stream
   - win → `getDisplayMedia({audio:true})` for system + `getUserMedia` for mic
   (Both then feed the same dual-channel tagged `MediaRecorder` loop — already built.)
3. **Record mode on Windows:** add a renderer-capture record path (mirror live capture but
   buffer to one webm, POST to the Render `/api/transcription/audio` endpoint on stop). The
   existing `transcribe-audio` IPC already uploads webm — reuse it.
4. **Permissions:** Windows shows its own mic prompt; loopback needs no special permission.
   Remove mac-only permission preflight on Windows (guard already mostly there).
5. **Backend:** unchanged. Render (record) + localhost/cloud (live) both work from Windows.
   ⚠️ If live mode is wanted on the Windows test machine, either run the Python backend there
   (`uvicorn`) or deploy the live WS backend to Render. (Record mode needs neither.)
6. **Packaging:** `npm run build:win` (electron-builder nsis, already configured) → `.exe`.
   For Layer 2A, bundle the NAudio helper via `extraResources` like the Swift binary.

---

## What works per platform after this plan

| Feature | macOS (now) | Windows (after Layer 1) | Windows (after Layer 2) |
|---|---|---|---|
| Live transcript + coach overlay | ✅ | ✅ | ✅ |
| Mic (YOU) capture | ✅ | ✅ | ✅ |
| System (OTHER) capture | ✅ (SCK) | ✅ (loopback) | ✅ (loopback/WASAPI) |
| Overlay hidden in screen-share | ✅ | ✅ (`setContentProtection`) | ✅ |
| Record-then-summarise | ✅ | ⚠️ via renderer capture | ✅ |

## Effort estimate
- **Layer 1 (live on Windows):** ~1 day. Highest value — gets the core product on Windows.
- **Layer 2 (record on Windows):** +0.5 day (option C) or +2 days (option A NAudio).

## Recommendation
Do **Layer 1 first** → live coaching + overlay on Windows with zero native code. Test on the
Windows machine. Add Layer 2 record-mode capture after, only if needed.
