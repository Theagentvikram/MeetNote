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
import asyncio
import tempfile
import logging
from datetime import datetime
from typing import Optional
from threading import Lock

from fastapi import FastAPI, File, Form, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
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

_GROQ_CLIENT: Optional[Groq] = None


def _groq_client() -> Groq:
    global _GROQ_CLIENT
    if _GROQ_CLIENT is not None:
        return _GROQ_CLIENT

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not set")

    _GROQ_CLIENT = Groq(api_key=api_key)
    return _GROQ_CLIENT

DATA_DIR = os.getenv("MEETNOTE_DATA_DIR", "./data")
MEETINGS_FILE = os.path.join(DATA_DIR, "meetings.json")
_MEETINGS_LOCK = Lock()


def _load_meetings() -> list:
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(MEETINGS_FILE):
        return []
    try:
        with open(MEETINGS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception as e:
        logger.warning(f"Failed to load meetings store: {e}")
        return []


def _save_meetings(meetings: list) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp_path = f"{MEETINGS_FILE}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(meetings, f, ensure_ascii=False)
    os.replace(tmp_path, MEETINGS_FILE)


def _upsert_meeting(meeting: dict) -> None:
    with _MEETINGS_LOCK:
        meetings = _load_meetings()
        mid = str(meeting.get("id", ""))
        meetings = [m for m in meetings if str(m.get("id", "")) != mid]
        meetings.insert(0, meeting)
        _save_meetings(meetings)


def _list_meetings() -> list:
    with _MEETINGS_LOCK:
        meetings = _load_meetings()
    meetings.sort(key=lambda m: m.get("created_at", ""), reverse=True)
    return meetings


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/")
@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "2.1.0",
        "groq_configured": bool(os.getenv("GROQ_API_KEY")),
    }


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
    confidence = 0.0

    try:
        if mic_present and sys_present:
            # Dual-track: transcribe each separately → speaker-labeled
            mic_bytes = await mic_file.read()
            sys_bytes = await sys_file.read()

            transcript = ""
            duration = 0

            if len(mic_bytes) > 0 and len(sys_bytes) > 0:
                transcript, duration, diarized_transcript, speakers, confidence = await _transcribe_dual(
                    mic_bytes, sys_bytes, suffix, lang_arg, meeting_id
                )
            else:
                # Fall back to merged
                audio_bytes = await audio_file.read()
                transcript, duration, confidence = await _transcribe_single(
                    audio_bytes, suffix, lang_arg, audio_file.filename, meeting_id
                )
        else:
            # Single merged track
            audio_bytes = await audio_file.read()
            if len(audio_bytes) == 0:
                raise HTTPException(status_code=400, detail="Empty audio file")
            transcript, duration, confidence = await _transcribe_single(
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
        "confidence": round(confidence, 2) if confidence else 0.9,
        "language": lang_arg or "en",
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    if diarized_transcript is not None:
        response["diarized_transcript"] = diarized_transcript
    if speakers is not None:
        response["speakers"] = speakers

    _upsert_meeting(response)
    return response


# ── Live transcription (Groq whisper-large-v3 + anti-hallucination) ─────────────

# Whisper hallucinates fixed phrases on silence/noise. Drop these outright.
_HALLUCINATION_PHRASES = {
    "thank you", "thanks for watching", "thank you for watching",
    "please subscribe", "you", ".", "...", "bye", "okay", "thank you.",
    "thanks", "thank you very much", "i'm sorry", "uh", "um", "hmm",
    "subscribe", "like and subscribe", "see you next time", "yeah",
    "thank you so much", "thank you for your attention",
}


def _looks_hallucinated(text: str) -> bool:
    t = text.strip().lower()
    if not t:
        return True
    if t in _HALLUCINATION_PHRASES:
        return True
    # Heavy repetition (e.g. "I'm fucking around. I'm fucking around.") → hallucination.
    words = t.split()
    if len(words) >= 6:
        uniq = len(set(words))
        if uniq / len(words) < 0.4:  # <40% unique words
            return True
    return False


# Anchors Whisper so it transcribes verbatim instead of inventing fluent-sounding
# filler. Helps a lot on short / noisy meeting clips.
_TRANSCRIBE_PROMPT = (
    "The following is a clear business meeting conversation. "
    "Transcribe exactly what is said, verbatim, without adding or repeating words."
)


def _keep_confident_segments(resp):
    """
    Return only Whisper segments that look like real, confident speech.
    Whisper flags invented speech with high no_speech_prob + very low avg_logprob;
    we also drop near-duplicate consecutive segments (the classic repetition loop).
    """
    segments = getattr(resp, "segments", None) or []
    kept = []
    prev_norm = None
    for s in segments:
        g = (lambda k, d: s.get(k, d) if isinstance(s, dict) else getattr(s, k, d))
        no_speech = float(g("no_speech_prob", 0.0) or 0.0)
        avg_lp = float(g("avg_logprob", 0.0) or 0.0)
        seg_text = (g("text", "") or "").strip()
        if not seg_text:
            continue
        if no_speech > 0.6:          # likely silence/noise
            continue
        if avg_lp < -1.0:            # very low confidence → hallucination
            continue
        norm = seg_text.lower()
        if norm == prev_norm:        # exact repeat of previous segment → loop
            continue
        prev_norm = norm
        kept.append(seg_text)
    return kept


def _collapse_repetition(text: str) -> str:
    """Remove repeated phrases/sentences Whisper loops on (exact and near-exact)."""
    import re as _re
    # collapse an exactly repeated run of words that appears back-to-back
    text = _re.sub(r"\b(\w[\w ,'-]{8,}?)\s+\1\b", r"\1", text, flags=_re.IGNORECASE)
    # collapse repeated single words ("the the the")
    text = _re.sub(r"\b(\w+)( \1\b){2,}", r"\1", text, flags=_re.IGNORECASE)
    text = _re.sub(r"\s{2,}", " ", text).strip()

    # Drop near-duplicate sentences: Whisper often loops the same clause with tiny
    # variations. Keep first occurrence, skip later ones with high word overlap.
    parts = _re.split(r"(?<=[.!?])\s+", text)
    seen = []
    out = []
    for p in parts:
        words = set(_re.findall(r"\w+", p.lower()))
        if len(words) >= 4 and any(
            len(words & s) / max(1, len(words | s)) > 0.7 for s in seen
        ):
            continue
        seen.append(words)
        out.append(p)
    return " ".join(out).strip()


def _avg_confidence(resp) -> float:
    """Mean per-segment confidence derived from avg_logprob, clamped to [0,1]."""
    import math as _math
    segments = getattr(resp, "segments", None) or []
    lps = []
    for s in segments:
        g = (lambda k, d: s.get(k, d) if isinstance(s, dict) else getattr(s, k, d))
        lp = g("avg_logprob", None)
        if lp is not None:
            lps.append(float(lp))
    if not lps:
        return 0.0
    # avg_logprob is ~[-1, 0]; map to a probability-ish score
    return max(0.0, min(1.0, _math.exp(sum(lps) / len(lps))))


async def _live_transcribe(audio_bytes: bytes, language, meeting_id: str, speaker: str = "?") -> str:
    """
    Transcribe one live blob with Groq whisper-large-v3 (accurate, low hallucination).
    Filters known hallucination patterns and low-confidence Whisper segments.
    """
    logger.info(f"[{meeting_id}] {speaker} blob {len(audio_bytes)//1024}KB -> Groq")

    def _do():
        import io as _io
        f = _io.BytesIO(audio_bytes)
        f.name = "live.webm"
        return _groq_client().audio.transcriptions.create(
            model="whisper-large-v3",
            file=("live.webm", f),
            language=None if (not language or language == "auto") else language,
            response_format="verbose_json",
            temperature=0.0,
        )

    try:
        resp = await asyncio.get_event_loop().run_in_executor(None, _do)
    except Exception as e:
        logger.warning(f"[{meeting_id}] live groq transcribe failed: {e}")
        return ""

    # Use per-segment confidence to reject hallucinations: whisper marks invented
    # speech with high no_speech_prob and very low avg_logprob.
    segments = getattr(resp, "segments", None) or []
    kept = []
    for s in segments:
        g = (lambda k, d: s.get(k, d) if isinstance(s, dict) else getattr(s, k, d))
        no_speech = float(g("no_speech_prob", 0.0) or 0.0)
        avg_lp = float(g("avg_logprob", 0.0) or 0.0)
        seg_text = (g("text", "") or "").strip()
        if no_speech > 0.6:      # likely no real speech
            continue
        if avg_lp < -1.0:        # very low confidence → hallucination
            continue
        if seg_text:
            kept.append(seg_text)

    text = " ".join(kept).strip() if segments else (getattr(resp, "text", "") or "").strip()

    if _looks_hallucinated(text):
        return ""
    return text


# ── Transcription helpers ─────────────────────────────────────────────────────

async def _transcribe_single(audio_bytes: bytes, suffix: str, language, filename, meeting_id: str):
    """Transcribe a single audio file. Returns (transcript_text, duration_seconds, confidence)."""
    logger.info(f"[{meeting_id}] Transcribing {len(audio_bytes)//1024}KB single track…")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        with open(tmp_path, "rb") as f:
            resp = _groq_client().audio.transcriptions.create(
                model="whisper-large-v3",
                file=(filename or f"audio{suffix}", f),
                language=language,
                response_format="verbose_json",
                temperature=0.0,
                prompt=_TRANSCRIBE_PROMPT,
            )
        kept = _keep_confident_segments(resp)
        text = " ".join(kept).strip() if kept else (getattr(resp, "text", "") or "").strip()
        text = _collapse_repetition(text)
        return text, int(getattr(resp, "duration", 0)), _avg_confidence(resp)
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
            mic_resp = _groq_client().audio.transcriptions.create(
                model="whisper-large-v3",
                file=(f"mic{suffix}", f),
                language=language,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
                temperature=0.0,
                prompt=_TRANSCRIBE_PROMPT,
            )
        with open(sys_path, "rb") as f:
            sys_resp = _groq_client().audio.transcriptions.create(
                model="whisper-large-v3",
                file=(f"sys{suffix}", f),
                language=language,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
                temperature=0.0,
                prompt=_TRANSCRIBE_PROMPT,
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
        return "", duration, [], {}, 0.0

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
                merged_text = _collapse_repetition(' '.join(cur_text))
                lines.append(f"{cur_speaker}: {merged_text}")
                diarized.append({"speaker": "you" if cur_speaker == "YOU" else "other", "text": merged_text, "start": cur_start})
            cur_speaker = seg["speaker"]
            cur_text = [text]
            cur_start = seg["start"]

    if cur_speaker and cur_text:
        merged_text = _collapse_repetition(' '.join(cur_text))
        lines.append(f"{cur_speaker}: {merged_text}")
        diarized.append({"speaker": "you" if cur_speaker == "YOU" else "other", "text": merged_text, "start": cur_start})

    transcript = "\n".join(lines)
    speakers = {"you": "You", "other": "Other"}
    confidence = max(_avg_confidence(mic_resp), _avg_confidence(sys_resp))
    logger.info(f"[{meeting_id}] Dual transcript: {len(lines)} speaker turns, diarized={len(diarized)} segs, conf={confidence:.2f}")
    return transcript, duration, diarized, speakers, confidence


def _extract_segments(resp, speaker_label: str):
    """Extract confident, de-duplicated timed segments from a Whisper response."""
    segments = getattr(resp, "segments", None) or []
    result = []
    prev_norm = None
    for seg in segments:
        g = (lambda k, d: seg.get(k, d) if isinstance(seg, dict) else getattr(seg, k, d))
        start = float(g("start", 0.0) or 0.0)
        text = (g("text", "") or "").strip()
        no_speech = float(g("no_speech_prob", 0.0) or 0.0)
        avg_lp = float(g("avg_logprob", 0.0) or 0.0)
        if not text:
            continue
        if no_speech > 0.6 or avg_lp < -1.0:   # silence/noise or hallucination
            continue
        norm = text.lower()
        if norm == prev_norm:                  # repeated segment loop
            continue
        prev_norm = norm
        result.append({"speaker": speaker_label, "start": start, "text": text})
    # Fallback: if filtering removed everything but there is raw text, keep it.
    if not result and (getattr(resp, "text", "") or "").strip():
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

def _chunk_text(text: str, size: int = 9000) -> list:
    """Split long transcript into chunks on line boundaries."""
    lines = text.split("\n")
    chunks, cur, cur_len = [], [], 0
    for ln in lines:
        if cur_len + len(ln) > size and cur:
            chunks.append("\n".join(cur)); cur, cur_len = [], 0
        cur.append(ln); cur_len += len(ln) + 1
    if cur:
        chunks.append("\n".join(cur))
    return chunks


def _condense_chunk(chunk: str, idx: int, meeting_id: str) -> str:
    """Summarise one transcript chunk into a dense paragraph (for long meetings)."""
    try:
        chat = _groq_client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content":
                f"Summarise this portion ({idx}) of a meeting transcript into a dense paragraph "
                f"capturing all decisions, topics, numbers, and action items. No preamble.\n\n{chunk}"}],
            temperature=0.2, max_tokens=600,
        )
        return chat.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"[{meeting_id}] chunk condense failed: {e}")
        return chunk[:2000]


