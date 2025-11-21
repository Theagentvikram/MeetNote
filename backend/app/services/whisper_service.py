"""
Whisper AI Service for audio transcription
Uses faster-whisper for efficient CPU inference
"""

import os
import logging
import asyncio
from typing import Optional, Dict, Any
import tempfile
import numpy as np
from faster_whisper import WhisperModel
import soundfile as sf
from io import BytesIO

from app.core.config import settings

logger = logging.getLogger(__name__)


class WhisperService:
    """Service for audio transcription using Whisper AI"""
    
    def __init__(self):
        self.model: Optional[WhisperModel] = None
        self.ready = False
        self.lock = asyncio.Lock()
    
    async def initialize(self):
        """Initialize the Whisper model"""
        try:
            logger.info(f"Loading Whisper model: {settings.WHISPER_MODEL}")
            
            # Load faster-whisper model
            # Models: tiny, base, small, medium, large-v2, large-v3
            # Device: cpu or cuda
            # Compute type: int8, float16, float32
            self.model = WhisperModel(
                settings.WHISPER_MODEL,
                device=settings.WHISPER_DEVICE,
                compute_type=settings.WHISPER_COMPUTE_TYPE
            )
            
            self.ready = True
            logger.info("Whisper model loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {str(e)}")
            self.ready = False
            raise
    
    def is_ready(self) -> bool:
        """Check if model is ready"""
        return self.ready and self.model is not None
    
    async def transcribe_file(self, audio_path: str, language: str = "en") -> Dict[str, Any]:
        """
        Transcribe an audio file
        
        Args:
            audio_path: Path to audio file
            language: Language code (e.g., 'en', 'es', 'fr')
        
        Returns:
            Dictionary with transcription results
        """
        if not self.is_ready():
            raise RuntimeError("Whisper model not initialized")
        
        try:
            async with self.lock:
                # Transcribe with faster-whisper
                segments, info = self.model.transcribe(
                    audio_path,
                    language=language,
                    beam_size=5,
                    vad_filter=True,  # Voice Activity Detection
                    vad_parameters=dict(min_silence_duration_ms=500)
                )
                
                # Collect all segments
                full_text = []
                transcript_segments = []
                
                for segment in segments:
                    full_text.append(segment.text)
                    transcript_segments.append({
                        "start": segment.start,
                        "end": segment.end,
                        "text": segment.text.strip(),
                        "confidence": segment.avg_logprob
                    })
                
                result = {
                    "text": " ".join(full_text),
                    "language": info.language,
                    "language_probability": info.language_probability,
                    "duration": info.duration,
                    "segments": transcript_segments
                }
                
                logger.info(f"Transcribed audio: {len(transcript_segments)} segments, {info.duration:.2f}s")
                return result
                
        except Exception as e:
            logger.error(f"Transcription error: {str(e)}")
            raise
    
    async def transcribe_chunk(self, audio_data: bytes) -> Optional[Dict[str, Any]]:
        """
        Transcribe an audio chunk (for real-time streaming)
        
        Args:
            audio_data: Raw audio bytes
        
        Returns:
            Dictionary with transcription or None if too short
        """
        if not self.is_ready():
            raise RuntimeError("Whisper model not initialized")
        
        try:
            # Save audio chunk to temporary file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
                tmp_path = tmp_file.name
                tmp_file.write(audio_data)
            
            # Transcribe
            result = await self.transcribe_file(tmp_path)
            
            # Clean up
            os.unlink(tmp_path)
            
            return {
                "text": result["text"],
                "timestamp": result["segments"][0]["start"] if result["segments"] else 0.0,
                "confidence": result["segments"][0]["confidence"] if result["segments"] else 0.0
            }
            
        except Exception as e:
            logger.error(f"Chunk transcription error: {str(e)}")
            return None
    
    async def transcribe_base64(self, base64_audio: str, language: str = "en") -> Dict[str, Any]:
        """
        Transcribe base64 encoded audio
        
        Args:
            base64_audio: Base64 encoded audio data
            language: Language code
        
        Returns:
            Dictionary with transcription results
        """
        import base64
        
        # Decode base64
        audio_bytes = base64.b64decode(base64_audio)
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
            tmp_path = tmp_file.name
            tmp_file.write(audio_bytes)
        
        try:
            result = await self.transcribe_file(tmp_path, language)
            return result
        finally:
            os.unlink(tmp_path)
    
    def cleanup(self):
        """Clean up resources"""
        self.model = None
        self.ready = False
        logger.info("Whisper service cleaned up")
