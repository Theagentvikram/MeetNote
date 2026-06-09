'use strict';
const { ipcRenderer } = require('electron');

// ─── Platform ─────────────────────────────────────────────────────────────────
// Single source of truth for platform branching. Set MEETNOTE_FORCE_PLATFORM=win32
// (or darwin) to simulate another OS on your dev machine — this lets us exercise the
// Windows capture path on a Mac without a Windows box. Falls back to the real OS.
const PLATFORM = process.env.MEETNOTE_FORCE_PLATFORM || process.platform;
const IS_MAC = PLATFORM === 'darwin';
const IS_WIN = PLATFORM === 'win32';
if (process.env.MEETNOTE_FORCE_PLATFORM) {
  console.warn(`[platform] FORCED to "${PLATFORM}" (real: ${process.platform}) — simulation mode`);
}

// ─── State ────────────────────────────────────────────────────────────────────
const DEFAULT_BACKEND_URL = 'https://meetnote-18tt.onrender.com';
const LEGACY_BACKEND_HOSTS = new Set(['meetnote-backend.onrender.com']);
const LOCAL_MEETINGS_KEY = 'meetnote.cachedMeetings.v1';
// Swift native capture is mac-only — never use it when simulating/running Windows.
const ENABLE_SWIFT_NATIVE_CAPTURE = IS_MAC;

// Last diagnostic from main's display-media handler (see display-media-diagnostic
// IPC). Lets the "no system audio" error explain WHY on Windows (no sources vs
// exception vs loopback yielded no track) instead of a generic message.
let lastDisplayMediaDiagnostic = null;

let backendUrl       = DEFAULT_BACKEND_URL;
let isRecording      = false;
let mediaRecorder    = null;
let recordedChunks   = [];
let recTimerInterval = null;
let recStartTime     = null;
let micStream        = null;
let sysStream        = null;
let audioCtx         = null;
let vizRAF           = null;
let analyserMic      = null;
let analyserSys      = null;
let previewMicStream = null;
let previewAudioCtx  = null;
let previewAnalyser  = null;
let previewRAF       = null;
let allMeetings      = [];   // in-memory cache loaded from backend
let backendPollTimer = null;
let lastBackendOnline = null;
let usingSwiftNativeCapture = false;
let currentRecordingTitle = '';
let swiftVizInterval = null;
let swiftCaptureTemporarilyDisabled = false;
let systemTestStream = null;
let systemTestAudioCtx = null;
let systemTestAnalyser = null;
let systemTestRAF = null;
let systemTestActive = false;
let systemAudioLive = false;
let systemAudioEndedNotified = false;
let systemStreamSinkEl = null;
let persistentSystemStream = null;
let persistentSystemKeepAliveTimer = null;
let persistentSystemAudioCtx = null;
let persistentSystemSourceNode = null;
let persistentSystemDestinationNode = null;
let recordingMixDestination = null;
let shouldCaptureSystemAudio = true;
let systemReconnectInFlight = false;
let systemAudioReconnectAttempts = 0;
let sysStreamUsesPersistent = false;
let recordingSysTrack = null;
let recordingSysTrackEndedHandler = null;
let systemTestTrack = null;
let systemTestTrackEndedHandler = null;
const MAX_SYSTEM_AUDIO_RECONNECTS = 2;
const SYSTEM_STREAM_KEEPALIVE_MS = 180000;

// ─── Live coaching state ────────────────────────────────────────────────────────
let liveActive          = false;
let liveWs              = null;
let liveSessionId       = null;
let liveMediaRecorder   = null;
let liveMicStream       = null;
let liveAudioCtx        = null;
let liveMixDest         = null;
let liveMicDest         = null;   // YOU channel
let liveSysDest         = null;   // OTHER channel
let liveRecorders       = [];     // active per-channel MediaRecorders
let liveTitle           = '';
const LIVE_BLOB_MS      = 8000;   // 8s window → full sentences, not phrase fragments

function attachSystemStreamSink(stream) {
  if (!stream) return;

  if (!systemStreamSinkEl) {
    systemStreamSinkEl = document.createElement('video');
    systemStreamSinkEl.muted = true;
    systemStreamSinkEl.autoplay = true;
    systemStreamSinkEl.playsInline = true;
    systemStreamSinkEl.style.position = 'fixed';
    systemStreamSinkEl.style.width = '1px';
    systemStreamSinkEl.style.height = '1px';
    systemStreamSinkEl.style.opacity = '0';
    systemStreamSinkEl.style.pointerEvents = 'none';
    systemStreamSinkEl.style.left = '-9999px';
    document.body.appendChild(systemStreamSinkEl);
  }

  systemStreamSinkEl.srcObject = stream;
  systemStreamSinkEl.onloadedmetadata = () => {
    systemStreamSinkEl?.play().catch(() => {});
  };
  systemStreamSinkEl.play().catch(() => {});
}

function detachSystemStreamSink() {
  if (!systemStreamSinkEl) return;
  try {
    systemStreamSinkEl.pause();
  } catch {
    // Ignore pause errors.
  }
  systemStreamSinkEl.srcObject = null;
}

function getLiveAudioTrack(stream) {
  if (!stream) return null;
  const [track] = stream.getAudioTracks();
  if (!track || track.readyState !== 'live') return null;
  return track;
}

function isLikelyMicrophoneTrack(track) {
  if (!track) return false;

  const label = String(track.label || '').toLowerCase();
  if (!label) return false;

  const hasMicHint = /\bmic\b|microphone|built-in/.test(label);
  const hasSystemHint = /system|loopback|screen|display|desktop|share/.test(label);
  return hasMicHint && !hasSystemHint;
}

async function forceRefreshPersistentSystemStream() {
  releasePersistentSystemStream();
  return await ensurePersistentSystemStream();
}

function clearPersistentSystemKeepAliveTimer() {
  if (!persistentSystemKeepAliveTimer) return;
  clearTimeout(persistentSystemKeepAliveTimer);
  persistentSystemKeepAliveTimer = null;
}

function stopPersistentSystemGraph() {
  try {
    persistentSystemSourceNode?.disconnect();
  } catch {
    // Ignore disconnect errors.
  }
  try {
    persistentSystemDestinationNode?.disconnect();
  } catch {
    // Ignore disconnect errors.
  }

  persistentSystemSourceNode = null;
  persistentSystemDestinationNode = null;

  if (persistentSystemAudioCtx) {
    persistentSystemAudioCtx.close().catch(() => {});
    persistentSystemAudioCtx = null;
  }
}

async function startPersistentSystemGraph(stream) {
  stopPersistentSystemGraph();
  if (!stream) return;

  try {
    const keepAliveCtx = new AudioContext({ sampleRate: 48000 });
    if (keepAliveCtx.state === 'suspended') {
      await keepAliveCtx.resume();
    }

    const keepAliveSource = keepAliveCtx.createMediaStreamSource(stream);
    const keepAliveDest = keepAliveCtx.createMediaStreamDestination();
    keepAliveSource.connect(keepAliveDest);

    persistentSystemAudioCtx = keepAliveCtx;
    persistentSystemSourceNode = keepAliveSource;
    persistentSystemDestinationNode = keepAliveDest;
  } catch (error) {
    console.warn('Persistent system-audio keepalive graph failed:', error);
    stopPersistentSystemGraph();
  }
}

function createRecordingSystemStreamFromPersistent(stream) {
  const liveTrack = getLiveAudioTrack(stream);
  if (!liveTrack) return null;

  const clonedTrack = liveTrack.clone();
  if (clonedTrack.readyState === 'live') {
    return new MediaStream([clonedTrack]);
  }

  return new MediaStream([liveTrack]);
}

function detachRecordingSystemTrackListener() {
  if (recordingSysTrack && recordingSysTrackEndedHandler) {
    recordingSysTrack.removeEventListener('ended', recordingSysTrackEndedHandler);
  }
  recordingSysTrack = null;
  recordingSysTrackEndedHandler = null;
}

function detachSystemTestTrackListener() {
  if (systemTestTrack && systemTestTrackEndedHandler) {
    systemTestTrack.removeEventListener('ended', systemTestTrackEndedHandler);
  }
  systemTestTrack = null;
  systemTestTrackEndedHandler = null;
}

function releasePersistentSystemStream() {
  clearPersistentSystemKeepAliveTimer();
  stopPersistentSystemGraph();

  const streamToRelease = persistentSystemStream;
  persistentSystemStream = null;

  if (streamToRelease && sysStream === streamToRelease) {
    detachRecordingSystemTrackListener();
    sysStream = null;
  }
  if (streamToRelease && systemTestStream === streamToRelease) {
    detachSystemTestTrackListener();
    systemTestStream = null;
  }

  if (streamToRelease) {
    streamToRelease.getTracks().forEach(t => t.stop());
  }

  sysStreamUsesPersistent = false;

  if (!isRecording && !systemTestActive) {
    detachSystemStreamSink();
  }
}

function schedulePersistentSystemStreamRelease() {
  clearPersistentSystemKeepAliveTimer();
  if (isRecording || systemTestActive || !persistentSystemStream) return;

  persistentSystemKeepAliveTimer = setTimeout(() => {
    if (isRecording || systemTestActive) return;
    if (!persistentSystemStream) return;
    releasePersistentSystemStream();
    setSystemTestStatus('Not testing', 'idle');
  }, SYSTEM_STREAM_KEEPALIVE_MS);
}

// Builds a precise "no system audio" error. On Windows the generic message hides
// the real cause; the main-process display-media handler reports it via the
// display-media-diagnostic IPC, which we fold in here so the popup is actionable.
function buildSystemAudioError({ gotStream } = {}) {
  if (IS_MAC) {
    return 'System audio unavailable. Check Screen Recording permission in System Settings → Privacy & Security.';
  }

  const diag = lastDisplayMediaDiagnostic;

  // No source could be enumerated → handler returned an empty stream.
  if (diag && diag.ok === false && diag.reason === 'no-sources') {
    return 'System audio unavailable: Windows returned no screen to capture. ' +
      'Open Settings → Privacy & security → Screen recording (or App permissions) and ' +
      'allow MeetNote, then restart the app.';
  }

  // The handler threw (e.g. desktopCapturer failed).
  if (diag && diag.ok === false && diag.reason === 'exception') {
    return `System audio unavailable: screen capture failed (${diag.message || 'unknown error'}). ` +
      'Restart the app; if it persists, allow MeetNote under Windows Screen recording permissions.';
  }

  // A source WAS selected but no audio track came back → loopback yielded nothing.
  // This means audio:'loopback' produced no track on this Windows build.
  if (diag && diag.ok === true && gotStream) {
    return 'System audio unavailable: Windows gave a screen but no audio track ' +
      '(loopback returned silence). Make sure audio is actually playing, and that ' +
      'the meeting app is outputting to the default playback device.';
  }
  if (diag && diag.ok === true) {
    return 'System audio unavailable: a screen was selected but loopback produced no audio track. ' +
      'This Windows configuration may not support system-audio loopback.';
  }

  // No diagnostic arrived at all → handler never fired (rare).
  return 'System audio unavailable. When the screen-share prompt appears, choose a ' +
    'screen/window and make sure "Share audio" / "Share system audio" is checked.';
}

async function ensurePersistentSystemStream() {
  clearPersistentSystemKeepAliveTimer();

  const existingTrack = getLiveAudioTrack(persistentSystemStream);
  if (existingTrack) {
    attachSystemStreamSink(persistentSystemStream);
    if (!persistentSystemAudioCtx || persistentSystemAudioCtx.state === 'closed') {
      await startPersistentSystemGraph(persistentSystemStream);
    }
    return persistentSystemStream;
  }

  if (persistentSystemStream) {
    persistentSystemStream.getTracks().forEach(t => t.stop());
    persistentSystemStream = null;
  }

  const stream = await captureSystemAudioStream();
  const track = stream ? getLiveAudioTrack(stream) : null;
  if (!stream || !track) {
    stream?.getTracks().forEach(t => t.stop());
    throw new Error(buildSystemAudioError({ gotStream: !!stream }));
  }

  track.addEventListener('ended', () => {
    if (persistentSystemStream === stream) {
      persistentSystemStream = null;
    }
    if (!isRecording && !systemTestActive) {
      detachSystemStreamSink();
    }
  }, { once: true });

  persistentSystemStream = stream;
  attachSystemStreamSink(stream);
  await startPersistentSystemGraph(stream);
  return stream;
}

