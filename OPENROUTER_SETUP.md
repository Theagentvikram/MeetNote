# OpenRouter Setup Guide

## Getting Your Free API Key

OpenRouter provides **FREE** access to various AI models including Mistral 7B, which we use for meeting summarization.

### Step 1: Sign Up for OpenRouter

1. Go to [OpenRouter.ai](https://openrouter.ai/)
2. Click "Sign In" or "Get Started"
3. Create an account using:
   - Email
   - Google
   - GitHub

### Step 2: Get Your API Key

1. After logging in, go to [Keys](https://openrouter.ai/keys)
2. Click "Create Key"
3. Give it a name like "MeetNote Desktop"
4. Copy your API key (starts with `sk-or-...`)

### Step 3: Configure Backend

#### Option A: Environment Variable (Recommended)
```bash
export OPENROUTER_API_KEY="sk-or-v1-your-key-here"
```

#### Option B: .env File
Create or edit `backend/.env`:
```bash
OPENROUTER_API_KEY=sk-or-v1-your-key-here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=mistralai/mistral-7b-instruct:free
```

### Step 4: Restart Backend

```bash
cd backend
python -m uvicorn app.main:app --reload
```

### Step 5: Test It!

1. Record a meeting in the desktop app
2. View the meeting details
3. Watch AI generate summary, key points, and action items! ✨

## Free Models Available

OpenRouter offers several **FREE** models:

- ✅ **Mistral 7B Instruct** (default) - Great for summaries
- ✅ **Mistral 8x7B** - More powerful
- ✅ **Claude Instant** - Anthropic's fast model
- ✅ **GPT-3.5 Turbo** - OpenAI (limited free tier)

To change model, update in backend `.env`:
```bash
OPENROUTER_MODEL=mistralai/mixtral-8x7b-instruct:free
```

## Rate Limits (Free Tier)

- **Requests**: ~20 requests/minute
- **Tokens**: Varies by model
- **Daily Limit**: Generous for personal use

For production apps with many users, consider upgrading to a paid plan.

## Troubleshooting

### "API Key Not Configured"
- Make sure `OPENROUTER_API_KEY` is set in backend environment
- Restart the backend server after adding the key

### "Rate Limit Exceeded"
- Free tier has rate limits
- Wait a few minutes and try again
- Consider upgrading for higher limits

### "Backend Error: 500"
- Check backend logs for details
- Verify API key is valid
- Check OpenRouter service status

## Cost Monitoring

Track your usage at: [OpenRouter Dashboard](https://openrouter.ai/activity)

Even on free tier, you can monitor:
- Requests per day
- Tokens used
- Model performance

## Alternative: Local AI (No API Key)

If you prefer not to use external APIs, you can:

1. Use **Ollama** with local models
2. Run **llama.cpp** locally
3. Use **GPT4All** for offline AI

We may add these options in future updates!

---

**Questions?** Check the [OpenRouter Documentation](https://openrouter.ai/docs)

**Status**: ✅ Free tier is perfect for personal use!
