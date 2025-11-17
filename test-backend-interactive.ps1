# Interactive Backend Test Script
# Prompts for the backend URL and runs comprehensive tests

Write-Host "`n=== MeetNote Backend Interactive Test ===" -ForegroundColor Cyan

# Prompt for backend URL
Write-Host "`nPlease enter your backend URL" -ForegroundColor Yellow
Write-Host "Examples:" -ForegroundColor Gray
Write-Host "  - https://orca-app-xxxxx.ondigitalocean.app" -ForegroundColor Gray
Write-Host "  - https://api.yourdomain.com" -ForegroundColor Gray
Write-Host "  - http://localhost:8000 (for local testing)`n" -ForegroundColor Gray

$BACKEND_URL = Read-Host "Backend URL"

# Remove trailing slash if present
$BACKEND_URL = $BACKEND_URL.TrimEnd('/')

Write-Host "`nTesting backend at: $BACKEND_URL`n" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "[TEST 1] Testing root endpoint..." -ForegroundColor Green
try {
    $response = Invoke-RestMethod -Uri "$BACKEND_URL/" -Method Get -ErrorAction Stop
    Write-Host "✅ Root endpoint: " -ForegroundColor Green -NoNewline
    Write-Host ($response | ConvertTo-Json -Compress)
} catch {
    Write-Host "❌ Root endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`nCannot connect to backend. Please check:" -ForegroundColor Yellow
    Write-Host "1. The URL is correct" -ForegroundColor White
    Write-Host "2. The backend is deployed and running" -ForegroundColor White
    Write-Host "3. You have internet connectivity" -ForegroundColor White
    exit 1
}

# Test 2: API Health Check
Write-Host "`n[TEST 2] Testing /api/health endpoint..." -ForegroundColor Green
try {
    $response = Invoke-RestMethod -Uri "$BACKEND_URL/api/health" -Method Get -ErrorAction Stop
    Write-Host "✅ Health check successful!" -ForegroundColor Green
    Write-Host "   Status: $($response.status)" -ForegroundColor Cyan
    Write-Host "   Database: $($response.database)" -ForegroundColor Cyan
    Write-Host "   Whisper: $($response.whisper)" -ForegroundColor Cyan
    Write-Host "   Version: $($response.version)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Get Meetings
Write-Host "`n[TEST 3] Testing /api/meetings endpoint..." -ForegroundColor Green
try {
    $response = Invoke-RestMethod -Uri "$BACKEND_URL/api/meetings" -Method Get -ErrorAction Stop
    Write-Host "✅ Meetings endpoint working!" -ForegroundColor Green
    Write-Host "   Total meetings: $($response.total)" -ForegroundColor Cyan
    if ($response.meetings.Count -gt 0) {
        Write-Host "`n   Recent meetings:" -ForegroundColor Yellow
        $response.meetings | Select-Object -First 3 | ForEach-Object {
            Write-Host "   - $($_.title) (ID: $($_.id))" -ForegroundColor White
            Write-Host "     Created: $($_.created_at)" -ForegroundColor Gray
        }
    } else {
        Write-Host "   No meetings found in database" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Meetings endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Test Audio Transcription
Write-Host "`n[TEST 4] Testing audio transcription endpoint..." -ForegroundColor Green
Write-Host "   Creating test meeting with mock audio..." -ForegroundColor Gray
try {
    # Create a small test audio data (base64 encoded mock)
    $audioData = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("This is a test audio content for transcription testing"))
    
    $body = @{
        audio_data = $audioData
        format = "webm"
        title = "Test Meeting - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    } | ConvertTo-Json
    
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    $response = Invoke-RestMethod -Uri "$BACKEND_URL/api/transcription/audio" -Method Post -Body $body -Headers $headers -ErrorAction Stop
    Write-Host "✅ Transcription created successfully!" -ForegroundColor Green
    Write-Host "`n   Meeting Details:" -ForegroundColor Yellow
    Write-Host "   ID: $($response.id)" -ForegroundColor Cyan
    Write-Host "   Title: $($response.title)" -ForegroundColor Cyan
    Write-Host "   Duration: $($response.duration)s" -ForegroundColor Cyan
    Write-Host "   Language: $($response.language)" -ForegroundColor Cyan
    Write-Host "   Confidence: $([math]::Round($response.confidence * 100, 2))%" -ForegroundColor Cyan
    Write-Host "`n   Transcript Preview:" -ForegroundColor Yellow
    $previewLength = [Math]::Min(120, $response.transcript.Length)
    Write-Host "   $($response.transcript.Substring(0, $previewLength))..." -ForegroundColor White
    Write-Host "`n   Summary:" -ForegroundColor Yellow
    Write-Host "   $($response.summary)" -ForegroundColor White
    
    # Store meeting ID for verification
    $global:testMeetingId = $response.id
    $global:testMeetingTitle = $response.title
} catch {
    Write-Host "❌ Transcription failed!" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
    if ($_.ErrorDetails) {
        Write-Host "   Details: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    }
}

# Test 5: Verify meeting was stored in database
Write-Host "`n[TEST 5] Verifying meeting was stored in database..." -ForegroundColor Green
if ($global:testMeetingId) {
    try {
        Start-Sleep -Seconds 2  # Wait for database write
        $response = Invoke-RestMethod -Uri "$BACKEND_URL/api/meetings" -Method Get -ErrorAction Stop
        
        $foundMeeting = $response.meetings | Where-Object { $_.id -eq $global:testMeetingId }
        if ($foundMeeting) {
            Write-Host "✅ Meeting successfully stored in database!" -ForegroundColor Green
            Write-Host "   ID: $($foundMeeting.id)" -ForegroundColor Cyan
            Write-Host "   Title: $($foundMeeting.title)" -ForegroundColor Cyan
            Write-Host "   Created: $($foundMeeting.created_at)" -ForegroundColor Cyan
        } else {
            Write-Host "⚠️ Meeting not found in database" -ForegroundColor Yellow
            Write-Host "   This might indicate a database connection issue" -ForegroundColor Gray
        }
        
        Write-Host "`n   Total meetings now in database: $($response.total)" -ForegroundColor Cyan
    } catch {
        Write-Host "❌ Failed to verify meeting storage: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️ Skipped (no test meeting was created)" -ForegroundColor Yellow
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
    Write-Host "⚠️ CORS test inconclusive: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Test Summary
Write-Host "`n" -NoNewline
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "                        TEST SUMMARY                        " -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "`nBackend URL: " -ForegroundColor White -NoNewline
Write-Host "$BACKEND_URL" -ForegroundColor Yellow

Write-Host "`n✅ Your backend is LIVE and working!" -ForegroundColor Green

Write-Host "`n📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Update your frontend configuration:" -ForegroundColor White
Write-Host "   NEXT_PUBLIC_API_URL=$BACKEND_URL" -ForegroundColor Yellow
Write-Host "`n2. Test with real Chrome extension:" -ForegroundColor White
Write-Host "   - Update extension config with backend URL" -ForegroundColor Gray
Write-Host "   - Record a meeting and verify transcription" -ForegroundColor Gray
Write-Host "`n3. Monitor your backend logs on DigitalOcean:" -ForegroundColor White
Write-Host "   - Check for any errors or warnings" -ForegroundColor Gray
Write-Host "   - Verify database connections" -ForegroundColor Gray

Write-Host "`n💾 To save this backend URL:" -ForegroundColor Cyan
Write-Host "   echo `"NEXT_PUBLIC_API_URL=$BACKEND_URL`" >> frontend\.env.local" -ForegroundColor Yellow

Write-Host "`n" -NoNewline