function clearRecordingSystemStream() {
  detachRecordingSystemTrackListener();

  if (sysStream && !sysStreamUsesPersistent && sysStream !== persistentSystemStream) {
    sysStream.getTracks().forEach(t => t.stop());
  }

  sysStream = null;
  sysStreamUsesPersistent = false;
}

function setRecordingSystemStream(stream) {
  clearRecordingSystemStream();
  if (!stream) {
    systemAudioLive = false;
    return;
  }

  sysStream = stream;
  sysStreamUsesPersistent = stream === persistentSystemStream;

  const track = stream.getAudioTracks()[0];
  if (!track) {
    systemAudioLive = false;
    return;
  }

  systemAudioLive = track.readyState === 'live';
  recordingSysTrack = track;
  recordingSysTrackEndedHandler = () => {
    systemAudioLive = false;
    analyserSys = null;
    setLevelBar('sysLevelBar', 0);
    setLevelBar('sysLevelBarActive', 0);

    if (!systemAudioEndedNotified) {
      systemAudioEndedNotified = true;
      showToast('System audio ended. Continuing with microphone only.', 'warning');
      showToast('Tip: share Entire Screen and keep the share active.', 'info');
    }

    reconnectSystemAudioIfNeeded().catch(() => {});
  };
  track.addEventListener('ended', recordingSysTrackEndedHandler, { once: true });
}

async function reconnectSystemAudioIfNeeded() {
  if (!isRecording || usingSwiftNativeCapture || !shouldCaptureSystemAudio) return;
  if (systemAudioLive || systemReconnectInFlight) return;
  if (!audioCtx || !recordingMixDestination) return;
  if (systemAudioReconnectAttempts >= MAX_SYSTEM_AUDIO_RECONNECTS) return;

  systemReconnectInFlight = true;
  systemAudioReconnectAttempts += 1;

  showToast(
    `System audio dropped. Reconnecting (${systemAudioReconnectAttempts}/${MAX_SYSTEM_AUDIO_RECONNECTS})...`,
    'warning'
  );

  try {
    const persistentStream = await forceRefreshPersistentSystemStream();
    const stream = createRecordingSystemStreamFromPersistent(persistentStream);
    const track = getLiveAudioTrack(stream);
    if (!stream || !track) {
      throw new Error('No system audio track');
    }

    setRecordingSystemStream(stream);

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    source.connect(recordingMixDestination);

    analyserSys = analyser;
    systemAudioLive = true;
    systemAudioEndedNotified = false;

    showToast('System audio reconnected (browser loopback).', 'success');
  } catch (error) {
    console.warn('System audio reconnect failed:', error);
    if (systemAudioReconnectAttempts >= MAX_SYSTEM_AUDIO_RECONNECTS) {
      showToast('System audio unavailable. Continuing with microphone only.', 'warning');
    }
  } finally {
    systemReconnectInFlight = false;
  }
}

// ─── Waveform bar counts ──────────────────────────────────────────────────────
const HERO_BARS   = 18;
const IDLE_BARS   = 22;
const ACTIVE_BARS = 28;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  swiftCaptureTemporarilyDisabled = false;

  buildWaveformBars('heroWaveform',    HERO_BARS,   2);
  buildWaveformBars('recordIdleWaveform', IDLE_BARS, 3);
  buildWaveformBars('activeWaveform',  ACTIVE_BARS, 2);

  setupNav();
  setupDashboard();
  setupRecordView();
  setupLiveView();
  setupLibrary();
  setupDetail();
  setupSettings();

  // Load backend URL from store
  try {
    const runtimeBackend = await ipcRenderer.invoke('get-backend-url');
    backendUrl = resolveBackendUrl(runtimeBackend);
    const stored = await ipcRenderer.invoke('get-settings');
    applySettingsToUI(stored);
    if (stored.backendUrl) {
      backendUrl = resolveBackendUrl(stored.backendUrl, backendUrl);
    }
    document.getElementById('backendUrlInput').value = backendUrl;

    const normalizedStoredBackend = normaliseBackendUrl(stored.backendUrl);
    if (
      (normalizedStoredBackend && normalizedStoredBackend !== backendUrl) ||
      isLocalBackendUrl(runtimeBackend) ||
      isLocalBackendUrl(stored.backendUrl)
    ) {
      await ipcRenderer.invoke('save-settings', { ...stored, backendUrl }).catch(() => {});
    }
  } catch (e) {
    backendUrl = DEFAULT_BACKEND_URL;
  }

  // Check backend health. coldStart waits out a sleeping Render free-tier service
  // (15–50s wake) instead of immediately reporting "Backend Offline" on launch.
  setPillState('connecting');
  await checkBackendHealth({ coldStart: true });
  startBackendHealthPolling();

  // Load meetings on startup
  await loadMeetings();

  // Permissions check
  await checkPermissions();

  // IPC: permission updates from main process
  ipcRenderer.on('permissions-status', (_, status) => {
    updatePermissionStatus(status);
  });

  // IPC: real audio levels from Swift bridge (mic + system)
  ipcRenderer.on('swift-audio-levels', (_, { mic, sys }) => {
    if (!isRecording || !usingSwiftNativeCapture) return;
    _lastSwiftLevelTs = Date.now();
    const micLevel = Math.min(1, mic * 4);
    const sysLevel = Math.min(1, sys * 4);
    setLevelBar('micLevelBar', micLevel);
    setLevelBar('sysLevelBar', sysLevel);
    setLevelBar('micLevelBarActive', micLevel);
    setLevelBar('sysLevelBarActive', sysLevel);
    animateLiveWaveform('activeWaveform', ACTIVE_BARS, micLevel);
    ipcRenderer.send('relay-audio-level', Math.min(1, micLevel));
  });

  // IPC: stop signal from overlay
  ipcRenderer.on('stop-recording-signal', () => {
    if (isRecording) stopRecording();
  });

  // IPC: stop live coaching session (from coach overlay)
  ipcRenderer.on('stop-live-signal', () => {
    if (liveActive) stopLiveSession();
  });

  // IPC: overlay buttons
  ipcRenderer.on('request-insight-signal', () => { if (liveActive) requestInsight(); });
  ipcRenderer.on('request-answer-signal', () => { if (liveActive) requestAnswer(); });

  // IPC: a meeting (Zoom/Meet/Teams) was auto-detected → offer to start
  ipcRenderer.on('meeting-detected', (_, info) => {
    if (isRecording || liveActive) return;
    showMeetingPrompt(info && info.platform ? info.platform : 'Meeting');
  });

  // IPC: main's display-media handler reports why system-audio capture did or
  // didn't get a source. Cached so the error popup can explain a Windows failure.
  ipcRenderer.on('display-media-diagnostic', (_, info) => {
    lastDisplayMediaDiagnostic = info || null;
    console.log('[display-media-diagnostic]', info);
  });

  window.addEventListener('beforeunload', () => {
    if (backendPollTimer) clearInterval(backendPollTimer);
    stopSystemAudioTest({ preserveStatus: true, releaseStream: true }).catch(() => {});
    releasePersistentSystemStream();
    if (usingSwiftNativeCapture) {
      ipcRenderer.invoke('swift-capture-abort').catch(() => {});
    }
  });
});

// ─── Nav ──────────────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

function switchView(name) {
  // view IDs: dashboardView, recordView, libraryView, detailView, settingsView
  const viewMap = {
    dashboard: 'dashboardView',
    record: 'recordView',
    live: 'liveView',
    library: 'libraryView',
    detail: 'detailView',
    settings: 'settingsView'
  };
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(viewMap[name] || name);
  if (el) el.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.nav-item[data-view="${name}"]`);
  if (btn) btn.classList.add('active');

  if (name === 'record' && !isRecording) {
    startIdleAudioPreview().catch(() => {});
  } else {
    stopIdleAudioPreview();
    if (!isRecording) {
      stopSystemAudioTest({ preserveStatus: true }).catch(() => {});
    }
  }

  if (name === 'library') renderMeetingCards(allMeetings);
  if (name === 'settings') {
    document.getElementById('backendUrlInput').value = backendUrl;
  }
}

// ─── Backend Health ───────────────────────────────────────────────────────────
// The backend runs on Render's free tier, which spins the service down after
// inactivity. A cold start takes ~15–50s to wake — far longer than a normal
// request. A single short-timeout probe therefore reports "Backend Offline" on
// first launch even though the service is fine, just asleep. This was the Windows
// "not connected" symptom: a fresh install almost always hits a cold backend.
//
// setPillState renders one of three states; the amber "Connecting…" state is shown
// while we wait out a cold start instead of immediately flashing red.
function setPillState(state) {
  const dot   = document.getElementById('backendDot');
  const label = document.getElementById('backendLabel');
  if (dot)   dot.className = `pill-dot ${state === 'online' ? 'online' : state === 'connecting' ? 'connecting' : 'offline'}`;
  if (label) label.textContent =
    state === 'online' ? 'Backend Online' :
    state === 'connecting' ? 'Connecting…' : 'Backend Offline';
}

// One probe. Returns true only on a 2xx /api/health response.
async function probeBackend(target, timeoutMs) {
  try {
    const r = await fetch(`${target}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}

// A "wake-aware" health check. The first probe uses a normal timeout; if it fails
// we keep probing with a longer per-attempt timeout, which both waits out and
// actively pings the service awake. `coldStart:true` (used at launch) spends up to
// ~60s before giving up so a sleeping Render service has time to wake.
async function checkBackendHealth({ coldStart = false } = {}) {
  const target = resolveBackendUrl(backendUrl);
  backendUrl = target;

  // First, a quick probe — if the service is already warm this returns instantly.
  let online = await probeBackend(target, 8000);

  if (!online && coldStart) {
    // Service may be asleep. Show "Connecting…" (not "Offline") and keep probing
    // with longer timeouts to wake + reach it. ~4 × 15s ≈ 60s worst case.
    setPillState('connecting');
    for (let attempt = 0; attempt < 4 && !online; attempt++) {
      online = await probeBackend(target, 15000);
    }
  }

  setPillState(online ? 'online' : 'offline');

  const changed = lastBackendOnline !== null && lastBackendOnline !== online;
  lastBackendOnline = online;
  if (changed) {
    showToast(online ? 'Backend connection restored' : 'Backend disconnected', online ? 'success' : 'warning');
  }

  return online;
}

