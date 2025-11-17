# MeetNote Backend

FastAPI backend for MeetNote - AI-powered meeting transcription and summarization.

## Features

- 🎤 **Audio Transcription** - Using Whisper AI (faster-whisper) for accurate, free transcription
- 🤖 **AI Summarization** - OpenRouter's free Mistral 7B for meeting summaries
- 🔐 **Authentication** - JWT-based user authentication
- 📊 **Meeting Management** - Full CRUD operations for meetings
- 🎯 **Highlights** - Create and manage meeting highlights
- 🔄 **Real-time** - WebSocket support for live transcription
- 🐳 **Dockerized** - Ready for deployment

## Tech Stack

- **Framework**: FastAPI
- **Database**: PostgreSQL (SQLite for development)
- **Transcription**: faster-whisper (Whisper AI)
- **AI**: OpenRouter (Mistral 7B - Free)
- **Authentication**: JWT with python-jose
- **ORM**: SQLAlchemy

## Quick Start

### Development

1. **Install dependencies**:
```bash
pip install -r requirements.txt
```

2. **Create `.env` file**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Run the server**:
```bash
python -m app.main
# or
uvicorn app.main:app --reload
```

Server will be available at `http://localhost:8000`

### Docker

```bash
# Build image
docker build -t meetnote-backend .

# Run container
docker run -p 8000:8000 --env-file .env meetnote-backend
```

## Deployment to Render

1. **Create a new Web Service** on Render.com
2. **Connect your GitHub repository**
3. **Configure**:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Environment Variables**:
     - `DATABASE_URL` - PostgreSQL connection string (from Render PostgreSQL)
     - `SECRET_KEY` - Generate with `openssl rand -hex 32`
     - `OPENROUTER_API_KEY` - Your OpenRouter API key
     - `WHISPER_MODEL` - `base` (recommended for Render)
     - `PYTHON_VERSION` - `3.11`

4. **Add PostgreSQL Database**:
   - Create a PostgreSQL instance on Render
   - Copy the Internal Database URL to `DATABASE_URL` env var

## API Documentation

Once running, visit:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `GET /api/auth/status` - Check auth status

### Meetings
- `POST /api/meetings` - Create meeting
- `GET /api/meetings` - List meetings
- `GET /api/meetings/{id}` - Get meeting details
- `POST /api/meetings/{id}/upload-audio` - Upload & process audio
- `POST /api/meetings/{id}/stop` - Stop meeting
- `POST /api/meetings/{id}/highlights` - Create highlight
- `GET /api/meetings/{id}/highlights` - Get highlights

### Transcription
- `POST /api/transcription/transcribe-file` - Transcribe audio file
- `POST /api/transcription/transcribe-base64` - Transcribe base64 audio

### WebSocket
- `WS /ws/{client_id}` - Real-time transcription stream

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | `sqlite:///./meetnote.db` |
| `SECRET_KEY` | JWT secret key | (required in production) |
| `OPENROUTER_API_KEY` | OpenRouter API key for AI | (optional) |
| `WHISPER_MODEL` | Whisper model size | `base` |
| `WHISPER_DEVICE` | Device for inference | `cpu` |
| `ENVIRONMENT` | Environment name | `development` |

## Whisper Models

Choose based on your needs:

| Model | Size | Speed | Accuracy |
|-------|------|-------|----------|
| `tiny` | 39M | Fastest | Good |
| `base` | 74M | Fast | Better |
| `small` | 244M | Medium | Great |
| `medium` | 769M | Slow | Excellent |

**Recommended for Render**: `base` or `small`

## Free Resources

- **Whisper AI**: 100% free, runs locally
- **OpenRouter Mistral 7B**: Free tier available
- **Render**: Free PostgreSQL (90 days), Web Service (750 hours/month)

## License

MIT
