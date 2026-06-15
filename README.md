# 🛡️ MahaGuard AI — Enterprise MahaRERA Legal Risk Audit Engine

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.2-black?logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/Supabase-pgvector-3ECF8E?logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/Gemini-Flash-4285F4?logo=google&logoColor=white" />
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white" />
</p>

> **MahaGuard AI** is a production-grade, full-stack automated legal risk audit engine purpose-built for Maharashtra Real Estate (MahaRERA) compliance documents. It combines a hybrid OCR/RAG document pipeline with deterministic financial cross-checks and a guardrailed LLM to produce fully-grounded, citation-verified Risk Scorecards — eliminating AI hallucination from legal workflows.

---

## 🎬 What It Does

1. A user drags and drops a MahaRERA PDF (Form 3 CA Certificate, Architect Form 1, Title Report, etc.) onto the dashboard.
2. The backend **immediately** returns a `task_id` and begins processing the document asynchronously.
3. The frontend **polls** the task status in real-time, showing an animated progress stepper (`OCR → Chunking → Embedding → AI Audit`).
4. Upon completion, the user is redirected to a **split-screen dashboard**:
   - **Left panel**: A structured AI Risk Scorecard with severity-coded findings (🔴 Critical / 🟡 Moderate / 🟢 Clear), financial metrics, and project metadata.
   - **Right panel**: An embedded live PDF viewer. Clicking "View Source Evidence" on any finding **jumps to the exact page** and **draws a bounding-box highlight** over the source text.

---

## ✨ Three Killer Features

### Feature A — Citation Verification Engine (Zero Hallucination)
The backend stores the precise **`page_number`** and **`bounding_box` coordinates** (in PDF points) alongside every text chunk. The `RiskFinding` Pydantic schema enforces a minimum of one `SourceCitation` per finding, making it structurally impossible for the LLM to return a finding without citing its source. On the frontend, `PdfViewer.tsx` computes the pixel-to-PDF-point scale ratio dynamically and overlays the highlight box precisely over the evidence.

### Feature B — Deterministic Financial Cross-Check
A pure Python function (`pipeline/financial_check.py`) implements the core MahaRERA financial rule:

```
If Escrow Withdrawn > (Structural Progress % + 10% tolerance) × Total Project Cost
→ Flag CAPITAL_DIVERSION_RISK (confidence: 100%, deterministic_flag: True)
```

This check runs **before** the LLM is called and injects its finding directly into the scorecard if triggered. The LLM has no role in this determination — eliminating any chance of a false negative on the most critical risk category.

### Feature C — Localized Legal Terminology Injector
A local `data/legal_glossary.json` contains 30+ Marathi and Maharashtra-specific land-law terms (e.g., *Satbara Utara*, *Visar Pavti*, *IOD*, *TDR*, *NA Order*). Before dispatching to the LLM, the backend scans retrieved chunks for these terms and **dynamically injects their definitions** into the system prompt. This equips the model to reason accurately about cross-lingual, jurisdiction-specific documents without fine-tuning.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       FRONTEND (Next.js)                        │
│  UploadZone → POST /api/upload → receives task_id               │
│  Polls GET /api/tasks/{id} every 2.5s → ProgressStepper UI      │
│  On COMPLETE → redirect → Dashboard                             │
│    Left: RiskScorecard (findings, metadata, financial panel)     │
│    Right: PDFViewer (react-pdf + bounding-box highlight overlay) │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP (REST)
┌───────────────────────────▼─────────────────────────────────────┐
│                     BACKEND (FastAPI)                            │
│                                                                  │
│  POST /api/upload  →  returns task_id instantly                  │
│  BackgroundTask kicks off _process_document()                    │
│                                                                  │
│  ── INGESTION PIPELINE ──────────────────────────────────────── │
│  1. detect_pdf_type()      → PyMuPDF scanned-page detection      │
│  2. extract_text_pymupdf() → text blocks + bounding boxes        │
│     or extract_text_ocr()  → EasyOCR for scanned pages          │
│  3. semantic_merge_chunks()→ layout-aware section grouping       │
│  4. persist_chunks()       → Supabase: chunks table              │
│                                                                  │
│  ── EMBEDDING PIPELINE ──────────────────────────────────────── │
│  5. embed_and_store()      → Gemini Embedding API (768-dim)      │
│                            → stored in Supabase pgvector         │
│                                                                  │
│  ── AUDIT PIPELINE ──────────────────────────────────────────── │
│  6. _retrieve_chunks()     → pgvector similarity search (8 cats) │
│  7. scan_and_inject()      → glossary term detection + injection │
│  8. run_financial_check()  → deterministic capital diversion flag │
│  9. instructor LLM call    → Gemini → structured RiskScorecard   │
│  10. persist scorecard     → Supabase: risk_scorecards table      │
└───────────────────────────┬─────────────────────────────────────┘
                            │ supabase-py SDK
