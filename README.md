# Mail Tamer

An AI-powered email triage and classification system for Gmail. It processes emails via deterministic rules first, falling back to an AI model (Gemini Flash or Claude Haiku) for unmatched emails, drastically reducing manual inbox management and API costs.

## Features
- **Local-first / Self-hosted**: Deploy as a single Docker container anywhere (local, Railway, Fly.io).
- **Hybrid Pipeline**: Fast rule engine for known emails; AI for everything else.
- **Auto-learning**: High-confidence AI classifications are promoted to rules (pending manual approval).
- **Batch Processing**: Migrates entirely existing 20k+ inboxes using resumable SQLite checkpoints.
- **Dry-run Mode**: Test rules and AI behavior without applying actual Gmail labels.
- **Embedded Dashboard**: A sleek React SPA to manage rules, review decisions, and control the scheduler.

## Tech Stack
- **Backend**: FastAPI, `google-api-python-client`, APScheduler
- **AI Integration**: `google-generativeai` (Gemini), `anthropic` (Claude)
- **Frontend**: React, Vite, Lucide Icons
- **Database**: SQLite (via `aiosqlite`)
- **Deployment**: `Dockerfile` + `docker-compose.yml`

## Getting Started (Development)

Requires `python 3.12+` and `node 22+`.

1. **Setup Environment Variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your Google OAuth secrets, AI API Keys, and Auth Tokens
   ```

2. **Install Dependencies**:
   ```bash
   just setup
   ```
   *Note: This creates a Python `venv` in `/backend` and runs `npm install` in `/frontend`.*

3. **Run Dev Servers**:
   ```bash
   just dev
   ```
   FastAPI will run on [http://localhost:8000](http://localhost:8000) and the Vite frontend proxy on [http://localhost:5173](http://localhost:5173).

## Production Deployment (Docker)

To run the entire stack (FastAPI + React SPA) behind a single port in a clean container:

```bash
just up
```

This mounts `/app/data` to a volume for database persistence, ensuring `triage.db` survives restarts.

## License

[MIT License](LICENSE)
