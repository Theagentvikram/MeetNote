# MeetNote

AI meeting assistant for macOS. Records meetings, transcribes with speaker
labels (YOU / OTHER), summarises, and gives **live AI coaching** through a
floating overlay while you're in a call.

Built by [TechAbhee](https://github.com/Theagentvikram). Electron desktop app
+ a Groq-powered FastAPI backend deployed on Render.

---

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│  MeetNote.app (Electron) │  HTTPS  │  Backend (FastAPI on Render)  │
│                          │ ──────► │  https://meetnote-18tt        │
│  • Record mode           │   WSS   │       .onrender.com           │
│  • Live coach overlay    │ ◄─────► │  • /api/transcription/audio   │
│  • Swift audio bridge    │         │  • /ws/sessions/{id}/stream   │
└─────────────────────────┘         │  • Groq Whisper + LLM          │
                                     └──────────────────────────────┘
```

The desktop app talks **only to the Render backend** — both record mode and
live coaching. There is no localhost dependency in shipped builds.

| Mode | What happens | Backend route |
|------|--------------|---------------|
| **Record** | Capture mic + system audio → upload → transcribe + summarise | `POST /api/transcription/audio` |
| **Live coach** | Stream tagged audio blobs over WebSocket → live transcript + coaching suggestions pushed to the floating overlay | `WS /ws/sessions/{id}/stream` |

### Speaker labeling

Speakers are separated by **audio channel**, not by voice diarization:

- **mic track → `YOU`**
- **system audio track → `OTHER`**

This works perfectly for 1:1 calls. In a call with multiple remote
participants, all of them are captured but share the single `OTHER` label —
the transcript cannot tell remote speakers apart. True per-speaker diarization
(Speaker 1/2/3) would require a paid STT provider (Deepgram/AssemblyAI) or a
self-hosted pyannote model on a larger instance; not enabled in this free build.

---

## Install (macOS)

1. Download the latest `MeetNote-<version>-arm64.dmg` from
   [Releases](https://github.com/Theagentvikram/MeetNote/releases).
2. Open the DMG, drag **MeetNote** to **Applications**.
3. First launch: the app is ad-hoc signed, so right-click → **Open** to bypass
   Gatekeeper (or run `xattr -cr /Applications/MeetNote.app`).
4. Grant permissions when prompted:
   - **Microphone** — record your voice
   - **Screen Recording** — capture system audio from Zoom/Meet/Teams

That's it. The app points at the hosted backend out of the box — no setup.

---

## Repo layout

```
.
├── main.js                 # Electron main process
├── renderer.js             # Electron renderer (UI logic)
├── index.html / styles.css # UI
├── overlays/               # Floating overlay windows
│   ├── overlay.html        #   recording indicator
│   └── coach-overlay.html  #   live coaching panel
├── swift-bridge/           # Swift audio-capture source (compiled in dev)
├── swift-bridge-prebuilt/  # Pre-compiled bridge binary (bundled in DMG)
├── entitlements.mac.plist  # mac permissions for codesign
├── assets/                 # icons
├── backend/                # FastAPI backend (deployed to Render)
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
├── render.yaml             # Render deploy config (rootDir: backend)
└── package.json            # Electron + electron-builder config
```

---

## Development

### Desktop app

```bash
npm install
npm run dev        # launches Electron against the Render backend
```

### Build the DMG

```bash
npm run build:mac  # → dist/mac-arm64/MeetNote.app + dist/MeetNote-*.dmg
```

### Backend (local, optional)

The shipped app always uses Render. To run the backend locally for
development:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # add your GROQ_API_KEY
uvicorn main:app --reload --port 8000
```

---

## Deployment (Render)

The backend deploys via **Docker** from `render.yaml`, with **Root Directory =
`backend`** and `backend/Dockerfile`.

1. Connect this repo as a Render Blueprint, or point an existing Web Service at it.
2. Set **Root Directory** to `backend` and **Runtime** to `Docker`
   (Render finds `backend/Dockerfile`).
3. Add the `GROQ_API_KEY` env var in the Render dashboard (marked `sync: false`).
4. Deploy. Verify the coach route exists:

```bash
curl -s https://meetnote-18tt.onrender.com/openapi.json \
  | python3 -c "import sys,json; print(sorted(json.load(sys.stdin)['paths']))"
# must include /ws/sessions/{session_id}/stream
```

If the WebSocket route is missing, the Root Directory is wrong (it must be
`backend`, not the repo root).

---

## License

MIT © TechAbhee
