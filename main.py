#!/usr/bin/env python3
"""
MeetNote Backend — Groq-powered transcription + summarisation.
Accepts multipart/form-data audio uploads from the Swift desktop app.
"""

import os
import json
import uuid
import tempfile
import logging
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MeetNote", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.environ["GROQ_API_KEY"])


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/")
@app.get("/api/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat(), "version": "2.0.0"}


# ── Transcription ─────────────────────────────────────────────────────────────

@app.post("/api/transcription/audio")
async def transcribe(
    audio_file: UploadFile = File(...),
    mic_file: Optional[UploadFile] = File(None),
    sys_file: Optional[UploadFile] = File(None),
    title: Optional[str] = Form("Meeting Recording"),
    format: Optional[str] = Form("m4a"),
    language: Optional[str] = Form("en"),
):
    """
    Receives audio from the Swift app, transcribes with Groq Whisper,
    summarises with LLaMA 3, and returns the full meeting payload.
    """
    meeting_id = str(uuid.uuid4())
    logger.info(f"[{meeting_id}] Received upload: title={title!r}")

    # Pick the best audio track: prefer mic (cleanest voice), fall back to merged
    primary = mic_file if mic_file else audio_file

    try:
        audio_bytes = await primary.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read audio: {e}")

    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")

    # Whisper needs a real file on disk
    suffix = f".{format}" if format else ".m4a"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        # ── Step 1: Transcribe ────────────────────────────────────────────────
        logger.info(f"[{meeting_id}] Transcribing {len(audio_bytes)//1024}KB audio…")
        with open(tmp_path, "rb") as f:
            whisper_resp = client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=(primary.filename or f"audio{suffix}", f),
                language=language if language != "auto" else None,
                response_format="verbose_json",
            )

        transcript = whisper_resp.text.strip()
        duration = int(getattr(whisper_resp, "duration", 0))
        detected_lang = getattr(whisper_resp, "language", language or "en")
        logger.info(f"[{meeting_id}] Transcript: {len(transcript)} chars, {duration}s")

        # ── Step 2: Summarise with LLaMA ─────────────────────────────────────
        summary, key_points, action_items = await _summarise(transcript, title, meeting_id)

    finally:
        os.unlink(tmp_path)

    return {
        "id": meeting_id,
        "title": title,
        "transcript": transcript,
        "summary": summary,
        "key_points": key_points,
        "action_items": action_items,
        "duration": duration,
        "confidence": 0.92,
        "language": detected_lang,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }


# ── Summarisation helper ──────────────────────────────────────────────────────

async def _summarise(transcript: str, title: str, meeting_id: str):
    if not transcript:
        return "No speech detected.", [], []

    prompt = f"""You are an expert meeting analyst. Analyse this meeting transcript and return ONLY valid JSON with no markdown.

Meeting title: {title}
Transcript:
{transcript[:8000]}

Return this exact JSON structure:
{{
  "summary": "2-3 sentence executive summary of the meeting",
  "keyPoints": ["key point 1", "key point 2", "key point 3"],
  "actionItems": ["action item 1", "action item 2"]
}}"""

    try:
        logger.info(f"[{meeting_id}] Summarising with LLaMA…")
        chat = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1024,
        )
        raw = chat.choices[0].message.content.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        parsed = json.loads(raw)
        summary = parsed.get("summary", "")
        key_points = parsed.get("keyPoints", [])
        action_items = parsed.get("actionItems", [])
        logger.info(f"[{meeting_id}] Summary OK: {len(key_points)} key points, {len(action_items)} actions")
        return summary, key_points, action_items

    except Exception as e:
        logger.warning(f"[{meeting_id}] Summarisation failed: {e}")
        # Graceful fallback — return transcript as-is
        return transcript[:300] + ("…" if len(transcript) > 300 else ""), [], []


# ── Meetings list (passthrough, storage not needed for MVP) ───────────────────

@app.get("/api/meetings")
async def list_meetings():
    return {"meetings": [], "total": 0}
