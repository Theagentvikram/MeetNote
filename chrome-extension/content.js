/**
 * Content Script - Runs on meeting pages
 * Detects meetings, shows overlay, handles UI interactions
 */

// Meeting platform detection
const MEETING_PLATFORMS = {
  GOOGLE_MEET: {
    name: 'Google Meet',
    urlPattern: /meet\.google\.com/,
    selectors: {
      video: 'video',
      participantCount: '[data-participant-count]'
    }
  },
  ZOOM: {
    name: 'Zoom',
    urlPattern: /zoom\.us/,
    selectors: {
      video: 'video',
      participantCount: '.participants-count'
    }
  },
  TEAMS: {
    name: 'Microsoft Teams',
    urlPattern: /teams\.microsoft\.com/,
    selectors: {
      video: 'video',
      participantCount: '[data-tid="roster-list"]'
    }
  },
  TEST_MEETING: {
    name: 'Test Meeting',
    urlPattern: /test-meeting|localhost.*meet/,
    selectors: {
      video: 'video',
      participantCount: '#participants'
    }
  }
};

// State
let currentPlatform = null;
let overlayInjected = false;
let transcriptOverlay = null;
let isRecording = false;

// Initialize
function init() {
  console.log('MeetNote content script loaded');
  
  // Detect meeting platform
  detectMeetingPlatform();
  
  // Listen for messages from background
  chrome.runtime.onMessage.addListener(handleMessage);
  
  // Inject overlay if on meeting page
  if (currentPlatform) {
    injectOverlay();
  }
}

// Detect which meeting platform we're on
function detectMeetingPlatform() {
  const url = window.location.href;
  
  for (const [key, platform] of Object.entries(MEETING_PLATFORMS)) {
    if (platform.urlPattern.test(url)) {
      currentPlatform = platform;
      console.log('Meeting platform detected:', platform.name);
      
      // Notify background
      chrome.runtime.sendMessage({
        type: 'MEETING_DETECTED',
        data: {
          platform: platform.name,
          url: url
        }
      });
      
      return platform;
    }
  }
  
  return null;
}

// Inject transcript overlay (invisible by default)
function injectOverlay() {
  if (overlayInjected) return;
  
  // Create overlay container
  transcriptOverlay = document.createElement('div');
  transcriptOverlay.id = 'meetnote-overlay';
  transcriptOverlay.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 400px;
    max-height: 300px;
    background: rgba(0, 0, 0, 0.9);
    border-radius: 12px;
    padding: 16px;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    z-index: 999999;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: none;
    overflow: hidden;
  `;
  
  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  `;
  
  const title = document.createElement('div');
  title.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
  `;
  
  const recordingDot = document.createElement('div');
  recordingDot.id = 'meetnote-recording-dot';
  recordingDot.style.cssText = `
    width: 8px;
    height: 8px;
    background: #ef4444;
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
    display: none;
  `;
  
  title.innerHTML = `
    <span style="font-size: 20px;">🎙️</span>
    <span>MeetNote</span>
  `;
  title.prepend(recordingDot);
  
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
    transition: opacity 0.2s;
  `;
  closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
  closeBtn.onmouseout = () => closeBtn.style.opacity = '0.7';
  closeBtn.onclick = () => hideOverlay();
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  
  // Transcript container
  const transcriptContainer = document.createElement('div');
  transcriptContainer.id = 'meetnote-transcript';
  transcriptContainer.style.cssText = `
    max-height: 200px;
    overflow-y: auto;
    font-size: 13px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.9);
  `;
  transcriptContainer.innerHTML = `
    <div style="color: rgba(255, 255, 255, 0.5); font-style: italic;">
      Waiting for recording to start...
    </div>
  `;
  
  // Controls
  const controls = document.createElement('div');
  controls.style.cssText = `
    display: flex;
    gap: 8px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  `;
  
  const highlightBtn = document.createElement('button');
  highlightBtn.innerHTML = '⭐ Highlight';
  highlightBtn.style.cssText = `
    flex: 1;
    background: rgba(59, 130, 246, 0.2);
    border: 1px solid rgba(59, 130, 246, 0.5);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  `;
  highlightBtn.onmouseover = () => {
    highlightBtn.style.background = 'rgba(59, 130, 246, 0.3)';
  };
  highlightBtn.onmouseout = () => {
    highlightBtn.style.background = 'rgba(59, 130, 246, 0.2)';
  };
  highlightBtn.onclick = () => {
    chrome.runtime.sendMessage({ type: 'CREATE_HIGHLIGHT' });
    showNotification('Highlight created! ⭐');
  };
  
  controls.appendChild(highlightBtn);
  
  // Assemble overlay
  transcriptOverlay.appendChild(header);
  transcriptOverlay.appendChild(transcriptContainer);
  transcriptOverlay.appendChild(controls);
  
  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    
    #meetnote-transcript::-webkit-scrollbar {
      width: 6px;
    }
    
    #meetnote-transcript::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
    }
    
    #meetnote-transcript::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
    }
    
    #meetnote-transcript::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  `;
  document.head.appendChild(style);
  
  // Append to body
  document.body.appendChild(transcriptOverlay);
  overlayInjected = true;
  
  console.log('Transcript overlay injected');
}

