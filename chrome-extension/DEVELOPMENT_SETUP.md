# MeetNote Chrome Extension - Local Development Setup

## 🚀 Quick Setup Guide

### Prerequisites
- Chrome browser
- Backend API running on `http://localhost:8000`
- Frontend (optional) running on `http://localhost:3001`

### 1. Load Extension in Developer Mode

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder: `/Users/abhi/Documents/Projects/Meet/chrome-extension`
5. The MeetNote extension should now appear in your extensions list

### 2. Test the Extension

#### Option A: Use Test Page
1. Open the test file: `file:///Users/abhi/Documents/Projects/Meet/test-meeting.html`
2. Click the MeetNote extension icon in your browser toolbar
3. Follow the authentication and testing instructions

#### Option B: Use Real Meeting Site
1. Go to `https://meet.google.com` (or create a test meeting)
2. Click the MeetNote extension icon
3. Test the functionality

### 3. Authentication Setup

1. **Register a new account:**
   - Click the MeetNote extension icon
   - Click "Create Account"
   - Fill in your details
   - The extension will automatically authenticate

2. **Or use test credentials:**
   ```
   Email: test@meetnote.app
   Password: testpassword123
   ```

### 4. Testing Recording

1. Navigate to a meeting page (or test page)
2. Click the MeetNote extension icon  
3. Click "Start Recording"
4. Check browser console for logs
5. Look for transcript overlay in bottom-right corner

### 5. Debugging

#### Check Extension Status
- Open DevTools (F12)
- Check Console for extension logs
- Look for any errors related to MeetNote

#### Check API Connection
- Ensure backend is running on `http://localhost:8000`
- Test API directly: `curl http://localhost:8000/api/health`
- Check CORS settings allow Chrome extensions

#### Common Issues

**Extension not loading:**
- Make sure Developer mode is enabled
- Try reloading the extension
- Check for manifest errors in Extensions page

**Authentication failing:**
- Verify backend is running
- Check network requests in DevTools
- Ensure API URL is set to `http://localhost:8000`

**Recording not working:**
- Grant microphone permissions when prompted
- Check Chrome's site permissions
- Look for audio capture errors in console

### 6. File Structure

```
chrome-extension/
├── manifest.json          # Extension configuration
├── background.js          # Background service worker
├── content.js            # Content script (runs on meeting pages)
├── popup.html           # Extension popup UI
├── popup.js             # Popup logic
└── icons/               # Extension icons
```

### 7. Key URLs for Testing

- **Backend Health Check:** http://localhost:8000/api/health
- **Frontend Dashboard:** http://localhost:3001/meetings
- **Test Meeting Page:** file:///Users/abhi/Documents/Projects/Meet/test-meeting.html
- **Chrome Extensions:** chrome://extensions/

### 8. Development Workflow

1. Make changes to extension files
2. Go to `chrome://extensions/`
3. Click reload button on MeetNote extension
4. Test changes on meeting page
5. Check console for any errors

---

## 🔧 Production Deployment

When ready for production, update these URLs in the extension files:

**In `background.js` and `popup.js`:**
```javascript
// Change from:
const API_BASE_URL = 'http://localhost:8000';

// To:
const API_BASE_URL = 'https://meetnote-backend.onrender.com';
```

**In `manifest.json`:**
```json
// Remove localhost from host_permissions:
"host_permissions": [
  "https://meet.google.com/*",
  "https://*.zoom.us/*", 
  "https://teams.microsoft.com/*",
  "https://meetnote-backend.onrender.com/*"
]
```

Then package the extension for Chrome Web Store submission.