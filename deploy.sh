#!/bin/bash

# MeetNote Production Deployment Script
# Run this before pushing to production

echo "🚀 MeetNote Production Deployment Preparation"
echo "============================================="

# Test backend health
echo "✅ Testing backend health..."
HEALTH_RESPONSE=$(curl -s http://localhost:8000/api/health 2>/dev/null || echo "Backend not running")
if [[ $HEALTH_RESPONSE == *"healthy"* ]]; then
    echo "✅ Backend health check passed"
else
    echo "❌ Backend health check failed. Make sure backend is running locally first."
    exit 1
fi

# Test frontend build
echo "✅ Testing frontend build..."
cd frontend
if npm run build > /dev/null 2>&1; then
    echo "✅ Frontend build successful"
else
    echo "❌ Frontend build failed"
    cd ..
    exit 1
fi
cd ..

# Check Chrome extension
echo "✅ Checking Chrome extension..."
if [[ -f "chrome-extension/manifest.json" ]]; then
    echo "✅ Chrome extension manifest found"
else
    echo "❌ Chrome extension manifest not found"
    exit 1
fi

# Environment checks
echo "✅ Environment checks..."
if [[ -f "backend/.env.example" ]]; then
    echo "✅ Backend environment template ready"
else
    echo "❌ Backend environment template missing"
    exit 1
fi

if [[ -f "frontend/netlify.toml" ]]; then
    echo "✅ Netlify configuration ready"
else
    echo "❌ Netlify configuration missing"
    exit 1
fi

if [[ -f "backend/Dockerfile" ]]; then
    echo "✅ Docker configuration ready"
else
    echo "❌ Docker configuration missing"
    exit 1
fi

echo ""
echo "🎉 ALL CHECKS PASSED! Ready for deployment!"
echo ""
echo "📋 Next steps:"
echo "1. Push all changes to GitHub"
echo "2. Deploy backend to Render.com"
echo "3. Deploy frontend to Netlify.com"
echo "4. Test Chrome extension with production URLs"
echo ""
echo "🔗 Deployment URLs:"
echo "Backend: https://render.com (connect to GitHub repo)"
echo "Frontend: https://netlify.com (connect to GitHub repo)"
echo "Chrome Extension: Load unpacked in chrome://extensions/"
echo ""
echo "📚 See DEPLOYMENT_READY.md for detailed instructions"
