// 🔧 MeetNote Debug Console Script
// Copy and paste this into your browser console for instant debugging

console.log('🔧 Starting MeetNote Debug...\n');

// 1. Check if we're on a meeting platform
const checkMeetingPlatform = () => {
  const url = window.location.href;
  const platforms = {
    googleMeet: url.includes('meet.google.com'),
    zoom: url.includes('zoom.us'),
    teams: url.includes('teams.microsoft.com'),
    webex: url.includes('webex.com')
  };
  
  console.log('📍 URL Check:', url);
  console.log('🎥 Platform Detection:', platforms);
  
  return Object.values(platforms).some(p => p);
};

// 2. Check extension presence
const checkExtension = () => {
  const hasChrome = typeof chrome !== 'undefined';
  const hasRuntime = hasChrome && chrome.runtime;
  
  console.log('🧩 Extension Check:');
  console.log('  - Chrome API available:', hasChrome);
  console.log('  - Runtime available:', hasRuntime);
  
  if (hasRuntime) {
    try {
      chrome.runtime.sendMessage({type: 'PING'}, (response) => {
        console.log('  - Extension responds:', !!response);
      });
    } catch (e) {
      console.log('  - Extension error:', e.message);
    }
  }
  
  return hasRuntime;
};

// 3. Check content script
const checkContentScript = () => {
  const hasOverlay = !!document.getElementById('meetnote-overlay');
  const hasTest = typeof window.meetNoteTest === 'function';
  
  console.log('📄 Content Script Check:');
  console.log('  - Overlay injected:', hasOverlay);
  console.log('  - Test function available:', hasTest);
  
  if (hasTest) {
    const testResult = window.meetNoteTest();
    console.log('  - Test result:', testResult);
  }
  
  return hasOverlay || hasTest;
};

// 4. Check authentication
const checkAuth = async () => {
  const token = localStorage.getItem('token');
  console.log('🔐 Auth Check:');
  console.log('  - Token exists:', !!token);
  
  if (token) {
    try {
      const response = await fetch('https://meetnote-backend.onrender.com/api/health', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('  - Backend responds:', response.ok);
      
      if (response.ok) {
        const meetingsResponse = await fetch('https://meetnote-backend.onrender.com/api/meetings', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const meetings = await meetingsResponse.json();
        console.log('  - Meetings count:', meetings.length || 0);
        return meetings;
      }
    } catch (e) {
      console.log('  - API error:', e.message);
    }
  }
  
  return false;
};

// 5. Check video elements
const checkVideo = () => {
  const videos = document.querySelectorAll('video');
  console.log('🎬 Video Check:');
  console.log('  - Video elements found:', videos.length);
  
  videos.forEach((video, i) => {
    console.log(`  - Video ${i + 1}:`, {
      src: video.src || 'No src',
      width: video.videoWidth || 'Unknown',
      height: video.videoHeight || 'Unknown',
      playing: !video.paused
    });
  });
  
  return videos.length > 0;
};

// Run all checks
const runFullDiagnosis = async () => {
  console.log('🏥 Running Full MeetNote Diagnosis...\n');
  
  const results = {
    meetingPlatform: checkMeetingPlatform(),
    extension: checkExtension(),
    contentScript: checkContentScript(),
    video: checkVideo(),
    auth: await checkAuth()
  };
  
  console.log('\n📋 Diagnosis Summary:');
  console.log('='.repeat(50));
  
  Object.entries(results).forEach(([check, result]) => {
    const status = result ? '✅' : '❌';
    console.log(`${status} ${check}: ${result ? 'OK' : 'FAILED'}`);
  });
  
  console.log('='.repeat(50));
  
  // Recommendations
  console.log('\n💡 Recommendations:');
  
  if (!results.meetingPlatform) {
    console.log('❌ Go to meet.google.com to test properly');
  }
  
  if (!results.extension) {
    console.log('❌ Install/reload the MeetNote extension');
  }
  
  if (!results.contentScript) {
    console.log('❌ Extension not working on this page - check permissions');
  }
  
  if (!results.video) {
    console.log('❌ No video elements found - join a meeting first');
  }
  
  if (!results.auth) {
    console.log('❌ Not authenticated - login via extension popup');
  }
  
  if (Object.values(results).every(r => r)) {
    console.log('🎉 All systems working! Try recording now!');
  }
  
  return results;
};

// Auto-run diagnosis
runFullDiagnosis();

// Make functions available globally for manual testing
window.meetNoteDebug = {
  checkMeetingPlatform,
  checkExtension,
  checkContentScript,
  checkAuth,
  checkVideo,
  runFullDiagnosis
};

console.log('\n🛠️  Manual commands available:');
console.log('  window.meetNoteDebug.runFullDiagnosis()');
console.log('  window.meetNoteDebug.checkAuth()');
console.log('  window.meetNoteDebug.checkExtension()');