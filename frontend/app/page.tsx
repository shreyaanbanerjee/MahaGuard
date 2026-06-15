"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Shield, Zap, Lock, Eye } from "lucide-react";
import UploadZone from "@/components/UploadZone";
import ProgressStepper from "@/components/ProgressStepper";
import { uploadDocument, getTaskStatus } from "@/lib/api";
import { TaskStatusResponse } from "@/lib/types";

const POLL_INTERVAL_MS = 2500;

const FEATURES = [
  {
    icon: <Eye size={16} color="#1e3a5f" />,
    title: "Citation Verification",
    desc: "Every risk finding is pinned to an exact page and bounding box. Click any finding to jump to the source text.",
  },
  {
    icon: <Zap size={16} color="#1e3a5f" />,
    title: "Financial Cross-Check",
    desc: "Deterministic rule engine compares escrow withdrawals vs. structural progress — no LLM involved in fraud detection.",
  },
  {
    icon: <Lock size={16} color="#1e3a5f" />,
    title: "Localized Legal Context",
    desc: "30+ Marathi land-law terms are automatically detected and injected into the AI prompt for accurate analysis.",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatusResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback((id: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const status = await getTaskStatus(id);
        setTaskStatus(status);
        if (status.status === "COMPLETE") {
          stopPolling();
          setTimeout(() => router.push(`/dashboard/${id}`), 800);
        }
        if (status.status === "FAILED") stopPolling();
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, POLL_INTERVAL_MS);
  }, [router, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const handleFileSelected = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    setTaskId(null);
    setTaskStatus(null);
    try {
      const { task_id } = await uploadDocument(file);
      setTaskId(task_id);
      setTaskStatus({
        task_id,
        status: "UPLOADING",
        progress_pct: 5,
        current_stage_label: "Document received. Preparing for processing...",
        document_name: file.name,
      });
      startPolling(task_id);
    } catch (err: any) {
      setUploadError(err?.message || "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const isProcessing = taskStatus && !["COMPLETE", "FAILED"].includes(taskStatus.status);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Navbar */}
      <nav style={{
        padding: "0 32px",
        height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-surface)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/icon.png" alt="MahaGuard logo" style={{ width: 28, height: 28, borderRadius: 6 }} />
          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--navy)", letterSpacing: "-0.01em" }}>
            MahaGuard
          </span>
          <span style={{
            marginLeft: 4,
            padding: "2px 8px", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700,
            background: "var(--clear-bg)", color: "var(--clear)", border: "1px solid var(--clear-border)",
          }}>
            Beta
          </span>
        </div>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          MahaRERA Compliance Engine
        </span>
      </nav>

      {/* Main Content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 32px 80px" }}>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: "52px" }}>
          <span className="label-tag" style={{ marginBottom: "16px", display: "inline-block" }}>
            MahaRERA · Legal Risk Audit
          </span>
          <h1 style={{
            fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800,
            color: "var(--navy)", lineHeight: 1.15,
            letterSpacing: "-0.03em", marginBottom: "16px",
          }}>
            Automated Legal Risk Audit<br />for MahaRERA Documents
          </h1>
          <p style={{
            fontSize: "1rem", color: "var(--text-muted)",
            maxWidth: 520, margin: "0 auto 0", lineHeight: 1.8,
          }}>
            Upload any MahaRERA document — Form 3, Architect Certificate, or Title Report —
            and receive a fully cited AI Risk Scorecard in minutes.
          </p>
        </div>

        {/* Upload / Progress Section */}
        <div style={{ maxWidth: 680, margin: "0 auto 56px" }}>
          {!isProcessing && !taskStatus?.status ? (
            <>
              <UploadZone onFileSelected={handleFileSelected} isUploading={isUploading} />
              {uploadError && (
                <div style={{
                  marginTop: "12px", padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--critical-bg)", border: "1px solid var(--critical-border)",
                  color: "var(--critical)", fontSize: "0.85rem",
                }}>
                  {uploadError}
                </div>
              )}
            </>
          ) : taskStatus ? (
            <ProgressStepper
              status={taskStatus.status}
              progressPct={taskStatus.progress_pct}
              stageLabel={taskStatus.current_stage_label}
              documentName={taskStatus.document_name}
              errorMessage={taskStatus.error_message}
            />
          ) : null}

          {taskStatus?.status === "FAILED" && (
            <div style={{ marginTop: "12px", textAlign: "center" }}>
              <button id="retry-upload-btn" className="btn-ghost"
                onClick={() => { setTaskStatus(null); setTaskId(null); }}>
                Try another document
              </button>
            </div>
          )}
        </div>

        {/* Feature Cards */}
        <div style={{ marginBottom: "56px" }}>
          <p style={{
            textAlign: "center", fontSize: "0.68rem", fontWeight: 700,
            letterSpacing: "0.1em", textTransform: "uppercase",
            color: "var(--text-muted)", marginBottom: "24px",
          }}>
            How it works
          </p>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "16px",
          }}>
            {FEATURES.map((f, i) => (
              <div key={i} className="glass-card" style={{ padding: "24px 20px" }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "8px",
                  background: "#eef2f7",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: "14px",
                }}>
                  {f.icon}
                </div>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>
                  {f.title}
                </h3>
                <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", lineHeight: 1.65 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Resources & Guidelines */}
        <div style={{
          maxWidth: 780, margin: "0 auto",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "28px 32px",
        }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>
            How to test MahaGuard
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "24px" }}>
            Download a sample document below, or get a real one from the MahaRERA portal.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Option 1 */}
            <div style={{
              padding: "18px 20px",
              background: "#f5f7fc",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
            }}>
              <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--navy)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                Option 1 — Sample Documents
              </p>
              <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", marginBottom: "14px" }}>
                Pre-built PDFs with intentional financial and legal anomalies for demonstration.
              </p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <a href="/examples/sample_form3_violation.pdf" download className="btn-ghost"
                  style={{ fontSize: "0.8rem" }}>
                  ↓ Form 3 — Capital Diversion
                </a>
                <a href="/examples/sample_title_report.pdf" download className="btn-ghost"
                  style={{ fontSize: "0.8rem" }}>
                  ↓ Title Report — Litigation Risk
                </a>
              </div>
            </div>

            {/* Option 2 */}
            <div style={{
              padding: "18px 20px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
            }}>
              <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--navy)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                Option 2 — Live MahaRERA Portal
              </p>
              <ol style={{ fontSize: "0.825rem", color: "var(--text-muted)", lineHeight: 1.9, paddingLeft: "18px", margin: 0 }}>
                <li>Go to <a href="https://maharera.maharashtra.gov.in/" target="_blank" rel="noreferrer" style={{ color: "var(--navy)", fontWeight: 500 }}>maharera.maharashtra.gov.in</a></li>
                <li>Navigate to <strong>Registration → Registered Projects</strong></li>
                <li>Search for a developer (e.g. "Godrej" or "Lodha") and click <strong>View</strong></li>
                <li>Download a <strong>CA Certificate (Form 3)</strong> or <strong>Title Report</strong></li>
                <li>Upload it above</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        borderTop: "1px solid var(--border)",
        padding: "18px 32px",
        textAlign: "center",
        color: "var(--text-muted)",
        fontSize: "0.78rem",
        background: "var(--bg-surface)",
      }}>
        MahaGuard AI · Automated MahaRERA Compliance Audit
      </footer>
    </div>
  );
}
