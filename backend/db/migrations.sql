-- MahaGuard AI — Supabase Database Migration
-- Run this in the Supabase SQL editor to set up the full schema.

-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── tasks ────────────────────────────────────────────────────────────────────
-- Tracks background processing jobs.
CREATE TABLE IF NOT EXISTS tasks (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status        TEXT NOT NULL DEFAULT 'UPLOADING'
                  CHECK (status IN ('UPLOADING','OCR','CHUNKING','AI_AUDITING','COMPLETE','FAILED')),
    progress_pct  INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
    stage_label   TEXT NOT NULL DEFAULT 'Uploading document...',
    document_name TEXT,
    storage_path  TEXT,        -- Supabase Storage object path
    error_message TEXT,
    scorecard_id  UUID,        -- FK to risk_scorecards once complete
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── documents ────────────────────────────────────────────────────────────────
-- Stores top-level document metadata.
CREATE TABLE IF NOT EXISTS documents (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id        UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    filename       TEXT NOT NULL,
    storage_path   TEXT NOT NULL,
    page_count     INTEGER,
    is_scanned     BOOLEAN NOT NULL DEFAULT FALSE,
    file_size_bytes BIGINT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── chunks ───────────────────────────────────────────────────────────────────
-- Layout-aware semantic chunks with spatial metadata for Feature A (Citation Engine).
CREATE TABLE IF NOT EXISTS chunks (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    page_number   INTEGER NOT NULL,     -- 1-indexed
    bbox_x0       FLOAT NOT NULL,       -- bounding box in PDF points
    bbox_y0       FLOAT NOT NULL,
    bbox_x1       FLOAT NOT NULL,
    bbox_y1       FLOAT NOT NULL,
    raw_text      TEXT NOT NULL,
    section_type  TEXT CHECK (section_type IN ('header','paragraph','table','footer','unknown')),
    section_label TEXT,                 -- e.g. "Clause 4.2", "Financial Summary"
    chunk_index   INTEGER NOT NULL,     -- ordering within document
    embedding     vector(768),          -- text-embedding-004 outputs 768 dims
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast vector similarity search
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
    ON chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Index for filtering by task
CREATE INDEX IF NOT EXISTS chunks_task_id_idx ON chunks(task_id);

-- ─── risk_scorecards ──────────────────────────────────────────────────────────
-- Stores the final guardrailed LLM output.
CREATE TABLE IF NOT EXISTS risk_scorecards (
    id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id                   UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    document_name             TEXT NOT NULL,
    overall_risk_level        TEXT NOT NULL CHECK (overall_risk_level IN ('CRITICAL','MODERATE','CLEAR')),
    audit_summary             TEXT NOT NULL,
    -- Project metadata (flattened for queryability)
    project_name              TEXT,
    rera_registration_number  TEXT,
    promoter_name             TEXT,
    completion_date           TEXT,
    -- Financial cross-check results (Feature B)
    total_withdrawn_escrow    FLOAT,
    structural_progress_pct   FLOAT,
    total_project_cost        FLOAT,
    capital_diversion_flagged BOOLEAN NOT NULL DEFAULT FALSE,
    diversion_delta_inr       FLOAT,
    -- Full structured JSON payload
    scorecard_json            JSONB NOT NULL,
    glossary_terms_injected   TEXT[],
    processing_time_seconds   FLOAT,
    model_used                TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scorecards_task_id_idx ON risk_scorecards(task_id);
CREATE INDEX IF NOT EXISTS scorecards_risk_level_idx ON risk_scorecards(overall_risk_level);
CREATE INDEX IF NOT EXISTS scorecards_rera_num_idx ON risk_scorecards(rera_registration_number);

-- ─── Auto-update updated_at on tasks ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Enable RLS (configure policies in Supabase dashboard or add service-role bypass)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_scorecards ENABLE ROW LEVEL SECURITY;

-- Service role bypass (used by backend with SUPABASE_SERVICE_KEY)
CREATE POLICY "Service role full access — tasks"
    ON tasks FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access — documents"
    ON documents FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access — chunks"
    ON chunks FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access — scorecards"
    ON risk_scorecards FOR ALL USING (auth.role() = 'service_role');

-- ─── pgvector similarity search function ─────────────────────────────────────
-- Used by the RAG retriever to find semantically similar chunks.
CREATE OR REPLACE FUNCTION match_chunks(
    query_embedding vector(768),
    filter_task_id  UUID,
    match_count     INT DEFAULT 8
)
RETURNS TABLE (
    id            UUID,
    raw_text      TEXT,
    page_number   INTEGER,
    bbox_x0       FLOAT,
    bbox_y0       FLOAT,
    bbox_x1       FLOAT,
    bbox_y1       FLOAT,
    section_label TEXT,
    similarity    FLOAT
)
LANGUAGE sql STABLE AS $$
    SELECT
        c.id,
        c.raw_text,
        c.page_number,
        c.bbox_x0,
        c.bbox_y0,
        c.bbox_x1,
        c.bbox_y1,
        c.section_label,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM chunks c
    WHERE c.task_id = filter_task_id
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
$$;