// Show overlay
function showOverlay() {
  if (transcriptOverlay) {
    transcriptOverlay.style.display = 'block';
  }
}

// Hide overlay
function hideOverlay() {
  if (transcriptOverlay) {
    transcriptOverlay.style.display = 'none';
  }
}

// Toggle overlay
function toggleOverlay() {
  if (transcriptOverlay) {
    const isVisible = transcriptOverlay.style.display !== 'none';
    transcriptOverlay.style.display = isVisible ? 'none' : 'block';
  }
}

// Update transcript in overlay
function updateTranscript(text) {
  const transcriptContainer = document.getElementById('meetnote-transcript');
  
  if (transcriptContainer) {
    const timestamp = new Date().toLocaleTimeString();
    
    const entry = document.createElement('div');
    entry.style.cssText = `
      margin-bottom: 12px;
      padding: 8px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 6px;
    `;
    
    entry.innerHTML = `
      <div style="font-size: 11px; color: rgba(255, 255, 255, 0.5); margin-bottom: 4px;">
        ${timestamp}
      </div>
      <div>${text}</div>
    `;
    
    transcriptContainer.appendChild(entry);
    
    // Auto-scroll to bottom
    transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
  }
}

// Show notification
function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    z-index: 9999999;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: slideIn 0.3s ease-out;
  `;
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Handle messages from background
function handleMessage(message, sender, sendResponse) {
  console.log('Content script received message:', message);
  
  switch (message.type) {
    case 'RECORDING_STARTED':
      isRecording = true;
      showOverlay();
      document.getElementById('meetnote-recording-dot').style.display = 'block';
      showNotification('Recording started! 🎙️');
      
      const transcriptContainer = document.getElementById('meetnote-transcript');
      if (transcriptContainer) {
        transcriptContainer.innerHTML = `
          <div style="color: rgba(255, 255, 255, 0.5); font-style: italic;">
            Recording in progress... Transcription will appear here.
          </div>
        `;
      }
      break;
      
    case 'RECORDING_STOPPED':
      isRecording = false;
      document.getElementById('meetnote-recording-dot').style.display = 'none';
      showNotification('Recording stopped! Processing...');
      break;
      
    case 'TRANSCRIPTION_UPDATE':
      updateTranscript(message.data.text);
      break;
      
    case 'TRANSCRIPTION_COMPLETE':
      showNotification('Transcription complete! ✓');
      updateTranscript('--- Transcription Complete ---');
      break;
      
    case 'TOGGLE_TRANSCRIPT':
      toggleOverlay();
      break;
  }
  
  return true;
}

// Test meeting detection (for debugging)
function testMeetingDetection() {
  console.log('🔍 MeetNote Debug Test:');
  console.log('Current URL:', window.location.href);
  console.log('Detected Platform:', currentPlatform ? currentPlatform.name : 'None');
  
  // Check for video elements
  const videos = document.querySelectorAll('video');
  console.log(`Found ${videos.length} video element(s)`);
  
  // Check if overlay was injected
  console.log('Overlay injected:', overlayInjected);
  
  // Test overlay visibility
  const overlay = document.getElementById('meetnote-overlay');
  console.log('Overlay element exists:', !!overlay);
  
  return {
    url: window.location.href,
    platform: currentPlatform,
    videoCount: videos.length,
    overlayExists: !!overlay,
    overlayInjected
  };
}

// Make test function globally available
window.meetNoteTest = testMeetingDetection;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Run debug test after initialization
setTimeout(() => {
  const testResult = testMeetingDetection();
  console.log('MeetNote Test Result:', testResult);
}, 3000);

console.log('MeetNote content script initialized');
