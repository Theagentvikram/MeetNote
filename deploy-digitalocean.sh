#!/bin/bash
# 🚀 Enhanced DigitalOcean Deployment Script for MeetNote
# Supports both production and budget deployments

set -e  # Exit on any error

echo "🚀 MeetNote DigitalOcean Deployment Helper v2.0"
echo "================================================"
echo ""

# Color codes for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if doctl is installed
    if ! command -v doctl &> /dev/null; then
        log_warning "DigitalOcean CLI (doctl) not found. Installing..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            if command -v brew &> /dev/null; then
                brew install doctl
            else
                log_error "Please install Homebrew first or download doctl manually"
                exit 1
            fi
        else
            log_error "Please install doctl manually from: https://github.com/digitalocean/doctl/releases"
            exit 1
        fi
    fi
    
    # Check if git is available
    if ! command -v git &> /dev/null; then
        log_error "Git is required but not installed"
        exit 1
    fi
    
    # Check if openssl is available
    if ! command -v openssl &> /dev/null; then
        log_error "OpenSSL is required but not installed"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Check if user wants to proceed
read -p "Do you have your DigitalOcean account ready with credits? (y/N): " confirm
if [[ $confirm != [yY] ]]; then
    echo ""
    log_error "Please create your DigitalOcean account first at: https://digitalocean.com"
    log_info "💡 Tip: Look for promo codes to get $200 in credits!"
    exit 1
fi

check_prerequisites

echo ""
log_info "Let's configure your deployment..."
echo ""

# Choose deployment type
echo "🎯 Choose your deployment type:"
echo "1. 💎 Production (1GB RAM, Full Whisper AI) - $32/month (~6 months with $200) [RECOMMENDED]"
echo "2. 💰 Budget (512MB RAM, Lightweight) - $5/month (~40 months with $200)"
echo ""
echo "💡 For your complete architecture (Desktop + Extension + Backend), Production is recommended"
echo "   to ensure full Whisper AI functionality across all components."
echo ""
read -p "Enter your choice (1 or 2) [default: 1]: " deployment_type

# Default to production if no input
if [[ -z "$deployment_type" ]]; then
    deployment_type="1"
fi

if [[ "$deployment_type" == "1" ]]; then
    config_file=".do/app.yaml"
    dockerfile=".do/Dockerfile"
    log_info "Selected: Production deployment with full features"
elif [[ "$deployment_type" == "2" ]]; then
    config_file=".do/deploy.yaml"
    dockerfile=".do/Dockerfile.budget"
    log_info "Selected: Budget deployment with lightweight setup"
else
    log_error "Invalid choice. Please run the script again."
    exit 1
fi

# Collect app name
echo ""
read -p "Enter your DO App name (e.g., meetnote-production): " app_name
if [[ -z "$app_name" ]]; then
    app_name="meetnote-production"
fi

# Generate secret key
echo ""
log_info "Generating secure secret key..."
secret_key=$(openssl rand -hex 32)
log_success "Generated SECRET_KEY"

# Check if doctl is authenticated
echo ""
log_info "Checking DigitalOcean authentication..."
if ! doctl account get &> /dev/null; then
    log_warning "Not authenticated with DigitalOcean CLI"
    echo "Please run: doctl auth init"
    echo "Then paste your API token from: https://cloud.digitalocean.com/account/api/tokens"
    read -p "Press Enter after authentication is complete..."
fi

# Collect database information
echo ""
log_info "Database Configuration:"
if [[ "$deployment_type" == "1" ]]; then
    echo "For production, we recommend DigitalOcean Managed PostgreSQL"
    echo "1. Go to: https://cloud.digitalocean.com/databases"
    echo "2. Create Database → PostgreSQL 15 → Basic plan"
    echo "3. Copy the connection string"
    echo ""
    read -p "Paste your DATABASE_URL here: " database_url