┌───────────────────────────▼─────────────────────────────────────┐
│              SUPABASE (PostgreSQL + pgvector)                    │
│  Tables: tasks, documents, chunks (+ vector column), scorecards  │
│  RPC: match_chunks() → pgvector cosine similarity search         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Project Structure

```
MahaGuard/
├── backend/
│   ├── main.py                   # FastAPI app, CORS, lifespan hooks
│   ├── requirements.txt          # All Python dependencies (pinned)
│   ├── .env.example              # Template for environment variables
│   ├── routers/
│   │   ├── upload.py             # POST /api/upload — async task dispatch
│   │   └── tasks.py              # GET /api/tasks/{id}, /scorecards/{id}
│   ├── pipeline/
│   │   ├── ingestion.py          # PDF type detection, PyMuPDF/OCR extraction,
│   │   │                         # layout classification, semantic chunking
│   │   ├── embedder.py           # Gemini embedding (768-dim) + pgvector storage
│   │   ├── auditor.py            # RAG retrieval, glossary inject, LLM orchestration
│   │   ├── financial_check.py    # Feature B: deterministic escrow rule engine
│   │   └── glossary.py           # Feature C: Marathi term scanner + prompt injector
│   ├── models/
│   │   └── schemas.py            # All Pydantic models (RiskScorecard, RiskFinding, etc.)
│   ├── db/
│   │   └── supabase_client.py    # Singleton Supabase client
│   └── data/
│       └── legal_glossary.json   # 30+ Marathi/MahaRERA legal term definitions
│
└── frontend/
    ├── app/
    │   ├── page.tsx              # Home: drag-and-drop upload + real-time progress
    │   ├── globals.css           # Design system (CSS variables, dark theme)
    │   ├── layout.tsx            # Root layout with Google Fonts
    │   └── dashboard/[taskId]/   # Split-screen audit dashboard (dynamic route)
    ├── components/
    │   ├── UploadZone.tsx        # Drag-and-drop PDF uploader
    │   ├── ProgressStepper.tsx   # Animated multi-stage pipeline progress UI
    │   ├── RiskScorecard.tsx     # Full scorecard: findings, metadata, financial panel
    │   └── PDFViewer.tsx         # react-pdf viewer with bounding-box highlight overlay
    ├── lib/
    │   ├── api.ts                # Typed API client (upload, poll, fetch scorecard)
    │   └── types.ts              # TypeScript mirror of all Pydantic schemas
    └── public/
        └── examples/             # Pre-built sample PDFs for demo/testing
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 16 (App Router) | React server/client components, file-based routing |
| **Styling** | Vanilla CSS + CSS Variables | Custom dark-mode design system, no framework overhead |
| **PDF Viewer** | `react-pdf` + `pdfjs-dist` | In-browser PDF rendering with canvas-based page display |
| **Backend** | FastAPI + BackgroundTasks | Async HTTP server, non-blocking document processing |
| **Document Parsing** | PyMuPDF (`fitz`) | Text + bounding box extraction, scanned page detection |
| **OCR** | EasyOCR | English/Marathi text extraction from scanned PDF pages |
| **Database** | Supabase (PostgreSQL) | Structured storage for tasks, documents, chunks, scorecards |
| **Vector Store** | Supabase `pgvector` | Cosine similarity search for RAG chunk retrieval |
| **Embeddings** | Google Gemini Embedding API | 768-dimensional semantic vectors for document chunks |
| **LLM** | Google Gemini Flash | Risk finding generation and structured extraction |
| **LLM Guardrailing** | `instructor` + Pydantic | Forces LLM output into strict `RiskScorecard` JSON schema |
| **Data Validation** | Pydantic v2 | Runtime schema enforcement for all API inputs/outputs |

---

## ⚙️ Prerequisites

- **Python** 3.11+ with `pip`
- **Node.js** 20+ (LTS) and `npm`
- A **Supabase** project with `pgvector` enabled
- A **Google AI Studio** API key (Gemini Flash + Embedding API)

---

## 🚀 Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-username/MahaGuard.git
cd MahaGuard
```

