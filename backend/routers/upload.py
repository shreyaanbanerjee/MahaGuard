"""
MahaGuard AI — Upload Router

POST /api/upload
- Accepts a PDF file
- Immediately returns task_id
- Processes document in the background (ingestion → embedding → audit)
"""
import os
import uuid
import logging
import asyncio
import aiofiles
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from models.schemas import UploadResponse, TaskStatus
from db.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter()

UPLOAD_DIR = Path("/tmp/mahaguard_uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_FILE_SIZE_MB = 50


async def _set_task_status(task_id: str, status: TaskStatus, pct: int, label: str, error: str = None):
    sb = get_supabase()
    payload = {
        "status": status.value,
        "progress_pct": pct,
        "stage_label": label,
    }
    if error:
        payload["error_message"] = error
    sb.table("tasks").update(payload).eq("id", task_id).execute()


async def _process_document(task_id: str, pdf_path: str, document_name: str):
    """
    Full background pipeline: OCR → Chunking → Embedding → AI Audit
    """
    from pipeline.ingestion import (
        detect_pdf_type, extract_text_chunks_pymupdf,
        extract_text_chunks_ocr, semantic_merge_chunks, persist_chunks
    )
    from pipeline.embedder import embed_and_store_chunks
    from pipeline.auditor import run_audit

    sb = get_supabase()

    try:
        # ── Stage: OCR / Ingestion ───────────────────────────────────────────
        await _set_task_status(task_id, TaskStatus.OCR, 15, "Detecting PDF type and running OCR...")

        pdf_info = detect_pdf_type(pdf_path)
        page_count = pdf_info["page_count"]
        is_scanned = pdf_info["is_scanned"]
        scanned_pages = pdf_info["scanned_pages"]

        # Create document record
        doc_result = sb.table("documents").insert({
            "task_id": task_id,
            "filename": document_name,
            "storage_path": pdf_path,
            "page_count": page_count,
            "is_scanned": is_scanned,
            "file_size_bytes": Path(pdf_path).stat().st_size,
        }).execute()
        document_id = doc_result.data[0]["id"]

        # Extract text chunks
        text_chunks = []
        if not is_scanned:
            text_chunks = extract_text_chunks_pymupdf(pdf_path)
        if scanned_pages:
            text_chunks += extract_text_chunks_ocr(pdf_path, scanned_pages)

        await _set_task_status(task_id, TaskStatus.OCR, 30, f"OCR complete. {len(text_chunks)} raw blocks extracted.")

        # ── Stage: Chunking ───────────────────────────────────────────────────
        await _set_task_status(task_id, TaskStatus.CHUNKING, 40, "Semantic chunking by clauses and sections...")

        merged_chunks = semantic_merge_chunks(text_chunks)
        chunk_ids = await persist_chunks(task_id, document_id, merged_chunks)
        chunk_texts = [c.raw_text for c in merged_chunks]

        await _set_task_status(task_id, TaskStatus.CHUNKING, 55, f"Chunking complete. {len(merged_chunks)} semantic chunks created.")

        # ── Stage: Embedding ──────────────────────────────────────────────────
        await _set_task_status(task_id, TaskStatus.CHUNKING, 65, "Generating vector embeddings...")

        await embed_and_store_chunks(task_id, chunk_ids, chunk_texts)

        await _set_task_status(task_id, TaskStatus.AI_AUDITING, 70, "Embeddings stored. Starting AI legal audit...")

        # ── Stage: AI Auditing ────────────────────────────────────────────────
        await _set_task_status(task_id, TaskStatus.AI_AUDITING, 78, "Retrieving relevant clauses and running risk analysis...")

        scorecard = await run_audit(task_id=task_id, document_name=document_name)

        # ── Complete ──────────────────────────────────────────────────────────
        # Get the scorecard ID from DB
        sc_result = sb.table("risk_scorecards").select("id").eq("task_id", task_id).single().execute()
        scorecard_id = sc_result.data["id"] if sc_result.data else None

        sb.table("tasks").update({
            "status": TaskStatus.COMPLETE.value,
            "progress_pct": 100,
            "stage_label": "Audit complete. Risk Scorecard ready.",
            "scorecard_id": scorecard_id,
        }).eq("id", task_id).execute()

        logger.info(f"Task {task_id} completed successfully.")

    except Exception as e:
        logger.error(f"Pipeline failed for task {task_id}: {e}", exc_info=True)
        await _set_task_status(
            task_id, TaskStatus.FAILED, 0,
            "Processing failed. Please retry.",
            error=str(e)[:500],
        )
    finally:
        # Clean up temp file
        try:
            Path(pdf_path).unlink(missing_ok=True)
        except Exception:
            pass


@router.post("/upload", response_model=UploadResponse, status_code=202)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """
    Accepts a PDF upload, creates a task record, and immediately returns task_id.
    Document is processed entirely in the background.
    """
    # Validate file type
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # Check file size (read header)
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max allowed: {MAX_FILE_SIZE_MB}MB. Got: {size_mb:.1f}MB"
        )

    # Create task record
    task_id = str(uuid.uuid4())
    sb = get_supabase()
    sb.table("tasks").insert({
        "id": task_id,
        "status": TaskStatus.UPLOADING.value,
        "progress_pct": 5,
        "stage_label": "Document received. Preparing for processing...",
        "document_name": file.filename,
    }).execute()

    # Save PDF to temp location
    pdf_path = UPLOAD_DIR / f"{task_id}.pdf"
    async with aiofiles.open(pdf_path, "wb") as f:
        await f.write(content)

    await _set_task_status(task_id, TaskStatus.OCR, 10, "Document saved. Starting OCR pipeline...")

    # Kick off background processing
    background_tasks.add_task(
        _process_document,
        task_id=task_id,
        pdf_path=str(pdf_path),
        document_name=file.filename,
    )

    return UploadResponse(task_id=task_id)
