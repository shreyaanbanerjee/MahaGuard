"use client";

import { RiskFinding, RiskScorecard, RiskStatus } from "@/lib/types";
import { ExternalLink, AlertTriangle, CheckCircle, AlertCircle, Cpu, TrendingDown, Clock, Building2, Hash } from "lucide-react";

interface RiskScorecardProps {
  scorecard: RiskScorecard;
  onViewEvidence: (finding: RiskFinding) => void;
}

function RiskBadge({ status }: { status: RiskStatus }) {
  const map = {
    CRITICAL: { cls: "badge-critical", icon: "🔴", label: "Critical Risk" },
    MODERATE: { cls: "badge-moderate", icon: "🟡", label: "Moderate Risk" },
    CLEAR:    { cls: "badge-clear",    icon: "🟢", label: "Clear"         },
  };
  const { cls, icon, label } = map[status];
  return <span className={cls}>{icon} {label}</span>;
}

function OverallRiskBanner({ status, summary }: { status: RiskStatus; summary: string }) {
  const config = {
    CRITICAL: { bg: "var(--critical-bg)", border: "var(--critical-border)", color: "var(--critical)", label: "CRITICAL RISK DETECTED" },
    MODERATE: { bg: "var(--moderate-bg)", border: "var(--moderate-border)", color: "var(--moderate)", label: "MODERATE RISKS FOUND" },
    CLEAR:    { bg: "var(--clear-bg)",    border: "var(--clear-border)",    color: "var(--clear)",    label: "DOCUMENT CLEARED" },
  }[status];

  return (
    <div style={{
      padding: "20px 24px", borderRadius: "var(--radius-md)",
      background: config.bg, border: `1px solid ${config.border}`,
      marginBottom: "24px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <div style={{
          width: 10, height: 10, borderRadius: "50%",
          background: config.color,
          boxShadow: `0 0 8px ${config.color}`,
        }} />
        <span style={{ fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.12em", color: config.color }}>
          {config.label}
        </span>
      </div>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.7 }}>{summary}</p>
    </div>
  );
}

