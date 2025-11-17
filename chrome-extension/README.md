# MeetNote Chrome Extension

AI-powered meeting assistant that works invisibly in your browser. Record, transcribe, and get AI summaries of meetings on Zoom, Google Meet, and Microsoft Teams.

## Features

- 🎙️ **Invisible Recording** - Works in the background, doesn't interfere with meetings
- 📝 **Real-time Transcription** - See live transcripts as people speak (optional overlay)
- 🤖 **AI Summarization** - Get meeting summaries with key points and action items
- ⭐ **Quick Highlights** - Mark important moments with keyboard shortcut (Alt+H)
- ⌨️ **Keyboard Shortcuts** - Control everything without clicking
- 🔐 **Secure** - All data encrypted and processed on your backend

## Installation

### Option 1: Load Unpacked (Development)

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `chrome-extension` folder
6. Extension is installed! 🎉

### Option 2: Chrome Web Store

Coming soon...

## Setup

1. Click the MeetNote extension icon
2. Create an account or login
3. Join any meeting (Zoom, Google Meet, Teams)
4. Click "Start Recording" or press `Alt+R`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+R` | Start/Stop Recording |
| `Alt+H` | Create Highlight |
| `Alt+T` | Toggle Transcript Overlay |

## Supported Platforms

- ✅ Google Meet
- ✅ Zoom
- ✅ Microsoft Teams

## Privacy

- Audio is processed on your private backend
- No data is stored on third-party services
- Whisper AI runs on your server
- Full control over your meeting data

## Architecture

- **Content Script**: Detects meetings and shows overlay
- **Background Service Worker**: Handles recording and API communication
- **Popup**: User interface for controls
- **Backend**: FastAPI with Whisper AI for transcription

## Backend

This extension requires the MeetNote backend to be running. See `/backend` folder for setup instructions.

Backend URL: `https://meetnote-backend.onrender.com`

## Development

```bash
# Install dependencies (none required for extension)
# Backend must be running

# Load extension in Chrome
# chrome://extensions/ -> Developer mode -> Load unpacked
```

## Permissions

- `storage` - Save user preferences and auth tokens
- `tabs` - Detect meeting tabs
- `activeTab` - Access current tab for recording
- `scripting` - Inject content scripts
- Host permissions for meeting platforms

## Contributing

Contributions welcome! Please open an issue or PR.

## License

MIT
