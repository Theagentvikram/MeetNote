"""
Production configuration for DigitalOcean deployment
Full Whisper AI + Managed Database + Spaces Storage
"""

from pydantic_settings import BaseSettings
from typing import Optional, List
import os
import logging

# Configure logging for production
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ProductionSettings(BaseSettings):
    """Production settings for DigitalOcean deployment"""
    
    # Application
    APP_NAME: str = "MeetNote Production"
    ENVIRONMENT: str = "production"
    DEBUG: bool = False
    
    # API
    API_V1_STR: str = "/api"
    
    # Database - DigitalOcean Managed PostgreSQL
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # OpenRouter API (FREE tier for summaries)
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "mistralai/mistral-7b-instruct:free"
    
    # Whisper Settings - Full production setup
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "base")  # base model for good accuracy
    WHISPER_DEVICE: str = os.getenv("WHISPER_DEVICE", "cpu")  # CPU optimization for DO
    WHISPER_COMPUTE_TYPE: str = os.getenv("WHISPER_COMPUTE_TYPE", "int8")  # Memory optimized
    WHISPER_BEAM_SIZE: int = 5  # Good accuracy/speed balance
    WHISPER_VAD_FILTER: bool = True  # Voice activity detection
    
    # Audio Settings
    SAMPLE_RATE: int = 16000
    CHUNK_DURATION: int = 5  # seconds
    MAX_AUDIO_SIZE: int = 100 * 1024 * 1024  # 100MB for production
    AUDIO_FORMATS: List[str] = ["wav", "mp3", "mp4", "webm", "ogg"]
    
    # DigitalOcean Spaces (S3-compatible storage)
    DO_SPACES_KEY: str = os.getenv("DO_SPACES_KEY", "")
    DO_SPACES_SECRET: str = os.getenv("DO_SPACES_SECRET", "")
    DO_SPACES_BUCKET: str = os.getenv("DO_SPACES_BUCKET", "meetnote-storage")
    DO_SPACES_REGION: str = os.getenv("DO_SPACES_REGION", "nyc3")
    DO_SPACES_ENDPOINT: str = f"https://{DO_SPACES_REGION}.digitaloceanspaces.com"
    
    # CORS - Production domains
    CORS_ORIGINS: List[str] = [
        "https://meetnoteapp.netlify.app",
        "https://meetnote-app.netlify.app",
        "https://app.meetnote.io",  # Custom domain if you have one
        "chrome-extension://*",  # Chrome extension
    ]
    
    # File Storage Paths
    UPLOAD_DIR: str = "/tmp/uploads"  # Use /tmp for DO App Platform
    RECORDINGS_DIR: str = "/tmp/recordings"
    LOGS_DIR: str = "/tmp/logs"
    
    # Redis Configuration (for caching - optional)
    REDIS_URL: str = os.getenv("REDIS_URL", "")
    
    # Monitoring & Analytics
    SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")  # Error tracking
    LOG_LEVEL: str = "INFO"
    
    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = 100  # requests per minute per user
    RATE_LIMIT_WINDOW: int = 60  # seconds
    
    # Feature Flags
    ENABLE_REAL_TIME_TRANSCRIPTION: bool = True
    ENABLE_AI_SUMMARIES: bool = True
    ENABLE_SPEAKER_DIARIZATION: bool = False  # Future feature
    ENABLE_AUDIO_COMPRESSION: bool = True
    
    class Config:
        env_file = ".env.production"
        case_sensitive = True
        
    def __post_init__(self):
        """Validate required environment variables"""
        required_vars = [
            "SECRET_KEY",
            "DATABASE_URL", 
            "OPENROUTER_API_KEY",
            "DO_SPACES_KEY",
            "DO_SPACES_SECRET"
        ]
        
        missing_vars = []
        for var in required_vars:
            if not getattr(self, var):
                missing_vars.append(var)
        
        if missing_vars:
            logger.error(f"Missing required environment variables: {', '.join(missing_vars)}")
            raise ValueError(f"Missing required environment variables: {missing_vars}")
        
        # Create necessary directories
        for directory in [self.UPLOAD_DIR, self.RECORDINGS_DIR, self.LOGS_DIR]:
            os.makedirs(directory, exist_ok=True)
            logger.info(f"Directory ensured: {directory}")


# Initialize settings
settings = ProductionSettings()

# Log startup info (without secrets)
logger.info(f"🚀 MeetNote Production Starting...")
logger.info(f"Environment: {settings.ENVIRONMENT}")
logger.info(f"Whisper Model: {settings.WHISPER_MODEL}")
logger.info(f"Database: {'Connected' if settings.DATABASE_URL else 'Not configured'}")
logger.info(f"Spaces Storage: {settings.DO_SPACES_BUCKET}")
logger.info(f"AI Summaries: {'Enabled' if settings.OPENROUTER_API_KEY else 'Disabled'}")
logger.info(f"CORS Origins: {len(settings.CORS_ORIGINS)} domains")