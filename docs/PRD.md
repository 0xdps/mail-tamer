# Mail Tamer — Consolidated PRD Analysis

> **Status**: Decisions locked ✅ — ready for implementation.

## The Two Documents at a Glance

| Dimension | **Email-Tamer v1.1** | **Gmail AI Triage v2** |
|---|---|---|
| Name | Email-Tamer | Gmail AI Triage |
| Framing | Lightweight automation tool | Self-hosted, containerised system |
| AI Model | Gemini Flash (default) | Claude Haiku (default) |
| Storage | SQLite (rules, history) | SQLite (rules, decisions, runs, settings) |
| Frontend | None (headless) | React dashboard (Vite) |
| Backend | Not specified | FastAPI (REST API) |
| Deployment | Local cron OR Railway worker | Docker → local or Railway/Fly.io |
| Batch inbox | Not explicitly covered | Yes — 20k+ email one-time migration |
| Scheduling | External cron `*/5 * * * *` | APScheduler embedded in container |
| Webhooks | No | No (polling) |
| Gmail Integration | Direct Gmail API + OAuth | `gws` wrapper abstraction |

---

## What They Share (Core Agreement)

Both documents agree on the **same fundamental product idea**:

1. **Hybrid pipeline** — deterministic rules first, AI only for unmatched emails
2. **SQLite** as the only data store — no external database
3. **5-minute polling** as the triage cadence
4. **Cost optimization** — pre-filters eliminate 50–70% of emails before AI
5. **Local-first with optional cloud** (Railway)
6. **No webhooks / Pub-Sub** — simple polling is intentional
7. **Rule learning** — high-confidence AI decisions are promoted to static rules
8. **Single-user v1** — multi-user is a future concern

---

## Key Differences & Conflicts

### 1. AI Model — ✅ Decided
- Pick the **best-suited model for email classification** — lean, fast, cheap
- **Gemini Flash** as default (Google-native, high throughput, low cost)
- Model must be **swappable via `settings` table** — Claude Haiku as documented alternative
- Prompt: sender + subject + 2-line snippet only (never full body)

### 2. Frontend — ✅ Decided
- Adopt **v2's React dashboard** (4 views: Rules, Decisions, Run History, Control Panel)
- Dashboard is hosted and served by FastAPI as static files

### 3. Gmail Integration — ✅ Decided
- Use the **official Gmail SDK** (Google API Python Client / `google-api-python-client`)
- Credentials: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` via `.env`
- Drop the `gws` abstraction from v2 — direct SDK is cleaner and more maintainable

### 4. Backend API — ✅ Decided
- **FastAPI** — serves REST API and React SPA as static files

### 5. Deployment — ✅ Decided
- **Docker** (`docker compose up`) — single container, all components bundled
- Deploy to local machine, Railway, or Fly.io with zero code changes

### 6. Batch Processing — ✅ Decided
- Adopt **v2's batch spec**: 50 emails/call, SQLite checkpoint (resumable), pre-filters first
- 20k emails ≈ 200–400 AI calls with pre-filters applied

### 7. Database Schema — ✅ Decided
- **Merge** both schemas: keep v2's richer tables + add v1.1's `domain_mappings`

### 8. Admin Auth — ✅ Decided
- **No full user management** — token-based admin auth only
- `ADMIN_TOKEN` (env) — required to log in to the dashboard
- `SECRET_SESSION` (env) — used as the cookie secret for session signing
- Both are rotatable by changing the env variable (no DB involvement)
- Dashboard login: POST token → verify against `ADMIN_TOKEN` → set signed cookie

### 9. Rule Approval Flow — ✅ Decided
- **New AI-promoted rules**: require manual approval in dashboard before becoming active
- **Existing rules** (already active): AI can update/refine them automatically above confidence threshold
- This prevents unchecked rule sprawl while keeping the system adaptive

### 10. Dry-Run Mode — ✅ Decided (v1)
- **Included in v1** — classify emails and log decisions but do **not** apply labels
- Toggle available from the Control Panel dashboard view
- Useful for onboarding, testing new rules, and validating AI classification quality

---

## Consolidated Product Definition

### Product Name
**Mail Tamer**

### Core Architecture
```
Docker Container
├── FastAPI backend
│   ├── REST API (/api/rules, /api/decisions, /api/runs, /api/scan, /api/scheduler, /api/auth)
│   └── Serves React SPA as static files
├── React Dashboard (Vite)
│   ├── Login (ADMIN_TOKEN → signed cookie)
│   ├── Rules view (approve / reject AI-promoted rules)
│   ├── Decisions view (with dry-run indicator)
│   ├── Run History view
│   └── Control Panel (dry-run toggle, scheduler, batch trigger)
├── Triage Engine
│   ├── APScheduler (5-min polling, configurable)
│   ├── Rule Engine (deterministic, SQLite cache)
│   └── AI Classifier (Gemini Flash default, swappable via settings)
└── SQLite (triage.db)
    ├── rules
    ├── decisions
    ├── runs
    ├── domain_mappings
    └── settings
```

### External Tools & Libraries
| Layer | Tool |
|---|---|
| Gmail integration | `google-api-python-client` (official Gmail SDK) |
| Backend | FastAPI + Uvicorn |
| Scheduling | APScheduler |
| Frontend | React + Vite |
| Database | SQLite via `sqlite3` / `aiosqlite` |
| AI (default) | Gemini Flash (`google-generativeai`) |
| AI (alt) | Claude Haiku (`anthropic`) |
| Auth | Signed cookie (`itsdangerous`) + env-based token |
| Packaging | Docker + `docker compose` |

### Consolidated Database Schema
| Table | Purpose |
|---|---|
| `rules` | Static rules — manual + AI-promoted (active/pending approval) |
| `decisions` | Per-email classification log (includes dry-run flag) |
| `runs` | Scheduler run history and stats |
| `domain_mappings` | Sender domain → label shortcuts |
| `settings` | Poll interval, confidence threshold, AI model, dry-run mode |

### Auth Flow
```
POST /api/auth/login  { token: ADMIN_TOKEN }
  → match env ADMIN_TOKEN
  → set signed cookie (SECRET_SESSION as signing key)
  → all subsequent API calls validate cookie
  → rotate by changing ADMIN_TOKEN / SECRET_SESSION in env + redeploy
```

### AI Model Strategy
- **Default**: Gemini Flash (low cost, high throughput)
- **Swappable** via `settings` table — Claude Haiku as an alternative
- Prompt sends only: sender, subject, 2-line snippet (never full body)

---

## Deferred to v2
- Multi-account Gmail support
- Team / multi-user access
- Postgres migration path
- Advanced automation rules (send reply, forward, etc.)

---

## Suggested Milestones (Consolidated)

| # | Milestone | Est. Effort |
|---|---|---|
| M1 | Gmail OAuth + `gws` abstraction layer | 1 day |
| M2 | Rule Engine + SQLite schema | 2 days |
| M3 | AI Classifier integration (Gemini Flash) | 1 day |
| M4 | APScheduler + triage loop | 1 day |
| M5 | Batch processor for existing inbox | 2 days |
| M6 | FastAPI REST API | 1 day |
| M7 | React Dashboard (4 views) | 3 days |
| M8 | Docker packaging + env config | 1 day |
| M9 | Testing + cost validation | 1 day |
| **Total** | | **~13 days** |
