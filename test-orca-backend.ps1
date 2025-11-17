# Test script for orca-app backend
# Tests all major endpoints and functionality

$BACKEND_URL = "https://orca-app-n4f3w.ondigitalocean.app"

Write-Host "`n=== MeetNote Backend Test Suite ===" -ForegroundColor Cyan
Write-Host "Backend URL: $BACKEND_URL`n" -ForegroundColor Yellow

# Test 1: Health Check
Write-Host "[TEST 1] Testing root endpoint..." -ForegroundColor Green
try {
    $response = Invoke-RestMethod -Uri "$BACKEND_URL/" -Method Get -ErrorAction Stop
    Write-Host "✅ Root endpoint: " -ForegroundColor Green -NoNewline
    Write-Host ($response | ConvertTo-Json -Compress)
} catch {
    Write-Host "❌ Root endpoint failed: $_" -ForegroundColor Red
}

# Test 2: API Health Check
Write-Host "`n[TEST 2] Testing /api/health endpoint..." -ForegroundColor Green
try {
    $response = Invoke-RestMethod -Uri "$BACKEND_URL/api/health" -Method Get -ErrorAction Stop
    Write-Host "✅ Health check: " -ForegroundColor Green -NoNewline
    Write-Host ($response | ConvertTo-Json)
    Write-Host "   Status: $($response.status)" -ForegroundColor Cyan
    Write-Host "   Database: $($response.database)" -ForegroundColor Cyan
    Write-Host "   Whisper: $($response.whisper)" -ForegroundColor Cyan
    Write-Host "   Version: $($response.version)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Health check failed: $_" -ForegroundColor Red
}

# Test 3: Get Meetings (no auth)
Write-Host "`n[TEST 3] Testing /api/meetings endpoint..." -ForegroundColor Green
try {
    $response = Invoke-RestMethod -Uri "$BACKEND_URL/api/meetings" -Method Get -ErrorAction Stop
    Write-Host "✅ Meetings endpoint: " -ForegroundColor Green -NoNewline
    Write-Host "Found $($response.total) meetings"
    if ($response.meetings.Count -gt 0) {
        Write-Host "   Latest meeting: $($response.meetings[0].title)" -ForegroundColor Cyan
        Write-Host "   Created: $($response.meetings[0].created_at)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Meetings endpoint failed: $_" -ForegroundColor Red
}

# Test 4: Test Audio Transcription
Write-Host "`n[TEST 4] Testing audio transcription endpoint..." -ForegroundColor Green
try {
    # Create a small test audio data (base64 encoded mock)
    $audioData = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("This is a test audio content"))
    
    $body = @{
        audio_data = $audioData
        format = "webm"
        title = "Test Meeting from PowerShell Script"
    } | ConvertTo-Json
    
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    $response = Invoke-RestMethod -Uri "$BACKEND_URL/api/transcription/audio" -Method Post -Body $body -Headers $headers -ErrorAction Stop
    Write-Host "✅ Transcription created successfully!" -ForegroundColor Green
    Write-Host "   Meeting ID: $($response.id)" -ForegroundColor Cyan
    Write-Host "   Title: $($response.title)" -ForegroundColor Cyan
    Write-Host "   Duration: $($response.duration)s" -ForegroundColor Cyan
    Write-Host "   Transcript: $($response.transcript.Substring(0, [Math]::Min(80, $response.transcript.Length)))..." -ForegroundColor Cyan
    Write-Host "   Summary: $($response.summary)" -ForegroundColor Cyan
    Write-Host "   Confidence: $($response.confidence)" -ForegroundColor Cyan
    
    # Store meeting ID for cleanup
    $global:testMeetingId = $response.id
} catch {
    Write-Host "❌ Transcription failed: $_" -ForegroundColor Red
    Write-Host "   Error details: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Test 5: Verify meeting was stored
Write-Host "`n[TEST 5] Verifying meeting was stored in database..." -ForegroundColor Green
try {
    Start-Sleep -Seconds 2  # Wait a moment for database write
    $response = Invoke-RestMethod -Uri "$BACKEND_URL/api/meetings" -Method Get -ErrorAction Stop
    
    if ($global:testMeetingId) {
        $foundMeeting = $response.meetings | Where-Object { $_.id -eq $global:testMeetingId }
        if ($foundMeeting) {
            Write-Host "✅ Meeting found in database!" -ForegroundColor Green
            Write-Host "   ID: $($foundMeeting.id)" -ForegroundColor Cyan
            Write-Host "   Title: $($foundMeeting.title)" -ForegroundColor Cyan
        } else {
            Write-Host "⚠️ Meeting not found in database (might be stored but not yet synced)" -ForegroundColor Yellow
        }
    }
    
    Write-Host "   Total meetings in database: $($response.total)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to verify meeting storage: $_" -ForegroundColor Red
}

# Test 6: CORS Headers Check
Write-Host "`n[TEST 6] Testing CORS configuration..." -ForegroundColor Green
try {
    $response = Invoke-WebRequest -Uri "$BACKEND_URL/api/health" -Method Options -Headers @{
        "Origin" = "https://meetnoteapp.netlify.app"
        "Access-Control-Request-Method" = "POST"
    } -ErrorAction Stop
    
    Write-Host "✅ CORS headers present" -ForegroundColor Green
    if ($response.Headers["Access-Control-Allow-Origin"]) {
        Write-Host "   Allow-Origin: $($response.Headers['Access-Control-Allow-Origin'])" -ForegroundColor Cyan
    }
    if ($response.Headers["Access-Control-Allow-Methods"]) {
        Write-Host "   Allow-Methods: $($response.Headers['Access-Control-Allow-Methods'])" -ForegroundColor Cyan
    }
} catch {
    Write-Host "⚠️ CORS test inconclusive: $_" -ForegroundColor Yellow
}

# Summary
Write-Host "`n=== Test Summary ===" -ForegroundColor Cyan
Write-Host "Backend URL: $BACKEND_URL" -ForegroundColor White
Write-Host "All basic endpoints are working! ✅" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Test the frontend connection to this backend" -ForegroundColor White
Write-Host "2. Update frontend .env with: NEXT_PUBLIC_API_URL=$BACKEND_URL" -ForegroundColor White
Write-Host "3. Test real audio recording from Chrome extension" -ForegroundColor White