### 2. Configure the Supabase database

In your Supabase project's **SQL Editor**, run the following to create the required tables and RPC function:

```sql
-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Tasks table (tracks background processing state)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'UPLOADING',
  progress_pct INT DEFAULT 0,
  stage_label TEXT,
  document_name TEXT,
  error_message TEXT,
  scorecard_id UUID,
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Documents table (one per uploaded PDF)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT,
  page_count INT,
  is_scanned BOOLEAN DEFAULT FALSE,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Chunks table (semantic text blocks with spatial metadata + vectors)
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT,
  page_number INT,
  bbox_x0 FLOAT, bbox_y0 FLOAT, bbox_x1 FLOAT, bbox_y1 FLOAT,
  raw_text TEXT,
  section_type TEXT,
  section_label TEXT,
  embedding VECTOR(768),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Risk scorecards (final audit output)
CREATE TABLE risk_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  scorecard_json JSONB NOT NULL,
  overall_risk TEXT,
  glossary_terms_injected TEXT[],
  processing_time_seconds FLOAT,
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- pgvector cosine similarity search RPC
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding VECTOR(768),
  filter_task_id UUID,
  match_count INT DEFAULT 6
)
RETURNS TABLE (
  id UUID, task_id UUID, document_id UUID,
  chunk_index INT, page_number INT,
  bbox_x0 FLOAT, bbox_y0 FLOAT, bbox_x1 FLOAT, bbox_y1 FLOAT,
  raw_text TEXT, section_type TEXT, section_label TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.task_id, c.document_id, c.chunk_index, c.page_number,
    c.bbox_x0, c.bbox_y0, c.bbox_x1, c.bbox_y1,
    c.raw_text, c.section_type, c.section_label,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM chunks c
  WHERE c.task_id = filter_task_id AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### 3. Set up the Backend

```bash
cd backend

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate       # macOS/Linux
# venv\Scripts\activate        # Windows

# Install all dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
```

Edit `backend/.env` and fill in your credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
GEMINI_API_KEY=your-google-ai-api-key
FRONTEND_URL=http://localhost:3000
```

Start the backend server:

```bash
python -m uvicorn main:app --port 8000 --reload
```

The API will be live at `http://localhost:8000`. Explore the interactive docs at `http://localhost:8000/docs`.

### 4. Set up the Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
```

Edit `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Start the development server:

```bash
npm run dev
```

The application will be live at `http://localhost:3000`.

---

## 🧪 Testing the Application

### Option 1: Use the Built-in Sample Documents

The homepage includes ready-to-download sample PDFs under **"How to test MahaGuard AI"**:

- **Form 3 with Capital Diversion** — An intentionally crafted CA Certificate where 75% of escrow funds were withdrawn despite only 25% structural progress. The deterministic engine will flag a `CRITICAL` Capital Diversion risk with 100% confidence.
- **Title Report with Litigation Risk** — A legal document with a pending civil suit and an active bank mortgage. The AI will extract these and flag a `MODERATE` Encumbrance risk.

### Option 2: Real MahaRERA Documents

