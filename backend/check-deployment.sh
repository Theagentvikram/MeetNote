#!/bin/bash

echo "🔍 Checking MeetNote Deployment Status..."
echo ""

BACKEND_URL="https://meetnote-backend.onrender.com"

echo "📡 Testing Backend Health..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/api/health" 2>/dev/null)

if [ "$RESPONSE" = "200" ]; then
    echo "✅ Backend is LIVE! ($BACKEND_URL)"
    echo ""
    echo "📊 Health Check Response:"
    curl -s "${BACKEND_URL}/api/health" | python3 -m json.tool
    echo ""
    echo "📚 API Documentation: ${BACKEND_URL}/docs"
    echo "🔗 ReDoc: ${BACKEND_URL}/redoc"
elif [ "$RESPONSE" = "000" ]; then
    echo "⏳ Backend is still deploying or not accessible..."
    echo "   Check Render dashboard: https://dashboard.render.com/"
else
    echo "⚠️  Backend returned status code: $RESPONSE"
    echo "   Check Render logs for errors"
fi

echo ""
echo "🌐 Expected URLs:"
echo "   Backend: https://meetnote-backend.onrender.com"
echo "   Frontend: https://meetnoteapp.netlify.app"