async def _summarise(transcript: str, title: str, meeting_id: str):
    if not transcript:
        return "", "No speech detected.", [], []

    # Long meeting: map-reduce. Condense each chunk, then summarise the condensations.
    source = transcript
    if len(transcript) > 10000:
        logger.info(f"[{meeting_id}] Long transcript ({len(transcript)} chars) → chunked summarise")
        loop = asyncio.get_event_loop()
        chunks = _chunk_text(transcript)
        condensed = []
        for i, ch in enumerate(chunks):
            condensed.append(await loop.run_in_executor(None, _condense_chunk, ch, i + 1, meeting_id))
        source = "\n\n".join(condensed)

    prompt = f"""You are an expert meeting analyst. Analyse the transcript and return ONLY valid JSON.

Rules:
- Base everything strictly on the transcript. Do NOT invent facts, names, or numbers.
- If the transcript is too short, empty, or incoherent to analyse, say so honestly in the
  summary (e.g. "The recording was too short or unclear to extract a meaningful summary.")
  and return empty keyPoints / actionItems rather than making things up.
- Be specific and concrete when there IS substance: capture decisions, topics, numbers, names.

Transcript:
{source[:14000]}

Return exactly this JSON shape:
{{
  "title": "Short specific meeting title (4-8 words capturing the actual topic; avoid generic words)",
  "summary": "A clear executive summary: what was discussed, key points, decisions, and outcome. Multiple sentences when there is enough content.",
  "keyPoints": ["specific key point", "..."],
  "actionItems": ["concrete action item with owner/context if known", "..."]
}}"""

    try:
        logger.info(f"[{meeting_id}] Summarising with LLaMA…")
        chat = _groq_client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=2048,
            response_format={"type": "json_object"},
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


