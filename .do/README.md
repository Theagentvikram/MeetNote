# 🚀 DigitalOcean Deployment Configuration

This directory contains all the configuration files needed to deploy MeetNote to DigitalOcean App Platform.

## 📁 Files Overview

| File | Purpose | Deployment Type |
|------|---------|-----------------|
| `app.yaml` | Production deployment config | 💎 Production |
| `deploy.yaml` | Budget deployment config | 💰 Budget |
| `Dockerfile` | Production Docker image | 💎 Production |
| `Dockerfile.budget` | Budget Docker image | 💰 Budget |
| `env-template.txt` | Environment variables template | Both |

## 🎯 Quick Deployment

### Option 1: Automated Script (Recommended)
```bash
# Run from project root
./deploy-digitalocean.sh
```

### Option 2: Manual CLI Deployment
```bash
# Authenticate
doctl auth init

# Deploy production
doctl apps create .do/app.yaml

# OR deploy budget
doctl apps create .do/deploy.yaml
```

### Option 3: Web Dashboard
1. Go to: https://cloud.digitalocean.com/apps
2. Create App → GitHub → Select repository
3. Upload one of the YAML files
4. Configure environment variables
5. Deploy

## 💰 Deployment Comparison

| Feature | Production (`app.yaml`) | Budget (`deploy.yaml`) |
|---------|-------------------------|------------------------|
| **Instance** | Professional-XS (1GB) | Basic-XXS (512MB) |
| **Monthly Cost** | ~$32 | ~$5 |
| **Whisper Model** | Base (accurate) | Tiny (basic) |
| **Database** | DO Managed ($15) | Supabase Free |
| **Storage** | DO Spaces ($5) | Local (ephemeral) |
| **Workers** | 2 | 1 |
| **Credits Duration** | ~6 months | ~40 months |

## 🔧 Configuration Details

### Production Features
- ✅ Full Whisper AI transcription
- ✅ Managed PostgreSQL database
- ✅ DigitalOcean Spaces storage
- ✅ Auto-scaling capabilities
- ✅ Advanced health checks
- ✅ Multiple workers
- ✅ CDN integration

### Budget Features
- ✅ Lightweight Whisper transcription
- ✅ Flexible database options
- ✅ Minimal resource usage
- ✅ Basic health checks
- ✅ Single worker
- ✅ Cost-optimized

## 🛠️ Environment Variables

### Required Secrets (Set as SECRET type in DO dashboard)
```bash
SECRET_KEY=your_32_char_secret_key
DATABASE_URL=postgresql://user:pass@host:port/db
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Production only:
DO_SPACES_KEY=your_spaces_access_key
DO_SPACES_SECRET=your_spaces_secret_key
```

### Configuration Variables (Regular type)
```bash
ENVIRONMENT=production
DEBUG=false
WHISPER_MODEL=base  # or 'tiny' for budget
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
CORS_ORIGINS=https://meetnoteapp.netlify.app,chrome-extension://*

# Production only:
DO_SPACES_BUCKET=meetnote-production
DO_SPACES_REGION=nyc3
```

## 🔍 Health Checks

### Production Health Check
- **Path**: `/api/health`
- **Interval**: 30 seconds
- **Timeout**: 10 seconds
- **Initial Delay**: 60 seconds
- **Retries**: 3

### Budget Health Check
- **Path**: `/api/health`
- **Interval**: 60 seconds
- **Timeout**: 15 seconds
- **Initial Delay**: 90 seconds
- **Retries**: 5

## 📊 Monitoring

### Key Metrics to Watch
- **CPU Usage**: < 80%
- **Memory Usage**: < 90%
- **Response Time**: < 2s
- **Error Rate**: < 1%
- **Database Connections**: Monitor pool

### Monitoring Commands
```bash
# List apps
doctl apps list

# Get app details
doctl apps get <APP_ID>

# View logs
doctl apps logs <APP_ID> --type=run
doctl apps logs <APP_ID> --type=build

# Monitor resources
doctl monitoring metrics droplet cpu <APP_ID>
```

## 🚨 Troubleshooting

### Common Issues

#### Build Failures
```bash
# Check build logs
doctl apps logs <APP_ID> --type=build

# Common fixes:
# 1. Verify requirements.txt exists
# 2. Check Dockerfile syntax
# 3. Ensure all dependencies listed
```

#### Runtime Errors
```bash
# Check runtime logs
doctl apps logs <APP_ID> --type=run

# Common issues:
# 1. Missing environment variables
# 2. Database connection failures
# 3. Whisper model download issues
```

#### Memory Issues (Budget)
```bash
# Symptoms: OOM kills, slow responses
# Solutions:
# 1. Use tiny Whisper model
# 2. Reduce worker count to 1
# 3. Optimize memory usage
# 4. Consider upgrading instance
```

### Performance Optimization

#### Production Optimization
```bash
# Connection pooling
DATABASE_URL=...?pool_size=20&max_overflow=30

# Whisper optimization
WHISPER_COMPUTE_TYPE=int8
WHISPER_BEAM_SIZE=5

# Caching (optional)
REDIS_URL=redis://your-instance
```

#### Budget Optimization
```bash
# Minimal model
WHISPER_MODEL=tiny

# Single worker
--workers 1

# Memory optimization
PYTHONOPTIMIZE=2
```

## 🔐 Security

### Best Practices
- ✅ Use SECRET type for sensitive variables
- ✅ Enable SSL for database connections
- ✅ Configure CORS properly
- ✅ Use strong, unique passwords
- ✅ Rotate keys regularly

### CORS Configuration
```yaml
cors:
  allow_origins:
  - exact: https://meetnoteapp.netlify.app
  - regex: ^chrome-extension://.*$
  allow_methods: [GET, POST, PUT, DELETE, OPTIONS]
  allow_headers: [Content-Type, Authorization]
  allow_credentials: true
```

## 📈 Scaling

### Vertical Scaling
```bash
# Upgrade instance size
# Basic-XXS → Professional-XS → Professional-S

# Update in app.yaml:
instance_size_slug: professional-s
```

### Horizontal Scaling
```bash
# Increase instance count
instance_count: 2

# Enable auto-scaling (production only)
autoscaling:
  min_instance_count: 1
  max_instance_count: 3
```

## 💡 Tips & Best Practices

### Development Workflow
1. **Test locally** before deploying
2. **Use staging environment** for testing
3. **Monitor logs** during deployment
4. **Set up alerts** for critical metrics
5. **Regular backups** of database

### Cost Management
1. **Start with budget** deployment
2. **Monitor usage** regularly
3. **Set billing alerts** at 80% credits
4. **Optimize based on** actual usage
5. **Scale gradually** as needed

### Performance Tips
1. **Pre-download Whisper models** in Docker
2. **Use connection pooling** for database
3. **Enable compression** for responses
4. **Monitor memory usage** closely
5. **Optimize worker count** based on load

## 📞 Support

### Resources
- **DigitalOcean Docs**: https://docs.digitalocean.com/products/app-platform/
- **Community**: https://www.digitalocean.com/community
- **Status**: https://status.digitalocean.com/

### Getting Help
1. **Check logs** first: `doctl apps logs <APP_ID>`
2. **Review configuration** files
3. **Test locally** to isolate issues
4. **Search community** for similar problems
5. **Create support ticket** if needed

---

**🎉 Ready to deploy your AI meeting assistant to DigitalOcean!**

Choose your deployment type and follow the configuration guide for a smooth deployment experience.
