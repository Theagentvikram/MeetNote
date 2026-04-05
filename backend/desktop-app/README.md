# MeetNote Desktop App

A native macOS desktop application for recording, transcribing, and summarizing meetings - inspired by Grain's desktop experience.

## Features

🎥 **Screen & Audio Recording**
- Capture any application or entire screen
- High-quality audio recording
- No visible bot in meetings

🤖 **AI-Powered Transcription**
- Real-time speech-to-text
- Multiple language support
- Integration with existing backend

📊 **Meeting Dashboard**
- View all recorded meetings
- Search transcripts
- AI-generated summaries

⚙️ **Native macOS Experience**
- Menu bar integration
- System tray controls
- Native permissions handling

## Installation & Setup

### Prerequisites

- macOS 10.15 or later
- Node.js 16+ installed
- Your existing MeetNote backend running

### Quick Install

```bash
# Navigate to desktop app folder
cd desktop-app

# Install dependencies
npm install

# Start development version
npm run dev

# Or build for production
npm run build-mac
```

### First Run Setup

1. **Grant Permissions**
   - Screen Recording permission (required)
   - Microphone access (required)
   - The app will guide you through this

2. **Configure Backend**
   - App auto-detects local backend (localhost:8000)
   - Uses production backend (render.com) if local not available
   - Can be configured in settings

3. **Start Recording**
   - Click "Start Recording"
   - Select screen/window to capture
   - Recording begins automatically

## How It Works

### Recording Process
```
User clicks "Start Recording"
    ↓
App requests screen sources
    ↓
User selects window/screen
    ↓
Electron captures video + audio stream
    ↓
MediaRecorder saves chunks locally
    ↓
Audio sent to backend for transcription
    ↓
Results displayed in real-time
```

### Architecture
```
┌─────────────────────────────────────────┐
│           Electron Main Process          │
│  • Window management                     │
│  • System permissions                    │
│  • Tray integration                      │
│  • IPC communication                     │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         Electron Renderer Process        │
│  • UI (HTML/CSS/JS)                     │
│  • MediaRecorder API                    │
│  • Screen capture                       │
│  • Real-time transcription display      │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│           Existing Backend               │
│  • FastAPI (Render.com)                 │
│  • Whisper transcription                │
│  • AI summarization                     │
│  • Meeting storage                      │
└─────────────────────────────────────────┘
```

## Development

### Project Structure
```
desktop-app/
├── src/
│   ├── main.js              # Electron main process
│   └── renderer/
│       ├── index.html       # UI layout
│       ├── styles.css       # Grain-inspired styling
│       └── renderer.js      # UI logic & recording
├── assets/                  # Icons and images
├── package.json            # Dependencies & build config
└── entitlements.mac.plist  # macOS permissions
```

### Key Technologies
- **Electron 27** - Cross-platform desktop framework
- **MediaRecorder API** - Native screen/audio recording
- **desktopCapturer** - Electron's screen capture API
- **electron-store** - Settings persistence
- **axios** - Backend communication

### Development Commands
```bash
# Development mode (with DevTools)
npm run dev

# Build for macOS
npm run build-mac

# Create installer
npm run dist

# Package without installer
npm run pack
```

## Permissions & Security

### Required macOS Permissions
1. **Screen Recording** - To capture meeting screens
2. **Microphone** - To record audio
3. **Network** - To communicate with backend

### Privacy Features
- All recording happens locally first
- User controls what gets shared with backend
- No data sent without explicit user action
- Recordings can be kept local-only

### Security Considerations
- App is sandboxed with minimal permissions
- Network requests only to configured backend
- No third-party analytics or tracking
- Local storage encrypted (via Electron)

## Integration with Existing Backend

The desktop app integrates seamlessly with your existing MeetNote backend:

### API Endpoints Used
- `POST /api/meetings/` - Create meeting record
- `POST /api/meetings/{id}/upload-audio/` - Upload audio for transcription
- `GET /api/meetings/` - Fetch meeting history
- `WS /ws/{client_id}` - Real-time transcription (optional)

### Environment Detection
```javascript
// Auto-detects environment
const BACKEND_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:8000'           // Local development
  : 'https://meetnote-backend.onrender.com';  // Production
```

## Comparison with Chrome Extension

| Feature | Desktop App | Chrome Extension |
|---------|-------------|------------------|
| **Screen Capture** | ✅ Any app/screen | ❌ Browser tabs only |
| **Audio Quality** | ✅ System-level | ⚠️ Tab audio only |
| **Meeting Detection** | ✅ Any platform | ⚠️ Web-based only |
| **Permissions** | ✅ One-time setup | ❌ Limited by browser |
| **Performance** | ✅ Native speed | ⚠️ Browser limitations |
| **User Experience** | ✅ Native macOS | ⚠️ Web-based UI |

## Troubleshooting

### Common Issues

**1. Screen Recording Permission Denied**
```bash
# Solution: Grant permission manually
System Preferences → Security & Privacy → Privacy → Screen Recording
→ Add MeetNote and enable
```

**2. No Audio in Recording**
```bash
# Solution: Check microphone permission
System Preferences → Security & Privacy → Privacy → Microphone
→ Add MeetNote and enable
```

**3. Backend Connection Failed**
```bash
# Check backend status
curl https://meetnote-backend.onrender.com/api/health

# Or for local development
curl http://localhost:8000/api/health
```

**4. Recording Not Starting**
```bash
# Check console for errors
# In development mode, DevTools will show detailed errors
npm run dev
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm run dev

# Or check logs in production
~/Library/Logs/MeetNote/main.log
```

## Building for Distribution

### Create macOS App Bundle
```bash
# Build signed app (requires Apple Developer account)
npm run build-mac

# Create DMG installer
npm run dist

# Output location
ls dist/MeetNote-1.0.0.dmg
```

### Code Signing (Optional)
For distribution outside Mac App Store:
```bash
# Sign with Developer ID
export CSC_NAME="Developer ID Application: Your Name"
npm run build-mac
```

## Roadmap

### Phase 1 (Current)
- [x] Basic screen recording
- [x] Audio capture
- [x] Backend integration
- [x] Simple UI

### Phase 2 (Next)
- [ ] Advanced meeting detection
- [ ] Speaker diarization
- [ ] Calendar integration
- [ ] Automatic meeting joining

### Phase 3 (Future)
- [ ] Video highlights
- [ ] Multi-language support
- [ ] Team collaboration features
- [ ] Advanced AI analysis

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License - see LICENSE file for details.

---

**Built with ❤️ for seamless meeting recording**