function startBackendHealthPolling() {
  if (backendPollTimer) clearInterval(backendPollTimer);
  backendPollTimer = setInterval(() => {
    checkBackendHealth();
  }, 20000);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function setupDashboard() {
  // Greeting
  const h = new Date().getHours();
  document.getElementById('greetingText').textContent =
    h < 12 ? 'Good morning.' : h < 17 ? 'Good afternoon.' : 'Good evening.';

  // Date badge
  document.getElementById('todayBadge').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  renderUpcomingMeetings();

  // Idle waveform animation
  animateIdleWaveform('heroWaveform');

  // Hero record button
  document.getElementById('heroRecordBtn').addEventListener('click', () => {
    const title = document.getElementById('meetingTitleInput').value.trim();
    if (title) document.getElementById('recordTitleInput').value = title;
    switchView('record');
    // Auto-start after small delay so view transition is visible
    setTimeout(() => beginRecording(), 200);
  });
}

function renderUpcomingMeetings() {
  const list = document.getElementById('upcomingList');
  if (!list) return;

  const today = [
    { title: 'Team Standup', time: '10:00 AM - 10:30 AM', platform: 'Zoom' },
    { title: 'Product Sync', time: '2:00 PM - 2:45 PM', platform: 'Google Meet' }
  ];

  list.innerHTML = '';
  today.forEach(item => {
    const row = document.createElement('div');
    row.className = 'upcoming-item';
    row.innerHTML = `
      <div>
        <div class="upcoming-item-title">${escHtml(item.title)}</div>
        <div class="upcoming-item-meta">${escHtml(item.time)} · ${escHtml(item.platform)}</div>
      </div>
      <button class="btn-xs" type="button">Record</button>
    `;
    row.querySelector('button')?.addEventListener('click', () => {
      const titleInput = document.getElementById('recordTitleInput');
      if (titleInput) titleInput.value = item.title;
      switchView('record');
      setTimeout(() => beginRecording(), 150);
    });
    list.appendChild(row);
  });
}

function updateDashboardStats() {
  document.getElementById('statSummaries').textContent = allMeetings.length;
  // total duration in hours
  const totalSec = allMeetings.reduce((s, m) => s + (m.duration || 0), 0);
  const hrs = (totalSec / 3600).toFixed(1);
  document.getElementById('statHours').textContent = `${hrs}h`;

  // Last note
  if (allMeetings.length > 0) {
    const last = allMeetings[0];
    const card = document.getElementById('lastNoteCard');
    if (card) {
      card.style.display = '';
      document.getElementById('lastNoteTitle').textContent = last.title;
      document.getElementById('lastNoteMeta').textContent =
        formatDate(last.created_at) + (last.duration ? ` · ${formatDuration(last.duration)}` : '');
      const viewBtn = document.getElementById('lastNoteViewBtn');
      if (viewBtn) viewBtn.onclick = () => openMeetingDetail(last);
    }
  }
}

// ─── Record View ──────────────────────────────────────────────────────────────
function setupRecordView() {
  // Nav click on mic icon → go to record view (idle)
  document.getElementById('startRecordBtn').addEventListener('click', beginRecording);
  document.getElementById('stopRecordBtn').addEventListener('click', stopRecording);

  const testBtn = document.getElementById('testSystemAudioBtn');
  if (testBtn) {
    testBtn.addEventListener('click', toggleSystemAudioTest);
  }

  // Also wire hero record button title sync
  document.getElementById('meetingTitleInput').addEventListener('input', e => {
    document.getElementById('recordTitleInput').value = e.target.value;
  });

  animateIdleWaveform('recordIdleWaveform');
}

async function checkPermissions() {
  try {
    const status = await ipcRenderer.invoke('get-media-permissions').catch(() => null);
    if (status) {
      updatePermissionStatus(status);
      if (status.microphone !== 'granted') {
        const hasMic = await ipcRenderer.invoke('check-audio-permissions');
        updatePermissionStatus({
          microphone: hasMic ? 'granted' : 'denied',
          screen: status.screen || 'unknown'
        });
      }
      return;
    }

    const hasMic = await ipcRenderer.invoke('check-audio-permissions');
    updatePermissionStatus({ microphone: hasMic ? 'granted' : 'denied', screen: 'unknown' });
  } catch (e) { /* ignore */ }
}

function updatePermissionStatus(status = {}) {
  const micState = status.microphone === true ? 'granted' : (status.microphone || 'unknown');
  const screenState = status.screen === true ? 'granted' : (status.screen || 'unknown');

  const micRow = document.getElementById('permMic');
  if (micRow) {
    micRow.className = 'perm-row ' + (micState === 'granted' ? 'ok' : 'fail');
    micRow.querySelector('span').textContent =
      micState === 'granted'
        ? 'Microphone — granted'
        : 'Microphone — denied (required)';
  }

  const screenRow = document.getElementById('permScreen');
  if (screenRow) {
    if (screenState === 'granted') {
      screenRow.className = 'perm-row ok';
      screenRow.querySelector('span').textContent = 'Screen Recording — granted';
    } else if (screenState === 'denied') {
      screenRow.className = 'perm-row fail';
      screenRow.querySelector('span').textContent = 'Screen Recording — allow in System Settings';
    } else {
      screenRow.className = 'perm-row';
      screenRow.querySelector('span').textContent = 'Screen Recording — required for system audio';
    }
  }
}

function setSystemTestStatus(text, state = 'idle') {
  const statusEl = document.getElementById('sysTestStatus');
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = `sys-test-indicator ${state}`;
}

function setSystemTestButton(label, disabled = false) {
  const button = document.getElementById('testSystemAudioBtn');
  if (!button) return;
  button.textContent = label;
  button.disabled = disabled;
}

async function toggleSystemAudioTest() {
  if (isRecording) {
    showToast('Stop recording before running system-audio test.', 'warning');
    return;
  }

  if (systemTestActive) {
    await stopSystemAudioTest();
    showToast('System audio test stopped.', 'info');
    return;
  }

  await startSystemAudioTest();
}

async function startSystemAudioTest() {
  if (systemTestActive) return;

  setSystemTestButton('Starting…', true);
  setSystemTestStatus('Requesting system audio…', 'waiting');

  try {
    systemTestStream = await ensurePersistentSystemStream();
    const testTrack = getLiveAudioTrack(systemTestStream);
    if (!systemTestStream || !testTrack) {
      throw new Error('No system audio track found');
    }

    systemTestAudioCtx = new AudioContext({ sampleRate: 48000 });
    if (systemTestAudioCtx.state === 'suspended') {
      await systemTestAudioCtx.resume();
    }

    systemTestAnalyser = systemTestAudioCtx.createAnalyser();
    systemTestAnalyser.fftSize = 256;

    const source = systemTestAudioCtx.createMediaStreamSource(systemTestStream);
    source.connect(systemTestAnalyser);

    systemTestActive = true;
    setSystemTestButton('Stop System Test');
    setSystemTestStatus('Listening (browser loopback)… play audio from meeting app', 'waiting');

    detachSystemTestTrackListener();
    systemTestTrack = testTrack;
    systemTestTrackEndedHandler = async () => {
      if (!systemTestActive) return;
      setSystemTestStatus('System audio stream ended', 'fail');
      showToast('System audio stream ended. Start the test again.', 'warning');
      await stopSystemAudioTest({ preserveStatus: true, releaseStream: true });
    };
    testTrack.addEventListener('ended', systemTestTrackEndedHandler, { once: true });

    const buffer = new Uint8Array(systemTestAnalyser.frequencyBinCount);
    const tick = () => {
      if (!systemTestActive || !systemTestAnalyser) return;

      systemTestAnalyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const n = buffer[i] / 128 - 1;
        sum += n * n;
      }

      const rms = Math.sqrt(sum / buffer.length);
      const scaled = Math.min(1, rms * 10);
      setLevelBar('sysLevelBar', scaled * 4);

      if (scaled > 0.09) {
        setSystemTestStatus('Signal detected (browser loopback)', 'ok');
      } else {
        setSystemTestStatus('Listening (browser loopback)… play audio from meeting app', 'waiting');
      }

      systemTestRAF = requestAnimationFrame(tick);
    };

    tick();
  } catch (error) {
    console.error('System audio test failed:', error);
    setSystemTestStatus(`Test failed: ${error?.message || 'Unknown error'}`, 'fail');
    showToast('System audio test failed: ' + (error?.message || 'Unknown error'), 'error');
    await stopSystemAudioTest({ preserveStatus: true });
  } finally {
    if (!systemTestActive) {
      setSystemTestButton('Test System Audio');
    }
  }
}

async function stopSystemAudioTest(options = {}) {
  const { preserveStatus = false, releaseStream = false, keepWarm = false } = options;

  if (systemTestRAF) {
    cancelAnimationFrame(systemTestRAF);
    systemTestRAF = null;
  }

  detachSystemTestTrackListener();
  systemTestStream = null;

  if (systemTestAudioCtx) {
    await systemTestAudioCtx.close().catch(() => {});
    systemTestAudioCtx = null;
  }

  systemTestAnalyser = null;
  systemTestActive = false;
  setLevelBar('sysLevelBar', 0);
  setSystemTestButton('Test System Audio');

  if (releaseStream) {
    releasePersistentSystemStream();
  } else if (!keepWarm && !isRecording) {
    schedulePersistentSystemStreamRelease();
  }

  if (!preserveStatus) {
    setSystemTestStatus(
      releaseStream ? 'Not testing' : 'Standby (stream warmed for next recording)',
      releaseStream ? 'idle' : 'waiting'
    );
  }
}

async function startIdleAudioPreview() {
  if (isRecording || previewMicStream) return;

  const recordView = document.getElementById('recordView');
  const recordIdle = document.getElementById('recordIdle');
  if (!recordView?.classList.contains('active')) return;
  if (recordIdle && recordIdle.style.display === 'none') return;

  try {
    previewMicStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
      video: false
    });

    previewAudioCtx = new AudioContext({ sampleRate: 48000 });
    if (previewAudioCtx.state === 'suspended') await previewAudioCtx.resume();

    previewAnalyser = previewAudioCtx.createAnalyser();
    previewAnalyser.fftSize = 256;

    const previewSource = previewAudioCtx.createMediaStreamSource(previewMicStream);
    previewSource.connect(previewAnalyser);

    const buffer = new Uint8Array(previewAnalyser.frequencyBinCount);
    const tick = () => {
      if (!previewAnalyser || isRecording) return;

      previewAnalyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const n = buffer[i] / 128 - 1;
        sum += n * n;
      }

      const micRms = Math.sqrt(sum / buffer.length);
      setLevelBar('micLevelBar', micRms * 7);
      animateLiveWaveform('recordIdleWaveform', IDLE_BARS, micRms);

      previewRAF = requestAnimationFrame(tick);
    };

    tick();
  } catch (err) {
    console.warn('Idle audio preview unavailable:', err?.message || err);
    await stopIdleAudioPreview();
  }
}

async function stopIdleAudioPreview() {
  if (previewRAF) {
    cancelAnimationFrame(previewRAF);
    previewRAF = null;
  }

  if (previewMicStream) {
    previewMicStream.getTracks().forEach(t => t.stop());
    previewMicStream = null;
  }

  if (previewAudioCtx) {
    await previewAudioCtx.close().catch(() => {});
    previewAudioCtx = null;
  }

  previewAnalyser = null;

  if (!isRecording) {
    setLevelBar('micLevelBar', 0);
  }
}

async function captureSystemAudioStream() {
  // Electron intercepts getDisplayMedia via setDisplayMediaRequestHandler in main.js,
  // which auto-selects the screen source and passes audio:'loopback' — no picker shown.
  // MacLoopbackAudioForScreenShare feature flag (set at startup) enables the loopback track.
  const stream = await navigator.mediaDevices.getDisplayMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      suppressLocalAudioPlayback: false
    },
    video: true  // required — Electron won't invoke handler without video in constraints
  });

  // Immediately stop video tracks — we only need audio
  stream.getVideoTracks().forEach(t => t.stop());

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    stream.getTracks().forEach(t => t.stop());
    return null;
  }

  const track = audioTracks[0];
  console.log('[sys-audio] got track:', track.label, track.readyState);

  // Reject if it looks like a microphone was selected instead of system loopback
  if (isLikelyMicrophoneTrack(track)) {
    console.warn('[sys-audio] track looks like microphone — rejecting:', track.label);
    stream.getTracks().forEach(t => t.stop());
    return null;
  }

  attachSystemStreamSink(stream);
  return stream;
}