# ── Live coaching helpers ─────────────────────────────────────────────────────

def _recent_transcript_text(transcript: list, limit: int = 12) -> str:
    """Format the last `limit` transcript turns as plain context for the LLM."""
    recent = transcript[-limit:]
    return "\n".join(f"{t['speaker']}: {t['text']}" for t in recent if t.get("text"))


async def _suggest(transcript: list, meeting_id: str, full: bool = False) -> Optional[dict]:
    """
    Coaching insight. `full=True` (on-demand button) uses the ENTIRE conversation
    for maximum context and returns a deeper, more specific suggestion. `full=False`
    (auto-nudge) uses recent turns only. Returns {content, suggestion_type, confidence}.
    """
    if full:
        # Whole conversation (cap to keep within model limits).
        context = "\n".join(f"{t['speaker']}: {t['text']}" for t in transcript if t.get("text"))[-12000:]
    else:
        context = _recent_transcript_text(transcript)
    if not context:
        return None

    depth = (
        "Use the ENTIRE conversation below to deeply understand the context, goals, and "
        "what's unresolved. Give the single most valuable, specific thing YOU could say or "
        "ask next to move the conversation forward — a sharp question or an insightful point. "
        "Up to ~40 words."
        if full else
        "Read the recent conversation and suggest the single best thing YOU could say or ask "
        "next. Be specific and brief (one sentence, max ~25 words)."
    )

    prompt = f"""You are a meeting coach advising ONE participant ("YOU").
{depth}
Return ONLY valid JSON, no markdown.

Conversation:
{context}

Return this exact JSON:
{{
  "content": "the suggested thing to say or ask, phrased so YOU can say it directly",
  "suggestion_type": "one of: question, contribute, clarify, redirect",
  "confidence": "one of: high, medium, low"
}}"""

    try:
        chat = _groq_client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=300 if full else 200,
        )
        raw = chat.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw.strip())
        content = (parsed.get("content") or "").strip()
        if not content:
            return None
        return {
            "content": content,
            "suggestion_type": parsed.get("suggestion_type", "contribute"),
            "confidence": parsed.get("confidence", "medium"),
        }
    except Exception as e:
        logger.warning(f"[{meeting_id}] Suggestion failed: {e}")
        return None


