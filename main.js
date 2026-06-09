const { app, BrowserWindow, ipcMain, systemPreferences, Menu, Tray, screen, nativeImage, session, desktopCapturer, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const Store = require('electron-store');
const axios = require('axios');

const store = new Store();

// ── Platform ────────────────────────────────────────────────────────────────
// Single source of truth for platform branching, mirroring renderer.js. Set
// MEETNOTE_FORCE_PLATFORM=win32 to simulate Windows on a Mac for testing the
// non-native (browser loopback) capture path without a Windows machine.
// NOTE: the real Swift binary can only ever spawn on a real darwin host, so we
// only let it run when BOTH the forced platform and the real OS are darwin.
const PLATFORM = process.env.MEETNOTE_FORCE_PLATFORM || process.platform;
const IS_MAC = PLATFORM === 'darwin';
const IS_WIN = PLATFORM === 'win32';
const CAN_RUN_SWIFT = IS_MAC && process.platform === 'darwin';
if (process.env.MEETNOTE_FORCE_PLATFORM) {
  safeConsoleEarly(`[platform] FORCED to "${PLATFORM}" (real: ${process.platform}) — simulation mode`);
}
function safeConsoleEarly(msg) { try { console.warn(msg); } catch {} }

// In production (packaged app), __dirname is inside app.asar which is a virtual FS.
// Use process.resourcesPath to reach real files bundled alongside the asar.
const IS_PACKAGED = app.isPackaged;

// Assets live inside app.asar — __dirname works for reads even in packaged apps.
const TRAY_ICON_PATH = path.join(__dirname, 'assets/tray-icon.png');
const APP_ICON_PATH  = path.join(__dirname, 'assets/icon.png');
const DEFAULT_BACKEND_URL = 'https://meetnote-18tt.onrender.com';
const LEGACY_BACKEND_HOSTS = new Set(['meetnote-backend.onrender.com']);

// Swift bridge — in production the pre-compiled binary is bundled under Resources/swift-bridge/
// In dev it is compiled on-demand from source.
const SWIFT_BRIDGE_SOURCE        = path.join(__dirname, 'swift-bridge/SwiftCaptureBridge.swift');
const SWIFT_AUDIO_CAPTURE_SOURCE = path.join(__dirname, 'swift-bridge/AudioCaptureService.swift');
const SWIFT_APP_SETTINGS_SOURCE  = path.join(__dirname, 'swift-bridge/AppSettings.swift');
const SWIFT_BRIDGE_BUILD_DIR     = IS_PACKAGED
  ? path.join(process.resourcesPath, 'swift-bridge')
  : path.join(__dirname, '.swift-bridge');
const SWIFT_BRIDGE_BINARY    = path.join(SWIFT_BRIDGE_BUILD_DIR, 'swift-capture-bridge');
const SWIFT_BRIDGE_ENTITLEMENTS = IS_PACKAGED
  ? path.join(process.resourcesPath, 'entitlements.mac.plist')
  : path.join(__dirname, 'entitlements.mac.plist');

function safeConsole(method, ...args) {
  try {
    const fn = typeof console[method] === 'function' ? console[method] : console.log;
    fn(...args);
  } catch {
    // Avoid crashing the main process if stdio becomes unavailable.
  }
}

function normaliseBackendUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = new URL(raw.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (LEGACY_BACKEND_HOSTS.has(parsed.hostname)) {
      return new URL(DEFAULT_BACKEND_URL).origin;
    }
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function normaliseLiveBackendUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = new URL(raw.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (LEGACY_BACKEND_HOSTS.has(parsed.hostname)) {
      return new URL(DEFAULT_BACKEND_URL).origin;
    }
    // The shipped Render backend serves the live-coaching WS route. Reject
    // localhost so a stale dev setting can't pin coach mode to a local server
    // that isn't running on an end user's machine.
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function detectAudioMimeType(filePath) {
  const ext = String(path.extname(filePath || '')).toLowerCase();
  switch (ext) {
    case '.m4a':
    case '.mp4':
      return 'audio/mp4';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.webm':
      return 'audio/webm';
    case '.ogg':
      return 'audio/ogg';
    case '.aac':
      return 'audio/aac';
    case '.flac':
      return 'audio/flac';
    default:
      return 'application/octet-stream';
  }
}

function findTranscribeCompanionFile(originalPath) {
  if (!originalPath) return null;

  const ext = path.extname(originalPath);
  const dir = path.dirname(originalPath);
  const base = path.basename(originalPath, ext);

  if (/_transcribe_16k$/i.test(base)) return null;

  const candidates = [
    path.join(dir, `${base}_transcribe_16k${ext}`),
    path.join(dir, `${base}_transcribe_16k.m4a`)
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      if (fs.statSync(candidate).size <= 0) continue;
      return candidate;
    } catch {
      // Ignore unreadable fallback candidates.
    }
  }

  return null;
}

function isRequestEntityTooLarge(error) {
  const status = Number(error?.response?.status || 0);
  if (status === 413) return true;

  const responseBody =
    typeof error?.response?.data === 'string'
      ? error.response.data
      : JSON.stringify(error?.response?.data || '');
  const text = `${error?.message || ''} ${responseBody}`.toLowerCase();

  return text.includes('request entity too large') ||
    text.includes('request_too_large') ||
    text.includes('413');
}

function buildAxiosTranscriptionError(error) {
  const status = error?.response?.status;
  const data = error?.response?.data;

  let detail = '';
  if (typeof data === 'string') {
    detail = data;
  } else if (data && typeof data === 'object') {
    detail = data.detail || data.error?.message || JSON.stringify(data);
  }

  if (status || detail) {
    const summary = String(detail || error?.message || 'Transcription request failed').slice(0, 240);
    return new Error(`Server ${status || 'error'}: ${summary}`);
  }

  return new Error(error?.message || 'Transcription request failed');
}

function parseRecordingIsoFromFilename(fileName) {
  const match = /^MeetNote_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)(?:_transcribe_[^.]*)?\.[a-z0-9]+$/i.exec(fileName);
  if (!match) return null;
  const stamp = match[1];
  const iso = stamp.replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, 'T$1:$2:$3Z');
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getRecordingDirectories() {
  const directories = [];

  try {
    const downloadsDir = app.getPath('downloads');
    if (downloadsDir) {
      directories.push(path.join(downloadsDir, 'meetnote'));
      // Keep reading from the legacy folder name so older recordings still appear.
      directories.push(path.join(downloadsDir, 'MeetNote Recordings'));
    }
  } catch {
    // Ignore path lookup errors and continue with legacy fallbacks.
  }

  const userDataDir = app.getPath('userData');
  const parentDir = path.dirname(userDataDir);
  const baseName = path.basename(userDataDir);
  const variants = [baseName];

  if (baseName === 'MeetNote') variants.push('meetnote');
  if (baseName === 'meetnote') variants.push('MeetNote');

  for (const name of variants) {
    directories.push(path.join(parentDir, name, 'Recordings'));
  }

  return Array.from(new Set(directories));
}

function listLocalRecordingMeetings(limit = 200) {
  const meetings = [];

  for (const recordingsDir of getRecordingDirectories()) {
    if (!fs.existsSync(recordingsDir)) continue;

    let entries = [];
    try {
      entries = fs.readdirSync(recordingsDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const fileName = entry.name;
      if (!/\.(m4a|mp4|wav|webm)$/i.test(fileName)) continue;
      if (/_transcribe_/i.test(fileName)) continue;

      const absolutePath = path.join(recordingsDir, fileName);
      let stats;
      try {
        stats = fs.statSync(absolutePath);
      } catch {
        continue;
      }

      const createdAt = parseRecordingIsoFromFilename(fileName) || stats.mtime.toISOString();
      const prettyDate = new Date(createdAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });

      meetings.push({
        id: `local-file:${absolutePath}`,
        title: `Recording ${prettyDate}`,
        transcript: '',
        summary: 'Audio file is available locally. Reprocess this recording to generate notes.',
        key_points: [],
        action_items: [],
        duration: 0,
        confidence: 0,
        language: 'en',
        created_at: createdAt,
        local_file_path: absolutePath,
        local_only: true
      });
    }
  }

  meetings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return meetings.slice(0, limit);
}

function getTrayIcon(size = 32) {
  const icon = nativeImage.createFromPath(TRAY_ICON_PATH);
  return icon.isEmpty() ? TRAY_ICON_PATH : icon.resize({ width: size, height: size });
}

function getAppIcon(size = 256) {
  const icon = nativeImage.createFromPath(APP_ICON_PATH);
  return icon.isEmpty() ? getTrayIcon(32) : icon.resize({ width: size, height: size });
}

function setDockIcon() {
  if (process.platform !== 'darwin') return;
  app.dock?.setIcon(getAppIcon(256));
}

function shouldRebuildSwiftBridge() {
  if (!fs.existsSync(SWIFT_BRIDGE_BINARY)) return true;
  const binaryMtime = fs.statSync(SWIFT_BRIDGE_BINARY).mtimeMs;
  return [SWIFT_BRIDGE_SOURCE, SWIFT_AUDIO_CAPTURE_SOURCE, SWIFT_APP_SETTINGS_SOURCE]
    .some(file => fs.existsSync(file) && fs.statSync(file).mtimeMs > binaryMtime);
}

function isSwiftBridgeValidlySigned(binaryPath) {
  if (process.platform !== 'darwin') return true;
  try {
    const r = spawnSync('codesign', ['--verify', '--strict', binaryPath], { encoding: 'utf8' });
    return r.status === 0;
  } catch {
    return false;
  }
}

function signSwiftBridgeBinary(binaryPath) {
  if (process.platform !== 'darwin') return;

  if (!fs.existsSync(SWIFT_BRIDGE_ENTITLEMENTS)) {
    throw new Error(`Swift bridge entitlements missing: ${SWIFT_BRIDGE_ENTITLEMENTS}`);
  }

  const sign = spawnSync(
    'codesign',
    ['--force', '--sign', '-', '--entitlements', SWIFT_BRIDGE_ENTITLEMENTS, binaryPath],
    { encoding: 'utf8' }
  );

  if (sign.status !== 0) {
    const err = (sign.stderr || sign.stdout || 'Swift bridge codesign failed').trim();
    throw new Error(err);
  }
}

function ensureSwiftBridgeBinary() {
  // In production the pre-compiled binary is bundled under Resources/swift-bridge/
  // Skip compilation entirely — just verify it exists.
  if (IS_PACKAGED) {
    if (!fs.existsSync(SWIFT_BRIDGE_BINARY)) {
      throw new Error(`Bundled swift-capture-bridge not found at: ${SWIFT_BRIDGE_BINARY}`);
    }
    fs.chmodSync(SWIFT_BRIDGE_BINARY, 0o755);
    return SWIFT_BRIDGE_BINARY;
  }

  const sourceFiles = [SWIFT_APP_SETTINGS_SOURCE, SWIFT_AUDIO_CAPTURE_SOURCE, SWIFT_BRIDGE_SOURCE];

  for (const file of sourceFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Swift bridge dependency missing: ${file}`);
    }
  }

  fs.mkdirSync(SWIFT_BRIDGE_BUILD_DIR, { recursive: true });

  if (!shouldRebuildSwiftBridge()) {
    // Do NOT re-sign an already-valid binary. `codesign --force` mints a new
    // adhoc identity each time, which invalidates the Screen Recording permission
    // the user granted to the previous identity — silently killing system audio.
    if (!isSwiftBridgeValidlySigned(SWIFT_BRIDGE_BINARY)) {
      signSwiftBridgeBinary(SWIFT_BRIDGE_BINARY);
    }
    return SWIFT_BRIDGE_BINARY;
  }

  const compile = spawnSync('xcrun', ['swiftc', '-O', '-o', SWIFT_BRIDGE_BINARY, ...sourceFiles], {
    encoding: 'utf8'
  });

  if (compile.status !== 0) {
    const err = (compile.stderr || compile.stdout || 'Swift bridge compilation failed').trim();
    throw new Error(err);
  }

  fs.chmodSync(SWIFT_BRIDGE_BINARY, 0o755);
  signSwiftBridgeBinary(SWIFT_BRIDGE_BINARY);
  return SWIFT_BRIDGE_BINARY;
}

let swiftCaptureProc = null;
let swiftCaptureBootPromise = null;
let swiftCaptureStdoutBuffer = '';
let swiftCapturePending = [];
let swiftCaptureCommandQueue = Promise.resolve();
let swiftCaptureIntentionalShutdown = false;

function isSwiftCaptureProcessAlive() {
  return Boolean(
    swiftCaptureProc &&
    !swiftCaptureProc.killed &&
    swiftCaptureProc.exitCode === null &&
    swiftCaptureProc.stdin &&
    !swiftCaptureProc.stdin.destroyed
  );
}

function rejectPendingSwiftCommands(error) {
  while (swiftCapturePending.length > 0) {
    const pending = swiftCapturePending.shift();
    clearTimeout(pending.timer);
    pending.reject(error);
  }
}

function processSwiftCaptureStdout(chunk) {
  swiftCaptureStdoutBuffer += chunk;
  const lines = swiftCaptureStdoutBuffer.split('\n');
  swiftCaptureStdoutBuffer = lines.pop() || '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let payload;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      safeConsole('warn', '[swift-capture] Non-JSON output:', trimmed);
      continue;
    }

    // Level updates are unsolicited push events — route to renderer, never consume a pending command.
    if (payload && payload.type === 'levels') {
      const mic = payload.mic || 0;
      const sys = payload.sys || 0;
      const combined = Math.min(1, Math.max(mic, sys));
      // Push real levels to both main window and overlay
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('swift-audio-levels', { mic, sys });
      }
      if (overlayReady && recordingOverlayWindow && !recordingOverlayWindow.isDestroyed()) {
        recordingOverlayWindow.webContents.send('update-audio-level', combined);
      }
      continue;
    }

    const pending = swiftCapturePending.shift();
    if (!pending) {
      safeConsole('log', '[swift-capture] unsolicited message:', payload);
      continue;
    }

    clearTimeout(pending.timer);
    if (payload && payload.ok === false) {
      pending.reject(new Error(payload.error || payload.message || `Swift capture command failed: ${pending.command}`));
    } else {
      pending.resolve(payload);
    }
  }
}

async function ensureSwiftCaptureProcess() {
  if (isSwiftCaptureProcessAlive()) return;
  if (swiftCaptureBootPromise) return swiftCaptureBootPromise;

  swiftCaptureBootPromise = (async () => {
    const binary = ensureSwiftBridgeBinary();

    swiftCaptureStdoutBuffer = '';
    swiftCaptureProc = spawn(binary, [], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    swiftCaptureProc.stdout.setEncoding('utf8');
    swiftCaptureProc.stderr.setEncoding('utf8');

    swiftCaptureProc.stdout.on('data', processSwiftCaptureStdout);
    swiftCaptureProc.stdin.on('error', (error) => {
      safeConsole('error', '[swift-capture] stdin error:', error?.message || error);
      if (error?.code === 'EPIPE' || error?.code === 'EIO') {
        const ioErr = new Error(`Swift capture stdin closed: ${error.code}`);
        rejectPendingSwiftCommands(ioErr);
      }
      stopSwiftCaptureProcess();
    });
    swiftCaptureProc.stderr.on('data', (data) => {
      const msg = String(data || '').trim();
      if (msg) safeConsole('log', '[swift-capture]', msg);
    });

    swiftCaptureProc.on('exit', (code, signal) => {
      const intentional = swiftCaptureIntentionalShutdown;
      swiftCaptureIntentionalShutdown = false;
      const err = new Error(`Swift capture helper exited (${code ?? 'null'}${signal ? `, ${signal}` : ''})`);
      rejectPendingSwiftCommands(err);

      if (!intentional) {
        safeConsole('error', '[swift-capture] helper exited unexpectedly:', err.message);
      }

      swiftCaptureProc = null;
      swiftCaptureStdoutBuffer = '';
    });
  })();

  try {
    await swiftCaptureBootPromise;
  } finally {
    swiftCaptureBootPromise = null;
  }
}

async function sendSwiftCaptureCommand(commandPayload, timeoutMs = 120000) {
  await ensureSwiftCaptureProcess();

  return new Promise((resolve, reject) => {
    if (!isSwiftCaptureProcessAlive() || !swiftCaptureProc.stdin.writable) {
      stopSwiftCaptureProcess();
      reject(new Error('Swift capture helper is not running'));
      return;
    }

    const command = commandPayload?.command || 'unknown';
    const pending = {
      command,
      resolve,
      reject,
      timer: null
    };

    pending.timer = setTimeout(() => {
      swiftCapturePending = swiftCapturePending.filter(item => item !== pending);
      reject(new Error(`Swift capture command timed out: ${command}`));
    }, timeoutMs);

    swiftCapturePending.push(pending);

    try {
      swiftCaptureProc.stdin.write(`${JSON.stringify(commandPayload)}\n`, (error) => {
        if (!error) return;

        clearTimeout(pending.timer);
        swiftCapturePending = swiftCapturePending.filter(item => item !== pending);

        if (error.code === 'EPIPE' || error.code === 'EIO') {
          stopSwiftCaptureProcess();
          reject(new Error(`Swift capture helper became unavailable while sending ${command}`));
          return;
        }

        reject(error);
      });
    } catch (error) {
      clearTimeout(pending.timer);
      swiftCapturePending = swiftCapturePending.filter(item => item !== pending);

      if (error.code === 'EPIPE' || error.code === 'EIO') {
        stopSwiftCaptureProcess();
      }

      reject(error);
    }
  });
}

function sendSwiftCaptureCommandSerial(commandPayload, timeoutMs = 120000) {
  const task = () => sendSwiftCaptureCommand(commandPayload, timeoutMs);
  const queued = swiftCaptureCommandQueue.then(task, task);
  swiftCaptureCommandQueue = queued.catch(() => {});
  return queued;
}

function stopSwiftCaptureProcess() {
  if (swiftCaptureProc && !swiftCaptureProc.killed) {
    swiftCaptureIntentionalShutdown = true;
    swiftCaptureProc.kill('SIGTERM');
  }
  swiftCaptureStdoutBuffer = '';
}

let mainWindow;
let tray;
let isRecording = false;
let recordingOverlayWindow = null;
let overlayReady = false;
let audioLevelInterval = null;
let coachOverlayWindow = null;
let coachOverlayReady = false;

// Backend URL — env var first, then dev/prod fallback
const BACKEND_URL =
  normaliseBackendUrl(process.env.BACKEND_URL) ||
  DEFAULT_BACKEND_URL;

function enableMacSystemAudioCaptureFeatures() {
  // Chromium features needed for loopback/system-audio screen sharing on macOS.
  const existing = app.commandLine.getSwitchValue('enable-features');
  const features = new Set(
    (existing ? existing.split(',') : [])
      .map(s => s.trim())
      .filter(Boolean)
  );

  features.add('MacLoopbackAudioForScreenShare');
  features.add('ScreenCaptureKitStreamPickerSonoma');

  app.commandLine.appendSwitch('enable-features', Array.from(features).join(','));
}

function configureDisplayMediaCapture() {
  const ses = session.defaultSession;
  if (!ses?.setDisplayMediaRequestHandler) return;

  const handler = async (_request, callback) => {
    try {
      // Request screens AND windows. On Windows, screen enumeration can fail or
      // return [] on some configs while windows still work; either source type
      // carries the loopback audio track, so we don't want to depend on screens only.
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1, height: 1 },
        fetchWindowIcons: false
      });

      console.log(
        `[display-media] ${PLATFORM} handler fired — ${sources.length} source(s):`,
        sources.map(s => s.name).slice(0, 8)
      );

      const source =
        sources.find(s => /entire|screen|display/i.test(s.name)) ||
        sources[0];

      if (!source) {
        // No capturable source at all. On Windows this is the usual cause of
        // "opened but no audio + error popup" — surface it instead of silently
        // returning an empty stream the renderer can't explain.
        console.error(
          `[display-media] NO SOURCES on ${PLATFORM}. desktopCapturer returned []. ` +
          `On Windows this usually means screen-capture access is blocked or no display ` +
          `is enumerable.`
        );
        mainWindow?.webContents.send('display-media-diagnostic', {
          ok: false,
          reason: 'no-sources',
          platform: PLATFORM,
          sourceCount: 0
        });
        callback({});
        return;
      }

      console.log(`[display-media] selecting "${source.name}" + audio:'loopback'`);
      mainWindow?.webContents.send('display-media-diagnostic', {
        ok: true,
        reason: 'selected',
        platform: PLATFORM,
        sourceCount: sources.length,
        sourceName: source.name
      });
      // Auto-select source + loopback audio (no picker shown).
      callback({ video: source, audio: 'loopback' });
    } catch (error) {
      console.error(`[display-media] handler error on ${PLATFORM}:`, error);
      mainWindow?.webContents.send('display-media-diagnostic', {
        ok: false,
        reason: 'exception',
        platform: PLATFORM,
        message: String(error?.message || error)
      });
      callback({});
    }
  };

  // Do NOT use useSystemPicker:true — that bypasses the handler entirely and
  // shows the macOS native picker, which doesn't auto-select loopback audio.
  // Without that flag, Electron calls our handler which passes audio:'loopback'.
  ses.setDisplayMediaRequestHandler(handler);
}

const isDev = process.env.NODE_ENV === 'development';

// The mac loopback Chromium flag only matters on a real darwin host. On Windows,
// Electron 31+ supports system-audio loopback via the display-media handler's
// audio:'loopback' directly, so no extra command-line flag is required.
if (process.platform === 'darwin') {
  enableMacSystemAudioCaptureFeatures();
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  const isMac = IS_MAC;
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    // mac-only window chrome; Windows/Linux use the standard frame
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 20, y: 18 },
          vibrancy: 'under-window',
          visualEffectState: 'active'
        }
      : {}),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    icon: APP_ICON_PATH,
    show: false,
    backgroundColor: '#171014'
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    checkPermissions();
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Hide to tray on minimize (macOS)
  mainWindow.on('minimize', (e) => {
    if (IS_MAC) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  if (process.env.OPEN_DEVTOOLS === '1') mainWindow.webContents.openDevTools();
}

// ── Tray ──────────────────────────────────────────────────────────────────────

function createTray() {
  tray = new Tray(getTrayIcon(32));
  tray.setToolTip('MeetNote Summaries');
  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else mainWindow?.show();
  });
}

function updateTrayMenu() {
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show MeetNote', click: () => mainWindow?.show() },
    { label: isRecording ? 'Stop Recording' : 'Start Recording',
      click: () => mainWindow?.webContents.send(isRecording ? 'stop-recording-signal' : 'start-recording-signal') },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));
}

// ── Permissions ───────────────────────────────────────────────────────────────

function getMacPermissionSnapshot() {
  if (!IS_MAC) {
    return {
      microphone: 'granted',
      screen: 'granted',
      isPackaged: app.isPackaged
    };
  }

  return {
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
    screen: systemPreferences.getMediaAccessStatus('screen'),
    isPackaged: app.isPackaged
  };
}

function buildPermissionGuidance(snapshot) {
  const tips = [];

  if (snapshot.screen !== 'granted') {
    tips.push('Enable Screen Recording for MeetNote in System Settings > Privacy & Security > Screen Recording.');
  }

  if (snapshot.microphone !== 'granted') {
    tips.push('Enable Microphone for MeetNote in System Settings > Privacy & Security > Microphone.');
  }

  tips.push('Fully quit and reopen MeetNote after changing permissions.');

  if (!snapshot.isPackaged) {
    tips.push('Dev mode note: when launched with npm scripts, macOS can require Terminal to have the same permissions.');
  }

  return tips.join(' ');
}

async function openMacPrivacySettings(area = 'screen') {
  if (!IS_MAC) return false;

  const section = area === 'microphone' ? 'Privacy_Microphone' : 'Privacy_ScreenCapture';

  if (typeof systemPreferences.openSystemPreferences === 'function') {
    try {
      if (systemPreferences.openSystemPreferences.length >= 2) {
        return Boolean(systemPreferences.openSystemPreferences('security', section));
      }

      systemPreferences.openSystemPreferences();
      return true;
    } catch {
      // Fall through to deep-link method.
    }
  }

  try {
    await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${section}`);
    return true;
  } catch {
    return false;
  }
}

