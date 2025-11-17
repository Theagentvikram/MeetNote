"""
MeetNote Backend - FastAPI Application
Audio transcription with Whisper AI and summarization with OpenRouter
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
from typing import List, Optional
import os

from app.core.config import settings
from app.api import transcription
from supabase import create_client, Client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

USE_PRODUCTION_WHISPER = settings.ENVIRONMENT.lower() == "production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    logger.info("Starting MeetNote Backend...")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    
    # Initialize Supabase client
    try:
        supabase_url = settings.SUPABASE_URL
        supabase_key = settings.SUPABASE_KEY
        
        if supabase_url and supabase_key:
            # Simple initialization without proxy parameter
            from supabase import create_client, Client
            app.state.supabase: Client = create_client(
                supabase_url=supabase_url,
                supabase_key=supabase_key
            )
            logger.info("✅ Supabase client initialized")
        else:
            logger.warning("⚠️ Supabase credentials missing, running without database")
            app.state.supabase = None
    except Exception as e:
        logger.warning(f"⚠️ Supabase initialization failed: {e}")
        app.state.supabase = None
    
    if USE_PRODUCTION_WHISPER:
        logger.info("✅ Backend ready with production Whisper pipeline")
    else:
        logger.info("✅ Backend ready with mock transcription")
    
    yield
    
    # Shutdown
    logger.info("Shutting down MeetNote Backend...")


# Create FastAPI app
app = FastAPI(
    title="MeetNote API",
    description="AI-powered meeting transcription and summarization",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:3001", 
        "https://meetnoteapp.netlify.app",
        "https://meetnote-app.netlify.app",
        "chrome-extension://*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)


# Health Check
@app.get("/")
async def root():
    return {
        "status": "healthy",
        "service": "MeetNote API",
        "version": "1.0.0"
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint for frontend"""
    database_status = "connected" if hasattr(app.state, 'supabase') and app.state.supabase else "disconnected"
    whisper_status = "production" if USE_PRODUCTION_WHISPER else "mock"
    return {
        "status": "healthy",
        "timestamp": "2025-11-16T18:48:39.281446",
        "version": "2.0.0",
        "database": f"supabase ({database_status})",
        "whisper": whisper_status
    }


# Include routers
app.include_router(transcription.router, prefix="/api/transcription", tags=["Transcription"])

# Meetings endpoint
@app.get("/api/meetings")
async def get_meetings():
    """Get all meetings from Supabase"""
    try:
        if not hasattr(app.state, 'supabase') or not app.state.supabase:
            # Return empty list if no database connection
            return {"meetings": [], "total": 0}
        
        response = app.state.supabase.table('meetings').select('*').order('created_at', desc=True).execute()
        meetings = response.data if response.data else []
        
        return {"meetings": meetings, "total": len(meetings)}
    except Exception as e:
        logger.error(f"Failed to fetch meetings: {e}")
        return {"meetings": [], "total": 0}


# WebSocket endpoint for real-time transcription (disabled for lightweight deployment)
# @app.websocket("/ws/{client_id}")
# async def websocket_endpoint(websocket: WebSocket, client_id: str):
#     """WebSocket connection for real-time audio streaming and transcription"""
#     # Disabled for lightweight deployment - use HTTP endpoints instead
#     pass


# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
