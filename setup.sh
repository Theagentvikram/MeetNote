#!/bin/bash

# MeetNote Quick Setup Script

echo "🎙️ MeetNote Setup Script"
echo "========================"
echo ""

# Check if we're in the right directory
if [ ! -f "README.md" ]; then
    echo "❌ Error: Please run this script from the Meet project root directory"
    exit 1
fi

echo "📦 Setting up MeetNote project..."
echo ""

# Backend Setup
echo "1️⃣ Setting up Backend..."
cd backend || exit

if [ ! -f ".env" ]; then
    echo "   Creating .env file..."
    cp .env.example .env
    echo "   ✅ .env created - Please edit with your configuration"
else
    echo "   ℹ️ .env already exists"
fi

echo "   Installing Python dependencies..."
if command -v pip &> /dev/null; then
    pip install -r requirements.txt
    echo "   ✅ Backend dependencies installed"
else
    echo "   ⚠️ pip not found - please install Python and pip"
fi

cd ..

# Frontend Setup
echo ""
echo "2️⃣ Setting up Frontend..."
cd frontend || exit

if [ ! -f ".env.local" ]; then
    echo "   Creating .env.local file..."
    cp .env.local.example .env.local
    echo "   ✅ .env.local created"
else
    echo "   ℹ️ .env.local already exists"
fi

echo "   Installing Node dependencies..."
if command -v bun &> /dev/null; then
    bun install
    echo "   ✅ Frontend dependencies installed (bun)"
elif command -v npm &> /dev/null; then
    npm install
    echo "   ✅ Frontend dependencies installed (npm)"
else
    echo "   ⚠️ Neither bun nor npm found - please install Node.js"
fi

cd ..

# Chrome Extension
echo ""
echo "3️⃣ Chrome Extension ready at: ./chrome-extension"
echo "   Load it in Chrome by:"
echo "   1. Opening chrome://extensions/"
echo "   2. Enabling 'Developer mode'"
echo "   3. Clicking 'Load unpacked'"
echo "   4. Selecting the chrome-extension folder"

echo ""
echo "✨ Setup complete!"
echo ""
echo "🚀 Next steps:"
echo "   1. Edit backend/.env with your API keys"
echo "   2. Start backend: cd backend && python -m app.main"
echo "   3. Start frontend: cd frontend && bun dev"
echo "   4. Load Chrome extension from chrome-extension folder"
echo ""
echo "📚 See DEPLOYMENT.md for production deployment guide"
echo ""