// ─── Core Recording ───────────────────────────────────────────────────────────
async function beginRecording() {
  if (isRecording || liveActive) return;

  // Mode switch: live coaching reroutes to the streaming flow.
  const mode = (await getSetting('mode')) || 'record';
  if (mode === 'live') {
    return beginLiveSession();
  }

  const title = (document.getElementById('recordTitleInput')?.value?.trim()
    || document.getElementById('meetingTitleInput')?.value?.trim()
    || `Meeting ${new Date().toLocaleDateString()}`);
  currentRecordingTitle = title;

  // Switch to record view & show idle → then start
  switchView('record');

  try {
    await stopIdleAudioPreview();
    await stopSystemAudioTest({ preserveStatus: true, keepWarm: true });
    clearPersistentSystemKeepAliveTimer();
    showRecordState('idle');
    systemAudioLive = false;
    systemAudioEndedNotified = false;
    systemAudioReconnectAttempts = 0;
    systemReconnectInFlight = false;
    const captureSystemAudio = (await getSetting('captureSystemAudio')) !== false;
    shouldCaptureSystemAudio = captureSystemAudio;
    const useSwiftCapture =
      ENABLE_SWIFT_NATIVE_CAPTURE &&
      IS_MAC &&
      captureSystemAudio &&
      !swiftCaptureTemporarilyDisabled;
    usingSwiftNativeCapture = false;

    // The macOS Screen Recording permission gate only applies on macOS. On Windows
    // there is no such system permission for loopback capture, and get-media-permissions
    // already reports screen:'granted' there — but we guard explicitly to be safe.
    if (IS_MAC) {
      const mediaPermissions = await ipcRenderer.invoke('get-media-permissions').catch(() => null);
      if (captureSystemAudio && mediaPermissions && mediaPermissions.screen !== 'granted') {
        await ipcRenderer.invoke('open-privacy-settings', 'screen').catch(() => false);
        throw new Error('Screen Recording permission is required for system audio. Allow MeetNote in macOS Privacy settings and restart the app. If running via npm run dev, also allow Terminal.');
      }
    }

    if (useSwiftCapture) {
      showToast('Starting Swift native capture…', 'info');
      try {
        await ipcRenderer.invoke('swift-capture-start', { title });

        swiftCaptureTemporarilyDisabled = false;

        usingSwiftNativeCapture = true;
        isRecording = true;

        showRecordState('active');
        document.getElementById('recTitleDisplay').textContent = title;
        startRecordTimer();
        startSwiftVizLoop();

        await ipcRenderer.invoke('show-recording-overlay').catch(() => {});
        await ipcRenderer.invoke('start-audio-monitoring').catch(() => {});
        await ipcRenderer.invoke('start-recording').catch(() => {});

        showToast('Recording with Swift engine (mic + system audio)', 'success');
        return;
      } catch (swiftStartError) {
        const msg = String(swiftStartError?.message || '').toLowerCase();
        if (msg.includes('screen recording') || msg.includes('microphone permission') || msg.includes('permission')) {
          throw swiftStartError;
        }

        console.warn('Swift native capture unavailable, falling back to browser capture:', swiftStartError);
        usingSwiftNativeCapture = false;
        swiftCaptureTemporarilyDisabled = true;
        stopSwiftVizLoop();
        showToast('Swift native capture is unavailable. Using browser loopback capture (not native).', 'warning');
      }
    }

    if (captureSystemAudio && IS_MAC && !usingSwiftNativeCapture) {
      showToast('System audio for this run is browser loopback (non-native).', 'info');
    }

    // ── Step 1: System audio first (Swift parity) ────────────────────────────
    // Starting system capture first avoids reconfiguration races seen on macOS.
    clearRecordingSystemStream();
    if (captureSystemAudio) {
      showToast('Requesting system audio…', 'info');
      const warmedStream = await forceRefreshPersistentSystemStream();
      const recordingSystemStream = createRecordingSystemStreamFromPersistent(warmedStream);
      setRecordingSystemStream(recordingSystemStream);
      const sysTrack = getLiveAudioTrack(sysStream);

      if (!sysTrack) {
        systemAudioLive = false;
        clearRecordingSystemStream();
        releasePersistentSystemStream();
        showToast('System audio track not available. Recording will continue with microphone only.', 'warning');
      } else {
        systemAudioLive = true;
      }
    } else {
      releasePersistentSystemStream();
    }

    // ── Step 2: Microphone after system capture ──────────────────────────────
    showToast('Requesting microphone access…', 'info');
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
      video: false
    });

    // ── Step 3: Mix streams ──────────────────────────────────────────────────
    audioCtx = new AudioContext({ sampleRate: 48000 });
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const dest = audioCtx.createMediaStreamDestination();
    dest.channelCount = 2;
    recordingMixDestination = dest;

    // Mic source → analyser → dest
    analyserMic = audioCtx.createAnalyser();
    analyserMic.fftSize = 256;
    const micSrc = audioCtx.createMediaStreamSource(micStream);
    micSrc.connect(analyserMic);
    micSrc.connect(dest);

    // System source → analyser → dest (if available)
    if (sysStream && sysStream.getAudioTracks().length > 0) {
      analyserSys = audioCtx.createAnalyser();
      analyserSys.fftSize = 256;
      const sysSrc = audioCtx.createMediaStreamSource(sysStream);
      sysSrc.connect(analyserSys);
      sysSrc.connect(dest);
      systemAudioLive = true;
    }

    // ── Step 4: MediaRecorder ────────────────────────────────────────────────
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    mediaRecorder  = new MediaRecorder(dest.stream, { mimeType, audioBitsPerSecond: 128000 });
    recordedChunks = [];

    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => processRecording(title);

    mediaRecorder.start(1000);
    isRecording = true;

    // ── Step 5: UI ───────────────────────────────────────────────────────────
    showRecordState('active');
    document.getElementById('recTitleDisplay').textContent = title;
    startRecordTimer();
    startVizLoop();

    await ipcRenderer.invoke('show-recording-overlay').catch(() => {});
    await ipcRenderer.invoke('start-audio-monitoring').catch(() => {});
    await ipcRenderer.invoke('start-recording').catch(() => {});

    if (systemAudioLive) {
      showToast('Recording mic + system audio (browser loopback, non-native)', 'success');
    } else {
      showToast('Recording microphone only (system audio unavailable)', 'warning');
    }

  } catch (err) {
    console.error('Recording error:', err);

    const message = String(err?.message || 'Unknown error');
    if (/screen recording/i.test(message)) {
      await ipcRenderer.invoke('open-privacy-settings', 'screen').catch(() => false);
    } else if (/microphone permission/i.test(message)) {
      await ipcRenderer.invoke('open-privacy-settings', 'microphone').catch(() => false);
    }

    showToast('Could not start recording: ' + err.message, 'error');
    if (usingSwiftNativeCapture) {
      await ipcRenderer.invoke('swift-capture-abort').catch(() => {});
      usingSwiftNativeCapture = false;
      stopSwiftVizLoop();
    }
    cleanupStreams();
    showRecordState('idle');
    startIdleAudioPreview().catch(() => {});
  }
}

async function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

  stopRecordTimer();
  if (usingSwiftNativeCapture) {
    stopSwiftVizLoop();
  } else {
    stopVizLoop();
  }

  await ipcRenderer.invoke('stop-audio-monitoring').catch(() => {});
  await ipcRenderer.invoke('hide-recording-overlay').catch(() => {});
  await ipcRenderer.invoke('stop-recording').catch(() => {});

  if (usingSwiftNativeCapture) {
    showRecordState('processing');
    try {
      const swiftResult = await ipcRenderer.invoke('swift-capture-stop');
      usingSwiftNativeCapture = false;
      await processSwiftRecording(currentRecordingTitle || 'Meeting Recording', swiftResult);
    } catch (err) {
      usingSwiftNativeCapture = false;
      console.error('Swift capture stop failed:', err);
      showToast('Swift capture failed: ' + err.message, 'error');
      showRecordState('idle');
      startIdleAudioPreview().catch(() => {});
    }
    return;
  }

  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.requestData();
    mediaRecorder.stop();  // triggers onstop → processRecording
  }

  showRecordState('processing');
}

function cleanupStreams() {
  isRecording = false;
  micStream?.getTracks().forEach(t => t.stop()); micStream = null;
  clearRecordingSystemStream();
  if (!shouldCaptureSystemAudio) {
    releasePersistentSystemStream();
  }
  if (!persistentSystemStream && !systemTestActive) {
    detachSystemStreamSink();
  }
  audioCtx?.close().catch(() => {}); audioCtx = null;
  recordingMixDestination = null;
  shouldCaptureSystemAudio = true;
  systemReconnectInFlight = false;
  systemAudioReconnectAttempts = 0;
  analyserMic = null; analyserSys = null;
  systemAudioLive = false;
  schedulePersistentSystemStreamRelease();
}

// ─── Live Coaching ──────────────────────────────────────────────────────────────

function setupLiveView() {
  const endBtn = document.getElementById('endLiveBtn');
  if (endBtn) endBtn.addEventListener('click', () => { if (liveActive) stopLiveSession(); });
  const ansBtn = document.getElementById('getAnswerBtn');
  if (ansBtn) ansBtn.addEventListener('click', requestAnswer);
  const insightBtn = document.getElementById('getInsightBtn');
  if (insightBtn) insightBtn.addEventListener('click', requestInsight);
}

function _wsSend(obj, warn) {
  if (!liveWs || liveWs.readyState !== WebSocket.OPEN) {
    showToast('Live session not connected', 'warning');
    return false;
  }
  try { liveWs.send(JSON.stringify(obj)); return true; }
  catch (e) { showToast(warn || 'Request failed', 'error'); return false; }
}

// ANSWER: reply to the other person's question, using full context.
function requestAnswer() {
  if (_wsSend({ type: 'request_answer' }, 'Could not request answer')) {
    const b = document.getElementById('getAnswerBtn');
    if (b) { b.disabled = true; b.textContent = '✦ Answering…'; }
  }
}

// INSIGHT: what's happening + notes.
function requestInsight() {
  if (_wsSend({ type: 'request_insight' }, 'Could not request insight')) {
    const b = document.getElementById('getInsightBtn');
    if (b) { b.disabled = true; b.textContent = '✦ Thinking…'; }
  }
}

function wsBaseUrl(httpUrl) {
  return resolveBackendUrl(httpUrl).replace(/^http/i, 'ws');
}

