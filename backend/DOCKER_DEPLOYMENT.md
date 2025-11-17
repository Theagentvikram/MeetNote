# MeetNote Backend - Docker Deployment Guide

## Quick Start

### 1. Environment Setup

Copy the environment template and fill in your Supabase credentials:

```bash
cp .env.production .env
```

Edit `.env` and add your Supabase credentials:
```bash
# Your Supabase project details
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-anon-key  
SUPABASE_SERVICE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:your-password@db.your-project-id.supabase.co:5432/postgres

# Generate a secure secret key
SECRET_KEY=$(openssl rand -hex 32)

# Optional: OpenRouter API for AI summaries (free tier available)
OPENROUTER_API_KEY=your-openrouter-key
```

### 2. Local Development with Docker

```bash
# Build and run with Docker Compose
docker-compose up --build

# Or run in background
docker-compose up -d --build

# View logs
docker-compose logs -f meetnote-backend

# Stop
docker-compose down
```

### 3. Production Deployment

#### For DigitalOcean App Platform:

1. **Push your code to GitHub**
2. **Create a new App on DigitalOcean**
3. **Connect your repository** 
4. **Configure the service:**
   ```yaml
   name: meetnote-backend
   source_dir: /backend
   dockerfile_path: backend/Dockerfile
   http_port: 8000
   instance_count: 1
   instance_size_slug: basic-xxs  # $5/month
   ```

5. **Add environment variables** in the DigitalOcean dashboard:
   ```
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_KEY=your-anon-key
   SUPABASE_SERVICE_KEY=your-service-role-key  
   DATABASE_URL=postgresql://postgres:your-password@db.your-project-id.supabase.co:5432/postgres
   SECRET_KEY=your-generated-secret-key
   OPENROUTER_API_KEY=your-openrouter-key
   ENVIRONMENT=production
   DEBUG=false
   ```

6. **Deploy**

#### For any Docker-compatible platform:

```bash
# Build the image
docker build -t meetnote-backend .

# Run the container
docker run -d \
  --name meetnote-backend \
  -p 8000:8000 \
  --env-file .env \
  meetnote-backend

# Or use docker-compose
docker-compose -f docker-compose.yml up -d
```

### 4. Verify Deployment

```bash
# Check health
curl https://your-app-url.ondigitalocean.app/

# Check API health  
curl https://your-app-url.ondigitalocean.app/api/health
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | Yes | - | Your Supabase project URL |
| `SUPABASE_KEY` | Yes | - | Supabase anon/public key |
| `SUPABASE_SERVICE_KEY` | Yes | - | Supabase service role key |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `SECRET_KEY` | Yes | - | JWT secret key (generate with openssl) |
| `OPENROUTER_API_KEY` | No | - | OpenRouter API for AI summaries |
| `ENVIRONMENT` | No | production | Environment mode |
| `DEBUG` | No | false | Enable debug mode |
| `WHISPER_MODEL` | No | base | Whisper model size |
| `CORS_ORIGINS` | No | - | Comma-separated allowed origins |

### Supabase Setup

1. **Create a Supabase project** at https://supabase.com
2. **Run the SQL schema** from `supabase_schema.sql`
3. **Get your credentials** from Settings > API
4. **Add the credentials** to your environment variables

### Resource Requirements

- **Memory**: 1GB minimum (2GB recommended)
- **CPU**: 1 vCPU minimum  
- **Storage**: 10GB minimum
- **Network**: HTTP/HTTPS on port 8000

### Scaling

- **Horizontal**: Deploy multiple instances with load balancer
- **Vertical**: Increase memory/CPU for faster Whisper processing
- **Database**: Supabase auto-scales PostgreSQL

## Troubleshooting

### Common Issues

**1. Docker build fails**
```bash
# Check Docker logs
docker-compose logs meetnote-backend

# Common fixes:
# - Ensure all dependencies are in requirements.txt
# - Check for missing system packages in Dockerfile
```

**2. Supabase connection fails**
```bash
# Test connection
python -c "from supabase import create_client; client = create_client('YOUR_URL', 'YOUR_KEY'); print('Connected!')"

# Check credentials and network access
```

**3. Whisper model fails to load**
```bash
# Try smaller model
export WHISPER_MODEL=tiny

# Check available disk space
df -h
```

**4. Permission denied errors**
```bash
# Fix file permissions
sudo chown -R 1000:1000 uploads recordings temp
```

### Health Checks

```bash
# Application health
curl http://localhost:8000/

# API health with details
curl http://localhost:8000/api/health

# Container health
docker ps
docker logs meetnote-backend
```

### Performance Tuning

**For limited resources:**
```bash
export WHISPER_MODEL=tiny
export WHISPER_COMPUTE_TYPE=int8
export WORKERS=1
```

**For better performance:**
```bash  
export WHISPER_MODEL=base
export WHISPER_COMPUTE_TYPE=float16
export WORKERS=2
```

## Production Checklist

- [ ] Supabase project created and configured
- [ ] Environment variables set securely
- [ ] SSL/HTTPS enabled
- [ ] CORS origins configured properly
- [ ] Health checks responding
- [ ] Logs configured and accessible
- [ ] Backup strategy for uploaded files
- [ ] Monitoring and alerting set up

## Support

- **Issues**: Check the logs first
- **Performance**: Monitor memory usage during transcription
- **Scaling**: Use multiple instances behind load balancer
- **Security**: Ensure environment variables are secure