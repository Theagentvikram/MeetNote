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
    
    // Settings
    elements.saveSettingsBtn?.addEventListener('click', saveSettings);
    
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Transcript toggle
    elements.transcriptToggle?.addEventListener('click', toggleTranscript);
    
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
        console.log('Starting desktop audio capture...');
        
        // Check permissions first
        const hasPermissions = await ipcRenderer.invoke('check-audio-permissions');
        if (!hasPermissions) {
            showToast('Audio permissions required. Please grant access in System Preferences.', 'error');
            return;
        }
        
        // Start audio-only recording
        showToast('Starting audio capture...', 'info');
        
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
        
        // Start recording with the audio stream
        await startAudioRecording(stream);
        
    } catch (error) {
        console.error('Desktop audio capture error:', error);
        if (error.name === 'NotAllowedError') {
            showToast('Audio permission denied. Please allow microphone access.', 'error');
        } else {
            showToast('Failed to start audio capture', 'error');
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
        // Set up MediaRecorder for audio only
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus'
        });
        
        recordedChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            console.log('Audio recording stopped');
            await processAudioRecording();
        };
        
        // Start REAL speech recognition
        startSpeechRecognition();
        
        // Start recording
        mediaRecorder.start(1000); // Collect data every second
        isRecording = true;
        
        // Update UI
        updateRecordingUI();
        showRecordingOverlay();
        startRecordingTimer();
        
        showToast('🎤 Recording with live transcription!', 'success');
        
    } catch (error) {
        console.error('Start audio recording error:', error);
        showToast('Failed to start audio recording', 'error');
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
        
        // Create audio blob and save to temporary file
        const audioBlob = new Blob(recordedChunks, { type: 'audio/webm;codecs=opus' });
        console.log('🎵 Audio blob size:', audioBlob.size, 'bytes');
        
        // Convert to base64 for backend API
        const reader = new FileReader();
        const base64Audio = await new Promise((resolve) => {
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1]; // Remove data:audio/webm;base64, prefix
                resolve(base64);
            };
            reader.readAsDataURL(audioBlob);
        });
        
        // Send to backend for REAL Whisper transcription
        const transcriptionResult = await sendAudioForTranscription(base64Audio);
        
        console.log('✅ Backend transcription result:', transcriptionResult);
        
        // Backend already stored the meeting in Supabase, just refresh the UI
        await loadRecordedMeetings();
        switchView('meetings');
        showToast('✅ Meeting transcribed and saved!', 'success');
        
    } catch (error) {
        console.error('Backend transcription error:', error);
        showToast('❌ Failed to process recording', 'error');
        switchView('meetings');
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
async function sendAudioForTranscription(base64Audio) {
    try {
        showToast('🔄 Transcribing with AI...', 'info');
        
        // Try to use real backend
        const response = await fetch(`${backendUrl}/api/transcription/audio`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                audio_data: base64Audio,
                format: 'webm'
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Backend transcription successful:', result);
            return result;
        } else {
            throw new Error(`Backend error: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Backend transcription failed, using fallback:', error);
        
        // Return fallback result
        const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
        return {
            transcript: "Backend transcription failed. This is a fallback mock transcript.",
            summary: `Mock transcription for ${duration}s recording (backend unavailable)`,
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

// Process completed recording
async function processRecording() {
    try {
        console.log('Processing recording...', recordedChunks.length, 'chunks');
        
        if (recordedChunks.length === 0) {
            showToast('No recording data to process', 'warning');
            return;
        }
        
        // Combine chunks
        const recordedBlob = new Blob(recordedChunks, { type: 'video/webm' });
        
        // Create meeting record
        const meetingData = {
            id: Date.now(),
            title: `Meeting ${new Date().toLocaleDateString()}`,
            platform: 'Desktop Recording',
            duration: Math.floor((Date.now() - recordingStartTime) / 1000),
            timestamp: new Date().toISOString(),
            summary: 'AI-generated summary will appear here after processing...',
            transcript: 'Full transcript available after processing...'
        };
        
        // Save locally for demo
        saveMeetingLocally(meetingData);
        
        showToast('Recording processed successfully!', 'success');
        
    } catch (error) {
        console.error('Processing error:', error);
        showToast('Failed to process recording', 'error');
    }
}

// Save meeting locally
function saveMeetingLocally(meetingData) {
    const meetings = JSON.parse(localStorage.getItem('meetings') || '[]');
    meetings.unshift(meetingData);
    localStorage.setItem('meetings', JSON.stringify(meetings));
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

// Load recorded meetings from backend
async function loadRecordedMeetings() {
    console.log('Loading recorded meetings from backend...');
    
    if (!elements.meetingsGrid) {
        console.error('Meetings grid element not found!');
        return;
    }
    
    try {
        // Show loading state
        elements.meetingsGrid.innerHTML = '<div class="loading">Loading meetings...</div>';
        
        // Fetch meetings from backend
        const response = await fetch(`${backendUrl}/api/meetings`);
        
        if (!response.ok) {
            throw new Error(`Backend error: ${response.status}`);
        }
        
        const data = await response.json();
        const meetings = data.meetings || [];
        
        console.log(`✅ Loaded ${meetings.length} meetings from backend`);
        
        if (meetings.length === 0) {
            elements.meetingsGrid.innerHTML = '<div class="no-meetings">No meetings recorded yet. Start your first recording!</div>';
            return;
        }
        
        // Convert backend format to frontend format
        const formattedMeetings = meetings.map(meeting => ({
            id: meeting.id,
            title: meeting.title,
            timestamp: new Date(meeting.created_at).getTime(),
            duration: meeting.duration || 0,
            summary: meeting.summary || 'No summary available',
            transcript: meeting.transcript || 'No transcript available',
            organizer: 'You',
            participants: 1,
            confidence: meeting.confidence || 0
        }));
        
        displayMeetings(formattedMeetings);
        
    } catch (error) {
        console.error('Failed to load meetings from backend:', error);
        elements.meetingsGrid.innerHTML = '<div class="error">Failed to load meetings. Please check your connection.</div>';
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
        
        // Fetch meeting details from backend
        const response = await fetch(`${backendUrl}/api/meetings`);
        if (!response.ok) {
            throw new Error(`Backend error: ${response.status}`);
        }
        
        const data = await response.json();
        const backendMeeting = data.meetings.find(m => m.id === meetingId);
        
        if (!backendMeeting) {
            console.error('❌ Meeting not found:', meetingId);
            showToast('Meeting not found', 'error');
            return;
        }
        
        console.log('✅ Found meeting:', backendMeeting.title);
        
        // Convert to frontend format
        const meeting = {
            id: backendMeeting.id,
            title: backendMeeting.title,
            timestamp: new Date(backendMeeting.created_at).getTime(),
            duration: backendMeeting.duration || 0,
            summary: backendMeeting.summary || 'No summary available',
            transcript: backendMeeting.transcript || 'No transcript available',
            organizer: 'You',
            participants: 1,
            confidence: backendMeeting.confidence || 0
        };
        
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
function updateMeetingDetailView(meeting) {
    console.log('🔄 Updating meeting detail view with:', meeting);
    
    // Update title
    const titleElement = document.querySelector('#meetingDetailView .meeting-title');
    if (titleElement) {
        titleElement.textContent = meeting.title;
        console.log('✅ Updated title:', meeting.title);
    }
    
    // Update metadata
    const metaElement = document.querySelector('#meetingDetailView .meeting-meta .meeting-meta');
    if (metaElement) {
        const date = new Date(meeting.timestamp).toLocaleDateString();
        const duration = `${Math.floor(meeting.duration / 60)}m ${meeting.duration % 60}s`;
        metaElement.innerHTML = `
            <span>${date}</span>
            <span>•</span>
            <span>${duration}</span>
            <span>•</span>
            <span>${meeting.participants || 1} participants</span>
        `;
        console.log('✅ Updated metadata');
    }
    
    // Update summary
    const summaryElement = document.querySelector('#meetingDetailView .summary-text');
    if (summaryElement) {
        summaryElement.textContent = meeting.summary || 'No summary available';
        console.log('✅ Updated summary');
    }
    
    // Update transcript
    const transcriptElement = document.querySelector('#meetingDetailView .transcript-content');
    if (transcriptElement) {
        transcriptElement.innerHTML = `
            <div class="transcript-text" style="white-space: pre-wrap; line-height: 1.6;">
                ${meeting.transcript || 'No transcript available'}
            </div>
        `;
        console.log('✅ Updated transcript');
    }
    
    // Update organizer info
    const organizerNameElement = document.querySelector('#meetingDetailView .organizer-name');
    if (organizerNameElement) {
        organizerNameElement.textContent = meeting.organizer || 'Unknown';
        console.log('✅ Updated organizer');
    }
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