1. Visit the official [MahaRERA Portal](https://maharera.maharashtra.gov.in/).
2. Navigate to **Registration → Registered Projects**.
3. Search for any developer (e.g., "Lodha", "Godrej", "Oberoi") and click **View**.
4. Scroll to **Uploaded Documents** and download a Form 3 (CA Certificate) or Title Report.
5. Upload it to MahaGuard AI.

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload a PDF. Returns `task_id` instantly (HTTP 202). |
| `GET` | `/api/tasks/{task_id}` | Poll processing status and progress percentage. |
| `GET` | `/api/scorecards/{task_id}` | Retrieve the full `RiskScorecard` JSON + signed PDF URL. |
| `GET` | `/health` | Health check endpoint. |

### Risk Scorecard Schema (Pydantic-enforced)

```python
class RiskScorecard(BaseModel):
    task_id: str
    document_name: str
    overall_risk_level: Literal["CRITICAL", "MODERATE", "CLEAR"]
    audit_summary: str                    # 2–4 sentence executive summary
    project_metadata: ProjectMetadata     # RERA reg no., promoter, dates, etc.
    financial_cross_check: FinancialCrossCheck  # Feature B output
    risk_findings: List[RiskFinding]      # min 1 finding, each with citations
    glossary_terms_injected: List[str]    # Feature C: terms detected
    processing_time_seconds: float
    model_used: str

class RiskFinding(BaseModel):
    risk_category: str                    # One of 10 defined categories
    status: Literal["CRITICAL", "MODERATE", "CLEAR"]
    ai_finding: str                       # Factual, cited finding (max 600 chars)
    confidence_score: float               # 0.0 – 1.0
    citations: List[SourceCitation]       # min 1, with page_number + bounding_box
    deterministic_flag: bool              # True = Feature B, not LLM
    remediation_hint: Optional[str]
```

---

## 🔍 Risk Categories Detected

| Category | Description |
|----------|-------------|
| **Capital Diversion** | Escrow withdrawal exceeding structural progress (deterministic) |
| **RERA Non-Compliance** | Missing quarterly reports, registration lapses |
| **Title Defect** | Disputed ownership, missing Satbara Utara / NA Order |
| **Escrow Violation** | Improper fund utilization from the 70% designated account |
| **Construction Delay** | Project behind scheduled completion date |
| **Missing Disclosure** | Absent carpet area, amenity, or promoter disclosures |
| **FSI Violation** | Floor Space Index exceedances or TDR misuse |
| **Approval Lapse** | Expired IOD, CC not obtained before construction |
| **Encumbrance Found** | Active mortgage, lien, or charge on the property |

---

## 🏛️ Design Decisions & Engineering Rationale

### Why Decoupled Async Architecture?
MahaRERA documents can be 50+ pages. Processing them synchronously would cause HTTP timeouts. The `task_id` polling pattern ensures the frontend remains responsive while the backend processes indefinitely.

### Why `instructor` + Pydantic over raw LLM output?
Raw LLM responses for legal documents are unreliable. `instructor` wraps the Gemini client and automatically retries malformed responses until the JSON conforms exactly to the `RiskScorecard` schema — enforcing that every finding has a citation, every citation has a bounding box, and the overall risk level is deterministically computed.

### Why a local legal glossary vs. embedding Marathi context?
Embedding a small, curated dictionary into the system prompt is orders of magnitude more reliable than relying on an LLM's training data for obscure Maharashtra revenue law terms. It is deterministic, zero-latency, and auditable.

### Why pgvector over a dedicated vector database?
For this use case, where vectors are strictly scoped per task and retrieval is filtered by `task_id`, Supabase's native `pgvector` extension provides sufficient performance with zero additional infrastructure. The entire stack runs on a single Supabase project.

---

## 🔮 Potential Extensions

- **Authentication**: Supabase Auth for multi-user audit history.
- **Batch Cross-Document Analysis**: Upload Form 1 + Form 3 + Title Report together for a unified cross-document audit.
- **PDF Export**: One-click download of the Risk Scorecard as a formal PDF report.
- **Webhook Notifications**: Push scorecard results to Slack or email when processing completes.
- **Fine-tuned Model**: Replace Gemini Flash with a fine-tuned model trained on verified MahaRERA audit decisions.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built for Maharashtra Real Estate · Powered by Gemini AI · Grounded by pgvector
</p>