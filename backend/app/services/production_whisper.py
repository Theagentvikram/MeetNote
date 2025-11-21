"""
Production Whisper Service for DigitalOcean
Full faster-whisper implementation with 1GB RAM support
"""

import asyncio
import logging
import tempfile
import os
import time
from typing import Optional, Dict, Any, List
from pathlib import Path
import io

try:
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False
    logging.warning("faster-whisper not available, using mock transcription")

import librosa
import numpy as np
import soundfile as sf

from app.core.production_config import settings

logger = logging.getLogger(__name__)

class ProductionWhisperService:
    """Production-grade Whisper transcription service"""
    
    def __init__(self):
        self.model = None
        self.model_loaded = False
        self.total_transcription_time = 0
        self.total_audio_duration = 0
        
        if WHISPER_AVAILABLE:
            self._load_model()
        else:
            logger.warning("Whisper not available - using mock transcription")
    
    def _load_model(self):
        """Load Whisper model with production optimizations"""
        try:
            logger.info(f"Loading Whisper model: {settings.WHISPER_MODEL}")
            start_time = time.time()
            
            # Production model configuration
            self.model = WhisperModel(
                settings.WHISPER_MODEL,
                device=settings.WHISPER_DEVICE,
                compute_type=settings.WHISPER_COMPUTE_TYPE,
                cpu_threads=2,  # Optimize for DO's 1 vCPU
                num_workers=1,  # Single worker for memory efficiency
                download_root="/tmp/whisper_models"  # Use /tmp for DO
            )
            
            load_time = time.time() - start_time
            self.model_loaded = True
            
            logger.info(f"✅ Whisper model loaded in {load_time:.2f}s")
            logger.info(f"Model: {settings.WHISPER_MODEL}")
            logger.info(f"Device: {settings.WHISPER_DEVICE}")
            logger.info(f"Compute: {settings.WHISPER_COMPUTE_TYPE}")
            
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            self.model_loaded = False
            self.model = None
    
    async def transcribe_audio(self, audio_data: bytes, language: str = None) -> Dict[str, Any]:
        """
        Transcribe audio data with full production features
        
        Args:
            audio_data: Raw audio bytes
            language: Optional language hint (e.g., 'en', 'es')
        
        Returns:
            Dict with transcription results
        """
        if not self.model_loaded or not WHISPER_AVAILABLE:
            return self._mock_transcription(len(audio_data))
        
        try:
            # Process audio in a thread to avoid blocking
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None, 
                self._transcribe_sync,
                audio_data,
                language
            )
            return result
            
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            return {
                "text": f"Transcription error: {str(e)}",
                "segments": [],
                "language": language or "unknown",
                "confidence": 0.0,
                "processing_time": 0.0,
                "error": True
            }
    
    def _transcribe_sync(self, audio_data: bytes, language: str = None) -> Dict[str, Any]:
        """Synchronous transcription processing"""
        start_time = time.time()
        
        try:
            # Create temporary file for audio processing
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
                temp_path = temp_file.name
                
                # Convert audio data to proper format
                audio_array = self._process_audio_data(audio_data)
                
                # Save as WAV file for Whisper
                sf.write(temp_path, audio_array, settings.SAMPLE_RATE)
                
                # Transcribe with Whisper
                segments, info = self.model.transcribe(
                    temp_path,
                    language=language,
                    beam_size=settings.WHISPER_BEAM_SIZE,
                    vad_filter=settings.WHISPER_VAD_FILTER,
                    vad_parameters=dict(
                        min_silence_duration_ms=500,
                        max_speech_duration_s=30
                    ),
                    word_timestamps=True,
                    temperature=0.0  # Deterministic output
                )
                
                # Process segments
                segments_list = []
                full_text = ""
                
                for segment in segments:
                    segment_dict = {
                        "start": round(segment.start, 2),
                        "end": round(segment.end, 2),
                        "text": segment.text.strip(),
                        "confidence": round(segment.avg_logprob, 3),
                        "words": []
                    }
                    
                    # Add word-level timestamps if available
                    if hasattr(segment, 'words') and segment.words:
                        for word in segment.words:
                            segment_dict["words"].append({
                                "start": round(word.start, 2),
                                "end": round(word.end, 2),
                                "word": word.word,
                                "probability": round(word.probability, 3)
                            })
                    
                    segments_list.append(segment_dict)
                    full_text += segment.text
                
                # Calculate metrics
                processing_time = time.time() - start_time
                audio_duration = len(audio_array) / settings.SAMPLE_RATE
                
                # Update stats
                self.total_transcription_time += processing_time
                self.total_audio_duration += audio_duration
                
                # Clean up temp file
                os.unlink(temp_path)
                
                result = {
                    "text": full_text.strip(),
                    "segments": segments_list,
                    "language": info.language,
                    "language_probability": round(info.language_probability, 3),
                    "confidence": np.mean([s["confidence"] for s in segments_list]) if segments_list else 0.0,
                    "processing_time": round(processing_time, 2),
                    "audio_duration": round(audio_duration, 2),
                    "real_time_factor": round(processing_time / audio_duration if audio_duration > 0 else 0, 2),
                    "model": settings.WHISPER_MODEL,
                    "error": False
                }
                
                logger.info(f"Transcribed {audio_duration:.1f}s audio in {processing_time:.1f}s (RTF: {result['real_time_factor']:.2f})")
                
                return result
                
        except Exception as e:
            logger.error(f"Sync transcription error: {e}")
            raise e
    
    def _process_audio_data(self, audio_data: bytes) -> np.ndarray:
        """Convert audio bytes to numpy array at correct sample rate"""
        import tempfile
        import os
        
        temp_path = None
        try:
            # Create temp file with .webm extension so librosa/ffmpeg knows the format
            with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as temp_file:
                temp_path = temp_file.name
                temp_file.write(audio_data)
            
            # Use librosa to load from FILE PATH (allows ffmpeg usage)
            audio_array, original_sr = librosa.load(
                temp_path, 
                sr=settings.SAMPLE_RATE,
                mono=True,
                dtype=np.float32
            )
            
            # Normalize audio
            if audio_array.max() > 0:
                audio_array = audio_array / audio_array.max() * 0.95
            
            return audio_array
            
        except Exception as e:
            logger.error(f"Audio processing error: {e}")
            # Return silence if processing fails
            return np.zeros(settings.SAMPLE_RATE * 1, dtype=np.float32)  # 1 second of silence
        finally:
            # Clean up temp file
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except Exception:
                    pass
    
    def _mock_transcription(self, audio_size: int) -> Dict[str, Any]:
        """Mock transcription for testing/fallback"""
        duration = audio_size / (settings.SAMPLE_RATE * 2)  # Estimate duration
        
        mock_texts = [
            "This is a mock transcription for testing purposes.",
            "The meeting is being recorded and transcribed.",
            "Please note this is a demonstration transcript.",
            "Real Whisper AI will provide actual transcription."
        ]
        
        import random
        text = random.choice(mock_texts)
        
        return {
            "text": text,
            "segments": [{
                "start": 0.0,
                "end": duration,
                "text": text,
                "confidence": 0.95,
                "words": []
            }],
            "language": "en",
            "language_probability": 0.99,
            "confidence": 0.95,
            "processing_time": 0.1,
            "audio_duration": duration,
            "real_time_factor": 0.1 / max(duration, 0.1),
            "model": "mock",
            "error": False,
            "mock": True
        }
    
    async def transcribe_chunk(self, audio_chunk: bytes, chunk_id: int = 0) -> Dict[str, Any]:
        """Transcribe a streaming audio chunk"""
        result = await self.transcribe_audio(audio_chunk)
        result["chunk_id"] = chunk_id
        result["timestamp"] = time.time()
        return result
    
    def get_stats(self) -> Dict[str, Any]:
        """Get transcription service statistics"""
        avg_rtf = (self.total_transcription_time / self.total_audio_duration 
                  if self.total_audio_duration > 0 else 0)
        
        return {
            "model_loaded": self.model_loaded,
            "whisper_available": WHISPER_AVAILABLE,
            "model": settings.WHISPER_MODEL if self.model_loaded else "none",
            "total_audio_hours": round(self.total_audio_duration / 3600, 2),
            "total_processing_time": round(self.total_transcription_time, 2),
            "average_real_time_factor": round(avg_rtf, 3),
            "device": settings.WHISPER_DEVICE,
            "compute_type": settings.WHISPER_COMPUTE_TYPE
        }


# Global instance
whisper_service = ProductionWhisperService()