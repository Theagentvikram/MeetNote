"""
Local transcription via faster-whisper — free, unlimited, no rate limits.
Used for live mode so realtime streaming isn't throttled by Groq.

Decodes webm/opus (or any container) blobs with PyAV → float32 16kHz mono →
faster-whisper. Model is loaded once (lazy) and cached.
"""

import asyncio
import io
import logging
import os

import av
import numpy as np
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000

# Accuracy > speed: 'small' is a good balance and not "jibberish".
# Override with LIVE_WHISPER_MODEL=base|small|medium if needed.
_MODEL_NAME = os.getenv("LIVE_WHISPER_MODEL", "small")
_model: WhisperModel | None = None


def _load_model() -> WhisperModel:
    global _model
    if _model is None:
        logger.info(f"Loading faster-whisper '{_MODEL_NAME}' (first run downloads model)…")
        _model = WhisperModel(_MODEL_NAME, device="cpu", compute_type="int8")
        logger.info("faster-whisper ready.")
    return _model


def _decode_audio(audio_bytes: bytes) -> np.ndarray:
    """Decode arbitrary audio container bytes → float32 mono 16kHz array."""
    container = av.open(io.BytesIO(audio_bytes))
    resampler = av.AudioResampler(format="fltp", layout="mono", rate=SAMPLE_RATE)
    frames: list[np.ndarray] = []
    try:
        for frame in container.decode(audio=0):
            for resampled in resampler.resample(frame):
                frames.append(resampled.to_ndarray()[0])
    finally:
        container.close()
    if not frames:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(frames).astype(np.float32)


def _transcribe_sync(audio_bytes: bytes, language: str | None) -> str:
    audio = _decode_audio(audio_bytes)
    if audio.size < SAMPLE_RATE // 3:  # < ~0.33s → skip
        return ""
    model = _load_model()
    segments, _ = model.transcribe(
        audio,
        language=None if (not language or language == "auto") else language,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 300},
        beam_size=5,  # better accuracy
    )
    return " ".join(s.text.strip() for s in segments).strip()


async def transcribe(audio_bytes: bytes, language: str | None = "en") -> str:
    """Non-blocking transcription of one audio blob."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _transcribe_sync, audio_bytes, language)
