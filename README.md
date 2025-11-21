# MeetNote - AI-Powered Meeting Transcription

A desktop application inspired by Grain that provides invisible meeting recording and AI transcription using Whisper.

## 🚀 Features

- **Invisible Recording**: Records system audio without joining meetings as a bot
- **Real-time Transcription**: Uses OpenAI Whisper for accurate speech-to-text
- **Native macOS UI**: Beautiful, fluid interface that feels native to macOS
- **Supabase Integration**: Cloud database for storing meetings and transcripts
- **Audio-Only Capture**: Focuses on audio without screen recording
- **Always-on-Top Overlay**: Minimal, draggable recording indicator
- **Modern Architecture**: Electron frontend + FastAPI backend

## 🏗️ Architecture

### Desktop App (Electron)
- **Frontend**: Modern HTML/CSS/JS with native macOS styling
- **Audio Capture**: System audio recording using Web APIs
- **Recording Overlay**: Transparent, always-on-top indicator
- **Backend Integration**: RESTful API communication

### Backend (FastAPI + Supabase)
- **Database**: Supabase PostgreSQL for meetings storage
- **Transcription**: OpenAI Whisper integration
- **API**: RESTful endpoints for audio processing
- **Real-time**: WebSocket support for live features

## 📦 Installation

### Prerequisites
- Node.js 18+
- Python 3.9+
- macOS (for desktop app)
- Supabase account

### 1. Clone Repository
```bash
git clone https://github.com/yourusername/meetnote.git
cd meetnote
```

### 2. Setup Supabase Database
1. Go to [Supabase](https://supabase.com) and create a new project
2. Copy your project URL and API key
3. Run the SQL schema in Supabase SQL Editor:
```sql
-- Copy contents from backend/supabase_schema.sql
```

### 3. Configure Backend
```bash
cd backend
pip install -r requirements.txt

# Create .env file
echo "SUPABASE_URL=your_supabase_url" > .env
echo "SUPABASE_KEY=your_supabase_key" >> .env
```

### 4. Install Desktop App
```bash
cd desktop-app
chmod +x install.sh
./install.sh
```

## 🔧 Development

### Start Backend
```bash
cd backend
python supabase_main.py
```

### Start Desktop App
```bash
cd desktop-app
npm start
```

## 🌐 Deployment

### Backend (Render)
1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Set environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
4. Deploy with build command: `pip install -r requirements.txt`
5. Start command: `python supabase_main.py`

### Desktop App Distribution
```bash
cd desktop-app
npm run build
```

## 🎯 Usage

1. **Start Recording**: Click "New Recording" → "Desktop Audio Capture"
2. **Monitor Progress**: Use the draggable overlay to track recording
3. **Stop & Transcribe**: Click stop to process with Whisper
4. **View Results**: Access transcripts in the Meetings tab
5. **Export/Share**: Use built-in sharing and export features

## 🔐 Environment Variables

### Backend (.env)
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
ENVIRONMENT=production
CORS_ORIGINS=http://localhost:5173,https://your-frontend.com
```

## 🛠️ Tech Stack

- **Frontend**: Electron, HTML5, CSS3, JavaScript
- **Backend**: FastAPI, Python 3.9+
- **Database**: Supabase (PostgreSQL)
- **Transcription**: OpenAI Whisper
- **Deployment**: Render (backend), Electron Builder (desktop)
- **Audio**: Web Audio API, MediaRecorder

## 📱 Platform Support

- ✅ macOS (primary)
- 🔄 Windows (planned)
- 🔄 Linux (planned)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Email**: support@meetnote.app

## 🔄 Roadmap

- [ ] Windows/Linux support
- [ ] Calendar integration (Google, Outlook)
- [ ] Meeting bot for Zoom/Teams
- [ ] Advanced AI features (summaries, action items)
- [ ] Team collaboration features
- [ ] Mobile companion app

---

**MeetNote** - Making meeting transcription invisible and effortless.