def _llama_json(prompt: str, meeting_id: str, max_tokens: int = 400) -> dict | None:
    """Call LLaMA, parse JSON (tolerating code fences). Returns dict or None."""
    try:
        chat = _groq_client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=max_tokens,
        )
        raw = chat.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        logger.warning(f"[{meeting_id}] llama json failed: {e}")
        return None


async def _answer(transcript: list, meeting_id: str) -> Optional[dict]:
    """
    ANSWER mode: the other person asked something — give YOU a ready-to-say reply,
    grounded in the full conversation context.
    """
    context = "\n".join(f"{t['speaker']}: {t['text']}" for t in transcript if t.get("text"))[-12000:]
    if not context:
        return None

    prompt = f"""You are advising ONE participant ("You") in a live conversation.
The OTHER person has asked something or made a point. Based on the FULL conversation,
write the best answer YOU should say next — direct, natural, first-person, ready to speak
aloud. Ground it in what was actually discussed. ~50 words max.
Return ONLY valid JSON, no markdown.

Conversation:
{context}

Return: {{
  "content": "the answer YOU should say, first person, ready to speak",
  "suggestion_type": "answer",
  "confidence": "one of: high, medium, low"
}}"""

    parsed = await asyncio.get_event_loop().run_in_executor(None, _llama_json, prompt, meeting_id, 400)
    if not parsed:
        return None
    content = (parsed.get("content") or "").strip()
    if not content:
        return None
    return {
        "content": content,
        "suggestion_type": "answer",
        "confidence": parsed.get("confidence", "medium"),
    }


