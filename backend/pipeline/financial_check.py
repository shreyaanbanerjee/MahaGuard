"""
Feature B: Deterministic Financial Cross-Check (NO LLM INVOLVEMENT)

Compares total escrow withdrawals (from CA Certificate / Form 3) against
structural progress certification (from Architect Form 1).

Rule: If withdrawn > (progress% + 10%) × total_project_cost → CAPITAL_DIVERSION_RISK
"""
from typing import Optional
from models.schemas import FinancialCrossCheck, RiskFinding, RiskStatus, SourceCitation


TOLERANCE_PCT: float = 10.0  # MahaRERA-defined buffer tolerance


def run_financial_cross_check(
    total_withdrawn_escrow: Optional[float],
    structural_progress_pct: Optional[float],
    total_project_cost: Optional[float],
    form3_citation: Optional[SourceCitation] = None,
    form1_citation: Optional[SourceCitation] = None,
) -> tuple[FinancialCrossCheck, Optional[RiskFinding]]:
    """
    Deterministically checks for capital diversion.

    Returns:
        (FinancialCrossCheck result, Optional[RiskFinding] if diversion detected)
    """

    # ── Guard: incomplete data ────────────────────────────────────────────────
    if any(v is None for v in [total_withdrawn_escrow, structural_progress_pct, total_project_cost]):
        return (
            FinancialCrossCheck(
                total_withdrawn_escrow=total_withdrawn_escrow,
                structural_progress_pct=structural_progress_pct,
                total_project_cost=total_project_cost,
                allowable_withdrawal_inr=None,
                capital_diversion_flagged=False,
                diversion_delta_inr=None,
                data_completeness="INCOMPLETE",
            ),
            None
        )

    # ── Core deterministic calculation ───────────────────────────────────────
    allowable_pct = structural_progress_pct + TOLERANCE_PCT
    allowable_withdrawal = (allowable_pct / 100.0) * total_project_cost
    diversion_delta = total_withdrawn_escrow - allowable_withdrawal
    is_diverted = diversion_delta > 0

    result = FinancialCrossCheck(
        total_withdrawn_escrow=total_withdrawn_escrow,
        structural_progress_pct=structural_progress_pct,
        total_project_cost=total_project_cost,
        allowable_withdrawal_inr=round(allowable_withdrawal, 2),
        capital_diversion_flagged=is_diverted,
        diversion_delta_inr=round(diversion_delta, 2) if is_diverted else None,
        data_completeness="COMPLETE",
    )

    # ── Build RiskFinding if diversion detected ───────────────────────────────
    risk_finding: Optional[RiskFinding] = None
    if is_diverted:
        citations = []
        if form3_citation:
            citations.append(form3_citation)
        if form1_citation:
            citations.append(form1_citation)

        risk_finding = RiskFinding(
            risk_category="Capital Diversion",
            status=RiskStatus.CRITICAL,
            ai_finding=(
                f"DETERMINISTIC ALERT: The project has withdrawn ₹{total_withdrawn_escrow:,.2f} "
                f"from the RERA escrow account, which exceeds the allowable limit of "
                f"₹{allowable_withdrawal:,.2f} (based on {structural_progress_pct:.1f}% structural "
                f"completion + {TOLERANCE_PCT:.0f}% tolerance). "
                f"Excess diversion of ₹{diversion_delta:,.2f} detected — potential Section 4(2)(l)(D) "
                f"MahaRERA violation."
            ),
            confidence_score=1.0,  # Deterministic — always 100% confident
            citations=citations if citations else [_placeholder_citation()],
            deterministic_flag=True,
            remediation_hint=(
                f"Verify CA Certificate (Form 3) and Architect Certificate (Form 1). "
                f"Promoter must return ₹{diversion_delta:,.2f} to escrow or provide revised architect certification."
            ),
        )

    return result, risk_finding


def _placeholder_citation() -> SourceCitation:
    """Fallback citation when source chunks weren't resolved for financial figures."""
    from models.schemas import BoundingBox
    return SourceCitation(
        page_number=1,
        bounding_box=BoundingBox(x0=0, y0=0, x1=0, y1=0),
        raw_text="[Financial figures extracted from CA Certificate Form 3 and Architect Form 1]",
        chunk_id="deterministic-check",
        section_label="Financial Cross-Check (Deterministic)",
    )
