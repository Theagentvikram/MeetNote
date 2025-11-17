#!/bin/bash

echo "🔍 Checking MeetNote Backend Status..."
echo "Backend URL: https://meetnote-backend.onrender.com"
echo ""

while true; do
    echo "⏳ Pinging backend..."
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" https://meetnote-backend.onrender.com/api/health 2>/dev/null)
    
    if [ "$RESPONSE" = "200" ]; then
        echo "✅ Backend is LIVE!"
        echo ""
        echo "📊 Health Check:"
        curl -s https://meetnote-backend.onrender.com/api/health | python3 -m json.tool
        echo ""
        echo "�� Your backend is ready!"
        echo "📚 API Docs: https://meetnote-backend.onrender.com/docs"
        break
    elif [ "$RESPONSE" = "000" ]; then
        echo "⏳ Still deploying... (waiting 10 seconds)"
    else
        echo "⚠️  Got status code: $RESPONSE (waiting 10 seconds)"
    fi
    
    sleep 10
done
