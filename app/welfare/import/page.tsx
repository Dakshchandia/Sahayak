"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, Download, CheckCheck, AlertCircle, FileText,
  ArrowRight, ShieldCheck, X, Info, RefreshCw
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { toast, Toaster } from "sonner";

const RECORD_TYPES = [
  { value: "duty_schedule", label: "Duty schedules",  template: "/templates/duty_schedule_template.csv" },
  { value: "deployment",    label: "Deployments",     template: "/templates/deployment_template.csv" },
  { value: "leave",         label: "Leave records",   template: "/templates/leave_template.csv" },
  { value: "transfer",      label: "Transfers",       template: "/templates/transfer_template.csv" },
  { value: "training",      label: "Training records", template: "/templates/training_template.csv" },
];

const REQUIRED_COLUMNS: Record<string, string[]> = {
  duty_schedule: ["personnel_id", "period_start", "period_end", "weekly_hours", "night_shifts"],
  deployment:    ["personnel_id", "start_date"],
  leave:         ["personnel_id", "leave_type", "start_date", "end_date", "duration_days"],
  transfer:      ["personnel_id", "transfer_date"],
  training:      ["personnel_id", "name", "start_date", "end_date"],
};

interface PreviewResult {
  jobId: number;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: Array<{ rowNumber: number; field?: string; message: string; rawValue?: string }>;
  preview: Record<string, string>[];
}

interface CommitResult {
  ok: boolean;
  committedRows: number;
  skippedDuplicates: number;
  errorRows: number;
  summary: string;
}

