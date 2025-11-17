# MeetNote - Complete Deployment Guide

## 🚀 Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐
│  Chrome         │────────►│  FastAPI Backend │
│  Extension      │◄────────│  (Render.com)    │
└─────────────────┘         └──────────────────┘
                                      ▲
                                      │
┌─────────────────┐                  │
│  Next.js        │──────────────────┘
│  Frontend       │
│  (Netlify)      │
└─────────────────┘
```

### Components:
1. **Chrome Extension** - Invisible recorder, works in meeting tabs
2. **FastAPI Backend** - Whisper AI transcription + Mistral 7B summarization  
3. **Next.js Frontend** - Dashboard and landing page

---

## 📦 Part 1: Backend Deployment (Render)

### Prerequisites:
- Render.com account (free tier available)
- OpenRouter API key (get free at openrouter.ai)

### Steps:

1. **Push Backend Code to GitHub**
```bash
cd backend
git init
git add .
git commit -m "Initial backend commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

2. **Create PostgreSQL Database on Render**
   - Go to Render Dashboard → New → PostgreSQL
   - Name: `meetnote-db`
   - Plan: Free
   - Copy the **Internal Database URL**

3. **Create Web Service on Render**
   - Go to Render Dashboard → New → Web Service
   - Connect your GitHub repository
   - Name: `meetnote-backend`
   - Root Directory: `backend`
   - Environment: `Python 3`
   - Build Command:
     ```bash
     pip install -r requirements.txt
     ```
   - Start Command:
     ```bash
     uvicorn app.main:app --host 0.0.0.0 --port $PORT
     ```

4. **Set Environment Variables** on Render:
   ```
   DATABASE_URL=<your-render-postgresql-internal-url>
   SECRET_KEY=<generate-with-openssl-rand-hex-32>
   OPENROUTER_API_KEY=<your-openrouter-api-key>
   WHISPER_MODEL=base
   WHISPER_DEVICE=cpu
   WHISPER_COMPUTE_TYPE=int8
   ENVIRONMENT=production
   PYTHON_VERSION=3.11
   ```

5. **Deploy**
   - Click "Create Web Service"
   - Wait 5-10 minutes for deployment
   - Your backend will be at: `https://meetnote-backend.onrender.com`

6. **Verify Deployment**
   ```bash
   curl https://meetnote-backend.onrender.com/api/health
   ```
   Should return: `{"status":"healthy",...}`

---

## 🌐 Part 2: Frontend Deployment (Netlify)

### Steps:

1. **Push Frontend Code to GitHub**
```bash
cd frontend
git init
git add .
git commit -m "Initial frontend commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

2. **Connect to Netlify**
   - Go to Netlify Dashboard → Add new site → Import existing project
   - Choose GitHub and select your repository
   - Base directory: `frontend`
   - Build command: `bun run build` (or `npm run build`)
   - Publish directory: `.next`

3. **Set Environment Variables** on Netlify:
   ```
   NEXT_PUBLIC_API_URL=https://meetnote-backend.onrender.com
   ```

4. **Deploy**
   - Click "Deploy site"
   - Wait 2-3 minutes
   - Your site will be at: `https://<random-name>.netlify.app`

5. **Custom Domain (Optional)**
   - Go to Site settings → Domain management
   - Add custom domain: `meetnoteapp.netlify.app` or your own domain

6. **Update CORS on Backend**
   - Add your Netlify URL to backend `.env`:
     ```
     CORS_ORIGINS=http://localhost:3000,https://meetnoteapp.netlify.app,https://your-custom-domain.com
     ```
   - Redeploy backend on Render

---

## 🔌 Part 3: Chrome Extension Setup

### Option 1: Load Unpacked (Development/Testing)

1. **Update API URL in Extension**
   - Edit `chrome-extension/background.js`
   - Change `API_BASE_URL` to your Render backend URL:
     ```javascript
     const API_BASE_URL = 'https://meetnote-backend.onrender.com';
     ```

