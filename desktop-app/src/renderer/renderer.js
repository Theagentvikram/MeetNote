const { ipcRenderer } = require('electron');

// Global state
let isRecording = false;
let selectedSource = null;
let mediaRecorder = null;
let recordedChunks = [];
let backendUrl = '';
let recordingTimer = null;
let recordingStartTime = null;

// DOM elements
const elements = {
    // Navigation
    navBtns: document.querySelectorAll('.nav-btn'),
    views: document.querySelectorAll('.view'),
    
    // Header
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    recordBtn: document.getElementById('recordBtn'),
    
    // Calendar view
    meetingInput: document.getElementById('meetingInput'),
    recordNowBtn: document.getElementById('recordNowBtn'),
    upcomingMeetings: document.getElementById('upcomingMeetings'),
    weekMeetings: document.getElementById('weekMeetings'),
    dateDisplay: document.getElementById('dateDisplay'),
    
    // Meetings view
    meetingsGrid: document.getElementById('meetingsGrid'),
    
    // Settings
    qualitySelect: document.getElementById('qualitySelect'),
    autoStartToggle: document.getElementById('autoStartToggle'),
    languageSelect: document.getElementById('languageSelect'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    
    // Recording modal
    recordingModal: document.getElementById('recordingModal'),
    screenSelectionModal: document.getElementById('screenSelectionModal'),
    sourceGrid: document.getElementById('sourceGrid'),
    closeModal: document.getElementById('closeModal'),
    closeScreenModal: document.getElementById('closeScreenModal'),
    cancelRecord: document.getElementById('cancelRecord'),
    startRecording: document.getElementById('startRecording'),
    
    // Meeting detail
    meetingDetailView: document.getElementById('meetingDetailView'),
    backToMeetings: document.getElementById('backToMeetings'),
    
    // Recording overlay (removed - using system overlay)
    // recordingOverlay: document.getElementById('recordingOverlay'),
    // recordingTimer: document.getElementById('recordingTimer'),
    // stopRecording: document.getElementById('stopRecording'),
    
    // Toast
    toastContainer: document.getElementById('toastContainer')
};

// Initialize app
async function initializeApp() {
    console.log('Initializing MeetNote Desktop...');
    
    try {
        // Get backend URL
        backendUrl = await ipcRenderer.invoke('get-backend-url');
        console.log('Backend URL:', backendUrl);
        
        // Setup event listeners
        setupEventListeners();
        
        // Load initial data
        await loadSettings();
        updateDateDisplay();
        loadUpcomingMeetings();
        
        // Check permissions
        await checkPermissions();
        
        showToast('MeetNote ready to record!', 'success');
        
    } catch (error) {
        console.error('Initialization error:', error);
        showToast('Failed to initialize app', 'error');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Navigation
    elements.navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
    
    // Recording buttons
    elements.recordBtn?.addEventListener('click', startRecordingFlow);
    elements.recordNowBtn?.addEventListener('click', startRecordingFlow);
    elements.startRecording?.addEventListener('click', startActualRecording);
    // elements.stopRecording removed - using system overlay stop button
    
    // Modal controls
    elements.closeModal?.addEventListener('click', closeRecordingModal);
    elements.closeScreenModal?.addEventListener('click', closeScreenSelectionModal);
    elements.cancelRecord?.addEventListener('click', closeScreenSelectionModal);
    
    // Recording option selection
    document.querySelectorAll('.recording-option').forEach(option => {
        option.addEventListener('click', () => {
            const optionType = option.dataset.option;
            handleRecordingOption(optionType);
        });
    });
    
    // Meeting detail navigation
    elements.backToMeetings?.addEventListener('click', () => {
        switchView('meetings');
    });
    
    // Transcript toggle
    const toggleTranscriptBtn = document.getElementById('toggleTranscript');
    if (toggleTranscriptBtn) {
        toggleTranscriptBtn.addEventListener('click', toggleTranscriptPanel);
    }
    
    // Settings
    elements.saveSettingsBtn?.addEventListener('click', saveSettings);
    
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Transcript toggle
    elements.transcriptToggle?.addEventListener('click', toggleTranscript);
    
    // Copy buttons
    const copySummaryBtn = document.getElementById('copySummary');
    const copyKeyPointsBtn = document.getElementById('copyKeyPoints');
    const copyActionItemsBtn = document.getElementById('copyActionItems');
    const copyTranscriptBtn = document.getElementById('copyTranscript');
    
    if (copySummaryBtn) {
        copySummaryBtn.addEventListener('click', () => {
            const summaryText = document.getElementById('summaryText');
            if (summaryText) copyToClipboard(summaryText.textContent, 'copySummary');
        });
    }
    
    if (copyKeyPointsBtn) {
        copyKeyPointsBtn.addEventListener('click', () => {
            const keyPointsList = document.getElementById('keyPointsList');
            if (keyPointsList) {
                const text = Array.from(keyPointsList.children)
                    .map(item => item.textContent.trim())
                    .filter(text => text && !text.includes('loading') && !text.includes('No'))
                    .join('\n\n');
                if (text) copyToClipboard(text, 'copyKeyPoints');
            }
        });
    }
    
    if (copyActionItemsBtn) {
        copyActionItemsBtn.addEventListener('click', () => {
            const actionItemsList = document.getElementById('actionItemsList');
            if (actionItemsList) {
                const text = Array.from(actionItemsList.children)
                    .map(item => item.textContent.trim())
                    .filter(text => text && !text.includes('loading') && !text.includes('No'))
                    .join('\n');
                if (text) copyToClipboard(text, 'copyActionItems');
            }
        });
    }
    
    if (copyTranscriptBtn) {
        copyTranscriptBtn.addEventListener('click', () => {
            const transcriptContent = document.getElementById('transcriptContent');
            if (transcriptContent) {
                const text = transcriptContent.textContent.trim();
                if (text && !text.includes('Loading')) copyToClipboard(text, 'copyTranscript');
            }
        });
    }
    
    // Close modal on background click
    elements.recordingModal?.addEventListener('click', (e) => {
        if (e.target === elements.recordingModal) {
            closeRecordingModal();
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

// Handle keyboard shortcuts
function handleKeyboardShortcuts(e) {
    if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
            case 'r':
                e.preventDefault();
                if (isRecording) {
                    stopRecording();
                } else {
                    startRecordingFlow();
                }
                break;
            case '1':
                e.preventDefault();
                switchView('calendar');
                break;
            case '2':
                e.preventDefault();
                switchView('meetings');
                break;
            case '3':
                e.preventDefault();
                switchView('settings');
                break;
        }
    }
}

// Switch views
function switchView(viewName) {
    // Update navigation (only for main views, not detail views)
    if (viewName !== 'meetingDetail') {
        elements.navBtns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.view === viewName) {
                btn.classList.add('active');
            }
        });
    }
    
    // Update views
    elements.views.forEach(view => {
        view.classList.remove('active');
        if (view.id === `${viewName}View`) {
            view.classList.add('active');
        }
    });
    
    // Load view-specific data
    if (viewName === 'meetings') {
        loadRecordedMeetings();
    } else if (viewName === 'calendar') {
        loadUpcomingMeetings();
    }
}

// Start recording flow - show recording options
async function startRecordingFlow() {
    try {
        console.log('🎬 Starting recording flow...');
        console.log('🔍 Recording modal element:', elements.recordingModal);
        
        // Show recording options modal
        if (elements.recordingModal) {
            console.log('✅ Adding active class to modal');
            elements.recordingModal.classList.add('active');
            console.log('📱 Modal classes:', elements.recordingModal.classList.toString());
        } else {
            console.error('❌ Recording modal not found!');
            showToast('Recording modal not found', 'error');
        }
        
    } catch (error) {
        console.error('Start recording error:', error);
        showToast('Failed to start recording', 'error');
    }
}

// Display available sources
function displaySources(sources) {
    if (!elements.sourceGrid) return;
    
    elements.sourceGrid.innerHTML = '';
    
    sources.forEach(source => {
        const sourceElement = document.createElement('div');
        sourceElement.className = 'source-item';
        sourceElement.dataset.sourceId = source.id;
        
        sourceElement.innerHTML = `
            <img src="${source.thumbnail.toDataURL()}" alt="${source.name}" class="source-thumbnail">
            <div class="source-name">${source.name}</div>
        `;
        
        sourceElement.addEventListener('click', () => selectSource(source, sourceElement));
        elements.sourceGrid.appendChild(sourceElement);
    });
}

// Select source
function selectSource(source, element) {
    // Update UI
    document.querySelectorAll('.source-item').forEach(item => {
        item.classList.remove('selected');
    });
    element.classList.add('selected');
    
    selectedSource = source;
    
    // Enable start button
    if (elements.startRecording) {
        elements.startRecording.disabled = false;
    }
}

// Start actual recording
async function startActualRecording() {
    if (!selectedSource) return;
    
    try {
        console.log('Starting recording with source:', selectedSource.id);
        
        // Get screen stream
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: selectedSource.id
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: selectedSource.id,
                    maxWidth: 1920,
                    maxHeight: 1080,
                    maxFrameRate: 30
                }
            }
        });
        
        // Setup MediaRecorder
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9,opus'
        });
        
        recordedChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
                processAudioChunk(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            console.log('Recording stopped');
            await processRecording();
        };
        
        // Start recording
        mediaRecorder.start(1000);
        
        // Update UI
        isRecording = true;
        updateRecordingUI();
        
        // Close modal and show overlay
        closeRecordingModal();
        showRecordingOverlay();
        
        showToast('Recording started!', 'success');
        
    } catch (error) {
        console.error('Recording error:', error);
        showToast('Failed to start recording', 'error');
    }
}