async function assertSwiftCapturePermissions() {
  if (!CAN_RUN_SWIFT) return;

  const initial = getMacPermissionSnapshot();
  mainWindow?.webContents.send('permissions-status', {
    screen: initial.screen,
    microphone: initial.microphone
  });

  if (initial.screen !== 'granted') {
    throw new Error(`Screen Recording permission is required for native system-audio capture. ${buildPermissionGuidance(initial)}`);
  }

  if (initial.microphone === 'not-determined') {
    try {
      await systemPreferences.askForMediaAccess('microphone');
    } catch {
      // Ignore prompt errors and validate via status check below.
    }
  }

  const afterPrompt = getMacPermissionSnapshot();
  mainWindow?.webContents.send('permissions-status', {
    screen: afterPrompt.screen,
    microphone: afterPrompt.microphone
  });

  if (afterPrompt.microphone !== 'granted') {
    throw new Error(`Microphone permission is required for native recording. ${buildPermissionGuidance(afterPrompt)}`);
  }
}

async function checkPermissions() {
  if (!IS_MAC) return;
  try {
    const snapshot = getMacPermissionSnapshot();
    mainWindow?.webContents.send('permissions-status', {
      screen: snapshot.screen,
      microphone: snapshot.microphone
    });
    if (snapshot.microphone !== 'granted') {
      systemPreferences.askForMediaAccess('microphone').catch(() => {});
    }
  } catch (e) {
    console.error('Permission check error:', e);
  }
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  ipcMain.handle('get-backend-url', () => {
    const saved = store.get('settings.backendUrl');
    return normaliseBackendUrl(saved) || BACKEND_URL;
  });

  ipcMain.handle('get-settings', () => {
    const existing = store.get('settings', {});
    const resolved = {
      quality: 'high',
      autoStart: false,
      autoUpload: true,
      captureSystemAudio: true,
      showMenuBarIcon: true,
      backendUrl: normaliseBackendUrl(existing.backendUrl) || BACKEND_URL,
      liveBackendUrl: normaliseLiveBackendUrl(existing.liveBackendUrl) ||
        normaliseLiveBackendUrl(existing.backendUrl) ||
        BACKEND_URL,
      transcriptionLanguage: 'en',
      mode: 'record',                 // 'record' | 'live'
      hideOverlayWhileSharing: false, // best-effort: hide coach overlay during screen-share
      autoDetectMeetings: true,       // auto-detect Zoom/Meet/Teams and offer to start
      ...existing
    };

    resolved.backendUrl = normaliseBackendUrl(resolved.backendUrl) || BACKEND_URL;
    resolved.liveBackendUrl = normaliseLiveBackendUrl(resolved.liveBackendUrl) ||
      normaliseLiveBackendUrl(resolved.backendUrl) ||
      BACKEND_URL;

    if (existing.backendUrl !== resolved.backendUrl || existing.liveBackendUrl !== resolved.liveBackendUrl) {
      store.set('settings', resolved);
    }

    return resolved;
  });

  ipcMain.handle('list-local-recordings', () => {
    return { meetings: listLocalRecordingMeetings() };
  });

  ipcMain.handle('save-settings', (_, settings) => {
    const existing = store.get('settings', {});
    const merged = { ...existing, ...settings };
    merged.backendUrl = normaliseBackendUrl(merged.backendUrl) || BACKEND_URL;
    merged.liveBackendUrl = normaliseLiveBackendUrl(merged.liveBackendUrl) ||
      normaliseLiveBackendUrl(merged.backendUrl) ||
      BACKEND_URL;
    store.set('settings', merged);
    return { success: true };
  });

  ipcMain.handle('get-media-permissions', () => {
    if (!IS_MAC) {
      return { microphone: 'granted', screen: 'granted' };
    }
    return {
      microphone: systemPreferences.getMediaAccessStatus('microphone'),
      screen: systemPreferences.getMediaAccessStatus('screen')
    };
  });

  ipcMain.handle('check-audio-permissions', async () => {
    if (!IS_MAC) return true;
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status === 'not-determined') {
      return await systemPreferences.askForMediaAccess('microphone');
    }
    return status === 'granted';
  });

  ipcMain.handle('open-privacy-settings', async (_, area = 'screen') => {
    return await openMacPrivacySettings(area);
  });

  ipcMain.handle('swift-capture-start', async (_, payload = {}) => {
    if (!CAN_RUN_SWIFT) {
      throw new Error('Swift native capture is only available on macOS');
    }

    await assertSwiftCapturePermissions();
    console.log('[swift-capture] start requested');
    try {
      const response = await sendSwiftCaptureCommandSerial(
        { command: 'start', title: payload.title || 'Meeting Recording' },
        60000
      );
      console.log('[swift-capture] start acknowledged');
      return response;
    } catch (error) {
      // If start times out/fails, reset helper to avoid leaving renderer hanging.
      stopSwiftCaptureProcess();
      throw error;
    }
  });

  ipcMain.handle('swift-capture-stop', async () => {
    if (!CAN_RUN_SWIFT) {
      throw new Error('Swift native capture is only available on macOS');
    }
    return await sendSwiftCaptureCommandSerial({ command: 'stop' }, 240000);
  });

  ipcMain.handle('swift-capture-status', async () => {
    if (!CAN_RUN_SWIFT) {
      return { ok: false, command: 'status', message: 'not-supported' };
    }
    return await sendSwiftCaptureCommandSerial({ command: 'status' }, 15000);
  });

  ipcMain.handle('swift-capture-abort', async () => {
    if (CAN_RUN_SWIFT) {
      try {
        // Abort can involve teardown work, so avoid short timeouts and avoid force-killing.
        await sendSwiftCaptureCommandSerial({ command: 'abort' }, 240000);
      } catch {
        // Ignore helper errors during renderer unload or forced shutdown paths.
      }
    }
    return { success: true };
  });

  // Recording state sync
  ipcMain.handle('start-recording', () => {
    isRecording = true;
    updateTrayMenu();
    return { success: true };
  });

  ipcMain.handle('stop-recording', () => {
    isRecording = false;
    updateTrayMenu();
    return { success: true };
  });

  // Relay audio level from renderer to overlay
  ipcMain.on('relay-audio-level', (_, level) => {
    if (overlayReady && recordingOverlayWindow && !recordingOverlayWindow.isDestroyed()) {
      recordingOverlayWindow.webContents.send('update-audio-level', level);
    }
  });

  // Capture source (used by renderer getDisplayMedia flow)
  ipcMain.on('set-capture-source', (_, sourceId) => {
    console.log('Capture source set:', sourceId);
  });

  // ── Recording Overlay ──────────────────────────────────────────────────────

  ipcMain.handle('show-recording-overlay', async () => {
    if (recordingOverlayWindow && !recordingOverlayWindow.isDestroyed()) {
      recordingOverlayWindow.show();
      return true;
    }

    overlayReady = false;
    const saved = store.get('overlayPosition', {
      x: screen.getPrimaryDisplay().workAreaSize.width - 140,
      y: 12
    });

    recordingOverlayWindow = new BrowserWindow({
      width: 160, height: 34,
      x: saved.x, y: saved.y,
      frame: false, alwaysOnTop: true, skipTaskbar: true,
      resizable: false, movable: true,
      minimizable: false, maximizable: false, closable: false,
      transparent: true, show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });

    recordingOverlayWindow.on('moved', () => {
      const { x, y } = recordingOverlayWindow.getBounds();
      store.set('overlayPosition', { x, y });
    });

    // Exclude from screen capture / screen-sharing.
    recordingOverlayWindow.setContentProtection(true);

    if (process.platform === 'darwin') {
      recordingOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      recordingOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
    }

    recordingOverlayWindow.loadFile(path.join(__dirname, 'overlays/overlay.html'));
    recordingOverlayWindow.once('ready-to-show', () => {
      recordingOverlayWindow.show();
      overlayReady = true;
    });
    return true;
  });

  ipcMain.handle('hide-recording-overlay', async () => {
    overlayReady = false;
    if (recordingOverlayWindow && !recordingOverlayWindow.isDestroyed()) {
      recordingOverlayWindow.destroy();
      recordingOverlayWindow = null;
    }
    return true;
  });

  ipcMain.handle('update-recording-time', (_, time) => {
    if (recordingOverlayWindow && !recordingOverlayWindow.isDestroyed()) {
      recordingOverlayWindow.webContents.send('update-time', time);
    }
    return true;
  });

  ipcMain.handle('start-audio-monitoring', () => {
    // Real levels arrive via two paths — no fake interval needed:
    // 1. Swift bridge: processSwiftCaptureStdout → update-audio-level (Swift recording)
    // 2. Renderer viz loop: relay-audio-level IPC → update-audio-level (browser recording)
    if (audioLevelInterval) { clearInterval(audioLevelInterval); audioLevelInterval = null; }
  });

  ipcMain.handle('stop-audio-monitoring', () => {
    if (audioLevelInterval) { clearInterval(audioLevelInterval); audioLevelInterval = null; }
  });

  ipcMain.handle('stop-recording-from-overlay', () => {
    mainWindow?.webContents.send('stop-recording-signal');
    setTimeout(() => {
      overlayReady = false;
      if (recordingOverlayWindow && !recordingOverlayWindow.isDestroyed()) {
        recordingOverlayWindow.destroy();
        recordingOverlayWindow = null;
      }
    }, 500);
    return true;
  });

  // ── Coaching Overlay (live mode — floats over the meeting window) ──────────
  // A separate always-on-top transparent window showing live AI suggestions.
  // Visible only to the local user; never shared into the call (camera/normal).

  ipcMain.handle('show-coach-overlay', async () => {
    if (coachOverlayWindow && !coachOverlayWindow.isDestroyed()) {
      coachOverlayWindow.show();
      return true;
    }

    coachOverlayReady = false;
    const primary = screen.getPrimaryDisplay().workAreaSize;
    const saved = store.get('coachOverlayPosition', {
      x: primary.width - 380,
      y: 80
    });

    coachOverlayWindow = new BrowserWindow({
      width: 360, height: 360,
      x: saved.x, y: saved.y,
      frame: false, alwaysOnTop: true, skipTaskbar: true,
      resizable: false, movable: true,
      minimizable: false, maximizable: false, closable: false,
      transparent: true, show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });

    coachOverlayWindow.on('moved', () => {
      const { x, y } = coachOverlayWindow.getBounds();
      store.set('coachOverlayPosition', { x, y });
    });

    // CRITICAL: exclude the overlay from screen capture / screen-sharing so it is
    // invisible to other Meet/Zoom participants even when you share your screen.
    coachOverlayWindow.setContentProtection(true);

    if (process.platform === 'darwin') {
      coachOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      coachOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
    }

    coachOverlayWindow.loadFile(path.join(__dirname, 'overlays/coach-overlay.html'));
    coachOverlayWindow.once('ready-to-show', () => {
      coachOverlayWindow.show();
      coachOverlayReady = true;
    });
    return true;
  });

  ipcMain.handle('hide-coach-overlay', async () => {
    coachOverlayReady = false;
    if (coachOverlayWindow && !coachOverlayWindow.isDestroyed()) {
      coachOverlayWindow.destroy();
      coachOverlayWindow = null;
    }
    return true;
  });

  // Renderer → main logging bridge (so live-mode logs appear in the dev terminal).
  ipcMain.on('live-log', (_, msg) => safeConsole('log', '[live]', msg));

  // Overlay "Get Insight" → ask renderer to request an on-demand suggestion.
  // Overlay "Answer" → ask renderer for an answer to the other person's question.
  ipcMain.handle('request-answer-from-overlay', () => {
    mainWindow?.webContents.send('request-answer-signal');
    return true;
  });

  // Overlay "Get Insight" → ask renderer for conversation insight/notes.
  ipcMain.handle('request-insight-from-overlay', () => {
    mainWindow?.webContents.send('request-insight-signal');
    return true;
  });

  const fwd = (channel) => (_, payload) => {
    if (coachOverlayReady && coachOverlayWindow && !coachOverlayWindow.isDestroyed()) {
      coachOverlayWindow.webContents.send(channel, payload);
    }
  };
  // Renderer → overlay relays.
  ipcMain.on('coach-pending', fwd('coach-pending'));
  ipcMain.on('coach-insight-pending', fwd('coach-insight-pending'));
  ipcMain.on('coach-suggestion', fwd('coach-suggestion'));
  ipcMain.on('coach-insight', fwd('coach-insight'));

  // Stop the live session from the overlay (relayed to renderer).
  // Always tear the overlay down here too, so the button works even if the
  // renderer's live state is out of sync.
  ipcMain.handle('stop-live-from-overlay', () => {
    safeConsole('log', '[live] stop pressed on overlay');
    mainWindow?.webContents.send('stop-live-signal');
    mainWindow?.show();
    coachOverlayReady = false;
    if (coachOverlayWindow && !coachOverlayWindow.isDestroyed()) {
      coachOverlayWindow.destroy();
      coachOverlayWindow = null;
    }
    return true;
  });

  // ── System Audio Source (for renderer getDisplayMedia without picker) ──────
  // Returns a desktopCapturer sourceId so the renderer can call getUserMedia
  // with chromeMediaSource: 'desktop' — no macOS screen picker shown.
  ipcMain.handle('get-system-audio-source', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
      fetchWindowIcons: false
    });
    const source =
      sources.find(s => /entire screen|screen \d|display/i.test(s.name)) ||
      sources[0];
    if (!source) throw new Error('No screen source found for system audio');
    return { sourceId: source.id, sourceName: source.name };
  });

  // ── Transcription ──────────────────────────────────────────────────────────

  ipcMain.handle('transcribe-audio', async (_, { audioBuffer, duration, title }) => {
    const targetBackend = normaliseBackendUrl(store.get('settings.backendUrl')) || BACKEND_URL;
    const FormData = require('form-data');
    const fd = new FormData();
    fd.append('audio_file', Buffer.from(audioBuffer), {
      filename: 'recording.webm',
      contentType: 'audio/webm'
    });
    fd.append('title', title || 'Meeting Recording');
    fd.append('format', 'webm');
    fd.append('language', 'en');

    const res = await axios.post(`${targetBackend}/api/transcription/audio`, fd, {
      headers: fd.getHeaders(),
      timeout: 120000
    });

    const r = res.data;
    return {
      id: r.id,
      transcript: r.transcript || '',
      summary: r.summary || '',
      keyPoints: r.key_points || [],
      actionItems: r.action_items || [],
      duration: r.duration || duration,
      confidence: r.confidence || 0.85,
      language: r.language || 'en',
      createdAt: r.created_at || new Date().toISOString()
    };
  });

  ipcMain.handle('transcribe-audio-file', async (_, payload = {}) => {
    const { filePath, micPath, sysPath, duration, title, language } = payload;

    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('Swift capture output file not found');
    }

    const mergedSize = fs.statSync(filePath).size;
    const micSize = micPath && fs.existsSync(micPath) ? fs.statSync(micPath).size : 0;
    const sysSize = sysPath && fs.existsSync(sysPath) ? fs.statSync(sysPath).size : 0;
    console.log(
      `[swift-capture] upload sizes merged=${Math.round(mergedSize / 1024)}KB ` +
      `mic=${Math.round(micSize / 1024)}KB sys=${Math.round(sysSize / 1024)}KB`
    );

    const targetBackend = normaliseBackendUrl(store.get('settings.backendUrl')) || BACKEND_URL;
    const FormData = require('form-data');

    // If we have both separate tracks use the dual-audio endpoint so the backend
    // can transcribe each speaker independently and infer their names.
    const hasMic = micPath && fs.existsSync(micPath) && micSize > 1024;
    const hasSys = sysPath && fs.existsSync(sysPath) && sysSize > 1024;
    const useDual = hasMic && hasSys;

    const endpoint = `${targetBackend}/api/transcription/audio`;

    const sendTranscriptionRequest = async (audioFilePath, options = {}) => {
      const shouldUseDual = options.useDual === true;
      const fd = new FormData();
      fd.append('title', title || 'Meeting Recording');
      fd.append('format', path.extname(audioFilePath).replace('.', '') || 'm4a');
      fd.append('language', language || 'en');

      if (shouldUseDual) {
        // Send mic and sys tracks separately — backend will diarize by track.
        fd.append('mic_file', fs.createReadStream(micPath), {
          filename: path.basename(micPath),
          contentType: detectAudioMimeType(micPath)
        });
        fd.append('sys_file', fs.createReadStream(sysPath), {
          filename: path.basename(sysPath),
          contentType: detectAudioMimeType(sysPath)
        });
        // Also send merged as fallback.
        fd.append('audio_file', fs.createReadStream(audioFilePath), {
          filename: path.basename(audioFilePath),
          contentType: detectAudioMimeType(audioFilePath)
        });
        console.log('[swift-capture] Using dual-audio (speaker separation) via /audio endpoint');
      } else {
        fd.append('audio_file', fs.createReadStream(audioFilePath), {
          filename: path.basename(audioFilePath),
          contentType: detectAudioMimeType(audioFilePath)
        });
        console.log('[swift-capture] Using single-audio endpoint (missing a track)');
      }

      console.log(`[swift-capture] POSTing to ${endpoint} with ${path.basename(audioFilePath)}…`);
      return await axios.post(endpoint, fd, {
        headers: fd.getHeaders(),
        timeout: 300000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });
    };

    const companionFilePath = findTranscribeCompanionFile(filePath);
    let uploadedFilePath = filePath;
    let res;
    try {
      res = await sendTranscriptionRequest(uploadedFilePath, { useDual });
    } catch (error) {
      if (isRequestEntityTooLarge(error)) {
        if (companionFilePath) {
          console.warn(
            '[swift-capture] Audio too large, retrying with companion file (single-track):',
            path.basename(companionFilePath)
          );
          uploadedFilePath = companionFilePath;
          try {
            res = await sendTranscriptionRequest(uploadedFilePath, { useDual: false });
          } catch (retryError) {
            if (isRequestEntityTooLarge(retryError)) {
              throw new Error('Audio file is too large for transcription, even after fallback. Please upload a shorter file.');
            }
            throw buildAxiosTranscriptionError(retryError);
          }
        } else if (useDual) {
          console.warn('[swift-capture] Dual-track payload too large, retrying single-track upload.');
          try {
            res = await sendTranscriptionRequest(uploadedFilePath, { useDual: false });
          } catch (retryError) {
            if (isRequestEntityTooLarge(retryError)) {
              throw new Error('Audio file is too large for transcription. Please upload a smaller file or a _transcribe_16k version.');
            }
            throw buildAxiosTranscriptionError(retryError);
          }
        } else {
          throw new Error('Audio file is too large for transcription. Please upload a smaller file or a _transcribe_16k version.');
        }
      } else {
        throw buildAxiosTranscriptionError(error);
      }
    }

    const r = res.data;
    console.log(
      `[swift-capture] Backend response: status=${res.status}, ` +
      `transcript_len=${(r.transcript || '').length}, ` +
      `mic_segs=${r.diarized_transcript ? r.diarized_transcript.filter(s => s.speaker === 'you').length : 'n/a'}, ` +
      `sys_segs=${r.diarized_transcript ? r.diarized_transcript.filter(s => s.speaker === 'other').length : 'n/a'}, ` +
      `speakers=${JSON.stringify(r.speakers || null)}`
    );
    if (r.transcript) {
      console.log('[swift-capture] Transcript preview:', r.transcript.slice(0, 300));
    }
    return {
      id: r.id,
      title: r.title || title || 'Meeting Recording',
      transcript: r.transcript || '',
      summary: r.summary || '',
      // API may return camelCase (keyPoints) or snake_case (key_points)
      keyPoints: r.key_points || r.keyPoints || [],
      actionItems: r.action_items || r.actionItems || [],
      speakers: r.speakers || null,
      diarizedTranscript: r.diarized_transcript || null,
      duration: r.duration || duration,
      confidence: r.confidence || 0.85,
      language: r.language || language || 'en',
      createdAt: r.created_at || new Date().toISOString()
    };
  });
}

