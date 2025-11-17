# Deploy MeetNote to DigitalOcean App Platform

## Prerequisites
- DigitalOcean account with $50 credits
- GitHub repository with your MeetNote code
- Supabase project with database set up

## Cost Estimate
- **Basic XXS**: $5/month (512MB RAM, 1 vCPU) - **Recommended**
- **Basic XS**: $12/month (1GB RAM, 1 vCPU)
- With $50 credits, you can run for **10 months** on Basic XXS

## Step 1: Prepare Your Repository

1. **Push your code to GitHub** (if not already done):
```bash
git add .
git commit -m "Prepare for DigitalOcean deployment"
git push origin main
```

## Step 2: Update Environment Variables

1. **Edit `.do/app.yaml`** and update these values:
```yaml
github:
  repo: your-username/your-repo-name  # Update this!
envs:
- key: SUPABASE_URL
  value: YOUR_SUPABASE_URL  # From Supabase dashboard
- key: SUPABASE_KEY
  value: YOUR_SUPABASE_ANON_KEY  # From Supabase dashboard
```

## Step 3: Deploy to DigitalOcean

### Option A: Using DigitalOcean CLI (Recommended)
```bash
# Install DO CLI
brew install doctl  # macOS
# or download from: https://github.com/digitalocean/doctl/releases

# Authenticate
doctl auth init

# Deploy the app
doctl apps create .do/app.yaml
```

### Option B: Using DigitalOcean Web Console
1. Go to [DigitalOcean Apps](https://cloud.digitalocean.com/apps)
2. Click **"Create App"**
3. Choose **"GitHub"** as source
4. Select your repository and `main` branch
5. Choose **"Autodeploy"** for automatic deployments
6. Set **Source Directory** to `/backend`
7. Set **Run Command** to: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1`
8. Add environment variables:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_KEY`: Your Supabase anon key
   - `ENVIRONMENT`: `production`
9. Choose **Basic XXS** ($5/month) plan
10. Click **"Create Resources"**

## Step 4: Configure Your Frontend

Once deployed, update your frontend to use the new DigitalOcean URL:

**In `desktop-app/src/renderer/renderer.js`:**
```javascript
const backendUrl = 'https://your-app-name.ondigitalocean.app';
```

## Step 5: Test Your Deployment

1. **Health Check**: Visit `https://your-app-name.ondigitalocean.app/api/health`
2. **Test API**: 
```bash
curl https://your-app-name.ondigitalocean.app/api/meetings
```

## Monitoring & Logs

- **View Logs**: DigitalOcean Console → Apps → Your App → Runtime Logs
- **Metrics**: Built-in CPU, Memory, and Request metrics
- **Alerts**: Set up alerts for high resource usage

## Scaling Options

- **Vertical Scaling**: Upgrade to Basic XS (1GB RAM) if needed
- **Horizontal Scaling**: Add more instances (auto-scaling available)
- **Database**: Supabase handles scaling automatically

## Troubleshooting

### Common Issues:
1. **502 Bad Gateway**: Check runtime logs for startup errors
2. **Environment Variables**: Verify in App Settings
3. **Build Failures**: Check build logs in deployment history

### Performance Tips:
- Monitor memory usage (should stay under 400MB)
- Use connection pooling for database
- Enable gzip compression for responses

## Cost Optimization

- **Basic XXS** is sufficient for development and light production
- Monitor usage in DigitalOcean dashboard
- Set up billing alerts to avoid surprises
- Consider pausing the app when not in use (saves costs)

## Next Steps

1. Set up custom domain (optional)
2. Enable HTTPS (automatic with DigitalOcean)
3. Set up monitoring and alerts
4. Configure backup strategy for Supabase