async function beginLiveSession() {
  if (liveActive) return;

  liveTitle = (document.getElementById('recordTitleInput')?.value?.trim()
    || document.getElementById('meetingTitleInput')?.value?.trim()
    || `Live Session ${new Date().toLocaleDateString()}`);
  liveSessionId = (crypto.randomUUID && crypto.randomUUID()) ||
    `live-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  switchView('live');
  clearLiveView();
  setLiveStatus('connecting');

  try {
    // ── Capture mic (YOU) and system (OTHER) as SEPARATE streams so we can
    //    transcribe + label each speaker independently (no muddy mix). ──────────
    const captureSystemAudio = (await getSetting('captureSystemAudio')) !== false;

    let sysTrack = null;
    if (captureSystemAudio) {
      const warmed = await forceRefreshPersistentSystemStream().catch(() => null);
      if (warmed) {
        const recSysStream = createRecordingSystemStreamFromPersistent(warmed);
        setRecordingSystemStream(recSysStream);
        sysTrack = getLiveAudioTrack(sysStream);
      }
    }

    liveMicStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
      video: false
    });

    liveAudioCtx = new AudioContext({ sampleRate: 48000 });
    if (liveAudioCtx.state === 'suspended') await liveAudioCtx.resume();

    // Separate destination nodes — one per speaker channel.
    liveMicDest = liveAudioCtx.createMediaStreamDestination();
    liveAudioCtx.createMediaStreamSource(liveMicStream).connect(liveMicDest);

    liveSysDest = null;
    if (sysTrack && sysStream && sysStream.getAudioTracks().length > 0) {
      liveSysDest = liveAudioCtx.createMediaStreamDestination();
      liveAudioCtx.createMediaStreamSource(sysStream).connect(liveSysDest);
      ipcRenderer.send('live-log', 'system audio track live — OTHER channel active');
    } else {
      ipcRenderer.send('live-log', 'NO system audio track — only mic (YOU) will transcribe');
    }

    // ── WebSocket ───────────────────────────────────────────────────────────────
    // Live coaching uses the streaming WS route, served by the deployed Render
    // backend. resolveBackendUrl strips any stale localhost setting so coach
    // mode in a shipped build always targets the cloud backend.
    const liveHttp = resolveBackendUrl(
      (await getSetting('liveBackendUrl')) ||
      backendUrl ||
      (await ipcRenderer.invoke('get-backend-url').catch(() => null)) ||
      DEFAULT_BACKEND_URL
    );
    const wsUrl = liveHttp.replace(/^http/i, 'ws').replace(/\/+$/, '');
    const url = `${wsUrl}/ws/sessions/${liveSessionId}/stream`;
    console.log('[live] connecting WS:', url);
    ipcRenderer.send('live-log', `connecting WS: ${url}`);
    liveWs = new WebSocket(url);
    liveWs.binaryType = 'arraybuffer';

    liveWs.onopen = async () => {
      ipcRenderer.send('live-log', 'WS open — streaming audio');
      setLiveStatus('live');
      const language = (await getSetting('transcriptionLanguage')) || 'en';
      liveWs.send(JSON.stringify({ type: 'config', title: liveTitle, language }));

      // Stream short blobs: restart MediaRecorder each interval so each blob is a
      // standalone, decodable webm segment (Groq Whisper needs whole files).
      startLiveRecorderLoop();
    };

    liveWs.onmessage = (ev) => handleLiveMessage(ev.data);
    liveWs.onerror = (e) => {
      ipcRenderer.send('live-log', `WS ERROR connecting to ${url}`);
      showToast(`Live coaching backend not reachable at ${liveHttp}. Check your connection or the Render service status.`, 'error');
    };
    liveWs.onclose = () => { if (liveActive) finishLiveUI(); };

    liveActive = true;
    isRecording = false; // live mode is not the record path
    document.getElementById('liveTitleDisplay') && (document.getElementById('liveTitleDisplay').textContent = liveTitle);

    await ipcRenderer.invoke('show-coach-overlay').catch(() => {});
    await ipcRenderer.invoke('start-recording').catch(() => {});
    showToast('Live coaching started', 'success');

  } catch (err) {
    console.error('Live session error:', err);
    showToast('Could not start live session: ' + err.message, 'error');
    await teardownLiveCapture();
    setLiveStatus('idle');
    switchView('record');
  }
}

function startLiveRecorderLoop() {
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus' : 'audio/webm';

  liveRecorders = [];

  // One tagged recorder per speaker channel. Each blob is prefixed with a 1-byte
  // speaker tag so the backend can label YOU vs OTHER. Longer window (LIVE_BLOB_MS)
  // = full sentences, not phrase fragments.
  const startChannel = (dest, tagByte) => {
    if (!dest) return;
    const loop = () => {
      if (!liveActive || !liveWs || liveWs.readyState !== WebSocket.OPEN) return;
      const chunks = [];
      const rec = new MediaRecorder(dest.stream, { mimeType, audioBitsPerSecond: 128000 });
      rec.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      rec.onstop = async () => {
        if (chunks.length && liveWs && liveWs.readyState === WebSocket.OPEN) {
          const blob = new Blob(chunks, { type: mimeType });
          const buf = await blob.arrayBuffer();
          // Frame = [tag byte][webm bytes]
          const framed = new Uint8Array(buf.byteLength + 1);
          framed[0] = tagByte;
          framed.set(new Uint8Array(buf), 1);
          try { liveWs.send(framed.buffer); } catch (e) { console.warn('live send failed', e); }
        }
        if (liveActive) loop();  // chain next window
      };
      rec.start();
      liveRecorders.push(rec);
      setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, LIVE_BLOB_MS);
    };
    loop();
  };

  startChannel(liveMicDest, 0x01);  // YOU
  startChannel(liveSysDest, 0x02);  // OTHER
}

function handleLiveMessage(data) {
  let msg;
  try { msg = JSON.parse(data); } catch { return; }

  switch (msg.type) {
    case 'session_started':
      break;
    case 'transcript_final':
      appendLiveTranscript(msg.speaker || 'Speaker', msg.text || '');
      break;
    case 'suggestion_pending':
      ipcRenderer.send('coach-pending');
      break;
    case 'insight_pending':
      ipcRenderer.send('coach-insight-pending');
      break;
    case 'suggested_answer':
      appendCoachingCard(msg);
      ipcRenderer.send('coach-suggestion', {
        content: msg.content,
        suggestion_type: msg.suggestion_type,
        confidence: msg.confidence,
        auto: msg.auto !== false
      });
      resetLiveButtons();
      break;
    case 'insight':
      appendInsight(msg.summary || '', msg.bullets || []);
      ipcRenderer.send('coach-insight', { summary: msg.summary || '', bullets: msg.bullets || [] });
      resetLiveButtons();
      break;
    case 'rolling_notes':
      appendRollingNotes(msg.bullets || []);
      break;
    case 'session_event':
      if (msg.event === 'processing_complete') {
        if (msg.meeting) {
          // Merge into local list and open detail, like a finished recording.
          upsertLocalMeeting(msg.meeting);
          showToast('Live session saved', 'success');
        }
        finishLiveUI(msg.meeting);
      }
      break;
  }
}

async function stopLiveSession() {
  ipcRenderer.send('live-log', 'stopLiveSession called');
  const wasActive = liveActive;
  liveActive = false;
  setLiveStatus('processing');
  if (!wasActive && !liveWs) {
    // Nothing was running — just make sure overlay is gone.
    await ipcRenderer.invoke('hide-coach-overlay').catch(() => {});
    setLiveStatus('idle');
    return;
  }

  // Stop the streaming recorder.
  try { if (liveMediaRecorder && liveMediaRecorder.state === 'recording') liveMediaRecorder.stop(); }
  catch {}

  // Ask backend to finalise (summary + persist), then it closes the socket.
  try {
    if (liveWs && liveWs.readyState === WebSocket.OPEN) {
      liveWs.send(JSON.stringify({ type: 'control', action: 'end_session', title: liveTitle }));
    }
  } catch {}

  await ipcRenderer.invoke('hide-coach-overlay').catch(() => {});
  await ipcRenderer.invoke('stop-recording').catch(() => {});
  await teardownLiveCapture();
}

async function teardownLiveCapture() {
  try { liveRecorders.forEach(r => { if (r.state === 'recording') r.stop(); }); } catch {}
  liveRecorders = [];
  try { liveMicStream?.getTracks().forEach(t => t.stop()); } catch {}
  liveMicStream = null;
  clearRecordingSystemStream();
  try { await liveAudioCtx?.close(); } catch {}
  liveAudioCtx = null;
  liveMixDest = null; liveMicDest = null; liveSysDest = null;
  liveMediaRecorder = null;
  schedulePersistentSystemStreamRelease();
}

function finishLiveUI(meeting) {
  liveActive = false;
  if (liveWs) { try { liveWs.close(); } catch {} liveWs = null; }
  teardownLiveCapture();
  setLiveStatus('idle');
  if (meeting) {
    openMeetingDetail(meeting);
  }
}

// ── Live view DOM helpers ──────────────────────────────────────────────────────
function setLiveStatus(state) {
  const el = document.getElementById('liveStatus');
  if (!el) return;
  const map = { connecting: 'Connecting…', live: '● Live', processing: 'Wrapping up…', idle: 'Idle' };
  el.textContent = map[state] || state;
  el.className = 'live-status ' + state;
}

function clearLiveView() {
  const t = document.getElementById('liveTranscript');
  const c = document.getElementById('liveCoaching');
  if (t) t.innerHTML = '';
  if (c) c.innerHTML = '';
}

function appendLiveTranscript(speaker, text) {
  const feed = document.getElementById('liveTranscript');
  if (!feed || !text) return;

  // Merge into the previous block if the same speaker is still talking → flowing
  // paragraph instead of one chip per phrase.
  const last = feed.lastElementChild;
  if (last && last.dataset.speaker === speaker) {
    const txt = last.querySelector('.live-txt');
    if (txt) {
      txt.textContent = (txt.textContent + ' ' + text).replace(/\s+/g, ' ').trim();
      feed.scrollTop = feed.scrollHeight;
      return;
    }
  }

  const row = document.createElement('div');
  row.className = 'live-line ' + (speaker === 'You' ? 'you' : 'other');
  row.dataset.speaker = speaker;
  row.innerHTML = `<span class="live-spk">${escHtml(speaker)}</span><span class="live-txt">${escHtml(text)}</span>`;
  feed.appendChild(row);
  feed.scrollTop = feed.scrollHeight;
}

function appendCoachingCard(msg) {
  const wrap = document.getElementById('liveCoaching');
  if (!wrap) return;
  const type = msg.suggestion_type || 'contribute';
  const card = document.createElement('div');
  card.className = 'coach-card ' + type;
  card.innerHTML = `
    <div class="coach-meta">
      <span class="coach-badge ${escHtml(type)}">${escHtml(type)}</span>
      <span class="coach-conf">${escHtml(msg.confidence || 'medium')}</span>
    </div>
    <div class="coach-text">${escHtml(msg.content || '')}</div>`;
  wrap.insertBefore(card, wrap.firstChild);
}

function appendRollingNotes(bullets) {
  if (!bullets.length) return;
  const wrap = document.getElementById('liveCoaching');
  if (!wrap) return;
  const block = document.createElement('div');
  block.className = 'coach-card notes';
  block.innerHTML = `<div class="coach-meta"><span class="coach-badge notes">notes</span></div>` +
    `<ul class="coach-notes">${bullets.map(b => `<li>${escHtml(b)}</li>`).join('')}</ul>`;
  wrap.insertBefore(block, wrap.firstChild);
}

function resetLiveButtons() {
  const a = document.getElementById('getAnswerBtn');
  if (a) { a.disabled = false; a.textContent = '✦ Answer'; }
  const i = document.getElementById('getInsightBtn');
  if (i) { i.disabled = false; i.textContent = '✦ Get Insight'; }
}

function appendInsight(summary, bullets) {
  const wrap = document.getElementById('liveCoaching');
  if (!wrap) return;
  const block = document.createElement('div');
  block.className = 'coach-card insight';
  block.innerHTML =
    `<div class="coach-meta"><span class="coach-badge insight">insight</span></div>` +
    (summary ? `<div class="coach-text">${escHtml(summary)}</div>` : '') +
    (bullets.length ? `<ul class="coach-notes">${bullets.map(b => `<li>${escHtml(b)}</li>`).join('')}</ul>` : '');
  wrap.insertBefore(block, wrap.firstChild);
}

function upsertLocalMeeting(meeting) {
  if (!meeting || !meeting.id) return;
  allMeetings = [meeting, ...allMeetings.filter(m => m.id !== meeting.id)];
  try { localStorage.setItem(LOCAL_MEETINGS_KEY, JSON.stringify(allMeetings)); } catch {}
}

// ─── Process & Upload ─────────────────────────────────────────────────────────
async function processRecording(title) {
  cleanupStreams();
  showRecordState('processing');
  updateProcessingHint('Preparing audio…');

  if (recordedChunks.length === 0) {
    showToast('No audio captured', 'error');
    showRecordState('idle');
    startIdleAudioPreview().catch(() => {});
    return;
  }

  const blob = new Blob(recordedChunks, { type: 'audio/webm;codecs=opus' });
  console.log(`Uploading ${(blob.size / 1024).toFixed(1)} KB to backend…`);
  
  // Start automatic download of the raw audio file so the user can examine it immediately
  const exportUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = exportUrl;
  a.download = `MeetNote_Electron_Audio_${new Date().getTime()}.webm`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(exportUrl); }, 100);

  updateProcessingHint(`Uploading ${(blob.size / 1024).toFixed(0)} KB…`);

  try {
    const formData = new FormData();
    formData.append('audio_file', blob, 'recording.webm');
    formData.append('title', title);
    formData.append('format', 'webm');
    formData.append('language', await getSetting('transcriptionLanguage') || 'en');

    updateProcessingHint('Transcribing with Groq Whisper…');
    const targetBackend = resolveBackendUrl(backendUrl);
    backendUrl = targetBackend;

    const resp = await fetch(`${targetBackend}/api/transcription/audio`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(180000)
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Server ${resp.status}: ${txt.slice(0, 120)}`);
    }

    const result = await resp.json();
    const normalized = normaliseMeeting(result);
    console.log('Transcription result:', normalized.id);

    // Add to in-memory cache (prepend, most-recent first) and persist locally.
    upsertMeeting(normalized);
    persistMeetingsCache(allMeetings);
    updateDashboardStats();
    renderMeetingCards(allMeetings);

    showRecordState('idle');
    showToast('Transcription complete!', 'success');

    // Open detail immediately
    openMeetingDetail(normalized);

  } catch (err) {
    console.error('Upload/transcription error:', err);
    showToast('Transcription failed: ' + err.message, 'error');
    showRecordState('idle');
    startIdleAudioPreview().catch(() => {});
  }
}

async function processSwiftRecording(title, swiftResult) {
  showRecordState('processing');
  updateProcessingHint('Preparing native Swift audio…');

  if (!swiftResult || !swiftResult.merged) {
    throw new Error('Swift recorder did not return a merged file');
  }

  try {
    const language = await getSetting('transcriptionLanguage') || 'en';
    updateProcessingHint('Uploading native Swift capture…');

    const result = await ipcRenderer.invoke('transcribe-audio-file', {
      filePath: swiftResult.merged,
      micPath: swiftResult.mic,
      sysPath: swiftResult.sys,
      duration: swiftResult.duration || 0,
      title,
      language
    });

    const normalized = normaliseMeeting(result);

    upsertMeeting(normalized);
    persistMeetingsCache(allMeetings);
    updateDashboardStats();
    renderMeetingCards(allMeetings);

    showRecordState('idle');
    showToast('Swift transcription complete!', 'success');
    openMeetingDetail(normalized);
  } catch (err) {
    console.error('Swift transcription error:', err);
    showToast('Transcription failed: ' + err.message, 'error');
    showRecordState('idle');
    startIdleAudioPreview().catch(() => {});
  }
}

