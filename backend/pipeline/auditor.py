"""
AI Auditing Engine — RAG + instructor + Pydantic guardrailed LLM output.

Workflow:
1. For each risk category query, retrieve top-k semantically similar chunks
2. Scan chunks for Marathi legal terms (Feature C) → inject into system prompt
3. Call Gemini 1.5 Flash via `instructor`, forcing RiskScorecard output
4. Merge with deterministic financial cross-check result (Feature B)
"""
import os
import time
import logging
import uuid
from typing import Optional

import instructor
import google.generativeai as genai
from google.generativeai import GenerativeModel

from models.schemas import (
    RiskScorecard, RiskFinding, RiskStatus, SourceCitation,
    BoundingBox, FinancialCrossCheck, ProjectMetadata, FinancialCrossCheck
)
from pipeline.glossary import scan_and_inject
from pipeline.embedder import embed_query
from pipeline.financial_check import run_financial_cross_check
from db.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# ─── Risk Category Query Templates ────────────────────────────────────────────
RISK_QUERIES = [
    ("RERA Non-Compliance", "MahaRERA registration compliance quarterly report disclosure"),
    ("Title Defect", "land title ownership Satbara Utara encumbrance NA order survey number"),
    ("Escrow Violation", "escrow account withdrawal deposit 70% Form 3 CA certificate funds"),
    ("Construction Delay", "completion date structural progress timeline delay extension"),
    ("Missing Disclosure", "promoter disclosure flat buyer agreement carpet area amenities"),
    ("FSI Violation", "FSI Floor Space Index TDR premium approved plan building"),
    ("Approval Lapse", "IOD commencement certificate CC occupancy certificate OC expired"),
    ("Encumbrance Found", "mortgage lien charge bank encumbrance loan pledge"),
]


def _build_system_prompt(glossary_block: str) -> str:
    base = """You are a senior legal auditor specializing in Maharashtra Real Estate (MahaRERA) compliance.
Your task is to analyze the provided document excerpts and extract ALL risk findings in the specified JSON schema.

STRICT RULES:
1. ONLY report findings that are directly evidenced in the provided text excerpts.
2. Do NOT hallucinate, infer, or extrapolate beyond what the text explicitly states.
3. Every finding MUST cite the exact passage (raw_text) it is based on.
4. If a risk category has no evidence in the text, do NOT include it.
5. Be precise with numbers, dates, and legal references — quote them exactly as they appear.
6. Confidence scores: 0.85–0.95 for clear explicit evidence; 0.60–0.80 for implied/indirect evidence.
"""
    if glossary_block:
        base += f"\n\n{glossary_block}"

    return base


def _retrieve_chunks(task_id: str, query: str, top_k: int = 6) -> list[dict]:
    """Retrieves semantically similar chunks from pgvector via Supabase RPC."""
    embedding = embed_query(query)
    if not embedding:
        return []

    sb = get_supabase()
    result = sb.rpc("match_chunks", {
        "query_embedding": embedding,
        "filter_task_id": task_id,
        "match_count": top_k,
    }).execute()

    return result.data or []


def _chunk_to_citation(chunk: dict) -> SourceCitation:
    return SourceCitation(
        page_number=chunk["page_number"],
        bounding_box=BoundingBox(
            x0=chunk["bbox_x0"],
            y0=chunk["bbox_y0"],
            x1=chunk["bbox_x1"],
            y1=chunk["bbox_y1"],
        ),
        raw_text=chunk["raw_text"],
        chunk_id=str(chunk["id"]),
        section_label=chunk.get("section_label"),
    )


