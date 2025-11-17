#!/bin/bash

# MeetNote Backend - Quick Docker Setup Script

echo "🚀 MeetNote Docker Setup"
echo "========================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    echo "   - If using OrbStack: Open OrbStack app"
    echo "   - If using Docker Desktop: Open Docker Desktop app"
    exit 1
fi

# Copy environment file
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.production .env
    echo "✅ Environment file created"
else
    echo "✅ Environment file exists"
fi

# Build Docker image
echo "🔨 Building Docker image..."
docker build -t meetnote-backend .

if [ $? -eq 0 ]; then
    echo "✅ Docker build successful!"
    
    # Run the container
    echo "🚀 Starting container..."
    docker run -d \
        --name meetnote-backend \
        -p 8000:8000 \
        --env-file .env \
        meetnote-backend
    
    echo "✅ Container started on http://localhost:8000"
    echo ""
    echo "Quick commands:"
    echo "  View logs: docker logs meetnote-backend"
    echo "  Stop: docker stop meetnote-backend"
    echo "  Remove: docker rm meetnote-backend"
    echo "  Test API: curl http://localhost:8000/api/health"
    
else
    echo "❌ Docker build failed. Check the output above for errors."
    exit 1
fi