// Stop recording
async function stopRecording() {
    try {
        console.log('🛑 Stopping recording...');
        
        // Stop speech recognition first
        stopSpeechRecognition();
        
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
        
        // Stop all tracks
        if (mediaRecorder && mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        // Update UI immediately
        isRecording = false;
        updateRecordingUI();
        await hideRecordingOverlay();
        stopRecordingTimer();
        
        // Process recording immediately with real transcript
        console.log('📝 Processing recording with real transcript...');
        await processAudioRecording();
        
    } catch (error) {
        console.error('Stop recording error:', error);
        showToast('❌ Failed to stop recording', 'error');
    }
}

// Update recording UI
function updateRecordingUI() {
    if (isRecording) {
        elements.statusDot?.classList.add('recording');
        elements.statusText && (elements.statusText.textContent = 'Recording');
        startRecordingTimer();
    } else {
        elements.statusDot?.classList.remove('recording');
        elements.statusDot?.classList.add('ready');
        elements.statusText && (elements.statusText.textContent = 'Ready');
        stopRecordingTimer();
    }
}

// Recording timer
function startRecordingTimer() {
    recordingStartTime = Date.now();
    recordingTimer = setInterval(async () => {
        const elapsed = Date.now() - recordingStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        if (elements.recordingTimer) {
            elements.recordingTimer.textContent = timeString;
        }
        
        // Update system overlay
        try {
            await ipcRenderer.invoke('update-recording-time', timeString);
        } catch (error) {
            // Ignore errors for system overlay updates
        }
    }, 1000);
}

function stopRecordingTimer() {
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
    if (elements.recordingTimer) {
        elements.recordingTimer.textContent = '00:00';
    }
}

// Show/hide recording overlay
async function showRecordingOverlay() {
    try {
        await ipcRenderer.invoke('show-recording-overlay');
        await ipcRenderer.invoke('start-audio-monitoring');
        showToast('🔴 Recording started', 'success');
        console.log('Recording overlay shown with audio monitoring');
    } catch (error) {
        console.error('Failed to show overlay:', error);
        showToast('🔴 Recording started', 'success');
    }
}

async function hideRecordingOverlay() {
    try {
        await ipcRenderer.invoke('stop-audio-monitoring');
        await ipcRenderer.invoke('hide-recording-overlay');
        showToast('⏹️ Recording stopped', 'info');
        console.log('Recording overlay hidden and audio monitoring stopped');
    } catch (error) {
        console.error('Failed to hide overlay:', error);
        showToast('⏹️ Recording stopped', 'info');
    }
}

// Close recording modal
function closeRecordingModal() {
    if (elements.recordingModal) {
        elements.recordingModal.classList.remove('active');
    }
    selectedSource = null;
    if (elements.startRecording) {
        elements.startRecording.disabled = true;
    }
}

// Close screen selection modal
function closeScreenSelectionModal() {
    if (elements.screenSelectionModal) {
        elements.screenSelectionModal.classList.remove('active');
    }
    selectedSource = null;
    if (elements.startRecording) {
        elements.startRecording.disabled = true;
    }
}

// Handle recording option selection
function handleRecordingOption(optionType) {
    closeRecordingModal();
    
    switch (optionType) {
        case 'desktop':
            startDesktopAudioCapture();
            break;
        case 'bot':
            showToast('Bot recording coming soon!', 'info');
            break;
        case 'upload':
            handleFileUpload();
            break;
        case 'zoom':
            showToast('Zoom import coming soon!', 'info');
            break;
    }
}

// Start desktop audio capture automatically
async function startDesktopAudioCapture() {
    try {
        console.log('🎙️ === STARTING DESKTOP AUDIO CAPTURE ===');
        console.log('⏰ Starting at:', new Date().toISOString());
        
        // Check permissions first
        console.log('🔐 Checking audio permissions...');
        const hasPermissions = await ipcRenderer.invoke('check-audio-permissions');
        console.log('🔐 Audio permissions granted:', hasPermissions);
        
        if (!hasPermissions) {
            showToast('Audio permissions required. Please grant access in System Preferences.', 'error');
            return;
        }
        
        // Start audio-only recording
        showToast('Starting audio capture...', 'info');
        
        console.log('🎤 Requesting microphone access...');
        
        // Get system audio stream (no video)
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: 44100,
                channelCount: 2
            },
            video: false
        });
        
        console.log('✅ Got media stream!');
        console.log('🎤 Stream ID:', stream.id);
        console.log('🎤 Stream active:', stream.active);
        console.log('🎤 Audio tracks:', stream.getAudioTracks().length);
        
        // Test if audio is actually coming through
        stream.getAudioTracks().forEach((track, i) => {
            console.log(`🎤 Track ${i}:`, {
                id: track.id,
                label: track.label,
                enabled: track.enabled,
                muted: track.muted,
                readyState: track.readyState
            });
        });
        
        // Start recording with the audio stream
        await startAudioRecording(stream);
        
    } catch (error) {
        console.error('❌ Desktop audio capture error:', error);
        console.error('❌ Error name:', error.name);
        console.error('❌ Error message:', error.message);
        
        if (error.name === 'NotAllowedError') {
            showToast('Audio permission denied. Please allow microphone access.', 'error');
        } else if (error.name === 'NotFoundError') {
            showToast('No microphone found. Please connect a microphone.', 'error');
        } else {
            showToast('Failed to start audio capture: ' + error.message, 'error');
        }
    }
}

