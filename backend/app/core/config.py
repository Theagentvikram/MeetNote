"""
Configuration settings for MeetNote Backend
"""

from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List, Optional, Union
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    """Application settings"""
    
    # Application
    APP_NAME: str = "MeetNote"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # API
    API_V1_STR: str = "/api"
    
    # Supabase Configuration
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    
    # Database - Support both Supabase and PostgreSQL
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite:///./meetnote.db"  # Default to SQLite for development
    )
    
    # Security
    SECRET_KEY: str = os.getenv(
        "SECRET_KEY",
        "your-secret-key-change-this-in-production"
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # OpenRouter API (for Mistral 7B summarization)
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "mistralai/mistral-7b-instruct:free"
    
    # Whisper Settings
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "base")  # tiny, base, small, medium, large
    WHISPER_DEVICE: str = os.getenv("WHISPER_DEVICE", "cpu")  # cpu or cuda
    WHISPER_COMPUTE_TYPE: str = os.getenv("WHISPER_COMPUTE_TYPE", "int8")  # int8, float16, float32
    
    # Audio Settings
    SAMPLE_RATE: int = 16000
    CHUNK_DURATION: int = 5  # seconds
    MAX_AUDIO_SIZE: int = int(os.getenv("MAX_AUDIO_SIZE", "25000000"))  # 25MB
    
    # CORS - Parse from environment variable
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://meetnoteapp.netlify.app",
        "chrome-extension://*",
    ]
    
    # File Storage
    UPLOAD_DIR: str = os.getenv("AUDIO_UPLOAD_PATH", "./uploads")
    RECORDINGS_DIR: str = "./recordings"
    TEMP_DIR: str = os.getenv("TEMP_PATH", "./temp")
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "info").upper()
    
    class Config:
        env_file = ".env"
        case_sensitive = True

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def split_cors_origins(cls, value: Union[str, List[str]]) -> List[str]:
        """Accept JSON arrays or comma-separated strings from env."""
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


settings = Settings()

# Log the SECRET_KEY value
logger.info(f"SECRET_KEY loaded: {settings.SECRET_KEY}")

# Create necessary directories
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.RECORDINGS_DIR, exist_ok=True)