export default function ImportPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [recordType, setRecordType] = useState("duty_schedule");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"idle" | "previewing" | "committing" | "done">("idle");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      if (!r.ok) { router.push("/login"); return; }
      const d = await r.json();
      if (!["welfare_officer", "admin"].includes(d.user?.role)) {
        router.push("/unauthorized"); return;
      }
      setUser(d.user);
      setCsrfToken(d.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");
    });
  }, [router]);

  async function handlePreview() {
    if (!file) { toast.error("Select a CSV file first."); return; }
    setLoading(true);
    setPreview(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("recordType", recordType);
      form.append("csrfToken", csrfToken);
      const res = await fetch("/api/import?action=preview", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Preview failed."); return; }
      setPreview(data);
      setStage("previewing");
    } catch { toast.error("Network error."); }
    finally { setLoading(false); }
  }

  async function handleCommit() {
    if (!file || !preview) return;
    setStage("committing");
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("recordType", recordType);
      form.append("csrfToken", csrfToken);
      const res = await fetch("/api/import?action=commit", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Commit failed."); setStage("previewing"); return; }
      setResult(data);
      setStage("done");
      toast.success(data.summary);
    } catch { toast.error("Network error."); setStage("previewing"); }
    finally { setLoading(false); }
  }

  function reset() {
    setFile(null); setPreview(null); setResult(null); setStage("idle");
    if (fileRef.current) fileRef.current.value = "";
  }

  const selectedType = RECORD_TYPES.find((t) => t.value === recordType)!;
  const requiredCols = REQUIRED_COLUMNS[recordType] ?? [];

  if (!user) return null;

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ORGANIZATIONAL RECORDS</div>
          <h1>Import duty and deployment records</h1>
          <p>Upload CSV files to populate welfare indicators. Preview before committing.</p>
        </div>
      </div>

      <div className="demo-notice">
        <Info size={15} />
        <span>
          This import path is provided as there is no live CAPF/Armed Forces HR integration.
          Records are validated, deduplicated and audited on commit.
        </span>
      </div>

      {stage === "done" && result ? (
        <section className="panel" style={{ textAlign: "center", padding: 40 }}>
          <CheckCheck size={48} style={{ color: "#509b83", margin: "0 auto 16px" }} />
          <h2 style={{ marginBottom: 8 }}>Import complete</h2>
          <p style={{ marginBottom: 20, fontSize: 15 }}>{result.summary}</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 24 }}>
            <div style={{ textAlign: "center" }}>
              <strong style={{ fontSize: 28, color: "#509b83" }}>{result.committedRows}</strong>
              <p style={{ fontSize: 13 }}>Records added</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <strong style={{ fontSize: 28, color: "#a06030" }}>{result.skippedDuplicates}</strong>
              <p style={{ fontSize: 13 }}>Duplicates skipped</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <strong style={{ fontSize: 28, color: "#bb4f46" }}>{result.errorRows}</strong>
              <p style={{ fontSize: 13 }}>Errors</p>
            </div>
          </div>
          <button className="primary" onClick={reset}><RefreshCw size={16} /> Import another file</button>
        </section>
      ) : (
        <div className="two-col">
          {/* Upload panel */}
          <section className="panel">
            <div className="panel-heading">
              <h2>Upload configuration</h2>
              <Upload size={20} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>
                Record type
              </label>
              <select
                value={recordType}
                onChange={(e) => { setRecordType(e.target.value); reset(); }}
                disabled={stage !== "idle"}
                style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14 }}
              >
                {RECORD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Template download */}
            <a
              href={selectedType.template}
              download
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#147d6e",
                fontWeight: 600, marginBottom: 20 }}
            >
              <Download size={16} /> Download {selectedType.label} template
            </a>

            {/* Required columns */}
            <div style={{ background: "#f4f7f8", borderRadius: 7, padding: 14, marginBottom: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#3a5260" }}>
                Required columns:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {requiredCols.map((col) => (
                  <code key={col} style={{ fontSize: 11, background: "#e0e8eb", padding: "2px 7px",
                    borderRadius: 4, color: "#2e5560" }}>
                    {col}
                  </code>
                ))}
              </div>
            </div>

            {/* File input */}
            <div
              style={{
                border: `2px dashed ${file ? "#147d6e" : "#dce5e8"}`,
                borderRadius: 10, padding: 24, textAlign: "center",
                background: file ? "#edf7f1" : "#fafcfc", cursor: "pointer",
                marginBottom: 16,
              }}
              onClick={() => fileRef.current?.click()}
            >
              <FileText size={28} style={{ color: file ? "#147d6e" : "#8b9ba3", margin: "0 auto 10px" }} />
              {file ? (
                <p style={{ fontSize: 14, color: "#2e5560", fontWeight: 600 }}>{file.name}</p>
              ) : (
                <>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#3a5260" }}>Click to select a CSV file</p>
                  <p style={{ fontSize: 12, color: "#8b9ba3", marginTop: 4 }}>UTF-8 encoded, comma-separated</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setFile(f); setStage("idle"); setPreview(null); }
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="primary"
                style={{ flex: 1 }}
                disabled={!file || loading || stage === "committing"}
                onClick={handlePreview}
              >
                {loading && stage === "idle" ? "Previewing…" : "Preview import"}
              </button>
              {file && (
                <button className="secondary" onClick={reset} disabled={loading}>
                  <X size={16} />
                </button>
              )}
            </div>
          </section>

          {/* Preview results */}
          <section className="panel">
            <div className="panel-heading">
              <h2>Preview and validation</h2>
              <FileText size={20} />
            </div>

            {!preview && !loading && (
              <div className="empty compact" style={{ padding: "40px 20px" }}>
                <Upload size={28} />
                <p>Upload a CSV file and click Preview to see validation results.</p>
              </div>
            )}

            {loading && (
              <div className="empty compact"><div className="pulse" style={{ fontSize: 24 }}>⟳</div><p>Validating…</p></div>
            )}

            {preview && (
              <>
                {/* Summary */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Total rows",  value: preview.totalRows,  color: "#3a5260" },
                    { label: "Valid rows",  value: preview.validRows,  color: "#509b83" },
                    { label: "Error rows",  value: preview.errorRows,  color: preview.errorRows > 0 ? "#bb4f46" : "#509b83" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ textAlign: "center", background: "#f4f7f8", borderRadius: 8, padding: 14 }}>
                      <strong style={{ fontSize: 26, display: "block", color }}>{value}</strong>
                      <span style={{ fontSize: 12, color: "#687b83" }}>{label}</span>
                    </div>
                  ))}
                </div>

                {/* Errors */}
                {preview.errors.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#bb4f46", marginBottom: 10 }}>
                      <AlertCircle size={14} style={{ display: "inline", marginRight: 6 }} />
                      Validation errors (first {preview.errors.length} shown):
                    </p>
                    <div style={{ maxHeight: 200, overflowY: "auto" }}>
                      {preview.errors.map((err, i) => (
                        <div key={i} style={{ fontSize: 12, padding: "6px 0", borderBottom: "1px solid #f0f4f5",
                          display: "flex", gap: 10 }}>
                          <span style={{ color: "#8b9ba3", minWidth: 60 }}>Row {err.rowNumber}</span>
                          <span style={{ color: "#bb4f46" }}>{err.field && <b>[{err.field}]</b>} {err.message}</span>
                          {err.rawValue && <code style={{ color: "#8b9ba3", fontSize: 11 }}>= "{err.rawValue}"</code>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview table */}
                {preview.preview.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                      Preview (first {preview.preview.length} valid rows):
                    </p>
                    <div style={{ overflowX: "auto", fontSize: 12 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            {Object.keys(preview.preview[0])
                              .filter((k) => k !== "_userId")
                              .map((col) => (
                                <th key={col} style={{ padding: "6px 10px", textAlign: "left",
                                  background: "#f4f7f8", color: "#637780", borderBottom: "1px solid #e0e8eb" }}>
                                  {col}
                                </th>
                              ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.preview.slice(0, 5).map((row, i) => (
                            <tr key={i}>
                              {Object.entries(row)
                                .filter(([k]) => k !== "_userId")
                                .map(([k, v]) => (
                                  <td key={k} style={{ padding: "6px 10px", borderBottom: "1px solid #edf1f3", color: "#3a5260" }}>
                                    {v}
                                  </td>
                                ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {preview.validRows > 0 ? (
                  <button
                    className="primary full"
                    disabled={loading || stage === "committing"}
                    onClick={handleCommit}
                  >
                    {stage === "committing" ? "Committing…" : `Commit ${preview.validRows} valid rows`}
                    <CheckCheck size={17} />
                  </button>
                ) : (
                  <div className="demo-notice" style={{ marginTop: 10 }}>
                    <AlertCircle size={15} />
                    <span>No valid rows to commit. Fix the errors and re-upload.</span>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Authorized data import</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}