async def _insight(transcript: list, meeting_id: str) -> dict:
    """
    INSIGHT mode: what's happening + notes. A short read of the conversation state
    plus key bullet notes so far. Returns {summary, bullets}.
    """
    context = "\n".join(f"{t['speaker']}: {t['text']}" for t in transcript if t.get("text"))[-12000:]
    if not context:
        return {"summary": "Not enough conversation yet.", "bullets": []}

    prompt = f"""Analyse this live conversation so far for ONE participant ("You").
Give a brief read of what's happening and the key notes.
Return ONLY valid JSON, no markdown.

Conversation:
{context}

Return: {{
  "summary": "1-2 sentences on what's happening / where the conversation is",
  "bullets": ["key point or note", "another", "..."]
}}"""

    parsed = await asyncio.get_event_loop().run_in_executor(None, _llama_json, prompt, meeting_id, 500)
    if not parsed:
        return {"summary": "Could not generate insight.", "bullets": []}
    return {
        "summary": (parsed.get("summary") or "").strip(),
        "bullets": [b for b in parsed.get("bullets", []) if isinstance(b, str) and b.strip()],
    }


async def _rolling_notes(transcript: list, meeting_id: str) -> list:
    """Summarise the recent stretch of conversation into a few bullet notes."""
    context = _recent_transcript_text(transcript, limit=10)
    if not context:
        return []

    prompt = f"""Summarise the recent meeting discussion into 2-4 concise bullet notes.
Return ONLY valid JSON, no markdown.

Recent discussion:
{context}

Return: {{ "bullets": ["note 1", "note 2"] }}"""

    try:
        chat = _groq_client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=300,
        )
        raw = chat.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw.strip())
        bullets = parsed.get("bullets", [])
        return [b for b in bullets if isinstance(b, str) and b.strip()]
    except Exception as e:
        logger.warning(f"[{meeting_id}] Rolling notes failed: {e}")
        return []


# ── Meetings list ─────────────────────────────────────────────────────────────

@app.get("/api/meetings")
async def list_meetings():
    meetings = _list_meetings()
    return {"meetings": meetings, "total": len(meetings)}


# ── Live coaching WebSocket ─────────────────────────────────────────────────────

# Suggestions are primarily ON-DEMAND (user clicks "Get Insight"). We keep only a
# gentle auto-nudge roughly every ~60s of speech so the user isn't spammed.
AUTO_NUDGE_SECONDS = 60   # auto-suggest at most once per this many seconds
NOTES_INTERVAL = 12       # rolling notes every N segments