// Show screen selection for bot recording (when needed)
async function showScreenSelection() {
    try {
        // Get available sources
        const sources = await ipcRenderer.invoke('get-sources');
        console.log('Available sources:', sources.length);
        
        if (sources.length === 0) {
            showToast('No screen sources available. Please check permissions.', 'error');
            return;
        }
        
        // Show screen selection modal
        displaySources(sources);
        if (elements.screenSelectionModal) {
            elements.screenSelectionModal.classList.add('active');
        }
        
    } catch (error) {
        console.error('Show screen selection error:', error);
        showToast('Failed to get screen sources', 'error');
    }
}

// Handle file upload for transcription
function handleFileUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,video/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            showToast(`Selected: ${file.name}`, 'success');
            // TODO: Process uploaded file for transcription
            processUploadedFile(file);
        }
    };
    input.click();
}

// Start audio-only recording with REAL speech recognition
async function startAudioRecording(stream) {
    try {
        console.log('🎙️ === STARTING AUDIO RECORDING ===');
        
        // Check if stream has audio tracks
        const audioTracks = stream.getAudioTracks();
        console.log('🎤 Audio tracks:', audioTracks.length);
        if (audioTracks.length === 0) {
            throw new Error('No audio tracks available in stream');
        }
        
        audioTracks.forEach((track, index) => {
            console.log(`🎤 Track ${index}:`, {
                label: track.label,
                enabled: track.enabled,
                muted: track.muted,
                readyState: track.readyState,
                settings: track.getSettings()
            });
        });
        
        // Set recording start time
        recordingStartTime = Date.now();
        console.log('⏰ Recording start time:', new Date(recordingStartTime).toISOString());
        
        // Set up MediaRecorder for audio only
        const options = { mimeType: 'audio/webm;codecs=opus' };
        
        // Check if the mimeType is supported
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.warn('⚠️ audio/webm;codecs=opus not supported, trying alternatives...');
            const alternatives = [
                'audio/webm',
                'audio/ogg;codecs=opus',
                'audio/mp4'
            ];
            
            for (const alt of alternatives) {
                if (MediaRecorder.isTypeSupported(alt)) {
                    options.mimeType = alt;
                    console.log('✅ Using alternative:', alt);
                    break;
                }
            }
        }
        
        console.log('🎬 Creating MediaRecorder with:', options);
        mediaRecorder = new MediaRecorder(stream, options);
        
        recordedChunks = [];
        console.log('📦 Cleared recorded chunks array');
        
        mediaRecorder.ondataavailable = (event) => {
            console.log('📡 ondataavailable event fired, data size:', event.data.size, 'bytes');
            if (event.data.size > 0) {
                console.log('🎵 Audio chunk received:', event.data.size, 'bytes');
                recordedChunks.push(event.data);
                console.log('📊 Total chunks so far:', recordedChunks.length);
                
                // Calculate total size
                const totalSize = recordedChunks.reduce((sum, chunk) => sum + chunk.size, 0);
                console.log('📦 Total audio data so far:', totalSize, 'bytes');
            } else {
                console.warn('⚠️ Empty audio chunk received (size: 0)');
            }
        };
        
        mediaRecorder.onerror = (event) => {
            console.error('❌ MediaRecorder error:', event.error);
        };
        
        mediaRecorder.onstop = async () => {
            const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
            console.log('⏹️ Audio recording stopped');
            console.log('⏱️ Recording duration:', duration, 'seconds');
            console.log('📊 Total chunks recorded:', recordedChunks.length);
            
            // Calculate total size
            const totalSize = recordedChunks.reduce((sum, chunk) => sum + chunk.size, 0);
            console.log('📦 Total audio data:', totalSize, 'bytes');
            
            await processAudioRecording();
        };
        
        // Start REAL speech recognition
        startSpeechRecognition();
        
        // Start recording
        console.log('▶️ Starting MediaRecorder with timeslice: 1000ms');
        mediaRecorder.start(1000); // Collect data every second
        console.log('✅ MediaRecorder started successfully');
        console.log('🎙️ MediaRecorder state:', mediaRecorder.state);
        console.log('🎙️ MediaRecorder mimeType:', mediaRecorder.mimeType);
        isRecording = true;
        
        // Update UI
        updateRecordingUI();
        showRecordingOverlay();
        startRecordingTimer();
        
        showToast('🎤 Recording with live transcription!', 'success');
        
    } catch (error) {
        console.error('❌ Start audio recording error:', error);
        console.error('❌ Error stack:', error.stack);
        showToast('Failed to start audio recording: ' + error.message, 'error');
    }
}

// Global variables for speech recognition
let recognition = null;
let finalTranscript = '';
let interimTranscript = '';

