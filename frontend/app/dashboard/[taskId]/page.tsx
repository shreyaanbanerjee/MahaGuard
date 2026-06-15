"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, X } from "lucide-react";
import dynamic from "next/dynamic";
import RiskScorecardPanel from "@/components/RiskScorecard";
import { getScorecard } from "@/lib/api";
import { RiskFinding, ScorecardResponse, SourceCitation } from "@/lib/types";

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
    setActiveCitation(finding.citations[0]);
    setPanelMode("split");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const closeSplitView = useCallback(() => {
    setActiveCitation(null);
    setPanelMode("scorecard");
  }, []);

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "16px",
        background: "var(--bg)",
      }}>
        <Loader2 size={28} className="spin" color="var(--navy)" />
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Loading Risk Scorecard…</p>
      </div>
    );
  }

  if (error || !scorecardData) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "16px",
        background: "var(--bg)", padding: "32px",
      }}>
        <div style={{
          padding: "24px 28px", borderRadius: "var(--radius-md)", textAlign: "center",
          background: "var(--critical-bg)", border: "1px solid var(--critical-border)", maxWidth: 440,
        }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--critical)", marginBottom: "8px" }}>
            Failed to Load Scorecard
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "16px" }}>
            {error || "The scorecard could not be retrieved. The task may still be processing."}
          </p>
          <button id="back-to-home-btn" className="btn-ghost" onClick={() => router.push("/")}>
            <ArrowLeft size={13} /> Back to Upload
          </button>
        </div>
      </div>
    );
  }

  const { scorecard, pdf_url } = scorecardData;
  const isSplit = panelMode === "split" && pdf_url;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* Navbar */}
      <nav style={{
        height: 52,
        padding: "0 20px",
        display: "flex", alignItems: "center", gap: "12px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-surface)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <button id="nav-back-btn" className="btn-ghost" onClick={() => router.push("/")}
          style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
          <ArrowLeft size={13} /> Home
        </button>

        <div style={{ width: 1, height: 20, background: "var(--border)" }} />

        <img src="/icon.png" alt="" style={{ width: 22, height: 22, borderRadius: 4 }} />
        <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--navy)" }}>
          MahaGuard
        </span>

        <div style={{ flex: 1 }} />

        {pdf_url && (
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              id="toggle-scorecard-view"
              className="btn-ghost"
              style={{
                padding: "5px 12px", fontSize: "0.78rem",
                background: panelMode === "scorecard" ? "#eef2f7" : undefined,
                borderColor: panelMode === "scorecard" ? "var(--border-mid)" : undefined,
                color: panelMode === "scorecard" ? "var(--navy)" : undefined,
                fontWeight: panelMode === "scorecard" ? 600 : undefined,
              }}
              onClick={() => setPanelMode("scorecard")}
            >
              Scorecard
            </button>
            <button
              id="toggle-split-view"
              className="btn-ghost"
              style={{
                padding: "5px 12px", fontSize: "0.78rem",
                background: panelMode === "split" ? "#eef2f7" : undefined,
                borderColor: panelMode === "split" ? "var(--border-mid)" : undefined,
                color: panelMode === "split" ? "var(--navy)" : undefined,
                fontWeight: panelMode === "split" ? 600 : undefined,
              }}
              onClick={() => setPanelMode("split")}
            >
              Split View
            </button>
          </div>
        )}

        {isSplit && (
          <button id="close-split-btn" className="btn-ghost" onClick={closeSplitView}
            style={{ padding: "5px 8px" }}>
            <X size={13} />
          </button>
        )}
      </nav>

      {/* Split-Screen Content */}
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: isSplit ? "1fr 1fr" : "min(860px, 100%)",
        justifyContent: isSplit ? undefined : "center",
        gap: 0,
        minHeight: 0,
      }}>
        {/* Left — Risk Scorecard */}
        <div style={{
          overflowY: "auto",
          padding: "28px 32px",
          borderRight: isSplit ? "1px solid var(--border)" : "none",
        }}>
          <RiskScorecardPanel
            scorecard={scorecard}
            onViewEvidence={handleViewEvidence}
          />
        </div>

        {/* Right — PDF Viewer */}
        {isSplit && (
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-subtle)" }}
            className="slide-up">
            <PDFViewer pdfUrl={pdf_url ?? null} activeCitation={activeCitation} />
          </div>
        )}
      </div>
    </div>
  );
}
