"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText, AlertCircle, Shield } from "lucide-react";

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  isUploading: boolean;
}

export default function UploadZone({ onFileSelected, isUploading }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("File exceeds the 50MB limit.");
      return;
    }
    onFileSelected(file);
  }, [onFileSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      id="upload-dropzone"
      className={`dropzone ${isDragOver ? "drag-over" : ""} ${isUploading ? "pointer-events-none opacity-60" : ""}`}
      style={{ padding: "64px 40px", textAlign: "center" }}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !isUploading && inputRef.current?.click()}
      role="button"
      aria-label="Upload MahaRERA PDF document"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        id="pdf-file-input"
        type="file"
        accept=".pdf"
        style={{ display: "none" }}
        onChange={handleInputChange}
        aria-label="Select PDF file"
      />

      {/* Icon */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
        <div style={{
          width: 64, height: 64, borderRadius: "12px",
          background: "#eef2f7",
          border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s ease",
        }}>
          {isDragOver
            ? <Upload size={26} color="var(--navy)" strokeWidth={1.5} />
            : <FileText size={26} color="var(--navy-light)" strokeWidth={1.5} />
          }
        </div>
      </div>

      <h3 style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
        {isDragOver ? "Drop your MahaRERA document here" : "Upload MahaRERA Document"}
      </h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "24px" }}>
        Drag & drop a PDF or click to browse — Form 3, Architect Form 1, Title Reports, etc.
      </p>

      <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap", marginBottom: "20px" }}>
        {["Form 3 (CA Certificate)", "Architect Form 1", "Title Search Report", "Satbara Utara"].map((label) => (
          <span key={label} style={{
            padding: "3px 10px", borderRadius: "999px",
            background: "var(--bg-subtle)",
            border: "1px solid var(--border)",
            fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 500,
          }}>
            {label}
          </span>
        ))}
      </div>

      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
        PDF only · Max 50MB · Marathi &amp; English supported
      </p>

      {error && (
        <div style={{
          marginTop: "20px", padding: "10px 16px", borderRadius: "var(--radius-sm)",
          background: "var(--critical-bg)", border: "1px solid var(--critical-border)",
          display: "flex", alignItems: "center", gap: "8px",
          color: "var(--critical)", fontSize: "0.85rem",
        }}>
          <AlertCircle size={15} />
          {error}
        </div>
      )}
    </div>
  );
}