// Start LOCAL Whisper transcription (like Grain uses)
function startSpeechRecognition() {
    console.log('🎤 Starting LOCAL Whisper transcription...');
    
    finalTranscript = '';
    
    // No real-time transcription with Whisper - we'll process after recording
    // Just show that we're ready to capture
    showToast('🎤 Recording with Whisper AI (local)', 'success');
    
    // Set up for post-recording processing
    console.log('✅ Whisper transcription ready - will process after recording stops');
}

// Update live transcript display
function updateLiveTranscript(text) {
    // This could update a live transcript overlay if we had one
    console.log('📝 Live transcript:', text.slice(-50) + '...');
}

// Stop speech recognition
function stopSpeechRecognition() {
    if (recognition) {
        recognition.stop();
        recognition = null;
        console.log('🛑 Speech recognition stopped');
    }
}

// Process audio recording with Whisper
async function processAudioRecording() {
    try {
        console.log('📝 Processing audio with Whisper...');
        console.log('📊 Audio chunks:', recordedChunks.length);
        
        if (recordedChunks.length === 0) {
            console.warn('⚠️ No audio chunks recorded');
            showToast('No audio data recorded', 'warning');
            return;
        }
        
        showToast('🔄 Transcribing with Whisper AI...', 'info');
        
        // Create audio blob
        const audioBlob = new Blob(recordedChunks, { type: 'audio/webm;codecs=opus' });
        console.log('🎵 Audio blob size:', audioBlob.size, 'bytes');
        
        // Convert WebM to WAV format for better backend compatibility
        console.log('🔄 Converting audio to WAV format...');
        const wavBlob = await convertWebMToWAV(audioBlob);
        console.log('🎵 WAV blob size:', wavBlob.size, 'bytes');
        
        // Convert to base64 for backend API
        const reader = new FileReader();
        const base64Audio = await new Promise((resolve) => {
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1]; // Remove data:audio/wav;base64, prefix
                resolve(base64);
            };
            reader.readAsDataURL(wavBlob);
        });
        
        console.log('📦 Base64 audio length:', base64Audio.length, 'characters');
        
        // Send to backend for REAL Whisper transcription
        const transcriptionResult = await sendAudioForTranscription(base64Audio, 'wav');
        
        console.log('✅ Backend transcription result:', transcriptionResult);
        
        // Save meeting locally (no database dependency)
        const meeting = {
            id: transcriptionResult.id || Date.now().toString(),
            title: transcriptionResult.title || `Meeting Recording - ${new Date().toLocaleString()}`,
            transcript: transcriptionResult.transcript || 'No transcript available',
            summary: transcriptionResult.summary || 'No summary available',
            duration: transcriptionResult.duration || Math.floor((Date.now() - recordingStartTime) / 1000),
            language: transcriptionResult.language || 'en',
            confidence: transcriptionResult.confidence || 0,
            created_at: new Date().toISOString(),
            timestamp: Date.now()
        };
        
        console.log('💾 Saving meeting locally:', meeting);
        saveMeetingLocally(meeting);
        
        // Refresh the UI
        await loadRecordedMeetings();
        switchView('meetings');
        showToast('✅ Meeting transcribed and saved locally!', 'success');
        
    } catch (error) {
        console.error('Backend transcription error:', error);
        showToast('❌ Failed to process recording', 'error');
        switchView('meetings');
    }
}

// Convert WebM to WAV format using Web Audio API
async function convertWebMToWAV(webmBlob) {
    try {
        console.log('🎵 Converting WebM to WAV using Web Audio API...');
        
        // Create an audio context
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        
        // Read the WebM blob as ArrayBuffer
        const arrayBuffer = await webmBlob.arrayBuffer();
        
        // Decode the audio data
        console.log('🔊 Decoding audio...');
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        console.log('✅ Audio decoded:', audioBuffer.duration, 'seconds');
        
        // Get audio data
        const channelData = audioBuffer.getChannelData(0); // Get first channel (mono)
        const sampleRate = audioBuffer.sampleRate;
        const numChannels = 1; // Mono
        const bitsPerSample = 16;
        
        // Create WAV file
        const wavBuffer = encodeWAV(channelData, sampleRate, numChannels, bitsPerSample);
        const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
        
        console.log('✅ WAV conversion complete');
        return wavBlob;
        
    } catch (error) {
        console.error('❌ WAV conversion failed:', error);
        // Return original blob if conversion fails
        console.warn('⚠️ Using original WebM blob');
        return webmBlob;
    }
}

// Encode PCM audio data to WAV format
function encodeWAV(samples, sampleRate, numChannels, bitsPerSample) {
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
    const view = new DataView(buffer);
    
    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * bytesPerSample, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // PCM format
    view.setUint16(20, 1, true); // Linear PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * bytesPerSample, true);
    
    // Write PCM samples
    floatTo16BitPCM(view, 44, samples);
    
    return buffer;
}

// Helper function to write string to DataView
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Convert float samples to 16-bit PCM
function floatTo16BitPCM(view, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
}

// Create mock meeting as fallback
function createMockMeeting() {
    const user = checkAuthentication();
    const meeting = {
        id: Date.now(),
        title: `Meeting Recording - ${new Date().toLocaleString()}`,
        timestamp: Date.now(),
        duration: Math.floor((Date.now() - recordingStartTime) / 1000),
        summary: 'Audio recording completed (offline mode)',
        transcript: 'Audio was recorded but transcription service is unavailable. Please check your backend connection.',
        organizer: user ? user.name : 'You',

        participants: 1
    };
    
    // Save immediately
    const meetings = JSON.parse(localStorage.getItem('meetings') || '[]');
    meetings.unshift(meeting);
    localStorage.setItem('meetings', JSON.stringify(meetings));
    console.log('✅ Mock meeting saved:', meeting.title);
    
    // Show in UI
    loadRecordedMeetings();
    switchView('meetings');
    showToast('📝 Recording saved (offline)', 'warning');
}

