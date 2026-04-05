# MeetNote Platform Design
**Date:** 2026-04-05  
**Status:** Approved  

---

## Overview

Three-phase build to turn MeetNote (Electron desktop app, macOS) into a multi-user platform where dev meeting action items flow directly into Claude Code as executable tasks. Users see only "MeetNote" — no infrastructure details exposed.

---

## Phase 1 — Auth + Persistence

### Goals
- Users log in with Google or GitHub
- Every recording is saved per-user, accessible across devices
- Audio stored durably at zero marginal cost

### Auth
- **Provider:** Supabase Auth (Google OAuth + GitHub OAuth)
- **OAuth flow:** PKCE. Electron opens system browser via `shell.openExternal(supabaseSignInUrl)`. Supabase redirects to `meetnote://auth#access_token=...&refresh_token=...&expires_in=...`. Electron registers `meetnote://` protocol via `app.setAsDefaultProtocolClient('meetnote')` called before `app.whenReady()` (and in `open-url` event for macOS). On callback, parse the URL fragment to extract tokens. On `error` param in callback, show error toast and return to login view.
- **Token storage:** `{ access_token, refresh_token, expires_at }` saved in `electron-store` under `meetnote.session`. `expires_at` stored as Unix **seconds** (as returned by Supabase `expires_in` + `Date.now()/1000`). Comparisons always in seconds.
- **Electron main process:** on startup, calls `supabase.auth.setSession({ access_token, refresh_token })` with stored tokens; Supabase JS client handles silent refresh automatically
- **All FastAPI requests:** include `Authorization: Bearer <access_token>` header
- **FastAPI JWT validation:** verifies Supabase JWT using the project's JWKS endpoint (`https://<project>.supabase.co/auth/v1/.well-known/jwks.json`) via `python-jose`. Validates `aud: "authenticated"` claim. Extracts `sub` (user UUID) from claims.
- **Logout:** Electron calls `supabase.auth.signOut()` (invalidates server session) then clears `meetnote.session` from electron-store

### Database Schema (Supabase / PostgreSQL)

```sql
-- meetings table (auth.users managed by Supabase Auth)
create table meetings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  title        text not null,
  transcript   text,
  summary      text,
  key_points   jsonb default '[]',   -- array of strings: ["Point A", "Point B"]
  action_items jsonb default '[]',   -- array of strings: ["Do X", "Do Y"]
  duration     integer,              -- seconds, set by Electron from recording timer
  language     text default 'en',
  audio_key    text,                 -- R2 object key: {user_id}/{meeting_id}.m4a
  created_at   timestamptz default now()
);

-- RLS
alter table meetings enable row level security;
create policy "users own their meetings"
  on meetings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### Audio Storage
- **Provider:** Cloudflare R2 via `boto3` with R2 S3-compatible endpoint (`https://{account_id}.r2.cloudflarestorage.com`)
- **Credentials:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` in FastAPI `.env`
- **Bucket visibility:** bucket is **private** (no public access). All access via pre-signed URLs only.
- **Key pattern:** `{user_id}/{meeting_id}.m4a`
- **Upload:** FastAPI buffers audio in memory (already read for transcription), then calls `boto3` `put_object` in a background task (does not block response)
- **Playback URL:** `GET /api/meetings/{id}/audio` — FastAPI generates a pre-signed R2 URL (1-hour expiry) on demand; client re-requests when expired
- **Delete:** `DELETE /api/meetings/{id}` — deletes Supabase row first, then R2 object (best-effort; orphaned R2 objects are acceptable)

### Recording Flow
1. Electron captures audio → sends multipart POST to `/api/transcription/audio` with JWT + `duration` field
2. FastAPI validates JWT → extracts `user_id`
3. Audio buffered in memory → Groq Whisper transcribes → Groq Llama summarises (parallel: R2 upload starts in background task)
4. Meeting row inserted into Supabase with `audio_key`
5. Response returned to Electron (same JSON shape as today + `id`)
6. Electron renderer upserts meeting into localStorage cache + displays

### FastAPI Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/transcription/audio` | ✅ | Transcribe + save meeting |
| GET | `/api/meetings` | ✅ | List user's meetings (newest first, limit 50) |
| GET | `/api/meetings/{id}` | ✅ | Single meeting detail |
| GET | `/api/meetings/{id}/audio` | ✅ | Pre-signed R2 playback URL |
| DELETE | `/api/meetings/{id}` | ✅ | Delete meeting row + R2 audio |

