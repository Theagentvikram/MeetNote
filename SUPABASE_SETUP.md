# Supabase Database Setup for MeetNote

## Quick Setup (5 minutes)

### 1. Create Supabase Project
1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Choose a name: `meetnote`
4. Set a strong database password (save it!)
5. Select region closest to you
6. Click "Create new project" (takes ~2 minutes)

### 2. Get Your Credentials
Once project is ready:
1. Go to **Settings** → **API**
2. Copy these values:
   - **Project URL**: `https://xxx.supabase.co`
   - **anon/public key**: Long string starting with `eyJ...`

### 3. Run Database Schema
1. Go to **SQL Editor** in Supabase dashboard
2. Click "New Query"
3. Copy and paste the content from `backend/supabase_schema.sql`
4. Click **Run** (bottom right)
5. You should see "Success. No rows returned"

### 4. Configure Backend

Create `.env` file in `backend/` directory:

```bash
cd backend
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
OPENROUTER_API_KEY=sk-or-v1-...  # Get from https://openrouter.ai/
```

### 5. Test Connection

```bash
cd backend
python setup_supabase.py
```

You should see:
```
✅ Supabase client initialized
✅ Meetings table exists
✅ Successfully created test meeting
✅ Database setup complete!
```

### 6. Deploy to DigitalOcean

Add environment variables to your DigitalOcean App:

1. Go to https://cloud.digitalocean.com/apps
2. Select your `orca-app` (or meetnote app)
3. Go to **Settings** → **App-Level Environment Variables**
4. Add these variables:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=eyJhbGci...
   OPENROUTER_API_KEY=sk-or-v1-...
   ENVIRONMENT=production
   ```
5. Click **Save** - app will automatically redeploy

### 7. Verify It Works

Test the API:
```bash
curl https://orca-app-n4f3w.ondigitalocean.app/api/transcription/audio \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"audio_data": "test", "format": "wav", "title": "Test Meeting"}'
```

Check Supabase dashboard → **Table Editor** → **meetings** table to see the stored meeting!

## Database Schema

The `meetings` table has these columns:
- `id` (uuid, primary key)
- `title` (text)
- `transcript` (text)
- `summary` (text)
- `duration` (integer, seconds)
- `language` (text)
- `confidence` (numeric)
- `audio_format` (text)
- `created_at` (timestamp)
- `segments` (jsonb) - for speaker diarization
- `ai_summary` (text)
- `key_points` (jsonb array)
- `action_items` (jsonb array)

## Troubleshooting

**Connection fails?**
- Check your SUPABASE_URL has `https://` prefix
- Verify SUPABASE_KEY is the **anon/public** key, not the secret key
- Ensure project is fully provisioned (green status in dashboard)

**Table doesn't exist?**
- Re-run the SQL schema in Supabase SQL Editor
- Check for any error messages in the SQL output

**Meetings not saving?**
- Check DigitalOcean app logs: `doctl apps logs <app-id>`
- Verify environment variables are set correctly
- Test with the setup script first locally