// Send audio to backend for transcription
async function sendAudioForTranscription(base64Audio, format = 'wav') {
    try {
        console.log('🌐 === SENDING TO BACKEND ===');
        console.log('📍 Backend URL:', backendUrl);
        console.log('🎵 Audio format:', format);
        console.log('📊 Base64 audio length:', base64Audio.length, 'characters');
        console.log('📦 First 100 chars of base64:', base64Audio.substring(0, 100));
        
        showToast('🔄 Transcribing with AI...', 'info');
        
        const requestBody = {
            audio_data: base64Audio,
            format: format,
            title: `Meeting Recording - ${new Date().toLocaleString()}`
        };
        
        console.log('📤 Sending request to:', `${backendUrl}/api/transcription/audio`);
        console.log('📤 Request body size:', JSON.stringify(requestBody).length, 'bytes');
        
        // Try to use real backend
        const response = await fetch(`${backendUrl}/api/transcription/audio`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log('📥 Response status:', response.status, response.statusText);
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Backend transcription successful!');
            console.log('📝 Result:', JSON.stringify(result, null, 2));
            console.log('📝 Transcript:', result.transcript);
            console.log('📝 Summary:', result.summary);
            return result;
        } else {
            const errorText = await response.text();
            console.error('❌ Backend error response:', errorText);
            throw new Error(`Backend error: ${response.status} - ${errorText}`);
        }
        
    } catch (error) {
        console.error('❌ Backend transcription failed:', error);
        console.error('❌ Error details:', error.message);
        
        // Return fallback result
        const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
        return {
            transcript: `Backend transcription failed: ${error.message}. This is a fallback mock transcript.`,
            summary: `Mock transcription for ${duration}s recording (backend error: ${error.message})`,
            duration: duration,
            confidence: 0.5,
            language: 'en'
        };
    }
}

// Process uploaded file (placeholder)
async function processUploadedFile(file) {
    showToast('Processing file...', 'info');
    // TODO: Implement file processing and transcription
    setTimeout(() => {
        showToast('File processing complete!', 'success');
    }, 2000);
}

// Toggle transcript panel
function toggleTranscriptPanel() {
    const transcriptContent = document.querySelector('.transcript-content-grain');
    const toggleBtn = document.getElementById('toggleTranscript');
    
    if (transcriptContent && toggleBtn) {
        transcriptContent.classList.toggle('collapsed');
        const isCollapsed = transcriptContent.classList.contains('collapsed');
        toggleBtn.querySelector('span').textContent = isCollapsed ? '+' : '−';
        toggleBtn.setAttribute('title', isCollapsed ? 'Expand' : 'Collapse');
    }
}

// Toggle transcript
function toggleTranscript() {
    const transcript = elements.recordingOverlay?.querySelector('.live-transcript');
    const button = elements.transcriptToggle;
    
    if (transcript && button) {
        const isHidden = transcript.style.display === 'none';
        transcript.style.display = isHidden ? 'block' : 'none';
        button.textContent = isHidden ? 'Hide' : 'Show';
    }
}

// Process audio chunk for real-time transcription
async function processAudioChunk(chunk) {
    try {
        // Simulate transcription for demo
        if (Math.random() > 0.7) { // Only sometimes add transcript
            const sampleTexts = [
                "Welcome everyone to today's meeting.",
                "Let's start by reviewing the agenda.",
                "The first item is project updates.",
                "Does anyone have questions about this?",
                "Let's move on to the next topic.",
                "I think we should consider this approach.",
                "What are your thoughts on this proposal?",
                "Let's schedule a follow-up meeting.",
                "Thank you all for your time today."
            ];
            
            const randomText = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
            addTranscriptEntry(randomText);
        }
    } catch (error) {
        console.error('Audio processing error:', error);
    }
}

// Add transcript entry
function addTranscriptEntry(text) {
    if (!elements.transcriptContent) return;
    
    // Remove placeholder
    const placeholder = elements.transcriptContent.querySelector('.transcript-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const entry = document.createElement('div');
    entry.style.cssText = `
        margin-bottom: 12px;
        padding: 8px;
        background: rgba(37, 99, 235, 0.05);
        border-radius: 4px;
        border-left: 2px solid #2563eb;
    `;
    
    entry.innerHTML = `
        <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">${timestamp}</div>
        <div>${text}</div>
    `;
    
    elements.transcriptContent.appendChild(entry);
    elements.transcriptContent.scrollTop = elements.transcriptContent.scrollHeight;
}

// Save meeting locally
function saveMeetingLocally(meetingData) {
    const meetings = JSON.parse(localStorage.getItem('meetings') || '[]');
    
    // Check if meeting already exists (prevent duplicates)
    const existingIndex = meetings.findIndex(m => m.id === meetingData.id);
    if (existingIndex !== -1) {
        console.log('⚠️ Meeting already exists, updating instead of duplicating');
        meetings[existingIndex] = meetingData;
    } else {
        meetings.unshift(meetingData);
    }
    
    localStorage.setItem('meetings', JSON.stringify(meetings));
    console.log('💾 Meeting saved locally:', meetingData.id);
}

// Update date display
function updateDateDisplay() {
    if (elements.dateDisplay) {
        const today = new Date();
        elements.dateDisplay.textContent = today.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
}

// Load upcoming meetings
function loadUpcomingMeetings() {
    if (!elements.upcomingMeetings) return;
    
    // Demo meetings
    const demoMeetings = [
        {
            title: 'Team Standup',
            time: '10:00 AM - 10:30 AM',
            platform: 'Zoom',
            status: 'upcoming'
        },
        {
            title: 'Product Review',
            time: '2:00 PM - 3:00 PM',
            platform: 'Google Meet',
            status: 'upcoming'
        },
        {
            title: 'Client Call',
            time: '4:00 PM - 5:00 PM',
            platform: 'Microsoft Teams',
            status: 'upcoming'
        }
    ];
    
    elements.upcomingMeetings.innerHTML = demoMeetings.map(meeting => `
        <div class="meeting-card">
            <div class="meeting-info">
                <div class="meeting-title">${meeting.title}</div>
                <div class="meeting-time">
                    <span>${meeting.time}</span>
                    <span>•</span>
                    <span>${meeting.platform}</span>
                </div>
            </div>
            <div class="meeting-actions">
                <button class="btn-secondary">Record</button>
            </div>
        </div>
    `).join('');
}

// Load recorded meetings from LOCAL STORAGE (no database required)
async function loadRecordedMeetings() {
    console.log('Loading recorded meetings from local storage...');
    
    if (!elements.meetingsGrid) {
        console.error('Meetings grid element not found!');
        return;
    }
    
    try {
        // Show loading state
        elements.meetingsGrid.innerHTML = '<div class="loading">Loading meetings...</div>';
        
        // Load meetings from local storage
        const meetings = JSON.parse(localStorage.getItem('meetings') || '[]');
        
        console.log(`✅ Loaded ${meetings.length} meetings from local storage`);
        
        if (meetings.length === 0) {
            elements.meetingsGrid.innerHTML = '<div class="no-meetings">No meetings recorded yet. Start your first recording!</div>';
            return;
        }
        
        // Meetings are already in the correct format
        displayMeetings(meetings);
        
    } catch (error) {
        console.error('Failed to load meetings:', error);
        elements.meetingsGrid.innerHTML = '<div class="error">Failed to load meetings from local storage.</div>';
    }
}

// Display meetings in the UI
function displayMeetings(meetings) {
    
    elements.meetingsGrid.innerHTML = meetings.map(meeting => `
        <div class="recorded-meeting-card" data-meeting-id="${meeting.id}">
            <div class="meeting-title">${meeting.title}</div>
            <div class="meeting-meta">
                <span>${new Date(meeting.timestamp).toLocaleDateString()}</span>
                <span>•</span>
                <span>${Math.floor(meeting.duration / 60)}m ${meeting.duration % 60}s</span>
                <span>•</span>
                <span>${meeting.participants} participants</span>
            </div>
            <div class="meeting-summary">${meeting.summary}</div>
            <div class="meeting-actions">
                <button class="btn-secondary view-meeting">View Transcript</button>
                <button class="btn-secondary">Download</button>
            </div>
        </div>
    `).join('');
    
    // Add click handlers to meeting cards
    document.querySelectorAll('.view-meeting').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.recorded-meeting-card');
            const meetingId = card.dataset.meetingId;
            showMeetingDetail(meetingId);
        });
    });
}