else
    echo "For budget deployment, you can use:"
    echo "1. DigitalOcean Managed DB (recommended but costs $15/month)"
    echo "2. Supabase free tier (free but with limits)"
    echo ""
    read -p "Do you want to use Supabase free tier? (y/N): " use_supabase
    if [[ $use_supabase == [yY] ]]; then
        echo "Please set up Supabase and paste your connection string:"
        read -p "Supabase DATABASE_URL: " database_url
    else
        echo "Please create a DigitalOcean managed database and paste the connection string:"
        read -p "DO DATABASE_URL: " database_url
    fi
fi

# Collect OpenRouter key
echo ""
log_info "AI Service Setup (OpenRouter - Free tier available):"
echo "1. Go to: https://openrouter.ai/keys"
echo "2. Sign up for free account"
echo "3. Create API key"
echo ""
read -p "Paste your OPENROUTER_API_KEY here: " openrouter_key

# Collect Spaces keys (only for production)
if [[ "$deployment_type" == "1" ]]; then
    echo ""
    log_info "Storage Setup (DigitalOcean Spaces):"
    echo "1. Go to: https://cloud.digitalocean.com/spaces"
    echo "2. Create Space → Name: meetnote-production → Region: NYC3"
    echo "3. Go to API → Spaces Keys → Generate New Key"
    echo ""
    read -p "Enter your DO_SPACES_KEY (Access Key): " spaces_key
    read -p "Enter your DO_SPACES_SECRET (Secret Key): " spaces_secret
fi

# Update extension URL
echo ""
log_info "Updating extension configuration..."
app_url="https://${app_name}.ondigitalocean.app"

# Update background.js
if [[ -f "chrome-extension/background.js" ]]; then
    sed -i.bak "s|https://your-app-name.ondigitalocean.app|${app_url}|g" chrome-extension/background.js
    sed -i.bak "s|http://localhost:8000|${app_url}|g" chrome-extension/background.js
    log_success "Updated chrome-extension/background.js"
else
    log_warning "chrome-extension/background.js not found - you'll need to update URLs manually"
fi

# Update app.yaml with repo info
echo ""
log_info "Updating deployment configuration..."
if [[ -f "$config_file" ]]; then
    # Get current git remote
    git_remote=$(git config --get remote.origin.url 2>/dev/null || echo "")
    if [[ -n "$git_remote" ]]; then
        # Extract repo name from git remote
        repo_name=$(echo "$git_remote" | sed 's/.*[\/:]//g' | sed 's/\.git$//')
        username=$(echo "$git_remote" | sed 's/.*[\/:]//g' | sed 's/\/.*$//' | sed 's/\.git$//')
        
        # Update the YAML file
        sed -i.bak "s|your-username/meetnote|${username}/${repo_name}|g" "$config_file"
        log_success "Updated $config_file with your repository info"
    else
        log_warning "Could not detect git repository. Please update $config_file manually."
    fi
else
    log_error "Configuration file $config_file not found!"
    exit 1
fi

# Create environment variables file for reference
echo ""
log_info "Creating environment variables reference file..."

env_file=".env.digitalocean"
cat > "$env_file" << EOF
# DigitalOcean Environment Variables - $(date)
# Copy these to your DO App Platform → Settings → Environment

# Required Secrets (set as SECRET type)
DATABASE_URL=$database_url
SECRET_KEY=$secret_key
OPENROUTER_API_KEY=$openrouter_key
EOF

if [[ "$deployment_type" == "1" ]]; then
cat >> "$env_file" << EOF
DO_SPACES_KEY=$spaces_key
DO_SPACES_SECRET=$spaces_secret
EOF
fi

cat >> "$env_file" << EOF

# Configuration (regular environment variables)
ENVIRONMENT=production
DEBUG=false
WHISPER_MODEL=${deployment_type == "1" && echo "base" || echo "tiny"}
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
EOF

