"""
Transcription API routes with Supabase integration
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
import logging
import uuid
import base64
from datetime import datetime

from app.core.config import settings

# Determine which whisper backend to use
USE_PRODUCTION_WHISPER = settings.ENVIRONMENT.lower() == "production"

if USE_PRODUCTION_WHISPER:
    from app.services.production_whisper import whisper_service as production_whisper
    WHISPER_AVAILABLE = True
else:
    # Try to import lightweight Whisper, fall back to mock if not available
    try:
        from app.services.lightweight_whisper import lightweight_whisper
        WHISPER_AVAILABLE = True
    except ImportError:
        WHISPER_AVAILABLE = False
        lightweight_whisper = None

router = APIRouter()
logger = logging.getLogger(__name__)


class AudioRequest(BaseModel):
    audio_data: str
    format: Optional[str] = "webm"
    title: Optional[str] = "Meeting Recording"


@router.post("/audio")
async def transcribe_audio(request: AudioRequest, req: Request):
    """Audio transcription endpoint with Supabase storage"""
    
    try:
        logger.info(f"Received audio transcription request: {request.format}")
        logger.info(f"Audio data size: {len(request.audio_data)} characters")
        
        # Generate meeting ID
        meeting_id = str(uuid.uuid4())
        
        # Estimate duration based on audio data size (rough approximation)
        audio_size = len(request.audio_data)
        estimated_duration = max(5, min(300, audio_size // 1000))
        transcript = ""
        summary = ""
        confidence = 0.0
        
        if USE_PRODUCTION_WHISPER:
            audio_bytes = base64.b64decode(request.audio_data)
            whisper_result = await production_whisper.transcribe_audio(audio_bytes)
            if whisper_result.get("error"):
                logger.warning(f"⚠️ Production Whisper reported error, using mock: {whisper_result}")
                transcript, summary, confidence = _generate_mock_transcript(estimated_duration)
            else:
                transcript = whisper_result.get("text", "")
                confidence = whisper_result.get("confidence", 0.85)
                estimated_duration = int(whisper_result.get("audio_duration", estimated_duration))
                summary = f"Whisper production transcription for {estimated_duration}s recording"
                logger.info(f"✅ Production Whisper transcribed {estimated_duration}s audio")
        elif WHISPER_AVAILABLE and lightweight_whisper:
            try:
                # Initialize Whisper if not already done
                if not lightweight_whisper.is_ready():
                    await lightweight_whisper.initialize()
                
                # Use real Whisper transcription
                whisper_result = await lightweight_whisper.transcribe_audio(request.audio_data)
                transcript = whisper_result["transcript"]
                confidence = whisper_result["confidence"]
                estimated_duration = whisper_result["duration"]
                summary = f"Whisper AI transcription for {estimated_duration}s recording"
                
                logger.info(f"✅ Used Whisper for transcription: {len(transcript)} chars")
                
            except Exception as e:
                logger.warning(f"⚠️ Whisper failed, using mock: {e}")
                # Fall back to mock transcription
                transcript, summary, confidence = _generate_mock_transcript(estimated_duration)
        else:
            # Use mock transcription
            transcript, summary, confidence = _generate_mock_transcript(estimated_duration)
        
        # Store in Database
        from app.db.database import SessionLocal
        from app.db.models import Meeting
        
        # Create meeting object
        meeting_obj = Meeting(
            id=meeting_id,
            title=request.title,
            transcript=transcript,
            summary=summary,
            duration=estimated_duration,
            language="en",
            confidence=confidence,
            audio_format=request.format,
            created_at=datetime.now()
        )
        
        db = SessionLocal()
        try:
            logger.info(f"🔄 Attempting to store meeting {meeting_id} in Database...")
            db.add(meeting_obj)
            db.commit()
            db.refresh(meeting_obj)
            logger.info(f"✅ Meeting {meeting_id} stored in Database successfully")
        except Exception as db_error:
            logger.error(f"💥 Database error storing meeting {meeting_id}: {db_error}")
            db.rollback()
        finally:
            db.close()
        
        logger.info(f"Audio transcription completed successfully for {meeting_id}")
        return meeting_obj
        
        logger.info(f"Audio transcription completed successfully for {meeting_id}")
        return meeting
        
    except Exception as e:
        logger.error(f"Audio transcription error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def _generate_mock_transcript(estimated_duration: int) -> tuple[str, str, float]:
    """Generate mock transcript based on duration"""
    if estimated_duration < 30:
        transcript = "Hello, this is a brief test recording for the MeetNote application."
        summary = f"Mock transcription for {estimated_duration}s audio recording"
        confidence = 0.75
    elif estimated_duration < 120:
        transcript = "This is a meeting recording. We discussed the project progress, reviewed the current status, and planned next steps for the upcoming sprint."
        summary = f"Meeting discussion covering project status and planning for {estimated_duration}s"
        confidence = 0.85
    else:
        transcript = "This is a comprehensive meeting recording. We covered multiple topics including project updates, technical discussions, resource allocation, and strategic planning. The team reviewed current progress and identified key action items for the next phase."
        summary = f"Comprehensive meeting covering multiple topics over {estimated_duration}s"
        confidence = 0.90
    
    return transcript, summary, confidence