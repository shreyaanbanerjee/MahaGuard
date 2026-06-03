from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings
from typing import List, Optional
from enum import Enum
import uuid


# ─── Enums ────────────────────────────────────────────────────────────────────

class RiskStatus(str, Enum):
    CRITICAL = "CRITICAL"
    MODERATE = "MODERATE"
    CLEAR = "CLEAR"

class TaskStatus(str, Enum):
    UPLOADING = "UPLOADING"
    OCR = "OCR"
    CHUNKING = "CHUNKING"
    AI_AUDITING = "AI_AUDITING"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"


# ─── Citation & Spatial Metadata ──────────────────────────────────────────────

class BoundingBox(BaseModel):
    x0: float = Field(description="Left x-coordinate in PDF points")
    y0: float = Field(description="Top y-coordinate in PDF points")
    x1: float = Field(description="Right x-coordinate in PDF points")
    y1: float = Field(description="Bottom y-coordinate in PDF points")

class SourceCitation(BaseModel):
    page_number: int = Field(description="1-indexed page number in the source PDF")
    bounding_box: BoundingBox
    raw_text: str = Field(description="The exact verbatim text passage from the document")
    chunk_id: str = Field(description="UUID of the chunk in the Supabase chunks table")
    section_label: Optional[str] = Field(
        default=None,
        description="Layout section label if detected (e.g. 'Clause 4.2', 'Financial Summary')"
    )


# ─── Individual Risk Finding ───────────────────────────────────────────────────

class RiskFinding(BaseModel):
    risk_category: str = Field(
        description=(
            "Category of legal/financial risk. Must be one of: "
            "'RERA Non-Compliance', 'Title Defect', 'Capital Diversion', "
            "'Escrow Violation', 'Construction Delay', 'Missing Disclosure', "
            "'FSI Violation', 'Encumbrance Found', 'Approval Lapse', 'Other'"
        )
    )
    status: RiskStatus = Field(description="Severity: CRITICAL / MODERATE / CLEAR")
    ai_finding: str = Field(
        description=(
            "Precise, factual finding in 1-3 sentences. "
            "Must reference specific clauses, amounts, or dates from the document. "
            "Do NOT generalize. Do NOT invent facts not in the source text."
        ),
        max_length=600
    )
    confidence_score: float = Field(
        ge=0.0, le=1.0,
        description="Model confidence in this finding. Be conservative — prefer 0.6–0.85 range."
    )
    citations: List[SourceCitation] = Field(
        description="Source passages grounding this finding. At least one required.",
        min_length=1
    )
    deterministic_flag: bool = Field(
        default=False,
        description="True if raised by a deterministic rule (Feature B), not LLM inference."
    )
    remediation_hint: Optional[str] = Field(
        default=None,
        description="Brief suggested action for the legal team. 1 sentence max."
    )


# ─── Deterministic Financial Cross-Check ──────────────────────────────────────

class FinancialCrossCheck(BaseModel):
    total_withdrawn_escrow: Optional[float] = Field(
        default=None,
        description="Total INR withdrawn from RERA escrow (from CA Certificate / Form 3)"
    )
    structural_progress_pct: Optional[float] = Field(
        default=None,
        description="Structural completion percentage (from Architect Form 1). Value 0–100."
    )
    total_project_cost: Optional[float] = Field(
        default=None,
        description="Total sanctioned project cost in INR"
    )
    allowable_withdrawal_inr: Optional[float] = Field(
        default=None,
        description="Max permissible withdrawal = (progress% + 10%) × total_project_cost"
    )
    capital_diversion_flagged: bool = Field(
        description="True if withdrawn > allowable_withdrawal_inr. Set by deterministic rule only."
    )
    diversion_delta_inr: Optional[float] = Field(
        default=None,
        description="Excess amount withdrawn beyond tolerance (INR). Positive = over-withdrawn."
    )
    data_completeness: str = Field(
        default="INCOMPLETE",
        description="'COMPLETE' if both Form 3 and Form 1 values were found; 'INCOMPLETE' otherwise."
    )


# ─── Project Metadata ─────────────────────────────────────────────────────────

class ProjectMetadata(BaseModel):
    project_name: Optional[str] = None
    rera_registration_number: Optional[str] = None
    promoter_name: Optional[str] = None
    promoter_pan: Optional[str] = None
    promoter_gstin: Optional[str] = None
    project_address: Optional[str] = None
    district: Optional[str] = None
    taluka: Optional[str] = None
    completion_date: Optional[str] = None
    total_units: Optional[int] = None
    carpet_area_sqft: Optional[float] = None
    land_survey_number: Optional[str] = None
    na_order_number: Optional[str] = None
    iod_number: Optional[str] = None
    cc_number: Optional[str] = None


# ─── Top-Level Guardrailed RiskScorecard ──────────────────────────────────────

class RiskScorecard(BaseModel):
    """
    The ONLY valid output format from the LLM. Enforced via `instructor`.
    Every field is grounded — no free-form generation allowed outside defined fields.
    """
    task_id: str = Field(description="UUID of the processing task")
    document_name: str = Field(description="Original filename of the uploaded PDF")
    overall_risk_level: RiskStatus = Field(
        description=(
            "Aggregate risk: CRITICAL if any finding is CRITICAL; "
            "MODERATE if any MODERATE and none CRITICAL; CLEAR otherwise."
        )
    )
    audit_summary: str = Field(
        description=(
            "Executive summary of all audit findings in 2-4 sentences. "
            "Mention the most critical finding, key project details, and overall assessment. "
            "Must be factual — no speculation."
        ),
        max_length=800
    )
    project_metadata: ProjectMetadata
    financial_cross_check: FinancialCrossCheck
    risk_findings: List[RiskFinding] = Field(
        description="All identified risk findings, each grounded with at least one citation.",
        min_length=1
    )
    glossary_terms_injected: List[str] = Field(
        default_factory=list,
        description="List of Marathi/legal terms detected in chunks and injected into the system prompt."
    )
    processing_time_seconds: float = Field(description="Total pipeline processing time in seconds")
    model_used: str = Field(description="LLM model identifier used for this audit")


# ─── API Request/Response Models ──────────────────────────────────────────────

class TaskStatusResponse(BaseModel):
    task_id: str
    status: TaskStatus
    progress_pct: int = Field(ge=0, le=100, description="Overall progress percentage")
    current_stage_label: str = Field(description="Human-readable stage description")
    document_name: Optional[str] = None
    error_message: Optional[str] = None
    scorecard_id: Optional[str] = None

class UploadResponse(BaseModel):
    task_id: str
    message: str = "Document accepted for processing. Poll /api/tasks/{task_id} for status."

class ScorecardResponse(BaseModel):
    scorecard: RiskScorecard
    pdf_url: Optional[str] = Field(
        default=None,
        description="Signed URL to retrieve the original PDF from storage for the viewer"
    )
