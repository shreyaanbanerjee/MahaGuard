"use client";

/**
 * PDFViewer — Feature A: Citation Verification Engine
 *
 * Renders the PDF using react-pdf and draws a highlight overlay
 * at exact bounding_box coordinates when a finding is selected.
 *
 * Coordinate system notes:
 * - PyMuPDF outputs coordinates in PDF points (1pt = 1/72 inch), top-left origin
 * - react-pdf renders pages scaled to container width
 * - We compute scale = renderedWidth / page.originalWidth to convert PDF points → pixels
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { SourceCitation } from "@/lib/types";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, FileText, Loader2 } from "lucide-react";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure pdf.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  pdfUrl: string | null;
  activeCitation: SourceCitation | null;
}

interface PageDimensions {
  originalWidth: number;
  originalHeight: number;
}

export default function PDFViewer({ pdfUrl, activeCitation }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [pageOriginalDims, setPageOriginalDims] = useState<PageDimensions | null>(null);
  const [renderedWidth, setRenderedWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Jump to citation page when activeCitation changes
  useEffect(() => {
    if (activeCitation) {
      setCurrentPage(activeCitation.page_number);
    }
  }, [activeCitation]);

  // Measure rendered page width after page renders
  const onPageRenderSuccess = useCallback((page: any) => {
    setPageOriginalDims({ originalWidth: page.width, originalHeight: page.height });
    if (pageRef.current) {
      const canvas = pageRef.current.querySelector("canvas");
      if (canvas) setRenderedWidth(canvas.offsetWidth);
    }
  }, []);

  // Compute highlight box position in pixels
  const getHighlightStyle = (): React.CSSProperties | null => {
    if (!activeCitation || !pageOriginalDims || renderedWidth === 0) return null;
    if (activeCitation.page_number !== currentPage) return null;

    const scaleX = renderedWidth / pageOriginalDims.originalWidth;
    const scaleY = scaleX; // assume uniform scaling

    const bb = activeCitation.bounding_box;
    return {
      position: "absolute",
      left:   `${bb.x0 * scaleX}px`,
      top:    `${bb.y0 * scaleY}px`,
      width:  `${(bb.x1 - bb.x0) * scaleX}px`,
      height: `${(bb.y1 - bb.y0) * scaleY}px`,
    };
  };

  if (!pdfUrl) {
    return (
      <div style={{
        height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "16px",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "rgba(99,102,241,0.08)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <FileText size={24} color="var(--text-muted)" />
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", textAlign: "center" }}>
          PDF viewer will appear here.<br />Click "View Source Evidence" to navigate to a finding.
        </p>
      </div>
    );
  }

  const highlightStyle = getHighlightStyle();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "10px 14px", borderBottom: "1px solid var(--border)",
        background: "rgba(255,255,255,0.02)", flexShrink: 0,
      }}>
        <button
          id="pdf-prev-page"
          className="btn-ghost"
          style={{ padding: "6px 10px" }}
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>

        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", minWidth: 80, textAlign: "center" }}>
          Page {currentPage} / {numPages}
        </span>

        <button
          id="pdf-next-page"
          className="btn-ghost"
          style={{ padding: "6px 10px" }}
          onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
          disabled={currentPage >= numPages}
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>

        <div style={{ flex: 1 }} />

        <button
          id="pdf-zoom-out"
          className="btn-ghost"
          style={{ padding: "6px 10px" }}
          onClick={() => setScale(s => Math.max(0.5, s - 0.2))}
          aria-label="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", minWidth: 40, textAlign: "center" }}>
          {Math.round(scale * 100)}%
        </span>
        <button
          id="pdf-zoom-in"
          className="btn-ghost"
          style={{ padding: "6px 10px" }}
          onClick={() => setScale(s => Math.min(3, s + 0.2))}
          aria-label="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
      </div>

      {/* Citation Info Banner */}
      {activeCitation && (
        <div style={{
          padding: "8px 14px", flexShrink: 0,
          background: "rgba(99,102,241,0.08)",
          borderBottom: "1px solid rgba(99,102,241,0.2)",
          fontSize: "0.75rem", color: "var(--accent-light)",
          display: "flex", alignItems: "center", gap: "8px",
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "var(--accent)", flexShrink: 0,
            boxShadow: "0 0 6px var(--accent)",
          }} />
          <span>
            Highlighting source evidence on Page {activeCitation.page_number}
            {activeCitation.section_label && ` — ${activeCitation.section_label}`}
          </span>
        </div>
      )}

      {/* PDF Canvas */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: "16px", display: "flex", justifyContent: "center" }}
      >
        <Document
          file={pdfUrl}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px", gap: "12px" }}>
              <Loader2 size={20} className="spin" color="var(--accent)" />
              <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Loading PDF...</span>
            </div>
          }
          error={
            <div style={{ color: "var(--critical)", padding: "20px", fontSize: "0.875rem" }}>
              Failed to load PDF. Check the URL or try re-uploading.
            </div>
          }
        >
          <div ref={pageRef} style={{ position: "relative", display: "inline-block" }}>
            <Page
              pageNumber={currentPage}
              scale={scale}
              onRenderSuccess={onPageRenderSuccess}
              renderTextLayer={true}
              renderAnnotationLayer={false}
            />
            {/* Feature A: Highlight Overlay */}
            {highlightStyle && (
              <div
                id="pdf-citation-highlight"
                className="pdf-highlight-box"
                style={highlightStyle}
                role="mark"
                aria-label={`Source evidence: ${activeCitation?.raw_text?.slice(0, 80)}`}
              />
            )}
          </div>
        </Document>
      </div>

      {/* Citation Text Preview */}
      {activeCitation && (
        <div style={{
          padding: "12px 14px", flexShrink: 0,
          borderTop: "1px solid var(--border)",
          background: "rgba(255,255,255,0.02)",
          maxHeight: "100px", overflowY: "auto",
        }}>
          <p style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Cited Passage
          </p>
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.6, fontStyle: "italic" }}>
            "{activeCitation.raw_text}"
          </p>
        </div>
      )}
    </div>
  );
}
