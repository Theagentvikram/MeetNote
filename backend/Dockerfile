# DigitalOcean App Platform Dockerfile
# Optimized for 1GB RAM with full Whisper AI support

FROM python:3.11-slim-bullseye

# Set environment variables for optimization
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DEBIAN_FRONTEND=noninteractive

# Install system dependencies with minimal footprint
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libc6-dev \
    libffi-dev \
    libssl-dev \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser -u 1001 appuser

# Copy requirements first for better caching
COPY requirements.txt ./

# Install Python dependencies with optimizations
RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt && \
    pip cache purge

# Copy application code
COPY . .

# Create necessary directories with proper permissions
RUN mkdir -p /tmp/uploads /tmp/recordings /tmp/logs /tmp/whisper-cache && \
    chown -R appuser:appuser /app /tmp/uploads /tmp/recordings /tmp/logs /tmp/whisper-cache && \
    chmod -R 755 /tmp/uploads /tmp/recordings /tmp/logs /tmp/whisper-cache

# Switch to non-root user
USER appuser

# Pre-download Whisper model to reduce startup time
RUN python -c "\
import os; \
os.environ['WHISPER_CACHE_DIR'] = '/tmp/whisper-cache'; \
try: \
    from faster_whisper import WhisperModel; \
    model = WhisperModel('base', device='cpu', compute_type='int8', download_root='/tmp/whisper-cache'); \
    print('✅ Whisper base model pre-downloaded successfully'); \
except Exception as e: \
    print(f'⚠️ Whisper model pre-download failed: {e}'); \
    print('Model will be downloaded on first use'); \
"

# Expose port (DigitalOcean will set PORT env var)
EXPOSE 8000

# Health check optimized for DigitalOcean
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Startup command optimized for DigitalOcean App Platform
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2 --loop asyncio --access-log --log-level info"]
