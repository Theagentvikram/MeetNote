"""
Meetings API routes
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import os
import logging

from app.db.database import get_db
from app.db import models
from app.core.security import get_current_user
from app.services.whisper_service import WhisperService
from app.services.ai_service import AIService
from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

whisper_service = WhisperService()
ai_service = AIService()


# Test endpoint without authentication for debugging
@router.get("/test")
async def test_endpoint():
    """Test endpoint to verify meetings router is working"""
    return {"message": "Meetings API is working", "authenticated": False}


@router.get("/test-auth")
async def test_auth_endpoint(current_user: models.User = Depends(get_current_user)):
    """Test endpoint to verify authentication is working"""
    return {
        "message": "Authentication is working", 
        "user_id": current_user.id,
        "user_email": current_user.email
    }


# Pydantic schemas
class MeetingCreate(BaseModel):
    title: str
    platform: Optional[str] = None
    meeting_url: Optional[str] = None


class MeetingResponse(BaseModel):
    id: int
    title: str
    platform: Optional[str]
    meeting_url: Optional[str]
    status: str
    duration: int
    participants_count: int
    summary: Optional[str]
    key_points: Optional[list]
    action_items: Optional[list]
    started_at: datetime
    ended_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class HighlightCreate(BaseModel):
    title: str
    start_time: float
    end_time: float
    description: Optional[str] = None


class HighlightResponse(BaseModel):
    id: int
    meeting_id: int
    title: str
    description: Optional[str]
    start_time: float
    end_time: float
    transcript_text: Optional[str]
    tags: Optional[list]
    
    class Config:
        from_attributes = True


@router.post("/", response_model=MeetingResponse)
async def create_meeting(
    meeting_data: MeetingCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new meeting"""
    
    new_meeting = models.Meeting(
        user_id=current_user.id,
        title=meeting_data.title,
        platform=meeting_data.platform,
        meeting_url=meeting_data.meeting_url,
        status="recording"
    )
    
    db.add(new_meeting)
    db.commit()
    db.refresh(new_meeting)
    
    logger.info(f"Created meeting {new_meeting.id} for user {current_user.id}")
    return new_meeting


@router.get("/", response_model=List[MeetingResponse])
async def get_meetings(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """Get all meetings for current user"""
    
    meetings = db.query(models.Meeting).filter(
        models.Meeting.user_id == current_user.id
    ).order_by(models.Meeting.started_at.desc()).offset(skip).limit(limit).all()
    
    return meetings


@router.get("/public")
async def get_public_meetings(db: Session = Depends(get_db)):
    """Get all meetings without authentication (for testing)"""
    
    meetings = db.query(models.Meeting).order_by(
        models.Meeting.started_at.desc()
    ).limit(10).all()
    
    return [
        {
            "id": meeting.id,
            "title": meeting.title,
            "status": meeting.status,
            "started_at": meeting.started_at,
            "user_id": meeting.user_id
        }
        for meeting in meetings
    ]


@router.get("/{meeting_id}", response_model=MeetingResponse)
async def get_meeting(
    meeting_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific meeting"""
    
    meeting = db.query(models.Meeting).filter(
        models.Meeting.id == meeting_id,
        models.Meeting.user_id == current_user.id
    ).first()
    
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found"
        )
    
    return meeting


@router.post("/{meeting_id}/upload-audio")
async def upload_audio(
    meeting_id: int,
    audio: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload audio file for a meeting and process transcription"""
    
    # Get meeting
    meeting = db.query(models.Meeting).filter(
        models.Meeting.id == meeting_id,
        models.Meeting.user_id == current_user.id
    ).first()
    
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found"
        )
    
    try:
        # Save audio file
        audio_filename = f"meeting_{meeting_id}_{datetime.now().timestamp()}.webm"
        audio_path = os.path.join(settings.RECORDINGS_DIR, audio_filename)
        
        with open(audio_path, "wb") as f:
            content = await audio.read()
            f.write(content)
        
        meeting.audio_file_path = audio_path
        meeting.status = "processing"
        db.commit()
        
        logger.info(f"Audio uploaded for meeting {meeting_id}, starting transcription")
        
        # Transcribe audio
        transcription_result = await whisper_service.transcribe_file(audio_path)
        
        # Save transcript segments
        for segment in transcription_result["segments"]:
            transcript = models.Transcript(
                meeting_id=meeting_id,
                text=segment["text"],
                start_time=segment["start"],
                end_time=segment["end"],
                confidence=segment.get("confidence", 0.0)
            )
            db.add(transcript)
        
        # Generate AI summary
        full_transcript = transcription_result["text"]
        ai_summary = await ai_service.summarize_transcript(full_transcript)
        
        # Update meeting
        meeting.status = "completed"
        meeting.duration = int(transcription_result.get("duration", 0))
        meeting.summary = ai_summary.get("summary")
        meeting.key_points = ai_summary.get("key_points", [])
        meeting.action_items = ai_summary.get("action_items", [])
        meeting.ended_at = datetime.utcnow()
        
        db.commit()
        
        logger.info(f"Meeting {meeting_id} processed successfully")
        
        return {
            "message": "Audio processed successfully",
            "transcript": full_transcript,
            "summary": ai_summary
        }
        
    except Exception as e:
        logger.error(f"Error processing audio for meeting {meeting_id}: {str(e)}")
        meeting.status = "failed"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process audio: {str(e)}"
        )


@router.post("/{meeting_id}/stop")
async def stop_meeting(
    meeting_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Stop a meeting recording"""
    
    meeting = db.query(models.Meeting).filter(
        models.Meeting.id == meeting_id,
        models.Meeting.user_id == current_user.id
    ).first()
    
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found"
        )
    
    meeting.status = "completed"
    meeting.ended_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Meeting stopped successfully"}


@router.post("/{meeting_id}/highlights", response_model=HighlightResponse)
async def create_highlight(
    meeting_id: int,
    highlight_data: HighlightCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a highlight/clip for a meeting"""
    
    meeting = db.query(models.Meeting).filter(
        models.Meeting.id == meeting_id,
        models.Meeting.user_id == current_user.id
    ).first()
    
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found"
        )
    
    # Get transcript for the highlight time range
    transcripts = db.query(models.Transcript).filter(
        models.Transcript.meeting_id == meeting_id,
        models.Transcript.start_time >= highlight_data.start_time,
        models.Transcript.end_time <= highlight_data.end_time
    ).all()
    
    transcript_text = " ".join([t.text for t in transcripts])
    
    # Create highlight
    new_highlight = models.Highlight(
        meeting_id=meeting_id,
        title=highlight_data.title,
        description=highlight_data.description,
        start_time=highlight_data.start_time,
        end_time=highlight_data.end_time,
        transcript_text=transcript_text
    )
    
    db.add(new_highlight)
    db.commit()
    db.refresh(new_highlight)
    
    logger.info(f"Created highlight {new_highlight.id} for meeting {meeting_id}")
    return new_highlight


@router.get("/{meeting_id}/highlights", response_model=List[HighlightResponse])
async def get_highlights(
    meeting_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all highlights for a meeting"""
    
    meeting = db.query(models.Meeting).filter(
        models.Meeting.id == meeting_id,
        models.Meeting.user_id == current_user.id
    ).first()
    
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found"
        )
    
    highlights = db.query(models.Highlight).filter(
        models.Highlight.meeting_id == meeting_id
    ).all()
    
    return highlights