// Swift viz loop: only a heartbeat fallback — real levels come via 'swift-audio-levels' IPC.
// If the IPC event hasn't fired recently (Swift bridge silent / initializing),
// we show a gentle idle animation so the UI doesn't look frozen.
let _lastSwiftLevelTs = 0;
function startSwiftVizLoop() {
  if (swiftVizInterval) clearInterval(swiftVizInterval);
  _lastSwiftLevelTs = 0;
  swiftVizInterval = setInterval(() => {
    if (!isRecording || !usingSwiftNativeCapture) return;

    // Real levels arrived recently — don't override with synthetic noise
    if (Date.now() - _lastSwiftLevelTs < 400) return;

    // Gentle idle pulse so waveform isn't frozen while bridge is warming up
    const idleLevel = 0.05 + Math.sin(Date.now() / 600) * 0.03;
    animateLiveWaveform('activeWaveform', ACTIVE_BARS, idleLevel);
  }, 180);
}

function stopSwiftVizLoop() {
  if (swiftVizInterval) {
    clearInterval(swiftVizInterval);
    swiftVizInterval = null;
  }
  setLevelBar('micLevelBar', 0);
  setLevelBar('sysLevelBar', 0);
  setLevelBar('micLevelBarActive', 0);
  setLevelBar('sysLevelBarActive', 0);
}

// ─── Record UI State Machine ──────────────────────────────────────────────────
function showRecordState(state) {
  document.getElementById('recordIdle').style.display       = state === 'idle'       ? '' : 'none';
  document.getElementById('recordActive').style.display     = state === 'active'     ? '' : 'none';
  document.getElementById('recordProcessing').style.display = state === 'processing' ? '' : 'none';
}

function updateProcessingHint(text) {
  const el = document.getElementById('processingHint');
  if (el) el.textContent = text;
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function startRecordTimer() {
  recStartTime = Date.now();
  recTimerInterval = setInterval(async () => {
    const elapsed = Date.now() - recStartTime;
    const m = Math.floor(elapsed / 60000);
    const s = Math.floor((elapsed % 60000) / 1000);
    const str = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    document.getElementById('recTimerDisplay').textContent = str;
    ipcRenderer.invoke('update-recording-time', str).catch(() => {});
  }, 1000);
}

function stopRecordTimer() {
  clearInterval(recTimerInterval);
  recTimerInterval = null;
}

// ─── Visualizer ───────────────────────────────────────────────────────────────
function startVizLoop() {
  const micBuf = analyserMic ? new Uint8Array(analyserMic.frequencyBinCount) : null;
  const sysBuf = analyserSys ? new Uint8Array(analyserSys.frequencyBinCount) : null;

  function tick() {
    if (!isRecording) return;

    // Mic level
    let micRms = 0;
    if (analyserMic && micBuf) {
      analyserMic.getByteTimeDomainData(micBuf);
      let sum = 0;
      for (let i = 0; i < micBuf.length; i++) { const n = micBuf[i] / 128 - 1; sum += n * n; }
      micRms = Math.sqrt(sum / micBuf.length);
    }

    // System level
    let sysRms = 0;
    if (analyserSys && sysBuf) {
      analyserSys.getByteTimeDomainData(sysBuf);
      let sum = 0;
      for (let i = 0; i < sysBuf.length; i++) { const n = sysBuf[i] / 128 - 1; sum += n * n; }
      sysRms = Math.sqrt(sum / sysBuf.length);
    }

    // Update level bars
    setLevelBar('micLevelBar',       micRms * 4);
    setLevelBar('sysLevelBar',       sysRms * 4);
    setLevelBar('micLevelBarActive', micRms * 4);
    setLevelBar('sysLevelBarActive', sysRms * 4);

    // Update active waveform
    animateLiveWaveform('activeWaveform', ACTIVE_BARS, micRms);

    // Relay to overlay
    ipcRenderer.send('relay-audio-level', Math.min(1, micRms * 5));

    vizRAF = requestAnimationFrame(tick);
  }
  tick();
}

function stopVizLoop() {
  if (vizRAF) { cancelAnimationFrame(vizRAF); vizRAF = null; }
  setLevelBar('micLevelBar', 0);
  setLevelBar('sysLevelBar', 0);
  setLevelBar('micLevelBarActive', 0);
  setLevelBar('sysLevelBarActive', 0);
}

function setLevelBar(id, ratio) {
  const el = document.getElementById(id);
  if (el) el.style.width = Math.min(100, ratio * 100) + '%';
}

// ─── Waveform Helpers ─────────────────────────────────────────────────────────
function buildWaveformBars(containerId, count, minH) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const b = document.createElement('div');
    b.className = 'bar';
    b.style.height = minH + 'px';
    c.appendChild(b);
  }
}

function animateIdleWaveform(containerId) {
  const c = document.getElementById(containerId);
  if (!c) return;
  const bars = c.querySelectorAll('.bar');
  const heights = [4, 8, 14, 20, 28, 22, 16, 10, 6, 10, 18, 26, 20, 14, 8, 12, 18, 10,
                   14, 22, 16, 8, 12, 20, 18, 6, 10, 14];
  let frame = 0;
  setInterval(() => {
    if (containerId === 'recordIdleWaveform' && previewAnalyser) {
      return;
    }
    frame++;
    bars.forEach((b, i) => {
      const base = heights[i % heights.length];
      const wave = Math.sin((frame * 0.08) + i * 0.45) * 6;
      b.style.height = Math.max(2, base + wave) + 'px';
    });
  }, 60);
}

function animateLiveWaveform(containerId, count, rms) {
  const c = document.getElementById(containerId);
  if (!c) return;
  const bars = c.querySelectorAll('.bar');
  const level = Math.min(1, rms * 5);
  bars.forEach((b, i) => {
    const center = (count - 1) / 2;
    const falloff = 1 - Math.abs(i - center) / center * 0.5;
    const rand = 0.7 + Math.random() * 0.6;
    const h = Math.max(2, level * 44 * falloff * rand);
    b.style.height = h + 'px';
  });
}

// ─── Library ──────────────────────────────────────────────────────────────────
function setupLibrary() {
  document.getElementById('searchInput').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const filtered = q
      ? allMeetings.filter(m =>
          m.title?.toLowerCase().includes(q) ||
          m.transcript?.toLowerCase().includes(q) ||
          m.summary?.toLowerCase().includes(q))
      : allMeetings;
    renderMeetingCards(filtered);
  });

  const uploadBtn = document.getElementById('uploadAudioBtn');
  const uploadInput = document.getElementById('audioUploadInput');

  uploadBtn?.addEventListener('click', () => {
    if (isRecording) {
      showToast('Stop active recording before uploading a file.', 'warning');
      return;
    }
    uploadInput?.click();
  });

  uploadInput?.addEventListener('change', handleUploadedAudioFile);
}

function setUploadButtonBusy(isBusy) {
  const btn = document.getElementById('uploadAudioBtn');
  const label = document.getElementById('uploadAudioBtnLabel');
  if (!btn) return;

  if (!btn.dataset.defaultLabel && label) {
    btn.dataset.defaultLabel = label.textContent.trim();
  }

  btn.disabled = isBusy;
  if (label) {
    label.textContent = isBusy ? 'Uploading...' : (btn.dataset.defaultLabel || 'Upload Audio');
  }
}

function titleFromUploadedFileName(fileName) {
  const withoutExt = String(fileName || '').replace(/\.[^.]+$/, '');
  const clean = withoutExt.replace(/[_-]+/g, ' ').trim();
  return clean || 'Uploaded Meeting Recording';
}

async function handleUploadedAudioFile(event) {
  const input = event?.target;
  const file = input?.files?.[0];

  if (!file) return;
  if (isRecording) {
    showToast('Stop active recording before uploading a file.', 'warning');
    input.value = '';
    return;
  }

  const filePath = file.path;
  if (!filePath) {
    showToast('Could not read selected file path.', 'error');
    input.value = '';
    return;
  }

  setUploadButtonBusy(true);
  showToast(`Uploading ${file.name} for transcription...`, 'info');

  try {
    const language = await getSetting('transcriptionLanguage') || 'en';
    const title = titleFromUploadedFileName(file.name);

    const result = await ipcRenderer.invoke('transcribe-audio-file', {
      filePath,
      title,
      language,
      duration: 0
    });

    const normalized = normaliseMeeting(result);
    upsertMeeting(normalized);
    allMeetings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    persistMeetingsCache(allMeetings);
    updateDashboardStats();
    renderMeetingCards(allMeetings);

    showToast('File transcribed successfully!', 'success');
    openMeetingDetail(normalized);
  } catch (err) {
    console.error('Upload transcription error:', err);
    showToast('Upload failed: ' + (err?.message || 'Unknown error'), 'error');
  } finally {
    setUploadButtonBusy(false);
    input.value = '';
  }
}

async function loadMeetings() {
  const cached = readMeetingsCache();
  const target = resolveBackendUrl(backendUrl);
  backendUrl = target;

  try {
    const resp = await fetch(`${target}/api/meetings`, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    const fromBackend = (data.meetings || []).map(normaliseMeeting);
    if (fromBackend.length > 0) {
      allMeetings = mergeMeetings(fromBackend, cached);
      persistMeetingsCache(allMeetings);
    } else {
      allMeetings = cached;
    }
  } catch (e) {
    console.warn('Could not load meetings:', e.message);
    allMeetings = cached;
  }

  if (allMeetings.length === 0) {
    try {
      const local = await ipcRenderer.invoke('list-local-recordings');
      const localMeetings = (local?.meetings || []).map(normaliseMeeting);
      if (localMeetings.length > 0) {
        allMeetings = localMeetings;
        persistMeetingsCache(allMeetings);
      }
    } catch (e) {
      console.warn('Could not load local recording fallback:', e.message);
    }
  }

  allMeetings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  updateDashboardStats();
  renderMeetingCards(allMeetings);
}

// Derive a meaningful title from the summary when the backend didn't provide one.
// Takes the first complete sentence (or first ~60 chars) of the summary.
function deriveTitleFromSummary(summary) {
  if (!summary) return null;
  const clean = summary.replace(/\s+/g, ' ').trim();
  const sentenceEnd = clean.search(/[.!?]\s/);
  const sentence = sentenceEnd > 0 ? clean.slice(0, sentenceEnd + 1) : clean;
  if (sentence.length < 8) return null;
  return sentence.length > 64 ? sentence.slice(0, 61).trimEnd() + '…' : sentence;
}

function meetingDisplayTitle(m) {
  if (m.title && m.title !== 'Untitled Meeting' && m.title !== 'Meeting Recording') return m.title;
  return deriveTitleFromSummary(m.summary) || m.title || 'Untitled Meeting';
}

// Returns a date-bucket key "Today", "Yesterday", or "Mon, Apr 7"
function dateBucket(isoDate) {
  if (!isoDate) return 'Unknown Date';
  const d = new Date(isoDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - target) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function renderMeetingCards(meetings) {
  const grid  = document.getElementById('meetingsGrid');
  const empty = document.getElementById('libraryEmpty');
  const count = document.getElementById('recCount');
  if (!grid) return;

  count.textContent = `${meetings.length} recording${meetings.length !== 1 ? 's' : ''}`;

  // Clear everything except the empty-state placeholder
  grid.querySelectorAll('.day-group, .meeting-card-lib').forEach(el => el.remove());

  if (meetings.length === 0) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  // Group by day bucket preserving sort order (newest first)
  const groups = [];
  const seen = new Map();
  for (const m of meetings) {
    const key = dateBucket(m.created_at);
    if (!seen.has(key)) { seen.set(key, []); groups.push(key); }
    seen.get(key).push(m);
  }

  for (const key of groups) {
    // Day header
    const header = document.createElement('div');
    header.className = 'day-group';
    header.innerHTML = `<span class="day-label">${escHtml(key)}</span><span class="day-count">${seen.get(key).length}</span>`;
    grid.appendChild(header);

    // Cards row for this day
    const row = document.createElement('div');
    row.className = 'day-cards';
    grid.appendChild(row);

    for (const m of seen.get(key)) {
      const displayTitle = meetingDisplayTitle(m);
      const card = document.createElement('div');
      card.className = 'meeting-card-lib';
      card.innerHTML = `
        <div class="lib-card-icon">
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
            <rect x="1"  y="10" width="4" height="12" rx="2" fill="#FF5757"/>
            <rect x="7"  y="6"  width="4" height="20" rx="2" fill="#FF5757"/>
            <rect x="13" y="8"  width="4" height="16" rx="2" fill="#FF5757"/>
            <rect x="19" y="4"  width="4" height="24" rx="2" fill="#FF5757"/>
            <rect x="25" y="10" width="4" height="12" rx="2" fill="#FF5757"/>
          </svg>
        </div>
        <div class="lib-card-title">${escHtml(displayTitle)}</div>
        <div class="lib-card-preview">${escHtml(m.summary || m.transcript || 'No summary available')}</div>
        <div class="lib-card-footer">
          <span class="lib-chip">${new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          <span class="lib-chip-sep">·</span>
          <span class="lib-chip">${formatDuration(m.duration || 0)}</span>
          <span class="lib-chip-ok">✓ Synced</span>
        </div>
      `;
      card.addEventListener('click', () => openMeetingDetail(m));
      row.appendChild(card);
    }
  }
}

// ─── Meeting Detail ───────────────────────────────────────────────────────────
function setupDetail() {
  document.getElementById('backBtn').addEventListener('click', () => switchView('library'));

  // Tab switching
  document.querySelectorAll('#detailTabs .tab-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#detailTabs .tab-pill').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      pill.classList.add('active');
      document.getElementById('tab' + capitalise(pill.dataset.tab))?.classList.add('active');
    });
  });

  document.getElementById('copyMdBtn').addEventListener('click', copyMeetingMarkdown);
}

