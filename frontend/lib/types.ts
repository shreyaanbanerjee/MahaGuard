// Shared TypeScript types for MahaGuard AI frontend

export type RiskStatus = "CRITICAL" | "MODERATE" | "CLEAR";
export type TaskStatus = "UPLOADING" | "OCR" | "CHUNKING" | "AI_AUDITING" | "COMPLETE" | "FAILED";

export interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SourceCitation {
  page_number: number;
  bounding_box: BoundingBox;
  raw_text: string;
  chunk_id: string;
  section_label?: string;
}

export interface RiskFinding {
  risk_category: string;
  status: RiskStatus;
  ai_finding: string;
  confidence_score: number;
  citations: SourceCitation[];
  deterministic_flag: boolean;
  remediation_hint?: string;
}

export interface FinancialCrossCheck {
  total_withdrawn_escrow?: number;
  structural_progress_pct?: number;
  total_project_cost?: number;
  allowable_withdrawal_inr?: number;
  capital_diversion_flagged: boolean;
  diversion_delta_inr?: number;
  data_completeness: string;
}

export interface ProjectMetadata {
  project_name?: string;
  rera_registration_number?: string;
  promoter_name?: string;
  promoter_pan?: string;
  promoter_gstin?: string;
  project_address?: string;
  district?: string;
  taluka?: string;
  completion_date?: string;
  total_units?: number;
  carpet_area_sqft?: number;
  land_survey_number?: string;
  na_order_number?: string;
  iod_number?: string;
  cc_number?: string;
}

export interface RiskScorecard {
  task_id: string;
  document_name: string;
  overall_risk_level: RiskStatus;
  audit_summary: string;
  project_metadata: ProjectMetadata;
  financial_cross_check: FinancialCrossCheck;
  risk_findings: RiskFinding[];
  glossary_terms_injected: string[];
  processing_time_seconds: number;
  model_used: string;
}

export interface TaskStatusResponse {
  task_id: string;
  status: TaskStatus;
  progress_pct: number;
  current_stage_label: string;
  document_name?: string;
  error_message?: string;
  scorecard_id?: string;
}

export interface ScorecardResponse {
  scorecard: RiskScorecard;
  pdf_url?: string;
}