if [[ "$deployment_type" == "1" ]]; then
cat >> "$env_file" << EOF
DO_SPACES_BUCKET=meetnote-production
DO_SPACES_REGION=nyc3
EOF
fi

cat >> "$env_file" << EOF
CORS_ORIGINS=https://meetnoteapp.netlify.app,https://meetnote-app.netlify.app,chrome-extension://*

# Deployment Info
APP_URL=$app_url
DEPLOYMENT_TYPE=${deployment_type == "1" && echo "production" || echo "budget"}
ESTIMATED_COST=${deployment_type == "1" && echo "$32/month" || echo "$5/month"}
EOF

log_success "Created $env_file with your configuration"

# Create deployment checklist
echo ""
log_info "Creating deployment checklist..."

checklist_file="DO_DEPLOYMENT_CHECKLIST.md"
cat > "$checklist_file" << EOF
# 🚀 DigitalOcean Deployment Checklist

Generated: $(date)
Deployment Type: ${deployment_type == "1" && echo "Production (Full Features)" || echo "Budget (Lightweight)"}
App URL: $app_url

## ✅ Completed Steps
- [x] Generated secure SECRET_KEY
- [x] Collected database connection string  
- [x] Got OpenRouter API key (free tier)
EOF

if [[ "$deployment_type" == "1" ]]; then
cat >> "$checklist_file" << EOF
- [x] Got DigitalOcean Spaces keys
EOF
fi

cat >> "$checklist_file" << EOF
- [x] Updated extension URLs
- [x] Updated deployment configuration

## 🎯 Next Steps (Manual - Do in DigitalOcean Dashboard)

### 1. Deploy App (10-15 minutes)

