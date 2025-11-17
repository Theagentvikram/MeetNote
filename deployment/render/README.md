# Render Deployment Files

This folder contains the Render-specific deployment configuration files that were used during initial development.

## Files:
- `render.yaml` - Render service configuration
- `Dockerfile.render` - Docker configuration optimized for Render
- `.dockerignore.render` - Docker ignore file for Render builds

## Usage:
If you want to deploy to Render instead of DigitalOcean:

1. Copy files back to the backend directory:
```bash
cp deployment/render/render.yaml ./
cp deployment/render/Dockerfile.render backend/Dockerfile
cp deployment/render/.dockerignore.render backend/.dockerignore
```

2. Follow the Render deployment process in the main README.

## Note:
These files are kept for reference and future use. The main deployment target is now DigitalOcean App Platform.
