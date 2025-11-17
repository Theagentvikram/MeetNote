# 🐛 Debugging Recording Issue

## Problem
Recordings are showing "0m 1s" and "No transcript available"

## Possible Causes
1. **No audio chunks being captured** - MediaRecorder not working
2. **Audio not being sent to backend** - Network issue
3. **Backend not processing audio** - Server error
4. **Microphone permission not granted** - Windows/System issue

## How to Debug

### Step 1: Open Developer Console in Electron App
1. With the MeetNote app open
2. Press **Ctrl + Shift + I** (Windows) or **Cmd + Option + I** (Mac)
3. Click on the **Console** tab

### Step 2: Start a New Recording
1. Click "Record Now" 
2. Choose "Desktop Audio"
3. **IMPORTANT**: Speak into your microphone immediately
4. Watch the console logs

### Step 3: What to Look For

#### ✅ GOOD SIGNS (What you SHOULD see):
```
🎙️ === STARTING AUDIO RECORDING ===
⏰ Recording start time: 2025-11-17T...
📦 Cleared recorded chunks array
▶️ Starting MediaRecorder...
✅ MediaRecorder started successfully
🎙️ MediaRecorder state: recording
🎵 Audio chunk received: 12345 bytes    <-- IMPORTANT!
📊 Total chunks so far: 1
🎵 Audio chunk received: 15678 bytes    <-- More chunks!
📊 Total chunks so far: 2
... (more chunks as you speak)
```

#### ❌ BAD SIGNS (Problems):
```
⚠️ Empty audio chunk received
📊 Total chunks recorded: 0              <-- NO AUDIO!
```

#### When you stop recording, look for:
```
⏹️ Audio recording stopped
⏱️ Recording duration: 10 seconds       <-- Should match actual time
📊 Total chunks recorded: 10            <-- Should have chunks!
📝 Processing audio with Whisper...
🎵 Audio blob size: 123456 bytes        <-- Should be > 0!
🌐 === SENDING TO BACKEND ===
📍 Backend URL: https://orca-app-n4f3w.ondigitalocean.app
📊 Base64 audio length: 164608 characters  <-- Should be large!
📤 Sending request to: https://...
📥 Response status: 200 OK              <-- Should be 200!
✅ Backend transcription successful!
📝 Transcript: [your transcription here]
```

### Step 4: Common Issues & Fixes

#### Issue 1: No Audio Chunks
**Symptom:** Console shows "Total chunks recorded: 0"

**Fix:**
- Check microphone permission in Windows Settings
- Make sure you're speaking loudly and clearly
- Try using a different microphone
- Check if microphone is muted

#### Issue 2: Backend Not Responding
**Symptom:** Console shows "Backend error: 500" or timeout

**Fix:**
```powershell
# Test backend directly
cd "d:\Projects\DigitalOceanMeet\Meetnote"
.\test-orca-backend.ps1
```

#### Issue 3: Permission Denied
**Symptom:** "Audio permission denied"

**Fix:**
1. Windows Settings → Privacy & Security → Microphone
2. Allow desktop apps to access microphone
3. Restart the app

### Step 5: Manual Test Audio

Try recording a longer session (20-30 seconds) and speak continuously:
```
"Hello, this is a test recording for MeetNote.
I am testing the audio transcription feature.
This sentence should appear in the transcript.
The backend should process this with Whisper AI.
This is the end of my test recording."
```

### Step 6: Check Local Storage

After recording, in the console type:
```javascript
JSON.parse(localStorage.getItem('meetings'))
```

You should see your meetings with transcripts.

## Quick Reload

If you make changes to the code, reload the app:
- Press **Ctrl + R** (Windows) or **Cmd + R** (Mac) in the Electron window
- Or close and restart with `npm start`

## Get Full Logs

After attempting a recording, copy ALL console output and share it to diagnose the exact issue.

---

**Most likely issue:** Microphone not capturing audio due to permissions or device settings.