@app.websocket("/ws/sessions/{session_id}/stream")
async def session_stream(websocket: WebSocket, session_id: str):
    """
    Real-time coaching loop. The desktop renderer streams short audio blobs
    (binary frames, ~4s each, webm/m4a). For each blob we transcribe via Groq
    Whisper, push a transcript line, and periodically push a coaching suggestion
    and rolling notes. On end_session we summarise and persist the meeting so it
    shows up in Library/Detail like any recording.
    """
    await websocket.accept()
    await websocket.send_text(json.dumps({
        "type": "session_started",
        "session_id": session_id,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }))

    transcript: list = []          # [{"speaker","text"}]
    seg_count = 0
    title = "Live Session"
    language = "en"
    started_at = datetime.utcnow()
    last_nudge = datetime.utcnow()

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                break

            # Binary audio blob -> transcribe with Groq.
            # Frame = [tag byte][webm bytes]; tag 0x01 = YOU (mic), 0x02 = OTHER (system).
            if message.get("bytes") is not None:
                raw = message["bytes"]
                if not raw or len(raw) < 2:
                    continue
                tag = raw[0]
                blob = raw[1:]
                speaker = "You" if tag == 0x01 else "Other"
                try:
                    text = await _live_transcribe(blob, language, session_id, speaker)
                except Exception as e:
                    logger.warning(f"[{session_id}] live transcribe failed: {e}")
                    continue

                text = (text or "").strip()
                logger.info(f"[{session_id}] {speaker}: {text!r}")
                if not text:
                    continue

                seg_count += 1
                transcript.append({"speaker": speaker, "text": text})
                await websocket.send_text(json.dumps({
                    "type": "transcript_final",
                    "speaker": speaker,
                    "text": text,
                }))

                # Gentle auto-nudge: at most once per AUTO_NUDGE_SECONDS of speech.
                now = datetime.utcnow()
                if (now - last_nudge).total_seconds() >= AUTO_NUDGE_SECONDS:
                    last_nudge = now
                    suggestion = await _suggest(transcript, session_id, full=False)
                    if suggestion:
                        await websocket.send_text(json.dumps({
                            "type": "suggested_answer",
                            "auto": True,
                            **suggestion,
                        }))

                if seg_count % NOTES_INTERVAL == 0:
                    bullets = await _rolling_notes(transcript, session_id)
                    if bullets:
                        await websocket.send_text(json.dumps({
                            "type": "rolling_notes",
                            "bullets": bullets,
                        }))

            # Text control message
            elif message.get("text") is not None:
                try:
                    msg = json.loads(message["text"])
                except Exception:
                    continue
                mtype = msg.get("type")
                if mtype == "control" and msg.get("action") == "end_session":
                    title = msg.get("title") or title
                    break
                if mtype == "config":
                    language = msg.get("language", language)
                    title = msg.get("title", title)
                # ON-DEMAND ANSWER: reply to the other person's latest question.
                if mtype in ("request_answer", "request_suggestion"):
                    await websocket.send_text(json.dumps({"type": "suggestion_pending"}))
                    answer = await _answer(transcript, session_id)
                    await websocket.send_text(json.dumps({
                        "type": "suggested_answer",
                        "auto": False,
                        **(answer or {
                            "content": "No clear question yet — let the other person finish their point.",
                            "suggestion_type": "contribute", "confidence": "low",
                        }),
                    }))

                # ON-DEMAND INSIGHT: what's happening + notes (state of conversation).
                if mtype == "request_insight":
                    await websocket.send_text(json.dumps({"type": "insight_pending"}))
                    insight = await _insight(transcript, session_id)
                    await websocket.send_text(json.dumps({
                        "type": "insight",
                        **insight,
                    }))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"[{session_id}] live stream error: {e}")

    # Finalise: summarise + persist so the session appears in Library/Detail
    full_text = "\n".join(t["text"] for t in transcript if t.get("text"))
    duration = int((datetime.utcnow() - started_at).total_seconds())
    ai_title, summary, key_points, action_items = await _summarise(full_text, title, session_id)

    meeting = {
        "id": session_id,
        "title": ai_title or title,
        "transcript": full_text,
        "summary": summary,
        "key_points": key_points,
        "action_items": action_items,
        "duration": duration,
        "confidence": 0.9,
        "language": language,
        "created_at": started_at.isoformat() + "Z",
        "mode": "live",
    }
    if full_text:
        _upsert_meeting(meeting)

    try:
        await websocket.send_text(json.dumps({
            "type": "session_event",
            "event": "processing_complete",
            "meeting": meeting,
        }))
        await websocket.close()
    except Exception:
        pass
