# ✅ MeetNote Deployment Checklist

## 📋 Pre-Deployment Setup

### Local Testing
- [ ] Python 3.11+ installed
- [ ] Node.js 18+ or Bun installed
- [ ] Chrome browser installed
- [ ] Git installed

### API Keys & Secrets
- [ ] OpenRouter account created (https://openrouter.ai)
- [ ] OpenRouter API key obtained (free tier)
- [ ] Secret key generated: `openssl rand -hex 32`
- [ ] GitHub account ready

---

## 🔧 Backend Setup (Local)

### Configuration
- [ ] Navigate to `backend/` folder
- [ ] Copy `.env.example` to `.env`
- [ ] Edit `.env` file:
  - [ ] `SECRET_KEY` = (your generated 32-char hex)
  - [ ] `OPENROUTER_API_KEY` = (your OpenRouter key)
  - [ ] `WHISPER_MODEL` = base
  - [ ] `DATABASE_URL` = sqlite:///./meetnote.db (for local)

### Installation
- [ ] Run: `pip install -r requirements.txt`
- [ ] Wait for faster-whisper to download (~2-5 minutes first time)

### Testing
- [ ] Run: `python -m app.main`
- [ ] See "Whisper model loaded successfully"
- [ ] Open http://localhost:8000/docs
- [ ] See Swagger UI
- [ ] Try health endpoint: GET /api/health
- [ ] Should return `{"status":"healthy"}`

---

## 🌐 Frontend Setup (Local)

### Configuration
- [ ] Navigate to `frontend/` folder
- [ ] Copy `.env.local.example` to `.env.local`
- [ ] Verify: `NEXT_PUBLIC_API_URL=http://localhost:8000`

### Installation
- [ ] Run: `bun install` (or `npm install`)
- [ ] Wait for dependencies (~1-2 minutes)

### Testing
- [ ] Run: `bun dev` (or `npm run dev`)
- [ ] Open http://localhost:3000
- [ ] See MeetNote landing page
- [ ] Check backend status indicator (should show "Connected")
- [ ] Navigate to /meetings page
- [ ] Navigate to /extension page

---

## 🔌 Chrome Extension Setup (Local)

### Loading
- [ ] Open Chrome
- [ ] Go to `chrome://extensions/`
- [ ] Enable "Developer mode" (toggle top-right)
- [ ] Click "Load unpacked"
- [ ] Select `chrome-extension/` folder
- [ ] See MeetNote extension icon in toolbar

### Testing
- [ ] Click extension icon
- [ ] See login screen
- [ ] Create account (with backend running)
- [ ] Should succeed and show authenticated view
- [ ] See "Backend: Connected" status

---

## 🧪 End-to-End Testing (Local)

### Recording Test
- [ ] Go to https://meet.google.com/new
- [ ] Start a test meeting
- [ ] Click MeetNote extension icon
- [ ] Click "Start Recording" (or press Alt+R)
- [ ] See "Recording started" notification
- [ ] Press Alt+T to toggle transcript overlay
- [ ] See transcript overlay appear
- [ ] Speak into microphone
- [ ] See transcript appear (may take 5-10 seconds)
- [ ] Press Alt+H to create highlight
- [ ] See "Highlight created" notification
- [ ] Click "Stop Recording" (or press Alt+R)
- [ ] See "Processing..." notification

### Dashboard Test
- [ ] Go to http://localhost:3000/meetings
- [ ] See your recorded meeting
- [ ] Click to view details
- [ ] See transcript text
- [ ] See AI summary (if OpenRouter key configured)
- [ ] See action items

---

## ☁️ Backend Deployment (Render)

### Render Account
- [ ] Create account at https://render.com
- [ ] Verify email

### GitHub Repository
- [ ] Create new GitHub repository
- [ ] Push backend code:
  ```bash
  cd backend
  git init
  git add .
  git commit -m "Initial backend commit"
  git remote add origin <your-repo-url>
  git push -u origin main
  ```

### PostgreSQL Database
- [ ] Render Dashboard → New → PostgreSQL
- [ ] Name: `meetnote-db`
- [ ] Region: Choose closest
- [ ] Plan: Free
- [ ] Click "Create Database"
- [ ] Copy **Internal Database URL**

### Web Service
- [ ] Render Dashboard → New → Web Service
- [ ] Connect GitHub repository
- [ ] Name: `meetnote-backend`
- [ ] Region: Same as database
- [ ] Branch: main
- [ ] Root Directory: (leave empty if backend is at root, or "backend" if in subfolder)
- [ ] Environment: Python 3
- [ ] Build Command: `pip install -r requirements.txt`
- [ ] Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- [ ] Plan: Free

### Environment Variables (Render)
- [ ] Add `DATABASE_URL` = (paste Internal Database URL from PostgreSQL)
- [ ] Add `SECRET_KEY` = (your generated secret)
- [ ] Add `OPENROUTER_API_KEY` = (your OpenRouter key)
- [ ] Add `WHISPER_MODEL` = base
- [ ] Add `WHISPER_DEVICE` = cpu
- [ ] Add `WHISPER_COMPUTE_TYPE` = int8
- [ ] Add `ENVIRONMENT` = production
- [ ] Add `PYTHON_VERSION` = 3.11

### Deploy
- [ ] Click "Create Web Service"
- [ ] Wait 10-15 minutes for first deploy
- [ ] Watch logs for errors
- [ ] See "Whisper model loaded successfully" in logs
- [ ] Note your backend URL: `https://meetnote-backend.onrender.com`

### Verify
- [ ] Open `https://meetnote-backend.onrender.com/api/health`
- [ ] Should return `{"status":"healthy"}`
- [ ] Open `https://meetnote-backend.onrender.com/docs`
- [ ] Should see Swagger UI

---

## 🌍 Frontend Deployment (Netlify)

### Netlify Account
- [ ] Create account at https://netlify.com
- [ ] Verify email

### GitHub Repository
- [ ] Push frontend code (if not already):
  ```bash
  cd frontend
  git init
  git add .
  git commit -m "Initial frontend commit"
  git remote add origin <your-repo-url>
  git push -u origin main
  ```

### Site Setup
- [ ] Netlify Dashboard → Add new site → Import existing project
- [ ] Choose GitHub
- [ ] Select your repository
- [ ] Base directory: `frontend` (if in subfolder, or leave empty)
- [ ] Build command: `bun run build` (or `npm run build`)
- [ ] Publish directory: `.next`

### Environment Variables (Netlify)
- [ ] Add `NEXT_PUBLIC_API_URL` = `https://meetnote-backend.onrender.com`

### Deploy
- [ ] Click "Deploy site"
- [ ] Wait 3-5 minutes
- [ ] Note your site URL: `https://random-name.netlify.app`

### Custom Domain (Optional)
- [ ] Site settings → Domain management → Add custom domain
- [ ] Use `meetnoteapp.netlify.app` or your own domain
- [ ] Follow DNS configuration steps

### Verify
- [ ] Open your Netlify URL
- [ ] See MeetNote landing page
- [ ] Check backend status indicator
- [ ] Should show "Connected"
- [ ] Navigate to all pages (/, /features, /demo, /meetings, /extension)

---

## 🔄 Update Backend CORS

### Add Frontend URL to Backend
- [ ] Go to Render backend service
- [ ] Environment → Edit
- [ ] Add/Update `CORS_ORIGINS`:
  ```
  http://localhost:3000,https://your-netlify-url.netlify.app
  ```
- [ ] Save
- [ ] Wait for redeploy (1-2 minutes)

---

## 🔌 Chrome Extension (Production)

### Update API URL
- [ ] Edit `chrome-extension/background.js`
- [ ] Find line: `const API_BASE_URL = ...`
- [ ] Change to: `const API_BASE_URL = 'https://meetnote-backend.onrender.com';`
- [ ] Save file

### Test Locally with Production Backend
- [ ] Reload extension in Chrome
- [ ] Click extension icon
- [ ] Login (uses production backend)
- [ ] Test recording
- [ ] Should work with production backend

### Package Extension
- [ ] Navigate to `chrome-extension/`
- [ ] Remove any temp files
- [ ] Create zip: `zip -r meetnote-extension.zip . -x "*.DS_Store" -x "__MACOSX"`

### Chrome Web Store (Optional - $5 fee)
- [ ] Go to https://chrome.google.com/webstore/devconsole
- [ ] Pay $5 registration (one-time)
- [ ] Click "New Item"
- [ ] Upload `meetnote-extension.zip`
- [ ] Fill in store listing:
  - [ ] Title
  - [ ] Description
  - [ ] Screenshots
  - [ ] Category: Productivity
- [ ] Submit for review (1-3 days)

---

## 🎉 Production Testing

### Full Flow Test
- [ ] Load extension (with production API URL)
- [ ] Click extension icon
- [ ] Create account / Login
- [ ] Join test meeting (Google Meet/Zoom)
- [ ] Start recording
- [ ] Speak and see transcript
- [ ] Create highlight
- [ ] Stop recording
- [ ] Go to production frontend: `https://your-netlify-url.netlify.app/meetings`
- [ ] See your meeting
- [ ] View transcript
- [ ] View AI summary
- [ ] Check highlights

---

## 📊 Monitoring

### Render Backend
- [ ] Check Render Dashboard → Logs
- [ ] Verify no errors
- [ ] Monitor CPU/RAM usage

### Netlify Frontend
- [ ] Check Netlify Dashboard → Analytics
- [ ] Verify site loads fast
- [ ] Check function logs if using

### Chrome Extension
- [ ] Monitor Chrome console for errors
- [ ] Check extension storage usage

---

## 🔐 Security Checklist

- [ ] `SECRET_KEY` is strong (32+ chars)
- [ ] `.env` files are in `.gitignore`
- [ ] No secrets in git repository
- [ ] CORS is properly configured
- [ ] Database uses secure connection
- [ ] API requires authentication
- [ ] Extension uses HTTPS for API calls

---

## 📈 Optional Enhancements

### Icons
- [ ] Create extension icons (16x16, 48x48, 128x128)
- [ ] Add to `chrome-extension/icons/`
- [ ] Tools: Canva, Figma, favicon.io

### Analytics
- [ ] Add Google Analytics to frontend
- [ ] Add Sentry for error tracking
- [ ] Add Plausible for privacy-friendly analytics

### SEO
- [ ] Add meta tags to frontend pages
- [ ] Create sitemap.xml
- [ ] Submit to Google Search Console

### Features
- [ ] Speaker diarization
- [ ] Multi-language support
- [ ] Calendar integration
- [ ] Slack/Teams webhooks
- [ ] Video clips

---

## 🎯 Success Metrics

Your deployment is successful if:
- ✅ Backend health check returns 200 OK
- ✅ Frontend loads without errors
- ✅ Extension can authenticate
- ✅ Recording works end-to-end
- ✅ Transcription appears
- ✅ AI summary generates
- ✅ Meetings save to dashboard
- ✅ No console errors

---

## 📞 Troubleshooting Resources

If stuck, check:
- [ ] Backend logs in Render
- [ ] Frontend deploy logs in Netlify
- [ ] Browser console (F12)
- [ ] Extension background page console
- [ ] `DEPLOYMENT.md` for detailed steps
- [ ] `QUICKSTART.md` for common issues
- [ ] GitHub Issues

---

## 🎊 Done!

**Congratulations!** Your MeetNote platform is now:
- ✅ Deployed to production
- ✅ Accessible worldwide
- ✅ Costing $0/month (with free tiers)
- ✅ Ready for real users

**Next Steps**:
1. Share with friends/colleagues
2. Get feedback
3. Iterate and improve
4. Consider monetization
5. Build community

---

**Time to complete**: 1-2 hours (first time)
**Ongoing cost**: $0-$7/month (depending on usage)
**Maintenance**: ~1 hour/week (optional)

Happy building! 🚀
