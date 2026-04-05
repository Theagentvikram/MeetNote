# 🎯 MeetNote - Complete User Guide

## 📖 How to Use MeetNote

### Step 1: Install Extension
1. Download from: https://meetnoteapp.netlify.app/extension
2. Extract the ZIP file
3. Go to `chrome://extensions/`
4. Enable "Developer mode"
5. Click "Load unpacked"
6. Select the extracted `chrome-extension` folder

### Step 2: Login
1. Click the MeetNote extension icon in Chrome toolbar
2. Login with:
   - **Email**: `abhi@meetnote.app`
   - **Password**: `abhi@123`
3. You should see "Backend: ● Connected"

### Step 3: Record a Meeting
1. **Join any meeting** (Google Meet, Zoom, Teams)
2. **Click extension icon** and click "🎙️ Start Recording"
   - OR press **Alt+R** keyboard shortcut
3. You'll see:
   - Extension popup shows "Recording" with red dot
   - Chrome extension badge shows "REC"
   - Notification: "Recording started"

### Step 4: During Recording
- **Create Highlight**: Click "⭐ Create Highlight" or press **Alt+H**
  - Captures 30 seconds of audio around that moment
- **View Transcript**: Press **Alt+T** to show/hide live transcript overlay

### Step 5: Stop Recording
1. Click extension icon and click "🎙️ Stop Recording"
   - OR press **Alt+R** again
2. Wait for processing (Whisper transcription + AI summary)
3. You'll see notification: "Recording Complete"

### Step 6: View Your Meetings
1. **Option A**: Click "📊 View My Meetings" button in extension popup
2. **Option B**: Go to https://meetnoteapp.netlify.app/meetings
3. You'll see all your recorded meetings with:
   - Meeting title
   - Date/time
   - Platform (Google Meet, Zoom, etc.)
   - Duration

### Step 7: View Meeting Details
1. Click on any meeting card
2. You'll see:
   - ✅ **Full Transcript**: Every word spoken with timestamps
   - ✅ **AI Summary**: Key points and overview
   - ✅ **Action Items**: Things mentioned that need to be done
   - ✅ **Highlights**: Moments you marked during recording

---

## 📊 Where Does Data Go?

### Backend Processing Flow:
```
Recording → Audio Chunks → Backend API → Whisper AI → Database
                                       → OpenRouter Mistral 7B → Summary
```

### Data Storage:
- **Audio files**: Stored on Render backend (in `/uploads` folder)
- **Transcripts**: PostgreSQL database on Render
- **Meetings metadata**: PostgreSQL database
- **User accounts**: PostgreSQL database (passwords hashed with bcrypt)

### API Endpoints Used:
```
POST /api/meetings - Create meeting record
POST /api/meetings/{id}/upload-audio - Upload audio file
GET  /api/meetings - List your meetings
GET  /api/meetings/{id} - Get meeting details
POST /api/meetings/{id}/highlights - Create highlight
```

---

## 🔍 Troubleshooting

### "Backend: ● Offline"
1. Check: https://meetnote-backend.onrender.com/api/health
2. If it shows JSON `{"status":"healthy"}`, backend is working
3. If Render free tier: backend sleeps after 15min inactivity
   - First request takes 30-60 seconds to wake up
   - Subsequent requests are fast

### "Recording doesn't start"
1. Make sure you're on a meeting page (meet.google.com, zoom.us, teams.microsoft.com)
2. Check browser console (F12) for errors
3. Verify extension has `tabCapture` permission in manifest

### "No transcription appears"
1. Audio is processed AFTER you stop recording (not real-time)
2. Wait 10-30 seconds after stopping for Whisper AI processing
3. Check Render logs: https://dashboard.render.com/
4. Look for: `INFO: POST /api/meetings/{id}/upload-audio`

### "Can't see my meetings"
1. Make sure you're logged in with same account
2. Go to: https://meetnoteapp.netlify.app/meetings
3. Or click "📊 View My Meetings" in extension

---

## 🎨 Features Overview

### ✅ What Works:
- Audio recording from any tab with audio
- Whisper AI transcription (base model, 95%+ accuracy)
- OpenRouter Mistral 7B summaries (free tier)
- Meeting history and database storage
- Keyboard shortcuts (Alt+R, Alt+H, Alt+T)
- Multi-platform support (Google Meet, Zoom, Teams)
- User authentication with JWT tokens

### ⏳ What Happens After Recording:
1. **Immediate**: Extension stops recording, combines audio chunks
2. **~5 seconds**: Audio uploaded to backend (via FormData)
3. **~10-20 seconds**: Whisper AI transcribes audio (depends on length)
4. **~5-10 seconds**: OpenRouter generates AI summary
5. **Result**: Full transcript + summary saved to database

### 📈 Expected Processing Times:
- **5 min meeting**: ~30 seconds processing
- **15 min meeting**: ~60 seconds processing
- **30 min meeting**: ~90 seconds processing
- **1 hour meeting**: ~2-3 minutes processing

---

## 🔐 Your Account

**Email**: abhi@meetnote.app  
**Password**: abhi@123

**Backend**: https://meetnote-backend.onrender.com  
**Frontend**: https://meetnoteapp.netlify.app  
**API Docs**: https://meetnote-backend.onrender.com/docs

---

## 🧪 Testing Checklist

- [ ] Extension installed and shows in Chrome toolbar
- [ ] Logged in successfully (green "Connected" indicator)
- [ ] Started recording on a test meeting
- [ ] Red "REC" badge appears
- [ ] Stopped recording
- [ ] Notification showed "Recording Complete"
- [ ] Opened meetings dashboard
- [ ] See meeting in list
- [ ] Clicked on meeting to view details
- [ ] Transcript is visible
- [ ] AI summary is visible
- [ ] Action items are visible

---

## 💡 Tips

1. **Best Audio Quality**: Use Google Meet or Zoom (better audio codec)
2. **Faster Processing**: Keep meetings under 15 minutes for quicker results
3. **Highlights**: Mark important moments during recording with Alt+H
4. **Transcript Overlay**: Toggle with Alt+T to verify recording is working
5. **Backend Sleep**: First request after 15min takes ~60 seconds to wake Render

---

## 🚨 Known Limitations

- **Render Free Tier**: Backend sleeps after 15 minutes of inactivity
- **PostgreSQL Free**: Database expires after 90 days (need to migrate)
- **Audio Processing**: Not real-time, processed after recording stops
- **Whisper Model**: Using "base" model for speed (not "large")
- **No Live Captions**: Transcript overlay shows after processing, not during

---

## 📞 Support

- **GitHub**: https://github.com/AbhiCherupally/MeetNote
- **Issues**: Open GitHub issue for bugs
- **Logs**: Check Render dashboard for backend logs
- **Browser Console**: Press F12 to see extension logs

---

**You're all set! Record your first meeting and see the magic happen! ✨**
