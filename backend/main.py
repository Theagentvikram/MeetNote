#!/usr/bin/env python3
"""
MeetNote Backend — Groq-powered transcription + summarisation.
Accepts multipart/form-data audio uploads from the Swift desktop app.
When mic_file and sys_file are provided, transcribes each separately and
returns a speaker-labeled transcript with YOU/OTHER segments.
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

app = FastAPI(title="MeetNote", version="2.1.0")

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
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat(), "version": "2.1.0"}


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

    When mic_file + sys_file are both present, each track is transcribed
    separately and merged into a speaker-labeled transcript:
      YOU: <text>
      OTHER: <text>
    """
    meeting_id = str(uuid.uuid4())
    logger.info(f"[{meeting_id}] Received upload: title={title!r}")

    mic_present = mic_file is not None and mic_file.filename
    sys_present = sys_file is not None and sys_file.filename
    logger.info(f"[{meeting_id}] Tracks received: merged=✅, mic={'✅' if mic_present else '❌'}, sys={'✅' if sys_present else '❌'}")

    suffix = f".{format}" if format else ".m4a"
    lang_arg = language if language != "auto" else None

    diarized_transcript = None
    speakers = None

    try:
        if mic_present and sys_present:
            # Dual-track: transcribe each separately → speaker-labeled
            mic_bytes = await mic_file.read()
            sys_bytes = await sys_file.read()

            transcript = ""
            duration = 0

            if len(mic_bytes) > 0 and len(sys_bytes) > 0:
                transcript, duration, diarized_transcript, speakers = await _transcribe_dual(
                    mic_bytes, sys_bytes, suffix, lang_arg, meeting_id
                )
            else:
                # Fall back to merged
                audio_bytes = await audio_file.read()
                transcript, duration = await _transcribe_single(
                    audio_bytes, suffix, lang_arg, audio_file.filename, meeting_id
                )
        else:
            # Single merged track
            audio_bytes = await audio_file.read()
            if len(audio_bytes) == 0:
                raise HTTPException(status_code=400, detail="Empty audio file")
            transcript, duration = await _transcribe_single(
                audio_bytes, suffix, lang_arg, audio_file.filename, meeting_id
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{meeting_id}] Transcription error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    # Summarise with the plain-text version (strip speaker labels for context)
    plain_transcript = _strip_labels(transcript)
    ai_title, summary, key_points, action_items = await _summarise(plain_transcript, title, meeting_id)
    meeting_title = ai_title if ai_title else title

    response = {
        "id": meeting_id,
        "title": meeting_title,
        "transcript": transcript,          # may contain YOU:/OTHER: labels
        "summary": summary,
        "key_points": key_points,
        "action_items": action_items,
        "duration": duration,
        "confidence": 0.92,
        "language": lang_arg or "en",
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    if diarized_transcript is not None:
        response["diarized_transcript"] = diarized_transcript
    if speakers is not None:
        response["speakers"] = speakers
    return response


# ── Transcription helpers ─────────────────────────────────────────────────────

async def _transcribe_single(audio_bytes: bytes, suffix: str, language, filename, meeting_id: str):
    """Transcribe a single audio file. Returns (transcript_text, duration_seconds)."""
    logger.info(f"[{meeting_id}] Transcribing {len(audio_bytes)//1024}KB single track…")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        with open(tmp_path, "rb") as f:
            resp = client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=(filename or f"audio{suffix}", f),
                language=language,
                response_format="verbose_json",
            )
        return resp.text.strip(), int(getattr(resp, "duration", 0))
    finally:
        os.unlink(tmp_path)