### Electron Changes
- Add Login view (shown when `meetnote.session` absent or expired)
- OAuth: Electron opens system browser via `shell.openExternal(supabase.auth.signInWithOAuth url)`
- Deep link `meetnote://auth` catches OAuth callback, extracts tokens, stores in electron-store, navigates to main view
- `get-settings` / `save-settings` IPC handlers unchanged
- All renderer `fetch` calls inject JWT via a shared `apiFetch(path, opts)` wrapper

---

## Phase 2 — MCP Server

### Goals
- Claude Desktop / Claude Code can read user's meetings via MCP tools
- User authenticates once via Electron app; MCP server reuses that session
- No infrastructure branding visible — all tools named under "MeetNote"

### Architecture
- Single file: `backend/mcp_server.py`
- Transport: **stdio**
- **Auth:** on startup, reads `meetnote.session.access_token` from electron-store's JSON file at `~/Library/Application Support/meetnote/config.json`. File permissions must be `0600` (Electron sets this on first write via `fs.chmodSync`). If file absent, token missing, or `expires_at` (Unix seconds) < `time.time()`, exits with a human-readable error: *"Open MeetNote and log in first."* No silent failure.
- **DB access:** `supabase-py` client initialised with user's JWT via `create_client(..., options=ClientOptions(headers={"Authorization": f"Bearer {token}"}))` — RLS enforces user isolation automatically
- Registered in Claude Desktop's `claude_desktop_config.json`

### Tools

| Tool | Arguments | Returns |
|------|-----------|---------|
| `list_meetings` | `limit?: int (default 10), since?: ISO date` | `[{id, title, created_at, duration, summary}]` |
| `get_meeting` | `id: string` | `{id, title, transcript, summary, key_points[], action_items[], duration, created_at}` |
| `get_action_items` | `since?: ISO date` | `[{action_item, meeting_title, meeting_id, created_at}]` |

`get_action_items` implementation: unnests each meeting's `action_items` jsonb array using `jsonb_array_elements_text()`, selects alongside `title`, `id`, `created_at` from the same row. The `since` filter applies to `meetings.created_at`. Python receives rows as `(action_item_text, meeting_id, title, created_at)` and returns the list above.

### MCP Config Snippet (shown in Settings UI)
```json
{
  "mcpServers": {
    "meetnote": {
      "command": "python3",
      "args": ["__ACTUAL_PATH__/backend/mcp_server.py"]
    }
  }
}
```
`__ACTUAL_PATH__` replaced with real app path at runtime.

### Settings UI — MCP Tab
- Connection status dot (green = JWT readable + valid, red = not logged in / not configured)
- Auto-generated config snippet with actual absolute path pre-filled
- One-click copy button for config snippet
- One-click copy for CLAUDE.md snippet (see Phase 3)

---

## Phase 3 — Claude Code Integration

### Goals
- Claude Code can be told "check my meeting tasks" and immediately act on the latest action items
- No manual copy-paste

### Usage Pattern
User says: *"check my meeting tasks"*  
Claude Code calls `get_action_items` via MCP → reads action items → creates TodoWrite tasks → executes.

### CLAUDE.md Snippet (shown in Settings, copy button)
```markdown
## Meeting Tasks
Use the MeetNote MCP tool `get_action_items` to check for pending action items
from recent dev meetings before starting work.
```

---

## Constraints
- **Zero infra cost:** Supabase free tier (500 MB DB, 50k users); R2 free tier (10 GB storage, 1M Class A ops/month — sufficient for early users); Groq free tier
- **Supabase free tier note:** project pauses after 1 week inactivity — acceptable for dev phase; upgrade to Pro before launch
- **No vendor branding visible to users:** everything is "MeetNote"
- **Offline-first:** Electron localStorage cache; app works offline, syncs on reconnect
- **No breaking changes to existing recording flow** until Phase 1 is complete and tested

---

## Out of Scope
- Team/shared meetings (enterprise Phase 2+)
- Real-time collaboration
- Speaker diarization
- Spotlight / App Store distribution
- Windows / Linux support
