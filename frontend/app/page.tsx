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
    icon: <Eye size={18} color="var(--accent-light)" />,
    title: "Citation Verification Engine",
    desc: "Every risk finding is pinned to an exact page and bounding box. Zero hallucination.",
  },
  {
    icon: <Zap size={18} color="var(--gold-light)" />,
    title: "Financial Cross-Check",
    desc: "Deterministic Python logic compares escrow withdrawals vs. structural progress. No LLM in the loop.",
  },
  {
    icon: <Lock size={18} color="var(--clear)" />,
    title: "Localized Legal Context",
    desc: "30+ Marathi land-law terms auto-injected into the AI prompt for accurate cross-lingual reasoning.",
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
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback((id: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const status = await getTaskStatus(id);
        setTaskStatus(status);
        if (status.status === "COMPLETE") {
          stopPolling();
          // Navigate to dashboard after brief delay for UX
          setTimeout(() => router.push(`/dashboard/${id}`), 1000);
        }
        if (status.status === "FAILED") {
          stopPolling();
        }
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
    <>
      <div className="bg-mesh" />
      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh" }}>
        {/* Navbar */}
        <nav style={{
          padding: "16px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
          background: "rgba(8,12,20,0.8)", backdropFilter: "blur(12px)",
          position: "sticky", top: 0, zIndex: 100,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: 34, height: 34, borderRadius: "10px",
              background: "linear-gradient(135deg, var(--accent), #7c3aed)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Shield size={18} color="white" strokeWidth={2} />
            </div>
            <span style={{ fontWeight: 800, fontSize: "1.05rem", letterSpacing: "-0.01em" }}>
              MahaGuard <span style={{ color: "var(--accent-light)" }}>AI</span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              padding: "4px 12px", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700,
              background: "rgba(34,197,94,0.1)", color: "var(--clear)", border: "1px solid var(--clear-border)",
            }}>
              Beta
            </span>
          </div>
        </nav>

        {/* Hero */}
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 32px 0" }}>
          <div style={{ textAlign: "center", marginBottom: "64px" }}>
            <span className="label-tag" style={{ marginBottom: "20px", display: "inline-block" }}>
              MahaRERA Compliance · Enterprise Grade
            </span>
            <h1 className="headline-gradient" style={{
              fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 900,
              lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: "24px",
            }}>
              Automated Legal Risk<br />Audit for MahaRERA
            </h1>
            <p style={{
              fontSize: "1.1rem", color: "var(--text-secondary)",
              maxWidth: 560, margin: "0 auto 40px", lineHeight: 1.8,
            }}>
              Upload any MahaRERA document — Form 3, Architect Certificate, Title Report —
              and receive a fully grounded, AI-powered Risk Scorecard in minutes.
            </p>
          </div>

          {/* Upload / Progress Section */}
          <div style={{ maxWidth: 720, margin: "0 auto", marginBottom: "80px" }}>
            {!isProcessing && !taskStatus?.status ? (
              <>
                <UploadZone onFileSelected={handleFileSelected} isUploading={isUploading} />
                {uploadError && (
                  <div style={{
                    marginTop: "16px", padding: "12px 16px",
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

            {/* Upload another / retry */}
            {taskStatus?.status === "FAILED" && (
              <div style={{ marginTop: "16px", textAlign: "center" }}>
                <button
                  id="retry-upload-btn"
                  className="btn-ghost"
                  onClick={() => { setTaskStatus(null); setTaskId(null); }}
                >
                  Try another document
                </button>
              </div>
            )}
          </div>

          {/* Feature Cards */}
          <div style={{ marginBottom: "80px" }}>
            <p style={{
              textAlign: "center", fontSize: "0.75rem", fontWeight: 700,
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: "var(--text-muted)", marginBottom: "32px",
            }}>
              Three Killer Features
            </p>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "20px",
            }}>
              {FEATURES.map((f, i) => (
                <div
                  key={i}
                  className="glass-card"
                  style={{ padding: "28px 24px" }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: "10px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: "16px",
                  }}>
                    {f.icon}
                  </div>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
                    {f.title}
                  </h3>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer style={{
          borderTop: "1px solid var(--border)", padding: "24px 32px",
          textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem",
        }}>
          MahaGuard AI — Enterprise MahaRERA Compliance Engine &nbsp;·&nbsp; Built for Maharashtra Real Estate
        </footer>
      </div>
    </>
  );
}