async def _transcribe_dual(mic_bytes: bytes, sys_bytes: bytes, suffix: str, language, meeting_id: str):
    """
    Transcribe mic (YOU) and system (OTHER) tracks separately,
    then merge them into a readable conversation by timestamp.
    """
    logger.info(f"[{meeting_id}] Dual-track transcription: mic={len(mic_bytes)//1024}KB, sys={len(sys_bytes)//1024}KB")

    mic_path = sys_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(mic_bytes)
            mic_path = f.name
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(sys_bytes)
            sys_path = f.name

        # Transcribe with verbose_json to get word/segment timestamps
        with open(mic_path, "rb") as f:
            mic_resp = client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=(f"mic{suffix}", f),
                language=language,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )
        with open(sys_path, "rb") as f:
            sys_resp = client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=(f"sys{suffix}", f),
                language=language,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )

    finally:
        if mic_path: os.unlink(mic_path)
        if sys_path: os.unlink(sys_path)

    duration = max(
        int(getattr(mic_resp, "duration", 0)),
        int(getattr(sys_resp, "duration", 0)),
    )

    # Build labeled segments with timestamps for interleaving
    mic_segments = _extract_segments(mic_resp, "YOU")
    sys_segments = _extract_segments(sys_resp, "OTHER")

    logger.info(
        f"[{meeting_id}] Groq results — mic: {len(mic_segments)} segs, "
        f"text={repr(mic_resp.text[:80])}; "
        f"sys: {len(sys_segments)} segs, text={repr(sys_resp.text[:80])}"
    )

    if not mic_segments and not sys_segments:
        return "", duration, [], {}

    # Merge and sort by start time
    all_segments = mic_segments + sys_segments
    all_segments.sort(key=lambda s: s["start"])

    # Collapse adjacent same-speaker segments, format output
    lines = []
    diarized = []
    cur_speaker = None
    cur_text = []
    cur_start = 0.0

    for seg in all_segments:
        text = seg["text"].strip()
        if not text:
            continue
        if seg["speaker"] == cur_speaker:
            cur_text.append(text)
        else:
            if cur_speaker and cur_text:
                merged_text = ' '.join(cur_text)
                lines.append(f"{cur_speaker}: {merged_text}")
                diarized.append({"speaker": "you" if cur_speaker == "YOU" else "other", "text": merged_text, "start": cur_start})
            cur_speaker = seg["speaker"]
            cur_text = [text]
            cur_start = seg["start"]

    if cur_speaker and cur_text:
        merged_text = ' '.join(cur_text)
        lines.append(f"{cur_speaker}: {merged_text}")
        diarized.append({"speaker": "you" if cur_speaker == "YOU" else "other", "text": merged_text, "start": cur_start})

    transcript = "\n".join(lines)
    speakers = {"you": "You", "other": "Other"}
    logger.info(f"[{meeting_id}] Dual transcript: {len(lines)} speaker turns, diarized={len(diarized)} segs")
    return transcript, duration, diarized, speakers


def _extract_segments(resp, speaker_label: str):
    """Extract timed segments from a Whisper verbose_json response."""
    segments = getattr(resp, "segments", None) or []
    result = []
    for seg in segments:
        start = getattr(seg, "start", 0.0) if not isinstance(seg, dict) else seg.get("start", 0.0)
        text = getattr(seg, "text", "") if not isinstance(seg, dict) else seg.get("text", "")
        result.append({"speaker": speaker_label, "start": float(start), "text": text})
    # Fallback: if no segments, treat whole text as one segment
    if not result and resp.text.strip():
        result.append({"speaker": speaker_label, "start": 0.0, "text": resp.text.strip()})
    return result


def _strip_labels(transcript: str) -> str:
    """Remove YOU:/OTHER: labels for LLM summarisation context."""
    lines = []
    for line in transcript.splitlines():
        if line.startswith("YOU: "):
            lines.append(line[5:])
        elif line.startswith("OTHER: "):
            lines.append(line[7:])
        else:
            lines.append(line)
    return "\n".join(lines)


# ── Summarisation helper ──────────────────────────────────────────────────────

async def _summarise(transcript: str, title: str, meeting_id: str):
    if not transcript:
        return "", "No speech detected.", [], []

    prompt = f"""You are an expert meeting analyst. Analyse this meeting transcript and return ONLY valid JSON with no markdown.

Transcript:
{transcript[:8000]}

Return this exact JSON structure:
{{
  "title": "Short specific meeting title (4-8 words, no generic words like Meeting or Discussion). Capture the actual topic. Examples: Q2 Launch Plan Review, Onboarding Sarah Chen, API Rate Limit Debugging.",
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
        ai_title = parsed.get("title", "")
        summary = parsed.get("summary", "")
        key_points = parsed.get("keyPoints", [])
        action_items = parsed.get("actionItems", [])
        logger.info(f"[{meeting_id}] Summary OK: title={ai_title!r}, {len(key_points)} key points, {len(action_items)} actions")
        return ai_title, summary, key_points, action_items

    except Exception as e:
        logger.warning(f"[{meeting_id}] Summarisation failed: {e}")
        return "", transcript[:300] + ("…" if len(transcript) > 300 else ""), [], []


# ── Meetings list ─────────────────────────────────────────────────────────────

@app.get("/api/meetings")
async def list_meetings():
    return {"meetings": [], "total": 0}
