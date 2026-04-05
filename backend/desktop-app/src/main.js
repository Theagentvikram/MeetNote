const { app, BrowserWindow, ipcMain, systemPreferences, Menu, Tray, dialog, screen } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');
const os = require('os');
const axios = require('axios');

// Initialize store for settings
const store = new Store();

// Global variables
let mainWindow;
let tray;
let isRecording = false;
let recordingStream = null;

// Backend URL - resolve from env first, then fallback
const BACKEND_URL = process.env.BACKEND_URL
  || (process.env.NODE_ENV === 'development'
    ? 'http://localhost:8000'
    : 'https://meetnote-backend.onrender.com');

// App configuration
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    titleBarOverlay: false,
    trafficLightPosition: { x: 20, y: 20 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    backgroundColor: '#f9fafb'
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    checkPermissions();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('minimize', (event) => {
    if (process.platform === 'darwin') {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

function createTray() {
  const trayIconPath = path.join(__dirname, '../assets/tray-icon.png');
  tray = new Tray(trayIconPath);

  updateTrayMenu();
  tray.setToolTip('MeetNote - AI Meeting Assistant');

  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
}

async function checkPermissions() {
  try {
    if (process.platform === 'darwin') {
      const screenAccess = systemPreferences.getMediaAccessStatus('screen');
      const micAccess = systemPreferences.getMediaAccessStatus('microphone');

      console.log('Screen access:', screenAccess);
      console.log('Microphone access:', micAccess);

      if (mainWindow) {
        mainWindow.webContents.send('permissions-status', {
          screen: screenAccess,
          microphone: micAccess
        });
      }

      if (micAccess !== 'granted') {
        systemPreferences.askForMediaAccess('microphone').catch(err => {
          console.log('Microphone permission request:', err.message);
        });
      }
    }
  } catch (error) {
    console.error('Permission check error:', error);
  }
}

function stopRecording() {
  try {
    console.log('Stopping recording...');
    isRecording = false;
    updateTrayMenu();
    if (mainWindow) {
      mainWindow.webContents.send('recording-stopped');
    }
  } catch (error) {
    console.error('Error stopping recording:', error);
  }
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show MeetNote',
      click: () => mainWindow && mainWindow.show()
    },
    {
      label: 'Stop Recording',
      click: stopRecording,
      enabled: isRecording
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// Recording overlay window
let recordingOverlayWindow = null;
let audioLevelInterval = null;

function registerIpcHandlers() {
  // Check audio permissions
  ipcMain.handle('check-audio-permissions', async () => {
    try {
      if (process.platform === 'darwin') {
        const microphoneStatus = systemPreferences.getMediaAccessStatus('microphone');
        if (microphoneStatus === 'not-determined') {
          const granted = await systemPreferences.askForMediaAccess('microphone');
          return granted;
        }
        return microphoneStatus === 'granted';
      }
      return true;
    } catch (error) {
      console.error('Check audio permissions error:', error);
      return false;
    }
  });

  // Show recording overlay
  ipcMain.handle('show-recording-overlay', async () => {
    if (recordingOverlayWindow) {
      recordingOverlayWindow.show();
      return;
    }

    const savedPosition = store.get('overlayPosition', {
      x: screen.getPrimaryDisplay().workAreaSize.width - 130,
      y: 10
    });

    recordingOverlayWindow = new BrowserWindow({
      width: 160,
      height: 32,
      x: savedPosition.x,
      y: savedPosition.y,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      closable: false,
      focusable: true,
      show: false,
      transparent: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false
      }
    });

    recordingOverlayWindow.on('moved', () => {
      const position = recordingOverlayWindow.getBounds();
      store.set('overlayPosition', { x: position.x, y: position.y });
    });

    if (process.platform === 'darwin') {
      recordingOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      recordingOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
    }

    recordingOverlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

    recordingOverlayWindow.once('ready-to-show', () => {
      recordingOverlayWindow.show();
    });

    return true;
  });

  // Hide recording overlay
  ipcMain.handle('hide-recording-overlay', async () => {
    if (recordingOverlayWindow) {
      recordingOverlayWindow.destroy();
      recordingOverlayWindow = null;
    }
    return true;
  });

  // Update recording time
  ipcMain.handle('update-recording-time', async (event, time) => {
    if (recordingOverlayWindow) {
      recordingOverlayWindow.webContents.send('update-time', time);
    }
    return true;
  });

  // Audio level monitoring
  ipcMain.handle('start-audio-monitoring', () => {
    if (audioLevelInterval) clearInterval(audioLevelInterval);

    audioLevelInterval = setInterval(() => {
      if (recordingOverlayWindow && !recordingOverlayWindow.isDestroyed()) {
        const baseLevel = 0.2 + Math.random() * 0.4;
        const spike = Math.random() > 0.7 ? Math.random() * 0.3 : 0;
        const audioLevel = Math.min(0.9, baseLevel + spike);
        recordingOverlayWindow.webContents.send('update-audio-level', audioLevel);
      }
    }, 150);
  });

  ipcMain.handle('stop-audio-monitoring', () => {
    if (audioLevelInterval) {
      clearInterval(audioLevelInterval);
      audioLevelInterval = null;
    }
  });

  // Stop recording from overlay
  ipcMain.handle('stop-recording-from-overlay', async () => {
    console.log('Stop recording signal from overlay');
    if (mainWindow) {
      mainWindow.webContents.send('stop-recording-signal');
    }
    setTimeout(() => {
      if (recordingOverlayWindow) {
        recordingOverlayWindow.destroy();
        recordingOverlayWindow = null;
      }
    }, 500);
    return true;
  });

  ipcMain.handle('start-recording', async (event, sourceId) => {
    console.log('Starting recording with source:', sourceId);
    isRecording = true;
    updateTrayMenu();
    return { success: true };
  });

  ipcMain.handle('stop-recording', async () => {
    stopRecording();
    return { success: true };
  });

  ipcMain.handle('get-backend-url', () => {
    return BACKEND_URL;
  });

  ipcMain.handle('save-settings', (event, settings) => {
    store.set('settings', settings);
    return { success: true };
  });

  ipcMain.handle('get-settings', () => {
    return store.get('settings', {
      autoStart: false,
      quality: 'high',
      transcriptionLanguage: 'en',
      apiKey: ''
    });
  });

  // Transcription handler — uploads to backend
  ipcMain.handle('transcribe-audio', async (event, { audioBuffer, duration, title }) => {
    try {
      console.log('Starting transcription via backend...');
      console.log('Audio buffer size:', audioBuffer.length, 'bytes');
      console.log('Backend URL:', BACKEND_URL);

      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('audio_file', Buffer.from(audioBuffer), {
        filename: 'recording.webm',
        contentType: 'audio/webm'
      });
      formData.append('title', title || 'Meeting Recording');
      formData.append('format', 'webm');
      formData.append('language', 'en');

      const response = await axios.post(`${BACKEND_URL}/api/transcription/audio`, formData, {
        headers: formData.getHeaders(),
        timeout: 120000,
      });

      const result = response.data;
      console.log('Transcription completed:', result.id);

      return {
        id: result.id,
        transcript: result.transcript || '',
        summary: result.summary || '',
        keyPoints: result.key_points || [],
        actionItems: result.action_items || [],
        duration: result.duration || duration,
        confidence: result.confidence || 0.85,
        language: result.language || 'en',
        createdAt: result.created_at || new Date().toISOString(),
      };

    } catch (error) {
      console.error('Transcription error:', error.message);
      throw new Error(`Transcription failed: ${error.message}`);
    }
  });
}

// App event handlers
app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});

app.on('before-quit', () => {
  if (recordingOverlayWindow && !recordingOverlayWindow.isDestroyed()) {
    recordingOverlayWindow.destroy();
    recordingOverlayWindow = null;
  }
  if (isRecording) stopRecording();
});

app.on('window-all-closed', () => {
  if (recordingOverlayWindow && !recordingOverlayWindow.isDestroyed()) {
    recordingOverlayWindow.destroy();
    recordingOverlayWindow = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

console.log('MeetNote Desktop starting...');
console.log('Backend URL:', BACKEND_URL);
