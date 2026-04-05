# MeetNote Platform Design
**Date:** 2026-04-05  
**Status:** Approved  

---

## Overview

Three-phase build to turn MeetNote into a multi-user platform where dev meeting action items flow directly into Claude Code as executable tasks. Users see only "MeetNote" — no infrastructure details exposed.

---

## Phase 1 — Auth + Persistence

### Goals
- Users log in with Google or GitHub
- Every recording is saved per-user, accessible across devices
- Audio stored durably at zero marginal cost

### Auth
- **Provider:** Supabase Auth (Google OAuth + GitHub OAuth)
- **Token storage:** JWT saved in Electron's `electron-store` under key `meetnote.session`
- **All FastAPI requests:** include `Authorization: Bearer <jwt>` header
- **Token refresh:** handled by Supabase JS client; Electron main process manages refresh on startup

### Database Schema (Supabase / PostgreSQL)

```sql
-- managed by Supabase Auth
users (id uuid, email, created_at)

meetings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  title       text not null,
  transcript  text,
  summary     text,
  key_points  jsonb default '[]',
  action_items jsonb default '[]',
  duration    integer,          -- seconds
  language    text default 'en',
  audio_key   text,             -- R2 object key
  created_at  timestamptz default now()
)
```

Row-Level Security: users can only read/write their own rows.

### Audio Storage
- **Provider:** Cloudflare R2 (existing account, 10 GB free)
- **Key pattern:** `{user_id}/{meeting_id}.m4a`
- **Upload flow:** FastAPI receives audio → streams to R2 → saves `audio_key` on the meeting row
- **Playback:** pre-signed R2 URL (1-hour expiry), generated on demand

### Recording Flow
1. Electron captures audio → sends multipart POST to `/api/transcription/audio` with JWT
2. FastAPI authenticates user from JWT
3. Groq Whisper transcribes → Groq Llama summarises
4. Audio uploaded to R2
5. Meeting row inserted into Supabase
6. Response returned to Electron (same shape as today)
7. Electron renderer upserts meeting into local cache + displays

### New FastAPI Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/meetings` | List user's meetings (auth required) |
| GET | `/api/meetings/{id}` | Single meeting detail |
| DELETE | `/api/meetings/{id}` | Delete meeting + R2 audio |

### Electron Changes
- Add Login view (shown when no session in store)
- Supabase JS client handles OAuth redirect (opens system browser)
- On callback: store JWT, show main app
- `get-settings` / `save-settings` IPC handlers remain unchanged
- All `fetch` calls to backend include JWT header

---

## Phase 2 — MCP Server

### Goals
- Claude Desktop / Claude Code can read user's meetings via MCP tools
- User authenticates once (via Electron app); MCP server reuses that session
- No Supabase branding visible — all tools are named under "MeetNote"

### Architecture
- Single file: `backend/mcp_server.py`
- Transport: **stdio** (standard MCP local server pattern)
- Auth: reads JWT from `electron-store` file on disk (`~/Library/Application Support/meetnote/config.json`)
- DB access: Supabase Python client with user's JWT (respects RLS — users only see their own data)
- Registered in Claude Desktop's `claude_desktop_config.json`

### Tools

| Tool | Arguments | Returns |
|------|-----------|---------|
| `list_meetings` | `limit?: int, since?: ISO date string` | Array of `{id, title, created_at, duration, summary}` |
| `get_meeting` | `id: string` | Full meeting: transcript, summary, key_points, action_items |
| `get_latest_meeting` | none | Most recent meeting, full detail |
| `get_action_items` | `since?: ISO date string` | Flat list of action items across all meetings with meeting context |

### MCP Server Config Snippet (shown in Settings UI)
```json
{
  "mcpServers": {
    "meetnote": {
      "command": "python3",
      "args": ["/path/to/meetnote/backend/mcp_server.py"]
    }
  }
}
```

### Settings UI — MCP Tab
- Connection status dot (green = server reachable, red = not configured)
- Auto-generated config snippet with actual path pre-filled
- One-click copy button

---

## Phase 3 — Claude Code Integration

### Goals
- After each recording, action items are immediately available to Claude Code
- Claude Code can turn action items into code tasks without manual copy-paste

### Task File
After every successful transcription, Electron writes:
```
~/.meetnote/latest_tasks.json
```
```json
{
  "meeting_id": "...",
  "title": "...",
  "recorded_at": "...",
  "action_items": ["...", "..."]
}
```

### Usage Pattern
User says to Claude Code: *"check my meeting tasks"*  
Claude Code calls `get_latest_meeting` via MCP → reads action items → creates TodoWrite tasks → begins executing.

### CLAUDE.md Snippet (shown in Settings)
```markdown
## Meeting Tasks
Use the MeetNote MCP tool `get_latest_meeting` to check for pending action items from the last dev meeting before starting work.
```
Settings UI shows this snippet with a copy button alongside the MCP config.

---

## Constraints
- **Zero infra cost:** Supabase free tier (500 MB DB, 50k users), R2 free tier (10 GB), Groq free tier
- **No vendor lock-in visible to users:** everything branded as MeetNote
- **Offline-first:** Electron keeps localStorage cache; app works without internet, syncs when online
- **No breaking changes to existing recording flow** until Phase 1 is complete

---

## Out of Scope
- Team/shared meetings (enterprise Phase 2+)
- Real-time collaboration
- Speaker diarization
- Spotlight / App Store distribution