// Show meeting detail view
async function showMeetingDetail(meetingId) {
    console.log('📋 Loading meeting detail for ID:', meetingId);
    
    try {
        // Show loading state
        updateMeetingDetailView({
            title: 'Loading...',
            summary: 'Loading meeting details...',
            transcript: 'Loading transcript...',
            organizer: 'Loading...',
            timestamp: Date.now(),
            duration: 0
        });
        
        // Switch to meeting detail view first
        switchView('meetingDetail');
        
        // Load meeting from LOCAL STORAGE
        const meetings = JSON.parse(localStorage.getItem('meetings') || '[]');
        const meeting = meetings.find(m => m.id === meetingId);
        
        if (!meeting) {
            console.error('❌ Meeting not found:', meetingId);
            showToast('Meeting not found', 'error');
            updateMeetingDetailView({
                title: 'Meeting Not Found',
                summary: 'This meeting could not be found in local storage.',
                transcript: 'Unable to load transcript.',
                organizer: 'Unknown',
                timestamp: Date.now(),
                duration: 0
            });
            return;
        }
        
        console.log('✅ Found meeting:', meeting.title);
        
        // Update meeting detail view with actual data
        updateMeetingDetailView(meeting);
        
    } catch (error) {
        console.error('Failed to load meeting details:', error);
        updateMeetingDetailView({
            title: 'Error Loading Meeting',
            summary: 'Failed to load meeting details. Please check your connection.',
            transcript: 'Unable to load transcript.',
            organizer: 'Unknown',
            timestamp: Date.now(),
            duration: 0
        });
        showToast('Failed to load meeting details', 'error');
    }
}

// Update meeting detail view with actual meeting data
// Format transcript with speaker-separated segments
function formatTranscriptWithSegments(segments) {
    if (!segments || segments.length === 0) {
        return '<p>No transcript available</p>';
    }
    
    let html = '<div class="transcript-segments">';
    let currentSpeaker = 1;
    let lastEndTime = 0;
    
    segments.forEach((segment, index) => {
        // Simple heuristic: change speaker if there's a pause > 2 seconds
        const gap = segment.start - lastEndTime;
        if (gap > 2 && index > 0) {
            currentSpeaker = currentSpeaker === 1 ? 2 : 1;
        }
        
        const minutes = Math.floor(segment.start / 60);
        const seconds = Math.floor(segment.start % 60);
        const timestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        html += `
            <div class="transcript-segment">
                <div class="segment-header">
                    <span class="speaker-label speaker-${currentSpeaker}">Speaker ${currentSpeaker}</span>
                    <span class="segment-time">${timestamp}</span>
                </div>
                <div class="segment-text">${segment.text.trim()}</div>
            </div>
        `;
        
        lastEndTime = segment.end;
    });
    
    html += '</div>';
    return html;
}

