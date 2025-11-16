# Use Python 3.11 alpine for minimal memory footprint (~50MB base)
FROM python:3.11-alpine

# Set working directory
WORKDIR /app

# Install minimal system dependencies
RUN apk add --no-cache gcc musl-dev

# Copy requirements first for better Docker layer caching
COPY requirements.txt .

# Install Python dependencies with minimal cache
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip cache purge

# Remove build dependencies to save space
RUN apk del gcc musl-dev

# Copy application code
COPY . .

# Create non-root user and set up directories
RUN adduser -D -s /bin/sh appuser && \
    mkdir -p uploads && \
    chown -R appuser:appuser /app

USER appuser

# Expose port
EXPOSE 8000

# Run with memory-optimized settings for 512MB limit
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--loop", "asyncio"]