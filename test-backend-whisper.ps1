# Test Backend Whisper Service
# This script tests if the backend's Whisper is working

$BACKEND_URL = "https://orca-app-n4f3w.ondigitalocean.app"

Write-Host "`n=== Testing Backend Whisper Service ===" -ForegroundColor Cyan

# Create a simple test audio (base64 encoded silence)
# This is a minimal WAV file with 1 second of silence
$testWAV = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQAAAAA="

Write-Host "`n[TEST] Sending test audio to backend..." -ForegroundColor Green

try {
    $body = @{
        audio_data = $testWAV
        format = "wav"
        title = "Whisper Test"
    } | ConvertTo-Json
    
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    $response = Invoke-RestMethod -Uri "$BACKEND_URL/api/transcription/audio" -Method Post -Body $body -Headers $headers -ErrorAction Stop
    
    Write-Host "✅ Response received:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json)
    
    if ($response.transcript -eq "" -and $response.duration -eq 1) {
        Write-Host "`n❌ BACKEND ISSUE CONFIRMED!" -ForegroundColor Red
        Write-Host "The backend is returning empty transcripts with 1s duration." -ForegroundColor Yellow
        Write-Host "This indicates the Whisper service is failing to process audio." -ForegroundColor Yellow
        Write-Host "`nPossible causes:" -ForegroundColor Yellow
        Write-Host "1. librosa/soundfile not installed properly" -ForegroundColor White
        Write-Host "2. faster-whisper model not loaded" -ForegroundColor White
        Write-Host "3. Audio decoding failing" -ForegroundColor White
        Write-Host "4. Memory/CPU constraints on DigitalOcean" -ForegroundColor White
        
        Write-Host "`n📋 Next Steps:" -ForegroundColor Cyan
        Write-Host "1. Check DigitalOcean Runtime Logs" -ForegroundColor White
        Write-Host "2. Look for Python errors or Whisper loading issues" -ForegroundColor White
        Write-Host "3. Verify faster-whisper is installed" -ForegroundColor White
        Write-Host "4. Check if model downloaded successfully" -ForegroundColor White
    } else {
        Write-Host "`n✅ Whisper is working!" -ForegroundColor Green
        Write-Host "Transcript: $($response.transcript)" -ForegroundColor Cyan
    }
    
} catch {
    Write-Host "❌ Failed to test backend: $_" -ForegroundColor Red
}

Write-Host "`n=== How to Check DigitalOcean Logs ===" -ForegroundColor Cyan
Write-Host "1. Go to: https://cloud.digitalocean.com/apps" -ForegroundColor White
Write-Host "2. Click on 'orca-app'" -ForegroundColor White
Write-Host "3. Click 'Runtime Logs' tab" -ForegroundColor White
Write-Host "4. Look for errors mentioning:" -ForegroundColor White
Write-Host "   - 'librosa'" -ForegroundColor Gray
Write-Host "   - 'whisper'" -ForegroundColor Gray
Write-Host "   - 'faster-whisper'" -ForegroundColor Gray
Write-Host "   - 'Audio processing error'" -ForegroundColor Gray
Write-Host "   - 'Failed to load'" -ForegroundColor Gray