function MetadataGrid({ scorecard }: { scorecard: RiskScorecard }) {
  const pm = scorecard.project_metadata;
  const items = [
    { icon: <Building2 size={13} />, label: "Project", value: pm.project_name },
    { icon: <Hash size={13} />,      label: "RERA Reg.", value: pm.rera_registration_number },
    { icon: <Clock size={13} />,     label: "Completion", value: pm.completion_date },
    { icon: null,                    label: "Promoter", value: pm.promoter_name },
    { icon: null,                    label: "District", value: pm.district },
    { icon: null,                    label: "Survey No.", value: pm.land_survey_number },
  ].filter(i => i.value);

  if (!items.length) return null;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
      gap: "12px", marginBottom: "24px",
    }}>
      {items.map(({ icon, label, value }) => (
        <div key={label} style={{
          padding: "12px 14px", borderRadius: "var(--radius-sm)",
          background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "4px" }}>
            <span style={{ color: "var(--text-muted)" }}>{icon}</span>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
              {label}
            </span>
          </div>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function FinancialPanel({ scorecard }: { scorecard: RiskScorecard }) {
  const fc = scorecard.financial_cross_check;
  if (fc.data_completeness === "INCOMPLETE") return null;

  const pct = fc.structural_progress_pct ?? 0;
  const withdrawn = fc.total_withdrawn_escrow ?? 0;
  const allowable = fc.allowable_withdrawal_inr ?? 0;
  const diverted = fc.capital_diversion_flagged;

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  return (
    <div style={{
      padding: "20px 24px", borderRadius: "var(--radius-md)", marginBottom: "24px",
      background: diverted ? "var(--critical-bg)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${diverted ? "var(--critical-border)" : "var(--border)"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        {diverted
          ? <TrendingDown size={16} color="var(--critical)" />
          : <CheckCircle size={16} color="var(--clear)" />
        }
        <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: diverted ? "var(--critical)" : "var(--text-primary)" }}>
          Financial Cross-Check {diverted ? "⚠ Capital Diversion Flagged" : "✓ Within Tolerance"}
        </h3>
        <span style={{
          marginLeft: "auto", fontSize: "0.65rem", fontWeight: 700,
          padding: "2px 8px", borderRadius: "999px",
          background: "rgba(99,102,241,0.1)", color: "var(--accent-light)",
          border: "1px solid rgba(99,102,241,0.2)",
        }}>
          DETERMINISTIC
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
        {[
          { label: "Withdrawn from Escrow", value: fmt(withdrawn), highlight: diverted },
          { label: "Allowable Withdrawal", value: fmt(allowable), highlight: false },
          { label: "Structural Progress", value: `${pct}%`, highlight: false },
        ].map(({ label, value, highlight }) => (
          <div key={label} style={{
            padding: "12px", borderRadius: "var(--radius-sm)",
            background: highlight ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${highlight ? "rgba(239,68,68,0.25)" : "var(--border)"}`,
          }}>
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: highlight ? "var(--critical)" : "var(--text-primary)" }}>{value}</div>
          </div>
        ))}
      </div>
      {diverted && fc.diversion_delta_inr && (
        <div style={{ marginTop: "12px", fontSize: "0.8rem", color: "var(--critical)", fontWeight: 600 }}>
          ⚠ Excess of {fmt(fc.diversion_delta_inr)} withdrawn beyond permissible limit
        </div>
      )}
    </div>
  );
}

export default function RiskScorecardPanel({ scorecard, onViewEvidence }: RiskScorecardProps) {
  const rowClass = (status: RiskStatus) =>
    status === "CRITICAL" ? "critical-row" : status === "MODERATE" ? "moderate-row" : "clear-row";

  return (
    <div className="fade-in" style={{ height: "100%", overflowY: "auto", padding: "4px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
          <span className="label-tag">Risk Scorecard</span>
          <RiskBadge status={scorecard.overall_risk_level} />
          <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "5px" }}>
            <Cpu size={12} /> {scorecard.model_used} · {scorecard.processing_time_seconds.toFixed(1)}s
          </span>
        </div>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", wordBreak: "break-word" }}>
          {scorecard.document_name}
        </h2>
      </div>

      <OverallRiskBanner status={scorecard.overall_risk_level} summary={scorecard.audit_summary} />
      <MetadataGrid scorecard={scorecard} />
      <FinancialPanel scorecard={scorecard} />

      {/* Glossary Terms */}
      {scorecard.glossary_terms_injected.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
            Localized Legal Terms Detected
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {scorecard.glossary_terms_injected.map((term) => (
              <span key={term} style={{
                padding: "3px 10px", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 500,
                background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
                color: "var(--gold-light)",
              }}>
                {term}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="divider" />

      {/* Risk Findings Table */}
      <div>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "16px" }}>
          Risk Findings ({scorecard.risk_findings.length})
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table className="scorecard-table" aria-label="Risk findings">
            <thead>
              <tr>
                <th>Risk Category</th>
                <th>Status</th>
                <th>AI Finding</th>
                <th>Confidence</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {scorecard.risk_findings.map((finding, i) => (
                <tr key={i} className={rowClass(finding.status)}>
                  <td style={{ minWidth: 140 }}>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.8rem" }}>
                      {finding.risk_category}
                    </div>
                    {finding.deterministic_flag && (
                      <span style={{
                        display: "inline-block", marginTop: "4px", fontSize: "0.6rem",
                        padding: "1px 6px", borderRadius: "999px",
                        background: "rgba(99,102,241,0.1)", color: "var(--accent-light)",
                        border: "1px solid rgba(99,102,241,0.2)",
                      }}>
                        DETERMINISTIC
                      </span>
                    )}
                  </td>
                  <td style={{ minWidth: 110 }}>
                    <RiskBadge status={finding.status} />
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    <p style={{ lineHeight: 1.6, fontSize: "0.8rem" }}>{finding.ai_finding}</p>
                    {finding.remediation_hint && (
                      <p style={{ marginTop: "6px", fontSize: "0.72rem", color: "var(--accent-light)", fontStyle: "italic" }}>
                        💡 {finding.remediation_hint}
                      </p>
                    )}
                  </td>
                  <td style={{ minWidth: 90 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{
                        flex: 1, height: 4, borderRadius: "999px",
                        background: "rgba(255,255,255,0.08)", overflow: "hidden",
                      }}>
                        <div style={{
                          width: `${Math.round(finding.confidence_score * 100)}%`,
                          height: "100%",
                          background: finding.confidence_score > 0.8 ? "var(--clear)" : finding.confidence_score > 0.6 ? "var(--moderate)" : "var(--critical)",
                          borderRadius: "999px",
                        }} />
                      </div>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {Math.round(finding.confidence_score * 100)}%
                      </span>
                    </div>
                  </td>
                  <td style={{ minWidth: 130 }}>
                    <button
                      id={`view-evidence-${i}`}
                      className="btn-ghost"
                      style={{ padding: "7px 14px", fontSize: "0.78rem" }}
                      onClick={() => onViewEvidence(finding)}
                      aria-label={`View source evidence for ${finding.risk_category}`}
                    >
                      <ExternalLink size={12} />
                      View Source
                    </button>
                    <div style={{ marginTop: "4px", fontSize: "0.65rem", color: "var(--text-muted)" }}>
                      {finding.citations.length} citation{finding.citations.length !== 1 ? "s" : ""}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
