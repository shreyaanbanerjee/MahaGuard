"use client";

import { CheckCircle, Circle, Loader2, XCircle } from "lucide-react";
import { TaskStatus } from "@/lib/types";

interface Stage {
  id: TaskStatus;
  label: string;
  description: string;
  pctRange: [number, number];
}

const STAGES: Stage[] = [
  { id: "UPLOADING",   label: "Uploading",     description: "Receiving document securely",           pctRange: [0, 15]  },
  { id: "OCR",         label: "OCR Analysis",  description: "Detecting layout & extracting text",    pctRange: [15, 40] },
  { id: "CHUNKING",    label: "Chunking",       description: "Semantic clause-level segmentation",    pctRange: [40, 65] },
  { id: "AI_AUDITING", label: "AI Auditing",   description: "RAG retrieval & risk classification",   pctRange: [65, 90] },
  { id: "COMPLETE",    label: "Complete",       description: "Risk Scorecard ready",                  pctRange: [90, 100]},
];

interface ProgressStepperProps {
  status: TaskStatus;
  progressPct: number;
  stageLabel: string;
  documentName?: string;
  errorMessage?: string;
}

export default function ProgressStepper({
  status, progressPct, stageLabel, documentName, errorMessage,
}: ProgressStepperProps) {
  const currentStageIdx = STAGES.findIndex((s) => s.id === status);
  const isFailed = status === "FAILED";

  return (
    <div className="glass-card fade-in" style={{ padding: "32px" }}>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <span className="label-tag" style={{ marginBottom: "8px", display: "inline-block" }}>
              Processing
            </span>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)", margin: "8px 0 4px" }}>
              {documentName || "MahaRERA Document"}
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              {isFailed ? errorMessage || "Processing failed" : stageLabel}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              fontSize: "2rem", fontWeight: 800, lineHeight: 1,
              background: "linear-gradient(135deg, var(--accent-light), #a78bfa)",
              WebkitBackgroundClip: "text", backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              {progressPct}%
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "4px" }}>
              complete
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="progress-bar-track" style={{ marginTop: "20px" }}>
          <div
            className="progress-bar-fill"
            style={{ width: `${progressPct}%` }}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Stage Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {STAGES.map((stage, idx) => {
          const isDone = !isFailed && (
            currentStageIdx > idx || status === "COMPLETE"
          );
          const isActive = !isFailed && currentStageIdx === idx && status !== "COMPLETE";
          const isPending = !isDone && !isActive;

          return (
            <div
              key={stage.id}
              id={`step-${stage.id.toLowerCase()}`}
              className={`stepper-step ${isActive ? "active" : isDone ? "done" : "pending"}`}
            >
              <div className={`stepper-dot ${isActive ? "active" : isDone ? "done" : "pending"}`}>
                {isDone ? (
                  <CheckCircle size={16} color="var(--bg-deep)" strokeWidth={2.5} />
                ) : isActive ? (
                  <Loader2 size={16} color="white" strokeWidth={2} className="spin" />
                ) : (
                  <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600 }}>
                    {idx + 1}
                  </span>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: "0.875rem", fontWeight: 600,
                  color: isDone ? "var(--clear)" : isActive ? "var(--text-primary)" : "var(--text-muted)",
                }}>
                  {stage.label}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  {stage.description}
                </div>
              </div>
              {isDone && (
                <span style={{ fontSize: "0.7rem", color: "var(--clear)", fontWeight: 600 }}>Done</span>
              )}
              {isActive && (
                <span style={{ fontSize: "0.7rem", color: "var(--accent-light)", fontWeight: 600 }}>
                  Running...
                </span>
              )}
            </div>
          );
        })}

        {isFailed && (
          <div className="stepper-step" style={{
            background: "var(--critical-bg)", border: "1px solid var(--critical-border)",
          }}>
            <div className="stepper-dot" style={{ background: "var(--critical)" }}>
              <XCircle size={16} color="white" strokeWidth={2} />
            </div>
            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--critical)" }}>
                Processing Failed
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                {errorMessage || "An unexpected error occurred. Please retry."}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
