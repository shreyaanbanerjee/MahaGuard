# MahaGuard AI

Enterprise-grade automated legal risk audit and extraction engine for Maharashtra Real Estate (MahaRERA) documents.

## Architecture

```
MahaGuard/
├── frontend/      Next.js 15 · TypeScript · Tailwind CSS
└── backend/       Python · FastAPI · Celery-ready · pgvector RAG
```

## Quick Start

### 1. Supabase Setup
1. Create a project at [supabase.com](https://supabase.com)
2. Run `backend/db/migrations.sql` in the Supabase SQL editor
3. Create a Storage bucket named `mahaguard-pdfs`

### 2. Backend
```bash
cd backend
cp .env.example .env        # Fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env.local  # Fill in NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SUPABASE_*
npm run dev                  # Starts on http://localhost:3000
```

## Features

| Feature | Description |
|---------|-------------|
| **Citation Verification** | Every risk pinned to exact page + bounding box. PDF split-screen viewer with highlight overlay. |
| **Financial Cross-Check** | Deterministic Python: escrow withdrawals vs. architect-certified progress. No LLM. |
| **Legal Glossary Injection** | 30+ Marathi land-law terms auto-detected and injected into the LLM system prompt. |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload PDF → returns `task_id` immediately |
| `GET`  | `/api/tasks/{task_id}` | Poll processing status + progress % |
| `GET`  | `/api/scorecards/{task_id}` | Retrieve full `RiskScorecard` JSON |
| `GET`  | `/health` | Health check |