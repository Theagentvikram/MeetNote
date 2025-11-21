#!/bin/bash

# MeetNote Desktop Installation Script
# This script sets up the MeetNote desktop app on macOS

set -e  # Exit on any error

echo "🎙️  MeetNote Desktop Installation"
echo "=================================="
echo ""

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This installer is for macOS only"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    echo "Or use Homebrew: brew install node"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16 or higher is required"
    echo "Current version: $(node -v)"
    echo "Please update Node.js"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Create placeholder icons if they don't exist
echo "🎨 Setting up icons..."

# Create a simple placeholder icon using ImageMagick (if available) or just create empty files
if command -v convert &> /dev/null; then
    # Create placeholder icons with ImageMagick
    echo "Creating placeholder icons with ImageMagick..."
    
    # Main icon (512x512)
    if [ ! -f "assets/icon.png" ]; then
        convert -size 512x512 xc:none -fill "#6366f1" -draw "circle 256,256 256,100" \
                -fill white -pointsize 200 -gravity center -annotate +0+0 "🎙️" \
                assets/icon.png
    fi
    
    # Tray icon (32x32)
    if [ ! -f "assets/tray-icon.png" ]; then
        convert -size 32x32 xc:none -fill "#6366f1" -draw "circle 16,16 16,4" \
                -fill white -pointsize 16 -gravity center -annotate +0+0 "M" \
                assets/tray-icon.png
    fi
    
    echo "✅ Icons created with ImageMagick"
else
    # Create simple text-based placeholder files
    echo "ImageMagick not found, creating simple placeholders..."
    
    # Just create empty files - Electron will use default icons
    touch assets/icon.png
    touch assets/tray-icon.png
    
    echo "⚠️  Placeholder icons created. Consider adding proper icons later."
fi

echo ""

# Check if backend is running
echo "🔍 Checking backend connection..."

# Try local backend first (with timeout)
if timeout 3 curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "✅ Local backend detected at http://localhost:8000"
    BACKEND_STATUS="local"
elif timeout 5 curl -s https://meetnote-backend.onrender.com/api/health > /dev/null 2>&1; then
    echo "✅ Production backend detected at https://meetnote-backend.onrender.com"
    BACKEND_STATUS="production"
else
    echo "⚠️  Backend check timed out. The app will work in demo mode."
    BACKEND_STATUS="none"
fi

echo ""

# Test build
echo "🔨 Testing build..."
npm run pack > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Build test successful"
else
    echo "❌ Build test failed"
    echo "Try running 'npm run dev' to see detailed errors"
fi

echo ""
echo "🎉 Installation Complete!"
echo "========================"
echo ""
echo "Next steps:"
echo "1. Start the app: npm run dev"
echo "2. Grant screen recording permission when prompted"
echo "3. Grant microphone permission when prompted"
echo "4. Start recording your first meeting!"
echo ""

if [ "$BACKEND_STATUS" = "none" ]; then
    echo "⚠️  Backend Setup:"
    echo "   - Start your backend: cd ../backend && python -m app.main"
    echo "   - Or use the production backend (already configured)"
    echo ""
fi

echo "Commands:"
echo "  npm run dev      - Start in development mode"
echo "  npm run build    - Build for production"
echo "  npm run dist     - Create installer"
echo ""
echo "Need help? Check the README.md file"
echo ""
echo "Happy meeting recording! 🎙️"