async function updateMeetingDetailView(meeting) {
    console.log('🔄 Updating meeting detail view with:', meeting);
    
    // Update title
    const titleElement = document.querySelector('#meetingDetailView .meeting-title');
    if (titleElement) {
        titleElement.textContent = meeting.title;
    }
    
    // Update metadata in header
    const dateElement = document.querySelector('.meeting-date');
    if (dateElement) {
        dateElement.textContent = new Date(meeting.timestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }
    
    const durationDisplayElement = document.querySelector('.meeting-duration-display');
    if (durationDisplayElement) {
        const minutes = Math.floor(meeting.duration / 60);
        const seconds = meeting.duration % 60;
        durationDisplayElement.textContent = `${minutes}m ${seconds}s`;
    }
    
    const organizerDisplayElement = document.querySelector('.meeting-organizer-display');
    if (organizerDisplayElement) {
        organizerDisplayElement.textContent = meeting.organizer || 'Unknown';
    }
    
    // Update transcript in sidebar
    const transcriptElement = document.getElementById('transcriptContent');
    if (transcriptElement) {
        // Check if we have segments for speaker-separated display
        if (meeting.segments && meeting.segments.length > 0) {
            transcriptElement.innerHTML = formatTranscriptWithSegments(meeting.segments);
        } else {
            transcriptElement.textContent = meeting.transcript || 'No transcript available';
        }
    }
    
    // Check if AI summary already exists, if not generate it
    if (meeting.ai_summary && meeting.key_points && meeting.action_items) {
        console.log('✅ Using cached AI summary');
        displaySummaryResult({
            summary: meeting.ai_summary,
            key_points: meeting.key_points,
            action_items: meeting.action_items
        }, document.getElementById('summaryText'), document.getElementById('keyPointsList'), document.getElementById('actionItemsList'));
    } else {
        console.log('🔄 Generating new AI summary...');
        await generateAISummary(meeting.id, meeting.transcript);
    }
}

// Generate AI summary using OpenRouter
async function generateAISummary(meetingId, transcript) {
    const summaryElement = document.getElementById('summaryText');
    const keyPointsList = document.getElementById('keyPointsList');
    const actionItemsList = document.getElementById('actionItemsList');
    
    if (!transcript || transcript.length < 20) {
        if (summaryElement) summaryElement.textContent = 'No transcript available for summarization';
        if (keyPointsList) keyPointsList.innerHTML = '<div class="no-data">No transcript to analyze</div>';
        if (actionItemsList) actionItemsList.innerHTML = '<div class="no-data">No action items found</div>';
        return;
    }
    
    try {
        console.log('🤖 Generating AI summary with OpenRouter...');
        
        // Show loading state
        if (summaryElement) summaryElement.textContent = 'AI is analyzing the meeting transcript...';
        if (keyPointsList) keyPointsList.innerHTML = '<div class="loading">Analyzing meeting...</div>';
        if (actionItemsList) actionItemsList.innerHTML = '<div class="loading">Extracting action items...</div>';
        
        // Try the dedicated /summarize endpoint first
        let response = await fetch(`${backendUrl}/api/transcription/summarize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ transcript })
        });
        
        // If endpoint doesn't exist (404), try extracting from the transcript itself
        if (!response.ok && response.status === 404) {
            console.warn('⚠️ /summarize endpoint not available on deployed backend');
            console.log('📝 Using client-side summary extraction...');
            
            // Generate a simple summary client-side
            const result = generateClientSideSummary(transcript);
            displaySummaryResult(result, summaryElement, keyPointsList, actionItemsList);
            
            // Save the summary to meeting
            saveSummaryToMeeting(meetingId, result);
            
            showToast('📝 Summary generated (AI endpoint unavailable)', 'info');
            return;
        }
        
        if (!response.ok) {
            throw new Error(`Backend error: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('✅ AI Summary generated:', result);
        
        displaySummaryResult(result, summaryElement, keyPointsList, actionItemsList);
        
        // Save the summary to meeting
        saveSummaryToMeeting(meetingId, result);
        
        showToast('✨ AI summary generated!', 'success');
        
    } catch (error) {
        console.error('❌ AI summary generation failed:', error);
        
        // Try client-side fallback
        try {
            const fallbackResult = generateClientSideSummary(transcript);
            displaySummaryResult(fallbackResult, summaryElement, keyPointsList, actionItemsList);
            
            // Save the summary to meeting
            saveSummaryToMeeting(meetingId, fallbackResult);
            
            showToast('📝 Summary generated (fallback mode)', 'info');
        } catch (fallbackError) {
            // Final fallback
            if (summaryElement) {
                summaryElement.textContent = 'AI summarization is temporarily unavailable. The full transcript is available in the sidebar.';
            }
            if (keyPointsList) {
                keyPointsList.innerHTML = '<div class="no-data">AI analysis unavailable - please deploy the latest backend</div>';
            }
            if (actionItemsList) {
                actionItemsList.innerHTML = '<div class="no-data">AI analysis unavailable - please deploy the latest backend</div>';
            }
            showToast('⚠️ AI summary unavailable', 'warning');
        }
    }
}

// Save AI summary to meeting in localStorage
function saveSummaryToMeeting(meetingId, summaryResult) {
    try {
        const meetings = JSON.parse(localStorage.getItem('meetings') || '[]');
        const meetingIndex = meetings.findIndex(m => m.id === meetingId);
        
        if (meetingIndex !== -1) {
            meetings[meetingIndex].ai_summary = summaryResult.summary;
            meetings[meetingIndex].key_points = summaryResult.key_points;
            meetings[meetingIndex].action_items = summaryResult.action_items;
            
            localStorage.setItem('meetings', JSON.stringify(meetings));
            console.log('💾 AI summary saved to meeting:', meetingId);
        }
    } catch (error) {
        console.error('❌ Failed to save summary:', error);
    }
}

// Display summary results in UI
function displaySummaryResult(result, summaryElement, keyPointsList, actionItemsList) {
    // Update summary
    if (summaryElement) {
        summaryElement.textContent = result.summary || 'Meeting discussion summary not available';
    }
    
    // Update key points with markdown rendering
    if (keyPointsList && result.key_points && result.key_points.length > 0) {
        keyPointsList.innerHTML = result.key_points.map(point => {
            // First, replace literal \n with actual newlines if they exist
            let processedPoint = point.replace(/\\n/g, '\n');
            
            // Convert **text** to <strong>text</strong> and preserve line breaks
            const formattedPoint = processedPoint
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');
            return `<div class="key-point-item">${formattedPoint}</div>`;
        }).join('');
    } else if (keyPointsList) {
        keyPointsList.innerHTML = '<div class="no-data">No key points identified</div>';
    }
    
    // Update action items with markdown rendering
    if (actionItemsList && result.action_items && result.action_items.length > 0) {
        actionItemsList.innerHTML = result.action_items.map(item => {
            // Replace literal \n with actual newlines
            let processedItem = item.replace(/\\n/g, '\n');
            
            // Convert **text** to <strong>text</strong> and preserve line breaks
            const formattedItem = processedItem
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');
            return `<div class="action-item">${formattedItem}</div>`;
        }).join('');
    } else if (actionItemsList) {
        actionItemsList.innerHTML = '<div class="no-data">No action items identified</div>';
    }
}

// Generate client-side summary when backend AI is unavailable
function generateClientSideSummary(transcript) {
    console.log('🔧 Generating client-side summary as fallback...');
    
    // Extract sentences
    const sentences = transcript.match(/[^\.!\?]+[\.!\?]+/g) || [transcript];
    
    // Create a simple summary (first 2-3 sentences)
    const summaryLength = Math.min(3, sentences.length);
    const summary = sentences.slice(0, summaryLength).join(' ').trim();
    
    // Extract potential key points by topics
    const keyPoints = [];
    const topicKeywords = {
        'Discussion Points': ['discussed', 'talked about', 'mentioned', 'brought up', 'covered'],
        'Decisions Made': ['decided', 'agreed', 'confirmed', 'approved', 'concluded'],
        'Plans & Next Steps': ['planned', 'will', 'going to', 'next', 'future'],
        'Questions & Concerns': ['asked', 'questioned', 'concern', 'issue', 'problem'],
        'Technical Details': ['system', 'code', 'api', 'database', 'model', 'schema']
    };
    
    // Group sentences by topics
    const topicGroups = {};
    sentences.forEach(sentence => {
        const lowerSentence = sentence.toLowerCase();
        for (const [topic, keywords] of Object.entries(topicKeywords)) {
            if (keywords.some(keyword => lowerSentence.includes(keyword))) {
                if (!topicGroups[topic]) topicGroups[topic] = [];
                const cleanSentence = sentence.trim().replace(/^(and|but|so|then)\s+/i, '');
                if (cleanSentence.length > 20 && topicGroups[topic].length < 3) {
                    topicGroups[topic].push('- ' + cleanSentence);
                }
            }
        }
    });
    
    // Format key points with headers
    for (const [topic, points] of Object.entries(topicGroups)) {
        if (points.length > 0) {
            keyPoints.push(`**${topic}**\n${points.join('\n')}`);
        }
    }
    
    // Extract action items with assignees
    const actionItems = [];
    const actionPatterns = [
        { regex: /(\w+)\s+will\s+([^\.]+)/gi, format: (name, task) => `**${name}**: ${task.trim()}` },
        { regex: /(\w+)\s+needs? to\s+([^\.]+)/gi, format: (name, task) => `**${name}**: ${task.trim()}` },
        { regex: /(\w+)\s+should\s+([^\.]+)/gi, format: (name, task) => `**${name}**: ${task.trim()}` }
    ];
    
    sentences.forEach(sentence => {
        actionPatterns.forEach(pattern => {
            const matches = [...sentence.matchAll(pattern.regex)];
            matches.forEach(match => {
                if (match[1] && match[2] && actionItems.length < 5) {
                    const name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
                    const task = match[2].trim();
                    if (task.length > 10) {
                        actionItems.push(pattern.format(name, task));
                    }
                }
            });
        });
    });
    
    return {
        summary: summary || 'Meeting transcript available in sidebar.',
        key_points: keyPoints.length > 0 ? keyPoints : ['**Note**: AI summarization unavailable - review full transcript for details'],
        action_items: actionItems.length > 0 ? actionItems : []
    };
}

// Check permissions
async function checkPermissions() {
    try {
        // This will be handled by the main process
        console.log('Checking permissions...');
    } catch (error) {
        console.error('Permission check error:', error);
    }
}

// Load settings
async function loadSettings() {
    try {
        const settings = await ipcRenderer.invoke('get-settings');
        
        if (elements.qualitySelect) elements.qualitySelect.value = settings.quality || 'high';
        if (elements.autoStartToggle) elements.autoStartToggle.checked = settings.autoStart || false;
        if (elements.languageSelect) elements.languageSelect.value = settings.transcriptionLanguage || 'en';
        
    } catch (error) {
        console.error('Load settings error:', error);
    }
}

// Save settings
async function saveSettings() {
    try {
        const settings = {
            quality: elements.qualitySelect?.value || 'high',
            autoStart: elements.autoStartToggle?.checked || false,
            transcriptionLanguage: elements.languageSelect?.value || 'en'
        };
        
        await ipcRenderer.invoke('save-settings', settings);
        showToast('Settings saved!', 'success');
        
    } catch (error) {
        console.error('Save settings error:', error);
        showToast('Failed to save settings', 'error');
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    if (!elements.toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    elements.toastContainer.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Theme Management
let currentTheme = localStorage.getItem('theme') || 'light';

function initializeTheme() {
    // Apply theme on startup
    applyTheme(currentTheme);
    
    // Update theme toggle buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.theme === currentTheme) {
            btn.classList.add('active');
        }
    });
}

function applyTheme(theme) {
    const body = document.body;
    
    // Remove existing theme classes
    body.classList.remove('theme-light', 'theme-dark', 'theme-auto');
    
    if (theme === 'light') {
        body.classList.add('theme-light');
    } else if (theme === 'dark') {
        body.classList.add('theme-dark');
    } else {
        body.classList.add('theme-auto');
    }
    
    currentTheme = theme;
    localStorage.setItem('theme', theme);
}

function setupThemeToggle() {
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            
            // Update active state
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Apply theme
            applyTheme(theme);
            
            showToast(`Switched to ${theme} theme`, 'success');
        });
    });
}