// ── Meeting Auto-Detect ─────────────────────────────────────────────────────
// Polls for an active video call (Zoom/Teams app in a meeting, or a Google Meet /
// Teams / Webex tab open in Chrome/Safari) and notifies the renderer once per new
// meeting so it can offer to auto-start. macOS uses AppleScript to read app state
// and browser tab URLs; other platforms fall back to running-process names.

let meetingDetectTimer = null;
let detectedMeetingKey = null;   // de-dupe: only notify once per distinct meeting

const MEETING_URL_PATTERNS = [
  { re: /meet\.google\.com\/[a-z\-]{3,}/i, name: 'Google Meet' },
  { re: /teams\.(microsoft|live)\.com.*\/(meetup-join|meet)\//i, name: 'Microsoft Teams' },
  { re: /(\.zoom\.us|zoom\.us)\/(j|wc|s)\//i, name: 'Zoom' },
  { re: /(\.webex\.com).*\/(meet|join)/i, name: 'Cisco Webex' },
  { re: /whereby\.com\/[a-z0-9\-]+/i, name: 'Whereby' },
];

function runOsascript(script) {
  try {
    const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 4000 });
    if (r.status !== 0) return '';
    return (r.stdout || '').trim();
  } catch {
    return '';
  }
}

// Collect open tab URLs from Chrome + Safari (only if already running — never launches them).
function getBrowserTabUrls() {
  if (process.platform !== 'darwin') return [];
  const urls = [];

  const chromeScript = `
    if application "Google Chrome" is running then
      tell application "Google Chrome"
        set out to ""
        repeat with w in windows
          repeat with t in tabs of w
            set out to out & (URL of t) & "\n"
          end repeat
        end repeat
        return out
      end tell
    end if`;
  const safariScript = `
    if application "Safari" is running then
      tell application "Safari"
        set out to ""
        repeat with w in windows
          repeat with t in tabs of w
            set out to out & (URL of t) & "\n"
          end repeat
        end repeat
        return out
      end tell
    end if`;

  for (const url of (runOsascript(chromeScript) + '\n' + runOsascript(safariScript)).split('\n')) {
    const u = url.trim();
    if (u) urls.push(u);
  }
  return urls;
}

