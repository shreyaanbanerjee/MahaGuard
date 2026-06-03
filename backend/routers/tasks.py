"""
MahaGuard AI — Tasks & Scorecards Router

GET /api/tasks/{task_id}   → Poll task status + progress
GET /api/scorecards/{task_id} → Retrieve full RiskScorecard + signed PDF URL
"""
import os
import logging
from fastapi import APIRouter, HTTPException
from models.schemas import TaskStatusResponse, TaskStatus, ScorecardResponse, RiskScorecard
from db.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter()

# Progress percentage map per status
STATUS_PROGRESS = {
    "UPLOADING": 5,
    "OCR": 25,
    "CHUNKING": 50,
    "AI_AUDITING": 75,
    "COMPLETE": 100,
    "FAILED": 0,
}


@router.get("/tasks/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    """
    Returns current status and progress for a processing task.
    Frontend polls this endpoint after upload.
    """
    sb = get_supabase()
    result = sb.table("tasks").select("*").eq("id", task_id).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")

    row = result.data
    return TaskStatusResponse(
        task_id=task_id,
        status=TaskStatus(row["status"]),
        progress_pct=row.get("progress_pct", STATUS_PROGRESS.get(row["status"], 0)),
        current_stage_label=row.get("stage_label", "Processing..."),
        document_name=row.get("document_name"),
        error_message=row.get("error_message"),
        scorecard_id=str(row["scorecard_id"]) if row.get("scorecard_id") else None,
    )


@router.get("/scorecards/{task_id}", response_model=ScorecardResponse)
async def get_scorecard(task_id: str):
    """
    Returns the full RiskScorecard for a completed task.
    Also generates a signed URL to the original PDF (for the frontend PDF viewer).
    """
    sb = get_supabase()

    # Verify task is complete
    task_result = sb.table("tasks").select("status, storage_path, scorecard_id").eq("id", task_id).single().execute()
    if not task_result.data:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")

    task_row = task_result.data
    if task_row["status"] != "COMPLETE":
        raise HTTPException(
            status_code=409,
            detail=f"Task is not complete yet. Current status: {task_row['status']}"
        )

    # Fetch scorecard
    sc_result = sb.table("risk_scorecards").select("scorecard_json").eq("task_id", task_id).single().execute()
    if not sc_result.data:
        raise HTTPException(status_code=404, detail="Scorecard not found for this task.")

    scorecard_data = sc_result.data["scorecard_json"]
    scorecard = RiskScorecard.model_validate(scorecard_data)

    # Generate signed URL for the original PDF (valid 1 hour)
    pdf_url = None
    storage_path = task_row.get("storage_path")
    if storage_path:
        try:
            url_result = sb.storage.from_("mahaguard-pdfs").create_signed_url(
                storage_path, expires_in=3600
            )
            pdf_url = url_result.get("signedURL")
        except Exception as e:
            logger.warning(f"Could not generate signed URL for task {task_id}: {e}")

    return ScorecardResponse(scorecard=scorecard, pdf_url=pdf_url)
