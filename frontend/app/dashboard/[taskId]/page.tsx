"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Shield, ArrowLeft, Download, Loader2, X } from "lucide-react";
import dynamic from "next/dynamic";
import RiskScorecardPanel from "@/components/RiskScorecard";
import { getScorecard } from "@/lib/api";
import { RiskFinding, RiskScorecard, ScorecardResponse, SourceCitation } from "@/lib/types";

// Dynamically import PDF viewer to avoid SSR issues with pdfjs
const PDFViewer = dynamic(() => import("@/components/PDFViewer"), { ssr: false });

type PanelMode = "scorecard" | "split";

export default function DashboardPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.taskId as string;

  const [scorecardData, setScorecardData] = useState<ScorecardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<SourceCitation | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("scorecard");

  useEffect(() => {
    if (!taskId) return;
    getScorecard(taskId)
      .then(setScorecardData)
      .catch((err) => setError(err?.message || "Failed to load scorecard."))
      .finally(() => setLoading(false));
  }, [taskId]);

  const handleViewEvidence = useCallback((finding: RiskFinding) => {
    if (finding.citations.length === 0) return;
    // Use first citation by default
    setActiveCitation(finding.citations[0]);
    setPanelMode("split");
    // Scroll to top of left panel
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const closeSplitView = useCallback(() => {
    setActiveCitation(null);
    setPanelMode("scorecard");
  }, []);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "20px",
        background: "var(--bg-deep)",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Loader2 size={24} className="spin" color="var(--accent)" />
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Loading Risk Scorecard...</p>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error || !scorecardData) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "20px",
        background: "var(--bg-deep)", padding: "32px",
      }}>
        <div style={{
          padding: "24px 32px", borderRadius: "var(--radius-lg)", textAlign: "center",
          background: "var(--critical-bg)", border: "1px solid var(--critical-border)", maxWidth: 480,
        }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--critical)", marginBottom: "12px" }}>
            Failed to Load Scorecard
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "20px" }}>
            {error || "The scorecard could not be retrieved. The task may still be processing."}
          </p>
          <button id="back-to-home-btn" className="btn-ghost" onClick={() => router.push("/")}>
            <ArrowLeft size={14} /> Back to Upload
          </button>
        </div>
      </div>
    );
  }

  const { scorecard, pdf_url } = scorecardData;
  const isSplit = panelMode === "split" && pdf_url;

  return (
    <>
      <div className="bg-mesh" style={{ position: "fixed" }} />
      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Navbar */}
        <nav style={{
          padding: "12px 24px",
          display: "flex", alignItems: "center", gap: "12px",
          borderBottom: "1px solid var(--border)",
          background: "rgba(8,12,20,0.9)", backdropFilter: "blur(16px)",
          position: "sticky", top: 0, zIndex: 100, flexWrap: "wrap",
        }}>
          <button id="nav-back-btn" className="btn-ghost" onClick={() => router.push("/")} style={{ padding: "7px 12px" }}>
            <ArrowLeft size={14} /> Home
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              width: 28, height: 28, borderRadius: "8px",
              background: "linear-gradient(135deg, var(--accent), #7c3aed)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Shield size={14} color="white" />
            </div>
            <span style={{ fontWeight: 800, fontSize: "0.95rem" }}>
              MahaGuard <span style={{ color: "var(--accent-light)" }}>AI</span>
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {/* View mode toggle */}
          {pdf_url && (
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                id="toggle-scorecard-view"
                className={`btn-ghost`}
                style={{
                  padding: "7px 14px", fontSize: "0.78rem",
                  borderColor: panelMode === "scorecard" ? "var(--accent)" : undefined,
                  color: panelMode === "scorecard" ? "var(--accent-light)" : undefined,
                }}
                onClick={() => setPanelMode("scorecard")}
              >
                Scorecard Only
              </button>
              <button
                id="toggle-split-view"
                className={`btn-ghost`}
                style={{
                  padding: "7px 14px", fontSize: "0.78rem",
                  borderColor: panelMode === "split" ? "var(--accent)" : undefined,
                  color: panelMode === "split" ? "var(--accent-light)" : undefined,
                }}
                onClick={() => setPanelMode("split")}
              >
                Split View (PDF)
              </button>
            </div>
          )}

          {/* Close split panel */}
          {isSplit && (
            <button id="close-split-btn" className="btn-ghost" onClick={closeSplitView} style={{ padding: "7px 10px" }}>
              <X size={14} />
            </button>
          )}
        </nav>

        {/* Main Split-Screen Content */}
        <div style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: isSplit ? "1fr 1fr" : "1fr",
          gap: 0,
          minHeight: 0,
        }}>
          {/* Left Panel — Risk Scorecard */}
          <div style={{
            overflowY: "auto", padding: "28px 28px",
            borderRight: isSplit ? "1px solid var(--border)" : "none",
          }}>
            <RiskScorecardPanel
              scorecard={scorecard}
              onViewEvidence={handleViewEvidence}
            />
          </div>

          {/* Right Panel — PDF Viewer (Feature A) */}
          {isSplit && (
            <div style={{
              display: "flex", flexDirection: "column", overflow: "hidden",
              background: "rgba(255,255,255,0.01)",
            }}
              className="slide-up"
            >
              <PDFViewer
                pdfUrl={pdf_url ?? null}
                activeCitation={activeCitation}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