// Detect native meeting apps (Zoom/Teams) that are running.
function getRunningMeetingApps() {
  if (process.platform !== 'darwin') return [];
  const found = [];
  const apps = [
    { proc: 'zoom.us', name: 'Zoom' },
    { proc: 'Microsoft Teams', name: 'Microsoft Teams' },
    { proc: 'Webex', name: 'Cisco Webex' },
  ];
  const psOut = (() => {
    try {
      const r = spawnSync('pgrep', ['-il', 'zoom|teams|webex'], { encoding: 'utf8', timeout: 3000 });
      return (r.stdout || '').toLowerCase();
    } catch { return ''; }
  })();
  for (const a of apps) {
    if (psOut.includes(a.proc.toLowerCase().split('.')[0])) found.push(a.name);
  }
  return found;
}

function detectMeetingOnce() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  let detected = null;

  // 1. Browser tabs (most reliable for Google Meet / web Teams / Zoom web).
  const urls = getBrowserTabUrls();
  for (const url of urls) {
    for (const p of MEETING_URL_PATTERNS) {
      if (p.re.test(url)) {
        // Key by the meeting code so re-detecting the same call doesn't re-prompt.
        const m = url.match(/[a-z0-9\-]{4,}/gi);
        detected = { platform: p.name, key: `${p.name}:${(m && m.slice(-1)[0]) || url}` };
        break;
      }
    }
    if (detected) break;
  }

  // 2. Native Zoom/Teams app running (fallback when no browser meeting found).
  if (!detected) {
    const apps = getRunningMeetingApps();
    if (apps.length) detected = { platform: apps[0], key: `app:${apps[0]}` };
  }

  if (detected) {
    if (detected.key !== detectedMeetingKey) {
      detectedMeetingKey = detected.key;
      mainWindow.webContents.send('meeting-detected', { platform: detected.platform });
    }
  } else {
    // No meeting → reset so the next call re-prompts.
    detectedMeetingKey = null;
  }
}