async def run_audit(
    task_id: str,
    document_name: str,
    financial_data: Optional[dict] = None,
) -> RiskScorecard:
    """
    Main entry point for the AI auditing engine.
    Returns a fully structured, grounded RiskScorecard.
    """
    start_time = time.time()
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])

    all_findings: list[RiskFinding] = []
    all_chunk_texts: list[str] = []

    # ─── Step 1: Retrieve chunks for each risk category ──────────────────────
    category_chunks: dict[str, list[dict]] = {}
    for category, query in RISK_QUERIES:
        chunks = _retrieve_chunks(task_id, query, top_k=6)
        if chunks:
            category_chunks[category] = chunks
            all_chunk_texts.extend(c["raw_text"] for c in chunks)

    # ─── Step 2: Feature C — Glossary scan + prompt injection ────────────────
    glossary_block, injected_terms = scan_and_inject(all_chunk_texts)
    system_prompt = _build_system_prompt(glossary_block)

    # ─── Step 3: Build context passages for LLM ──────────────────────────────
    context_passages = []
    all_citations_map: dict[str, SourceCitation] = {}

    for category, chunks in category_chunks.items():
        for chunk in chunks:
            citation = _chunk_to_citation(chunk)
            all_citations_map[chunk["id"]] = citation
            context_passages.append(
                f"[{category} | Page {chunk['page_number']} | "
                f"Similarity: {chunk.get('similarity', 0):.2f}]\n{chunk['raw_text']}"
            )

    context_text = "\n\n---\n\n".join(context_passages[:40])  # cap at 40 passages

    user_message = f"""Analyze the following document excerpts from a MahaRERA compliance document.
Extract ALL risk findings with exact citations.

Document Name: {document_name}
Task ID: {task_id}

=== DOCUMENT EXCERPTS ===
{context_text}
=== END EXCERPTS ===

Return a complete RiskScorecard JSON. Every finding must reference the exact raw_text from above."""

    # ─── Step 4: instructor-wrapped LLM call ─────────────────────────────────
    try:
        gemini_client = GenerativeModel(
            model_name="gemini-flash-latest",
            system_instruction=system_prompt,
        )
        client = instructor.from_gemini(
            client=gemini_client,
            mode=instructor.Mode.GEMINI_JSON,
        )

        scorecard_partial = client.chat.completions.create(
            response_model=RiskScorecard,
            messages=[{"role": "user", "content": user_message}],
            max_retries=3,
        )
        all_findings = scorecard_partial.risk_findings or []

    except Exception as e:
        logger.error(f"LLM call failed for task {task_id}: {e}", exc_info=True)
        raise

    # ─── Step 5: Feature B — Deterministic financial cross-check ─────────────
    fin_data = financial_data or {}
    fin_form3_citation = None
    fin_form1_citation = None

    # Try to find Form 3 / Form 1 citations from retrieved chunks
    for cid, citation in all_citations_map.items():
        text_lower = citation.raw_text.lower()
        if "form 3" in text_lower or "ca certificate" in text_lower or "withdrawn" in text_lower:
            fin_form3_citation = citation
        if "form 1" in text_lower or "architect" in text_lower or "structural progress" in text_lower:
            fin_form1_citation = citation

    fin_result, fin_risk_finding = run_financial_cross_check(
        total_withdrawn_escrow=fin_data.get("total_withdrawn_escrow"),
        structural_progress_pct=fin_data.get("structural_progress_pct"),
        total_project_cost=fin_data.get("total_project_cost"),
        form3_citation=fin_form3_citation,
        form1_citation=fin_form1_citation,
    )

    if fin_risk_finding:
        all_findings.insert(0, fin_risk_finding)  # Capital diversion always first

    # ─── Step 6: Determine overall risk level ────────────────────────────────
    if any(f.status == RiskStatus.CRITICAL for f in all_findings):
        overall_risk = RiskStatus.CRITICAL
    elif any(f.status == RiskStatus.MODERATE for f in all_findings):
        overall_risk = RiskStatus.MODERATE
    else:
        overall_risk = RiskStatus.CLEAR

    # ─── Step 7: Assemble final scorecard ─────────────────────────────────────
    processing_time = round(time.time() - start_time, 2)

    final_scorecard = RiskScorecard(
        task_id=task_id,
        document_name=document_name,
        overall_risk_level=overall_risk,
        audit_summary=scorecard_partial.audit_summary,
        project_metadata=scorecard_partial.project_metadata,
        financial_cross_check=fin_result,
        risk_findings=all_findings,
        glossary_terms_injected=injected_terms,
        processing_time_seconds=processing_time,
        model_used="gemini-flash-latest",
    )

    # ─── Step 8: Persist to Supabase ─────────────────────────────────────────
    sb = get_supabase()
    pm = final_scorecard.project_metadata
    fc = final_scorecard.financial_cross_check

    result = sb.table("risk_scorecards").insert({
        "task_id": task_id,
        "document_name": document_name,
        "overall_risk_level": overall_risk.value,
        "audit_summary": final_scorecard.audit_summary,
        "project_name": pm.project_name,
        "rera_registration_number": pm.rera_registration_number,
        "promoter_name": pm.promoter_name,
        "completion_date": pm.completion_date,
        "total_withdrawn_escrow": fc.total_withdrawn_escrow,
        "structural_progress_pct": fc.structural_progress_pct,
        "total_project_cost": fc.total_project_cost,
        "capital_diversion_flagged": fc.capital_diversion_flagged,
        "diversion_delta_inr": fc.diversion_delta_inr,
        "scorecard_json": final_scorecard.model_dump(mode="json"),
        "glossary_terms_injected": injected_terms,
        "processing_time_seconds": processing_time,
        "model_used": "gemini-flash-latest",
    }).execute()

    logger.info(f"Scorecard persisted for task {task_id} — overall: {overall_risk.value}")
    return final_scorecard