// Render a transcript with speaker labels into readable, grouped paragraphs.
function renderTranscript(el, transcript) {
  if (!el) return;
  el.innerHTML = '';
  const text = (transcript || '').trim();
  if (!text) {
    const empty = document.createElement('div');
    empty.className = 'tx-empty';
    empty.textContent = 'No transcript available.';
    el.appendChild(empty);
    return;
  }

  const labelRe = /^\s*(YOU|OTHER|You|Other|Speaker)\s*:\s*/;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let curSpeaker = null;
  let curText = [];

  const flush = () => {
    if (!curText.length) return;
    const block = document.createElement('div');
    block.className = 'tx-block' + (curSpeaker ? ' ' + (curSpeaker.toLowerCase() === 'you' ? 'you' : 'other') : '');
    if (curSpeaker) {
      const spk = document.createElement('div');
      spk.className = 'tx-spk';
      spk.textContent = curSpeaker.toLowerCase() === 'you' ? 'You' : (curSpeaker.toLowerCase() === 'other' ? 'Other' : curSpeaker);
      block.appendChild(spk);
    }
    const p = document.createElement('div');
    p.className = 'tx-text';
    p.textContent = curText.join(' ').replace(/\s+/g, ' ').trim();
    block.appendChild(p);
    el.appendChild(block);
    curText = [];
  };

  let hadLabels = false;
  for (const line of lines) {
    const mt = line.match(labelRe);
    if (mt) {
      hadLabels = true;
      const spk = mt[1].toLowerCase();
      const body = line.replace(labelRe, '').trim();
      if (spk !== (curSpeaker || '').toLowerCase()) { flush(); curSpeaker = mt[1]; }
      if (body) curText.push(body);
    } else {
      curText.push(line);
    }
  }
  flush();

  // No speaker labels at all → show as clean paragraphs by sentence grouping
  // so a long monologue reads as several short paragraphs, not one wall of text.
  if (!hadLabels) {
    el.innerHTML = '';
    const clean = text.replace(/\s+/g, ' ').trim();
    const sentences = clean.match(/[^.!?]+[.!?]+|\S+$/g) || [clean];
    const PER_PARA = 3;
    for (let i = 0; i < sentences.length; i += PER_PARA) {
      const p = document.createElement('div');
      p.className = 'tx-text';
      p.style.marginBottom = '12px';
      p.textContent = sentences.slice(i, i + PER_PARA).join(' ').trim();
      el.appendChild(p);
    }
  }
}

function openMeetingDetail(m) {
  document.getElementById('detailTitle').textContent     = meetingDisplayTitle(m);
  document.getElementById('detailDate').textContent      = formatDate(m.created_at);
  document.getElementById('detailDuration').textContent  = formatDuration(m.duration || 0);
  document.getElementById('detailConfidence').textContent =
    m.confidence ? `${Math.round(m.confidence * 100)}% confidence` : '';

  renderRichSummary(document.getElementById('summaryText'), m);

  const kpList = document.getElementById('keypointsList');
  kpList.innerHTML = '';
  (m.key_points || []).forEach(kp => {
    const li = document.createElement('li');
    li.textContent = kp;
    kpList.appendChild(li);
  });
  if ((m.key_points || []).length === 0) kpList.innerHTML = '<li>No key points extracted.</li>';

  const actList = document.getElementById('actionsList');
  actList.innerHTML = '';
  (m.action_items || []).forEach(ai => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="action-checkbox"></span><span>${escHtml(ai)}</span>`;
    actList.appendChild(li);
  });
  if ((m.action_items || []).length === 0) actList.innerHTML = '<li><span class="action-checkbox"></span><span>No action items found.</span></li>';

  renderTranscript(document.getElementById('transcriptText'), m.transcript || '');

  // Diagram tab — show only when the backend produced a Mermaid diagram
  const diagTab  = document.querySelector('#detailTabs .tab-pill[data-tab="diagram"]');
  const diagWrap = document.getElementById('diagramWrap');
  const diagramSrc = (m.diagram || '').trim();
  if (diagramSrc && diagTab && diagWrap) {
    diagTab.style.display = '';
    renderDiagram(diagWrap, diagramSrc, m.id);
  } else if (diagTab) {
    diagTab.style.display = 'none';
  }

  // Conversation tab — show speaker bubbles if diarized, else hide tab
  const convTab  = document.querySelector('#detailTabs .tab-pill[data-tab="conversation"]');
  const convPane = document.getElementById('tabConversation');
  if (m.diarized_transcript && m.diarized_transcript.length > 0 && convTab && convPane) {
    convTab.style.display = '';
    renderConversation(convPane, m.diarized_transcript, m.speakers || {});
  } else if (convTab) {
    convTab.style.display = 'none';
  }

  // Reset to summary tab
  document.querySelectorAll('#detailTabs .tab-pill').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('#detailTabs .tab-pill[data-tab="summary"]').classList.add('active');
  document.getElementById('tabSummary').classList.add('active');

  // Store current meeting for copy
  document.getElementById('copyMdBtn').dataset.meeting = JSON.stringify(m);

  switchView('detail');
  // Swap nav highlight to library
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector('.nav-item[data-view="library"]')?.classList.add('active');
}

// Rich, structured Summary tab: overview + topic cards + decisions + participants.
// Falls back to plain paragraphs for older meetings that only have `summary`.
function renderRichSummary(el, m) {
  if (!el) return;
  el.innerHTML = '';

  const overview   = (m.overview || m.summary || '').trim();
  const topics     = Array.isArray(m.topics) ? m.topics : [];
  const decisions  = Array.isArray(m.decisions) ? m.decisions : [];
  const people     = Array.isArray(m.participants) ? m.participants : [];
  const sentiment  = (m.sentiment || '').trim();

  if (!overview && !topics.length && !decisions.length) {
    const empty = document.createElement('div');
    empty.className = 'tx-empty';
    empty.textContent = 'No summary available.';
    el.appendChild(empty);
    return;
  }

  // ── Overview ──
  if (overview) {
    const sec = document.createElement('div');
    sec.className = 'sum-overview';
    overview.split(/\n\s*\n|\n/).map(s => s.trim()).filter(Boolean).forEach(para => {
      const p = document.createElement('p');
      p.textContent = para;
      sec.appendChild(p);
    });
    el.appendChild(sec);
  }

  // ── Meta chips: participants + sentiment ──
  if (people.length || sentiment) {
    const meta = document.createElement('div');
    meta.className = 'sum-meta';
    people.forEach(p => {
      const name = (typeof p === 'string') ? p : (p.name || '');
      const role = (typeof p === 'object' && p.role) ? p.role : '';
      if (!name) return;
      const chip = document.createElement('span');
      chip.className = 'sum-chip person';
      chip.innerHTML = `<span class="sum-chip-dot"></span>${escHtml(name)}` +
        (role ? `<span class="sum-chip-role">${escHtml(role)}</span>` : '');
      meta.appendChild(chip);
    });
    if (sentiment) {
      const chip = document.createElement('span');
      chip.className = 'sum-chip mood';
      chip.textContent = sentiment;
      meta.appendChild(chip);
    }
    el.appendChild(meta);
  }

  // ── Decisions ──
  if (decisions.length) {
    el.appendChild(_sumSectionTitle('Decisions'));
    const ul = document.createElement('ul');
    ul.className = 'sum-decisions';
    decisions.forEach(d => {
      const li = document.createElement('li');
      li.textContent = d;
      ul.appendChild(li);
    });
    el.appendChild(ul);
  }

  // ── Topic cards ──
  if (topics.length) {
    el.appendChild(_sumSectionTitle('Topics'));
    const grid = document.createElement('div');
    grid.className = 'sum-topics';
    topics.forEach(t => {
      const title = (t && t.title) ? t.title : '';
      const points = (t && Array.isArray(t.points)) ? t.points : [];
      if (!title && !points.length) return;
      const card = document.createElement('div');
      card.className = 'sum-topic-card';
      if (title) {
        const h = document.createElement('div');
        h.className = 'sum-topic-title';
        h.textContent = title;
        card.appendChild(h);
      }
      if (points.length) {
        const ul = document.createElement('ul');
        points.forEach(pt => {
          const li = document.createElement('li');
          li.textContent = pt;
          ul.appendChild(li);
        });
        card.appendChild(ul);
      }
      grid.appendChild(card);
    });
    el.appendChild(grid);
  }
}

function _sumSectionTitle(text) {
  const h = document.createElement('div');
  h.className = 'sum-section-title';
  h.textContent = text;
  return h;
}

// Render a Mermaid diagram string into `wrap`. Offline (bundled mermaid).
// Fails soft: on any error, hides nothing breaks — shows a small notice.
let _mermaidInited = false;
async function renderDiagram(wrap, src, id) {
  if (!wrap) return;
  wrap.innerHTML = '';
  if (typeof mermaid === 'undefined') {
    wrap.innerHTML = '<div class="tx-empty">Diagram engine unavailable.</div>';
    return;
  }
  try {
    if (!_mermaidInited) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'dark',
        themeVariables: {
          background: 'transparent',
          primaryColor: '#1A2140',
          primaryTextColor: '#EAF0FF',
          primaryBorderColor: '#73B7FF',
          lineColor: '#8F7DFF',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        },
      });
      _mermaidInited = true;
    }
    const gid = 'mmd-' + String(id || Math.random()).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
    const { svg } = await mermaid.render(gid, src);
    wrap.innerHTML = svg;
  } catch (e) {
    console.warn('mermaid render failed:', e);
    wrap.innerHTML = '<div class="tx-empty">Could not render the diagram for this meeting.</div>';
  }
}

// Palette for N-speaker diarized conversations (cycles for >4 speakers).
const _SPEAKER_PALETTE = ['#73B7FF', '#3EE6D8', '#8F7DFF', '#FF9C6A', '#F472B6', '#FBBF24'];

function renderConversation(pane, segments, speakers) {
  pane.innerHTML = '';

  // Map every distinct speaker label → display name + a stable color.
  const order = [];
  const colorOf = {};
  const nameOf = {};
  const norm = (s) => String(s == null ? '' : s);

  for (const seg of segments) {
    const key = norm(seg.speaker);
    if (!(key in colorOf)) {
      colorOf[key] = _SPEAKER_PALETTE[order.length % _SPEAKER_PALETTE.length];
      // Legacy you/other → friendly names; otherwise use speakers map or label itself.
      const lk = key.toLowerCase();
      nameOf[key] = (lk === 'you') ? (speakers.you || 'You')
                  : (lk === 'other') ? (speakers.other || 'Other')
                  : (speakers[key] || key || 'Speaker');
      order.push(key);
    }
  }

  // Legend
  const legend = document.createElement('div');
  legend.className = 'conv-legend';
  order.forEach(key => {
    const span = document.createElement('span');
    span.className = 'conv-legend-item';
    span.innerHTML = `<span class="conv-dot" style="background:${colorOf[key]}"></span>${escHtml(nameOf[key])}`;
    legend.appendChild(span);
  });
  pane.appendChild(legend);

  const feed = document.createElement('div');
  feed.className = 'conv-feed';

  // First speaker sits on the right (treated as "you"-side), rest on the left.
  const youSide = order[0];

  for (const seg of segments) {
    const key = norm(seg.speaker);
    const isYou = key === youSide;
    const color = colorOf[key] || _SPEAKER_PALETTE[0];

    const bubble = document.createElement('div');
    bubble.className = `conv-bubble ${isYou ? 'you' : 'other'}`;
    bubble.style.setProperty('--spk-color', color);
    bubble.innerHTML = `
      <div class="conv-name" style="color:${color}">${escHtml(nameOf[key] || 'Speaker')}</div>
      <div class="conv-text">${escHtml(seg.text)}</div>
    `;
    feed.appendChild(bubble);
  }

  pane.appendChild(feed);
}

function copyMeetingMarkdown() {
  try {
    const m = JSON.parse(document.getElementById('copyMdBtn').dataset.meeting || '{}');
    const parts = [
      `# ${m.title || 'Meeting'}`,
      `*${formatDate(m.created_at)} · ${formatDuration(m.duration || 0)}*`,
      '',
      '## Summary',
      m.overview || m.summary || '',
    ];
    const people = Array.isArray(m.participants) ? m.participants : [];
    if (people.length) {
      parts.push('', '## Participants',
        people.map(p => {
          const n = (typeof p === 'string') ? p : (p.name || '');
          const r = (typeof p === 'object' && p.role) ? ` — ${p.role}` : '';
          return `- ${n}${r}`;
        }).join('\n'));
    }
    if (Array.isArray(m.decisions) && m.decisions.length) {
      parts.push('', '## Decisions', m.decisions.map(d => `- ${d}`).join('\n'));
    }
    if (Array.isArray(m.topics) && m.topics.length) {
      parts.push('', '## Topics');
      m.topics.forEach(t => {
        if (t.title) parts.push(`### ${t.title}`);
        (t.points || []).forEach(p => parts.push(`- ${p}`));
      });
    } else if (Array.isArray(m.key_points) && m.key_points.length) {
      parts.push('', '## Key Points', m.key_points.map(k => `- ${k}`).join('\n'));
    }
    parts.push('', '## Action Items',
      (m.action_items || []).map(a => `- [ ] ${a}`).join('\n'));
    if ((m.diagram || '').trim()) {
      parts.push('', '## Diagram', '```mermaid', m.diagram.trim(), '```');
    }
    parts.push('', '## Transcript', m.transcript || '');
    const md = parts.join('\n');
    require('electron').clipboard.writeText(md);
    showToast('Copied as Markdown', 'success');
  } catch (e) {
    showToast('Copy failed', 'error');
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function setupSettings() {
  // Settings tab pills
  document.querySelectorAll('#settingsTabs .tab-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#settingsTabs .tab-pill').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.stab-content').forEach(c => c.classList.remove('active'));
      pill.classList.add('active');
      document.getElementById('stab' + capitalise(pill.dataset.stab))?.classList.add('active');
    });
  });

  document.getElementById('testConnectionBtn').addEventListener('click', testConnection);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

  // Mode switch (record | live) — applies immediately
  document.querySelectorAll('#modeSwitch .mode-opt').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#modeSwitch .mode-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const stored = await ipcRenderer.invoke('get-settings').catch(() => ({}));
      await ipcRenderer.invoke('save-settings', { ...stored, mode: btn.dataset.mode }).catch(() => {});
      showToast(btn.dataset.mode === 'live' ? 'Live Coach mode on' : 'Record mode on', 'success');
    });
  });

  const hideOverlay = document.getElementById('hideOverlayToggle');
  if (hideOverlay) {
    hideOverlay.addEventListener('change', async () => {
      const stored = await ipcRenderer.invoke('get-settings').catch(() => ({}));
      await ipcRenderer.invoke('save-settings', { ...stored, hideOverlayWhileSharing: hideOverlay.checked }).catch(() => {});
    });
  }

  const autoDetect = document.getElementById('autoDetectToggle');
  if (autoDetect) {
    autoDetect.addEventListener('change', async () => {
      const stored = await ipcRenderer.invoke('get-settings').catch(() => ({}));
      await ipcRenderer.invoke('save-settings', { ...stored, autoDetectMeetings: autoDetect.checked }).catch(() => {});
      await ipcRenderer.invoke('set-meeting-detection', autoDetect.checked).catch(() => {});
      showToast(autoDetect.checked ? 'Auto-detect on' : 'Auto-detect off', 'info');
    });
  }
}