2. **Load in Chrome**
   - Open Chrome → `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `chrome-extension` folder

3. **Test**
   - Join a Google Meet/Zoom meeting
   - Click extension icon → Login
   - Start recording!

### Option 2: Publish to Chrome Web Store (Production)

1. **Prepare Extension Package**
   ```bash
   cd chrome-extension
   # Remove any temp files
   zip -r meetnote-extension.zip . -x "*.DS_Store" -x "__MACOSX"
   ```

2. **Create Chrome Web Store Developer Account**
   - Go to https://chrome.google.com/webstore/devconsole
   - Pay $5 one-time registration fee

3. **Upload Extension**
   - Click "New Item"
   - Upload `meetnote-extension.zip`
   - Fill in store listing details:
     - Title: "MeetNote - AI Meeting Assistant"
     - Description: (use description from manifest)
     - Category: "Productivity"
     - Screenshots: Take screenshots of extension in action

4. **Submit for Review**
   - Review typically takes 1-3 days
   - Once approved, extension will be live!

---

## 🔐 Environment Variables Reference

### Backend (Render)
```env
DATABASE_URL=postgresql://user:pass@host:5432/db
SECRET_KEY=<32-char-hex-string>
OPENROUTER_API_KEY=sk-or-v1-xxxxx
WHISPER_MODEL=base
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
ENVIRONMENT=production
PYTHON_VERSION=3.11
```

### Frontend (Netlify)
```env
NEXT_PUBLIC_API_URL=https://meetnote-backend.onrender.com
```

### Chrome Extension
```javascript
// In background.js
const API_BASE_URL = 'https://meetnote-backend.onrender.com';
```

---

## 🧪 Testing Checklist

### Backend
- [ ] Health endpoint: `GET /api/health`
- [ ] Register user: `POST /api/auth/register`
- [ ] Login: `POST /api/auth/login`
- [ ] Create meeting: `POST /api/meetings`
- [ ] Upload audio: `POST /api/meetings/{id}/upload-audio`

### Frontend
- [ ] Landing page loads
- [ ] Navigation works
- [ ] Backend status indicator shows "Connected"
- [ ] Extension download button works

### Chrome Extension
- [ ] Detects Google Meet/Zoom/Teams
- [ ] Login works
- [ ] Recording starts/stops
- [ ] Transcript overlay shows
- [ ] Keyboard shortcuts work (Alt+R, Alt+H, Alt+T)

---

## 💰 Cost Breakdown (All FREE!)

| Service | Free Tier | Cost |
|---------|-----------|------|
| **Whisper AI** | Unlimited (local) | $0 |
| **OpenRouter (Mistral 7B)** | Free tier available | $0 |
| **Render PostgreSQL** | 90 days free, then $7/mo | $0 (initially) |
| **Render Web Service** | 750 hours/month | $0 |
| **Netlify** | 100GB bandwidth/month | $0 |
| **Chrome Extension** | $5 one-time registration | $5 (optional) |

**Total Monthly Cost: $0** (with free tiers)

---

## 🔧 Troubleshooting

### Backend Issues

**Problem**: Model loading fails on Render
- **Solution**: Use `WHISPER_MODEL=base` (smaller, faster)
- Or upgrade to Render paid plan for more RAM

**Problem**: Database connection fails
- **Solution**: Check `DATABASE_URL` is the Internal URL from Render PostgreSQL

**Problem**: CORS errors
- **Solution**: Add your frontend URL to `CORS_ORIGINS` in backend config

### Frontend Issues

**Problem**: API calls fail
- **Solution**: Check `NEXT_PUBLIC_API_URL` environment variable
- Verify backend is accessible

**Problem**: Build fails on Netlify
- **Solution**: Ensure `package.json` has correct build command
- Try `npm run build` locally first

### Extension Issues

**Problem**: Recording doesn't start
- **Solution**: Check backend API URL in `background.js`
- Verify user is logged in
- Check browser console for errors

**Problem**: Transcription not appearing
- **Solution**: Ensure backend Whisper service is initialized
- Check backend logs on Render

**Problem**: Extension not loading
- **Solution**: Check manifest.json is valid
- Ensure all required permissions are granted

---

## 📚 Additional Resources

- **Whisper Models**: https://github.com/openai/whisper#available-models-and-languages
- **OpenRouter API**: https://openrouter.ai/docs
- **FastAPI Docs**: https://fastapi.tiangolo.com/
- **Next.js Deployment**: https://nextjs.org/docs/deployment
- **Chrome Extension Dev**: https://developer.chrome.com/docs/extensions/

---

## 🎯 Next Steps

1. **Deploy backend to Render** ✓
2. **Deploy frontend to Netlify** ✓
3. **Load extension in Chrome** ✓
4. **Test end-to-end** ✓
5. **Monitor and iterate** ✓

Your MeetNote platform is now live! 🚀

For support, check logs:
- **Backend**: Render Dashboard → Logs
- **Frontend**: Netlify Dashboard → Deploys → Deploy log
- **Extension**: Chrome DevTools → Console
