# 🎯 QUICK START GUIDE

## 🚀 Get MeetNote Running in 15 Minutes

### Prerequisites
- Python 3.11+
- Node.js 18+ (or Bun)
- Chrome browser
- GitHub account (for deployment)

---

## 📝 Step-by-Step Setup

### 1. Clone & Setup (2 minutes)

```bash
# Clone the repository
git clone <your-repo-url>
cd Meet

# Run setup script (creates .env files, installs dependencies)
./setup.sh

# Or manually:
cd backend && pip install -r requirements.txt && cd ..
cd frontend && bun install && cd ..
```

### 2. Configure Backend (3 minutes)

```bash
cd backend

# Edit .env file
nano .env  # or open in your editor

# Required settings:
DATABASE_URL=sqlite:///./meetnote.db  # For local dev
SECRET_KEY=your-secret-key-here       # Generate: openssl rand -hex 32
OPENROUTER_API_KEY=sk-or-v1-xxxxx    # Get free at openrouter.ai
WHISPER_MODEL=base                    # Recommended
```

**Get OpenRouter API Key (FREE)**:
1. Go to https://openrouter.ai/
2. Sign up (free)
3. Go to Keys section
4. Create new key
5. Copy to `.env`

### 3. Start Backend (1 minute)

```bash
# In backend folder
python -m app.main

# Should see:
# INFO: Started server at http://0.0.0.0:8000
# INFO: Whisper model loaded successfully
```

Test it: Open http://localhost:8000/docs

### 4. Start Frontend (1 minute)

```bash
# In frontend folder
bun dev  # or npm run dev

# Should see:
# ▲ Next.js 15.3.5
# - Local: http://localhost:3000
```

Open http://localhost:3000

### 5. Load Chrome Extension (2 minutes)

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (toggle top-right)
4. Click **Load unpacked**
5. Select the `chrome-extension` folder
6. Extension installed! 🎉

### 6. Test It! (5 minutes)

1. **Create Account**:
   - Click MeetNote extension icon
   - Click "Create Account"
   - Enter name, email, password
   - Click "Create Account"

2. **Join a Meeting**:
   - Go to https://meet.google.com/new
   - Join a test meeting

3. **Start Recording**:
   - Click extension icon
   - Click "Start Recording" (or press Alt+R)
   - See recording indicator

4. **Talk & Transcribe**:
   - Speak into your microphone
   - Watch transcript appear (press Alt+T to toggle overlay)

5. **Create Highlight**:
   - Press Alt+H while recording
   - See "Highlight created!" notification

6. **Stop & View**:
   - Click "Stop Recording" (or press Alt+R)
   - Wait for processing
   - Go to http://localhost:3000/meetings
   - See your meeting with transcript and summary!

---

## ✅ Verification Checklist

- [ ] Backend running at http://localhost:8000
- [ ] Frontend running at http://localhost:3000
- [ ] Extension loaded in Chrome
- [ ] Can create account
- [ ] Can start/stop recording
- [ ] Transcript appears
- [ ] AI summary generated
- [ ] Highlights work

---

## 🐛 Common Issues

### Backend won't start
```bash
# Issue: ModuleNotFoundError
pip install -r requirements.txt

# Issue: Port already in use
lsof -ti:8000 | xargs kill -9

# Issue: Whisper model download fails
# Check internet connection, model will download on first run
```

### Frontend won't start
```bash
# Issue: Module not found
rm -rf node_modules && bun install

# Issue: Port 3000 in use
# Change port: bun dev --port 3001
```

### Extension won't load
```bash
# Issue: Manifest errors
# Check manifest.json is valid JSON
# Ensure all files exist

# Issue: Recording doesn't work
# Check browser console for errors
# Verify backend URL in background.js
```

### Recording works but no transcription
```bash
# Issue: Whisper model not loaded
# Check backend logs: "Whisper model loaded successfully"
# May take 2-3 minutes on first run to download model

# Issue: OpenRouter API key invalid
# Verify OPENROUTER_API_KEY in backend/.env
# Get new key from openrouter.ai
```

---

## 🚀 Deploy to Production

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete guide.

**Quick deploy**:

1. **Backend → Render.com**
   - Connect GitHub repo
   - Add PostgreSQL database
   - Set environment variables
   - Deploy!

2. **Frontend → Netlify**
   - Connect GitHub repo
   - Set `NEXT_PUBLIC_API_URL`
   - Deploy!

3. **Extension → Chrome Web Store** (optional)
   - Update `API_BASE_URL` in background.js
   - Zip the chrome-extension folder
   - Submit to Chrome Web Store

---

## 📚 Next Steps

1. ✅ **Got it working locally?** → Star the repo! ⭐
2. 📖 **Learn more** → Read [README.md](README.md)
3. 🚀 **Deploy** → Follow [DEPLOYMENT.md](DEPLOYMENT.md)
4. 🎨 **Customize** → Modify colors, branding
5. 🤝 **Contribute** → Open issues or PRs

---

## 🆘 Need Help?

- **Issues**: Check existing GitHub Issues
- **Logs**: Check browser console + terminal output
- **Docs**: Read API docs at http://localhost:8000/docs
- **Community**: Open a new issue with:
  - What you tried
  - Error messages
  - Screenshots if relevant

---

## 🎉 You're Ready!

MeetNote is now running locally. Enjoy your AI-powered meeting assistant! 

**Pro Tips**:
- Use keyboard shortcuts (Alt+R, Alt+H, Alt+T)
- Toggle transcript overlay as needed
- Highlights save the last 30 seconds
- All recordings save to dashboard
- AI summaries appear after recording stops

Happy meeting! 🎙️
