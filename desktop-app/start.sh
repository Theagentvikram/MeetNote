#!/bin/bash

# MeetNote Desktop Quick Start Script
echo "🎙️ Starting MeetNote Desktop..."

# Navigate to app directory
cd "$(dirname "$0")"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies first..."
    npm install
fi

# Start the app
echo "🚀 Launching MeetNote..."
npm start