async function testConnection() {
  const rawUrl = document.getElementById('backendUrlInput').value.trim();
  const normalized = normaliseBackendUrl(rawUrl);
  const url = resolveBackendUrl(normalized || backendUrl);
  const status = document.getElementById('connectionStatus');
  status.textContent = 'Testing…';
  status.className   = 'connection-status';
  try {
    if (!normalized) throw new Error('Invalid URL');
    if (isLocalBackendUrl(normalized)) throw new Error('Localhost URL is disabled. Use deployed backend URL.');

    // Quick probe first; if it fails the service may just be asleep (Render free
    // tier cold start), so keep probing with longer timeouts and a "Waking…" hint
    // instead of reporting a false failure.
    let ok = await probeBackend(url, 6000);
    if (!ok) {
      status.textContent = 'Waking backend…';
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        ok = await probeBackend(url, 15000);
      }
    }
    if (ok) {
      status.textContent = '✓ Connected';
      status.className   = 'connection-status ok';
    } else throw new Error('No response (service may be down)');
  } catch (e) {
    status.textContent = `✗ Failed: ${e.message}`;
    status.className   = 'connection-status fail';
  }
}

async function saveSettings() {
  const inputUrl = document.getElementById('backendUrlInput').value.trim();
  const normalisedInputUrl = normaliseBackendUrl(inputUrl);
  const resolvedBackendUrl = resolveBackendUrl(normalisedInputUrl || backendUrl);

  const settings = {
    backendUrl:            resolvedBackendUrl,
    transcriptionLanguage: document.getElementById('langSelect').value,
    autoUpload:            document.getElementById('autoUploadToggle').checked,
    showMenuBarIcon:       document.getElementById('menuBarToggle').checked,
    captureSystemAudio:    document.getElementById('sysAudioToggle').checked,
  };

  backendUrl = settings.backendUrl || backendUrl;
  document.getElementById('backendUrlInput').value = backendUrl;

  if (inputUrl && !normalisedInputUrl) {
    showToast('Invalid backend URL. Reverted to default.', 'warning');
  } else if (normalisedInputUrl && isLocalBackendUrl(normalisedInputUrl)) {
    showToast('Localhost backend disabled. Using deployed backend instead.', 'warning');
  }

  await ipcRenderer.invoke('save-settings', settings).catch(() => {});
  await checkBackendHealth();
  await loadMeetings();
  showToast('Settings saved', 'success');
}

async function getSetting(key) {
  try {
    const s = await ipcRenderer.invoke('get-settings');
    return s[key];
  } catch { return null; }
}

// ─── Toasts ───────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ─── Meeting auto-detect prompt ─────────────────────────────────────────────────
let meetingPromptEl = null;
async function showMeetingPrompt(platform) {
  if (meetingPromptEl) return; // already showing
  const mode = (await getSetting('mode')) || 'record';
  const actionLabel = mode === 'live' ? 'Start Live Coach' : 'Start Recording';

  const el = document.createElement('div');
  el.className = 'meeting-prompt';
  el.innerHTML = `
    <div class="mp-icon">🎙️</div>
    <div class="mp-body">
      <div class="mp-title">${escHtml(platform)} detected</div>
      <div class="mp-sub">Want MeetNote to capture this meeting?</div>
    </div>
    <div class="mp-actions">
      <button class="mp-start" type="button">${escHtml(actionLabel)}</button>
      <button class="mp-dismiss" type="button">Dismiss</button>
    </div>`;
  document.body.appendChild(el);
  meetingPromptEl = el;
  requestAnimationFrame(() => el.classList.add('show'));

  const close = () => {
    el.classList.remove('show');
    setTimeout(() => { el.remove(); if (meetingPromptEl === el) meetingPromptEl = null; }, 250);
  };

  el.querySelector('.mp-start').addEventListener('click', () => { close(); beginRecording(); });
  el.querySelector('.mp-dismiss').addEventListener('click', close);

  // Auto-dismiss after 15s if ignored.
  setTimeout(() => { if (meetingPromptEl === el) close(); }, 15000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function applySettingsToUI(settings = {}) {
  if (!settings || typeof settings !== 'object') return;

  if (settings.transcriptionLanguage && document.getElementById('langSelect')) {
    document.getElementById('langSelect').value = settings.transcriptionLanguage;
  }
  if (typeof settings.autoUpload === 'boolean' && document.getElementById('autoUploadToggle')) {
    document.getElementById('autoUploadToggle').checked = settings.autoUpload;
  }
  if (typeof settings.captureSystemAudio === 'boolean' && document.getElementById('sysAudioToggle')) {
    document.getElementById('sysAudioToggle').checked = settings.captureSystemAudio;
  }
  if (typeof settings.showMenuBarIcon === 'boolean' && document.getElementById('menuBarToggle')) {
    document.getElementById('menuBarToggle').checked = settings.showMenuBarIcon;
  }
  if (settings.mode && document.getElementById('modeSwitch')) {
    document.querySelectorAll('#modeSwitch .mode-opt').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === settings.mode);
    });
  }
  if (typeof settings.hideOverlayWhileSharing === 'boolean' && document.getElementById('hideOverlayToggle')) {
    document.getElementById('hideOverlayToggle').checked = settings.hideOverlayWhileSharing;
  }
  if (typeof settings.autoDetectMeetings === 'boolean' && document.getElementById('autoDetectToggle')) {
    document.getElementById('autoDetectToggle').checked = settings.autoDetectMeetings;
  }
}

function normaliseBackendUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (LEGACY_BACKEND_HOSTS.has(parsed.hostname)) {
      return new URL(DEFAULT_BACKEND_URL).origin;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function isLocalBackendUrl(url) {
  const normalized = normaliseBackendUrl(url);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function resolveBackendUrl(url, fallback = DEFAULT_BACKEND_URL) {
  const normalized = normaliseBackendUrl(url);
  if (normalized && !isLocalBackendUrl(normalized)) {
    return normalized;
  }
  return normaliseBackendUrl(fallback) || DEFAULT_BACKEND_URL;
}

function normaliseMeeting(meeting) {
  const safe = meeting || {};
  return {
    ...safe,
    id: safe.id || `${safe.title || 'meeting'}-${safe.created_at || safe.createdAt || Date.now()}`,
    title: safe.title || 'Untitled Meeting',
    transcript: safe.transcript || '',
    summary: safe.summary || '',
    key_points: Array.isArray(safe.key_points) ? safe.key_points : (Array.isArray(safe.keyPoints) ? safe.keyPoints : []),
    action_items: Array.isArray(safe.action_items) ? safe.action_items : (Array.isArray(safe.actionItems) ? safe.actionItems : []),
    speakers: safe.speakers || null,
    diarized_transcript: Array.isArray(safe.diarized_transcript) ? safe.diarized_transcript :
                         Array.isArray(safe.diarizedTranscript) ? safe.diarizedTranscript : null,
    duration: Number.isFinite(Number(safe.duration)) ? Number(safe.duration) : 0,
    confidence: Number.isFinite(Number(safe.confidence)) ? Number(safe.confidence) : 0,
    language: safe.language || 'en',
    created_at: safe.created_at || safe.createdAt || new Date().toISOString()
  };
}

function readMeetingsCache() {
  try {
    const raw = localStorage.getItem(LOCAL_MEETINGS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(normaliseMeeting) : [];
  } catch {
    return [];
  }
}

function persistMeetingsCache(meetings) {
  try {
    localStorage.setItem(LOCAL_MEETINGS_KEY, JSON.stringify((meetings || []).slice(0, 200)));
  } catch {
    // Ignore cache write errors silently.
  }
}

function mergeMeetings(primary, secondary) {
  const map = new Map();
  [...(secondary || []), ...(primary || [])]
    .map(normaliseMeeting)
    .forEach(meeting => {
      const key = meeting.id || `${meeting.title}-${meeting.created_at}`;
      map.set(key, meeting);
    });
  return Array.from(map.values());
}

function upsertMeeting(meeting) {
  const normalized = normaliseMeeting(meeting);
  const idx = allMeetings.findIndex(m => String(m.id) === String(normalized.id));
  if (idx >= 0) {
    allMeetings[idx] = normalized;
  } else {
    allMeetings.unshift(normalized);
  }
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function formatDuration(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function capitalise(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