// IPC event listeners
ipcRenderer.on('permissions-status', (event, permissions) => {
    console.log('Permissions status:', permissions);
    // Update UI based on permissions
});

ipcRenderer.on('recording-started', () => {
    console.log('Recording started from main process');
});

ipcRenderer.on('recording-stopped', () => {
    console.log('Recording stopped from main process');
});

ipcRenderer.on('stop-recording-signal', () => {
    console.log('Stop recording signal from overlay');
    if (isRecording) {
        stopRecording();
    }
});

// Meeting detection listener
ipcRenderer.on('meeting-detected', (event, meetingData) => {
    console.log('📞 Meeting detected:', meetingData);
    showMeetingDetectionModal(meetingData);
});

// Show meeting detection modal
function showMeetingDetectionModal(meetingData) {
    const modal = document.getElementById('meetingDetectionModal');
    const meetingType = document.getElementById('meetingType');
    const meetingName = document.getElementById('meetingName');
    const startBtn = document.getElementById('startMeetingRecording');
    const dismissBtn = document.getElementById('dismissMeetingPrompt');
    
    if (!modal) return;
    
    // Set meeting info
    if (meetingType) meetingType.textContent = meetingData.type;
    if (meetingName) meetingName.textContent = meetingData.name;
    
    // Show modal
    modal.style.display = 'flex';
    
    // Handle start recording
    startBtn.onclick = async () => {
        modal.style.display = 'none';
        // Auto-start recording with the detected source
        const result = await ipcRenderer.invoke('start-recording', meetingData.sourceId);
        if (result.success) {
            showToast(`🎥 Recording ${meetingData.type} meeting`, 'success');
        }
    };
    
    // Handle dismiss
    dismissBtn.onclick = async () => {
        modal.style.display = 'none';
        await ipcRenderer.invoke('dismiss-meeting-prompt');
    };
}

// Copy functionality
async function copyToClipboard(text, buttonId) {
    try {
        await navigator.clipboard.writeText(text);
        
        // Update button state
        const button = document.getElementById(buttonId);
        if (button) {
            button.classList.add('copied');
            const originalHTML = button.innerHTML;
            button.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5l-7 7-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
            
            setTimeout(() => {
                button.classList.remove('copied');
                button.innerHTML = originalHTML;
            }, 2000);
        }
        
        showToast('📋 Copied to clipboard', 'success');
    } catch (error) {
        console.error('Copy failed:', error);
        showToast('❌ Failed to copy', 'error');
    }
}

// Authentication functions
function checkAuthentication() {
    const user = localStorage.getItem('meetnote_user');
    return user ? JSON.parse(user) : null;
}

function handleLogin(event) {
    event.preventDefault();
    
    const userName = document.getElementById('userName').value.trim();
    const userEmail = document.getElementById('userEmail').value.trim();
    
    if (!userName) {
        showToast('Please enter your name', 'error');
        return;
    }
    
    // Save user data
    const userData = {
        name: userName,
        email: userEmail || '',
        createdAt: Date.now()
    };
    
    localStorage.setItem('meetnote_user', JSON.stringify(userData));
    
    // Hide login modal
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.classList.remove('active');
    }
    
    // Update UI with user info
    updateUserInterface(userData);
    
    showToast(`Welcome, ${userName}!`, 'success');
}

function updateUserInterface(userData) {
    // Update header with user name if needed
    const appName = document.querySelector('.app-name');
    if (appName) {
        appName.textContent = `MeetNote - ${userData.name}`;
    }
}

function showLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.classList.add('active');
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    
    // Check authentication (optional - don't force login)
    const user = checkAuthentication();
    if (user) {
        updateUserInterface(user);
    }
    
    initializeApp();
    setupThemeToggle();
});

console.log('MeetNote Desktop renderer loaded');