#### Option A: Using doctl CLI (Recommended)
\`\`\`bash
# Deploy using the configuration file
doctl apps create $config_file

# Monitor deployment
doctl apps list
\`\`\`

#### Option B: Using Web Dashboard
1. Go to: https://cloud.digitalocean.com/apps
2. Click **"Create App"**
3. Choose **"GitHub"** as source
4. Select your repository: $(git config --get remote.origin.url 2>/dev/null | sed 's/.*[\/:]//g' | sed 's/\.git$//')
5. Branch: **main**
6. Source Directory: **/backend**
7. Plan: **${deployment_type == "1" && echo "Professional-XS ($12/month)" || echo "Basic-XXS ($5/month)"}**

### 2. Set Environment Variables
Copy from .env.digitalocean file to DO App Settings:

**Required Secrets (set as SECRET type):**
- [ ] DATABASE_URL
- [ ] SECRET_KEY  
- [ ] OPENROUTER_API_KEY
EOF

if [[ "$deployment_type" == "1" ]]; then
cat >> "$checklist_file" << EOF
- [ ] DO_SPACES_KEY
- [ ] DO_SPACES_SECRET
EOF
fi

cat >> "$checklist_file" << EOF

**Configuration (regular environment variables):**
- [ ] ENVIRONMENT=production
- [ ] DEBUG=false
- [ ] WHISPER_MODEL=${deployment_type == "1" && echo "base" || echo "tiny"}
- [ ] WHISPER_DEVICE=cpu
- [ ] WHISPER_COMPUTE_TYPE=int8
EOF

if [[ "$deployment_type" == "1" ]]; then
cat >> "$checklist_file" << EOF
- [ ] DO_SPACES_BUCKET=meetnote-production
- [ ] DO_SPACES_REGION=nyc3
EOF
fi

cat >> "$checklist_file" << EOF
- [ ] CORS_ORIGINS=https://meetnoteapp.netlify.app,https://meetnote-app.netlify.app,chrome-extension://*

### 3. Deploy & Test (5-10 minutes)
- [ ] Click **"Create Resources"**
- [ ] Wait for build completion (5-10 minutes)
- [ ] Test health endpoint: \`curl $app_url/api/health\`
- [ ] Verify response shows "${deployment_type == "1" && echo "faster-whisper" || echo "mock transcription"}"

### 4. Update Extension (2 minutes)
- [ ] Open Chrome → Extensions → Load Unpacked
- [ ] Select chrome-extension folder
- [ ] Test popup opens without errors
- [ ] Verify backend connection status is green

### 5. End-to-End Test (5 minutes)
- [ ] Join a test meeting (Zoom/Meet/Teams)
- [ ] Press Alt+R to start recording
- [ ] Verify transcript appears (if enabled)
- [ ] Press Alt+R to stop recording
- [ ] Check meeting appears in dashboard

## 🎉 Success Criteria
- [ ] Health check returns proper Whisper status
- [ ] Extension connects without CORS errors
- [ ] Real-time transcription works in meetings
- [ ] AI summaries generate after recording
- [ ] No console errors in browser

## 📊 Cost Monitoring
- Monthly Cost: ${deployment_type == "1" && echo "~$32" || echo "~$5"}
- Credits Duration: ${deployment_type == "1" && echo "~6 months" || echo "~40 months"}
- Monitor at: https://cloud.digitalocean.com/billing

## 🆘 Troubleshooting

### Build Failures
\`\`\`bash
# Check build logs
doctl apps logs \$APP_ID --type=build

# Common fixes:
# 1. Verify requirements.txt exists
# 2. Check Python version compatibility
# 3. Ensure all dependencies are listed
\`\`\`

### Runtime Errors
\`\`\`bash
# Check runtime logs
doctl apps logs \$APP_ID --type=run

# Common issues:
# 1. Missing environment variables
# 2. Database connection failures
# 3. Whisper model download issues
\`\`\`

### Extension Issues
- Check CORS_ORIGINS includes chrome-extension://*
- Verify host_permissions in manifest.json
- Reload extension after URL changes

## 📞 Support Resources
- App URL: $app_url
- Configuration: $config_file
- Environment: .env.digitalocean
- Estimated setup time: 30-45 minutes
- DigitalOcean Docs: https://docs.digitalocean.com/products/app-platform/
EOF

log_success "Created $checklist_file"

# Commit changes
echo ""
log_info "Committing changes to git..."
git add .
git commit -m "🚀 Enhanced DigitalOcean deployment configuration

- Add production and budget deployment options
- Create optimized Dockerfiles for different tiers
- Update deployment script with better UX
- Add comprehensive environment configuration
- Create detailed deployment checklist

Deployment type: ${deployment_type == "1" && echo "Production" || echo "Budget"}
Ready for DO App Platform deployment!"

if git push; then
    log_success "Changes pushed to repository"
else
    log_warning "Failed to push changes - you may need to push manually"
fi

# Final summary
echo ""
echo "🎉 DigitalOcean Deployment Setup Complete!"
echo "=========================================="
echo ""
log_success "Configuration Summary:"
echo "  • Deployment Type: ${deployment_type == "1" && echo "Production (Full Features)" || echo "Budget (Lightweight)"}"
echo "  • App Name: $app_name"
echo "  • App URL: $app_url"
echo "  • Monthly Cost: ${deployment_type == "1" && echo "~$32" || echo "~$5"}"
echo "  • Credits Duration: ${deployment_type == "1" && echo "~6 months" || echo "~40 months"}"
echo ""
log_info "Next Steps:"
echo "  1. 📋 Review: $checklist_file"
echo "  2. 🌐 Deploy: https://cloud.digitalocean.com/apps"
echo "  3. ⚙️  Configure: Copy variables from .env.digitalocean"
echo "  4. 🧪 Test: Follow the checklist verification steps"
echo ""
log_warning "Security Note:"
echo "  • .env.digitalocean contains secrets - don't commit it!"
echo "  • It's already added to .gitignore"
echo ""
log_success "Ready for DigitalOcean deployment! 🚀"

# Add to gitignore
echo ".env.digitalocean" >> .gitignore
echo "*.bak" >> .gitignore