function startMeetingDetection() {
  if (meetingDetectTimer) return;
  detectedMeetingKey = null;
  meetingDetectTimer = setInterval(detectMeetingOnce, 4000);
}

function stopMeetingDetection() {
  if (meetingDetectTimer) { clearInterval(meetingDetectTimer); meetingDetectTimer = null; }
}

ipcMain.handle('set-meeting-detection', (_, enabled) => {
  if (enabled) startMeetingDetection(); else stopMeetingDetection();
  return { enabled: Boolean(enabled) };
});

// ── App Lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  configureDisplayMediaCapture();
  setDockIcon();
  registerIpcHandlers();
  createWindow();
  createTray();
  // Start auto-detect if the user enabled it (default on).
  if (store.get('settings.autoDetectMeetings', true) !== false) {
    startMeetingDetection();
  }

  app.on('activate', () => {
    if (!mainWindow) createWindow();
    else mainWindow.show();
  });
});

app.on('web-contents-created', (_, contents) => {
  contents.on('new-window', (e) => e.preventDefault());
});

app.on('before-quit', () => {
  stopSwiftCaptureProcess();
  stopMeetingDetection();
  overlayReady = false;
  if (recordingOverlayWindow && !recordingOverlayWindow.isDestroyed()) {
    recordingOverlayWindow.destroy();
    recordingOverlayWindow = null;
  }
  coachOverlayReady = false;
  if (coachOverlayWindow && !coachOverlayWindow.isDestroyed()) {
    coachOverlayWindow.destroy();
    coachOverlayWindow = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

console.log('MeetNote starting — Backend:', BACKEND_URL);
