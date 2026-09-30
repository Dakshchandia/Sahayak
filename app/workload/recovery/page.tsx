"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Clock, Moon, TrendingUp, AlertCircle, CheckCircle2,
  HelpCircle, ShieldCheck, Info, ChevronDown, ChevronRight,
  RefreshCw, Calendar, Clock3, FileText
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { toast, Toaster } from "sonner";
import { formatDate, formatDateTime } from "@/lib/utils";

interface DutyEntry {
  id: number;
  dutyType: string;
  scheduledStart: string;
  scheduledEnd: string;
  scheduledBreakMinutes: number;
  actualStart: string | null;
  actualEnd: string | null;
  actualBreakMinutes: number | null;
  verificationStatus: string;
  isAdditionalDuty: boolean;
  status: string;
  scheduledDurationMinutes: number | null;
  actualDurationMinutes: number | null;
  additionalMinutes: number;
  nightDurationMinutes: number;
  hasOverlapFlag: boolean;
  notes: string | null;
}

interface CorrectionEntry {
  id: number;
  dutyLedgerId: number | null;
  explanation: string;
  status: string;
  reviewDecision: string | null;
  createdAt: string;
}

function hm(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function StatusChip({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    verified: { bg: "#e9f4ee", color: "#509479" },
    pending: { bg: "#fbf5df", color: "#a79136" },
    disputed: { bg: "#fcf0e9", color: "#b77b52" },
    no_actual_data: { bg: "#f0f4f5", color: "#637780" },
    scheduled: { bg: "#e9f0f6", color: "#5a7a9a" },
    completed: { bg: "#e9f4ee", color: "#509479" },
    cancelled: { bg: "#f0f4f5", color: "#8b9ba3" },
  };
  const c = colors[status] ?? { bg: "#f0f4f5", color: "#637780" };
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600, ...c }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function MyDutyRecoveryPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [duties, setDuties] = useState<DutyEntry[]>([]);
  const [corrections, setCorrections] = useState<CorrectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"week" | "month" | "all">("month");
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<DutyEntry | null>(null);
  const [explanation, setExplanation] = useState("");
  const [repStart, setRepStart] = useState("");
  const [repEnd, setRepEnd] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [meRes, dutyRes, corrRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(
          filter === "week"
            ? `/api/workload/duty-ledger?from=${new Date(Date.now() - 7 * 86400000).toISOString()}`
            : filter === "month"
            ? `/api/workload/duty-ledger?from=${new Date(Date.now() - 30 * 86400000).toISOString()}`
            : "/api/workload/duty-ledger"
        ),
        fetch("/api/workload/corrections"),
      ]);
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      setUser(me.user);
      setCsrfToken(me.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");
      if (dutyRes.ok) setDuties((await dutyRes.json()).duties ?? []);
      if (corrRes.ok) setCorrections((await corrRes.json()).corrections ?? []);
    } catch { setError("Could not load duty records. Please retry."); }
    finally { setLoading(false); }
  }, [router, filter]);

  useEffect(() => { load(); }, [load]);

  async function submitCorrection() {
    setSaving(true);
    try {
      const res = await fetch("/api/workload/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csrfToken,
          dutyLedgerId: correctionTarget?.id ?? undefined,
          reportedActualStart: repStart || undefined,
          reportedActualEnd: repEnd || undefined,
          isUnrecordedDuty: !correctionTarget,
          explanation,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("Correction request submitted. It is pending review.");
      setShowCorrectionForm(false); setExplanation(""); setRepStart(""); setRepEnd(""); setCorrectionTarget(null);
      load();
    } catch { toast.error("Network error."); }
    finally { setSaving(false); }
  }

  if (!user) return null;

  // Summaries
  const totalScheduledH = duties.reduce((s, d) => s + (d.scheduledDurationMinutes ?? 0) / 60, 0);
  const totalVerifiedH = duties.filter((d) => d.verificationStatus === "verified")
    .reduce((s, d) => s + (d.actualDurationMinutes ?? 0) / 60, 0);
  const totalPendingH = duties.filter((d) => d.verificationStatus === "pending" && d.actualDurationMinutes)
    .reduce((s, d) => s + (d.actualDurationMinutes ?? 0) / 60, 0);
  const totalAdditionalH = duties.reduce((s, d) => s + (d.additionalMinutes ?? 0) / 60, 0);
  const nightShifts = duties.filter((d) => d.nightDurationMinutes > 120).length;
  const missingActual = duties.filter(
    (d) => d.status !== "cancelled" && d.status !== "scheduled" && !d.actualEnd
      && new Date(d.scheduledEnd) < new Date()
  ).length;

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKLOAD & RECOVERY</div>
          <h1>My Duty & Recovery</h1>
          <p>Your scheduled and recorded actual duty hours. Wellness data is kept separate.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {["week", "month", "all"].map((f) => (
            <button key={f} className={filter === f ? "primary" : "secondary"}
              style={{ padding: "8px 16px", fontSize: 13 }}
              onClick={() => setFilter(f as any)}>
              {f === "week" ? "7 days" : f === "month" ? "30 days" : "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="demo-notice">
        <Info size={15} />
        <span>
          Operational duty records only. Your wellness check-ins and support conversations
          are in a separate confidential view and are never shown here.
        </span>
      </div>

      {/* Summary metrics */}
      <div className="metrics" style={{ gridTemplateColumns: "repeat(6,1fr)" }}>
        {[
          { label: "Scheduled", value: `${totalScheduledH.toFixed(1)}h`, icon: Calendar, detail: "From roster" },
          { label: "Verified actual", value: `${totalVerifiedH.toFixed(1)}h`, icon: CheckCircle2, detail: "Verified records" },
          { label: "Pending actual", value: `${totalPendingH.toFixed(1)}h`, icon: Clock3, detail: "Awaiting verification" },
          { label: "Additional hours", value: `${totalAdditionalH.toFixed(1)}h`, icon: TrendingUp, detail: "Beyond scheduled" },
          { label: "Night shifts", value: nightShifts, icon: Moon, detail: "≥2h in night window" },
          { label: "Missing records", value: missingActual, icon: AlertCircle, detail: "Past duties without actual times", tone: missingActual > 0 ? "attention" : "" },
        ].map(({ label, value, icon: Icon, detail, tone }) => (
          <div key={label} className={`metric ${tone ?? ""}`}>
            <div className="metric-top"><span>{label}</span><Icon size={16} /></div>
            <strong style={{ fontSize: 24 }}>{value}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>

      {missingActual > 0 && (
        <div style={{ background: "#fffbea", border: "1px solid #e8d98a", borderRadius: 8, padding: "12px 16px",
          fontSize: 13, color: "#7a6820", display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 20 }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <b>{missingActual} past duty record(s)</b> do not have actual times. A period without recorded actual times
            is labeled &ldquo;No recorded duty&rdquo; — it is not treated as verified rest. Use the correction form to report your actual hours.
          </span>
        </div>
      )}

      {/* Duty ledger table */}
      <section className="panel cases-panel">
        <div className="panel-heading">
          <div>
            <h2>Duty ledger</h2>
            <p>Scheduled vs actual comparison. Missing actual times are shown explicitly.</p>
          </div>
          <button className="secondary" style={{ fontSize: 13 }}
            onClick={() => { setCorrectionTarget(null); setShowCorrectionForm(true); }}>
            <FileText size={15} /> Report unrecorded duty
          </button>
        </div>

        {loading ? (
          <div className="empty compact"><div className="pulse">⟳</div><p>Loading…</p></div>
        ) : error ? (
          <div className="empty compact"><AlertCircle /><p>{error}</p>
            <button className="primary" onClick={load}><RefreshCw size={15} /> Retry</button></div>
        ) : duties.length === 0 ? (
          <div className="empty compact">
            <Calendar size={28} />
            <p>No duty records for this period. Records are created by your roster manager.</p>
          </div>
        ) : (
          <div className="table-wrap" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f4f7f8" }}>
                  {["Date", "Type", "Scheduled", "Actual", "Additional", "Night", "Status", ""].map((h) => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", color: "#637780", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {duties.map((d) => {
                  const hasMissingActual = !d.actualEnd && d.status !== "cancelled" && d.status !== "scheduled"
                    && new Date(d.scheduledEnd) < new Date();
                  return (
                    <tr key={d.id} style={{ borderBottom: "1px solid #edf1f3",
                      background: d.hasOverlapFlag ? "#fff9f0" : "transparent" }}>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        {formatDate(d.scheduledStart)}
                        {d.hasOverlapFlag && (
                          <span title="Overlap with another entry" style={{ marginLeft: 6, color: "#b77b52" }}>⚠</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 11, background: "#f0f4f5", padding: "2px 7px", borderRadius: 4 }}>
                          {d.dutyType}
                        </span>
                        {d.isAdditionalDuty && (
                          <span style={{ marginLeft: 4, fontSize: 11, background: "#fcf0e9", color: "#b77b52", padding: "2px 7px", borderRadius: 4 }}>
                            additional
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {hm(d.scheduledDurationMinutes ? d.scheduledDurationMinutes - d.scheduledBreakMinutes : null)}
                        <br /><span style={{ fontSize: 11, color: "#8b9ba3" }}>
                          {new Date(d.scheduledStart).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}–
                          {new Date(d.scheduledEnd).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {hasMissingActual ? (
                          <span style={{ color: "#b77b52", fontStyle: "italic" }}>No recorded actual time</span>
                        ) : d.actualEnd ? (
                          <>
                            {hm(d.actualDurationMinutes ? d.actualDurationMinutes - (d.actualBreakMinutes ?? 0) : null)}
                            <br />
                            <StatusChip status={d.verificationStatus} />
                          </>
                        ) : (
                          <span style={{ color: "#8b9ba3" }}>
                            {d.status === "scheduled" ? "Not yet" : "—"}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", color: d.additionalMinutes > 0 ? "#b77b52" : "#8b9ba3" }}>
                        {d.additionalMinutes > 0 ? `+${hm(d.additionalMinutes)}` : "—"}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {d.nightDurationMinutes > 120 ? (
                          <span style={{ color: "#5a7a9a" }}><Moon size={13} /> {hm(d.nightDurationMinutes)}</span>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <StatusChip status={d.status} />
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {(hasMissingActual || (d.actualEnd && d.verificationStatus === "pending")) && (
                          <button className="icon-button" title="Report correction"
                            onClick={() => { setCorrectionTarget(d); setShowCorrectionForm(true); }}>
                            <FileText size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Correction requests */}
      {corrections.length > 0 && (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-heading"><h2>My correction requests</h2><FileText size={18} /></div>
          {corrections.map((c) => (
            <div key={c.id} className="audit-row">
              <span className="mini-icon">
                {c.status === "approved" ? <CheckCircle2 size={17} style={{ color: "#509b83" }} />
                  : c.status === "rejected" ? <AlertCircle size={17} style={{ color: "#bb4f46" }} />
                  : <Clock3 size={17} style={{ color: "#a79136" }} />}
              </span>
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 13 }}>{c.explanation.slice(0, 80)}{c.explanation.length > 80 ? "…" : ""}</b>
                <p style={{ fontSize: 12 }}>
                  Submitted {formatDateTime(c.createdAt)}
                  {c.reviewDecision && <> · Review: {c.reviewDecision}</>}
                </p>
              </div>
              <StatusChip status={c.status} />
            </div>
          ))}
        </section>
      )}

      {/* Correction form */}
      {showCorrectionForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,28,36,.45)", display: "grid",
          placeItems: "center", zIndex: 50, padding: 24 }}>
          <div style={{ background: "white", borderRadius: 12, padding: 28, width: "100%", maxWidth: 500 }}>
            <h2 style={{ marginBottom: 8 }}>
              {correctionTarget ? "Report actual duty hours" : "Report unrecorded duty"}
            </h2>
            <p style={{ fontSize: 13, marginBottom: 20 }}>
              This is a correction request — it is reviewed before any record is changed. Rejected requests
              retain their history. Your explanation is seen by your roster manager.
            </p>
            {correctionTarget && (
              <div style={{ background: "#f4f7f8", borderRadius: 7, padding: 12, fontSize: 13, marginBottom: 16 }}>
                Scheduled: {formatDate(correctionTarget.scheduledStart)} ·{" "}
                {hm((correctionTarget.scheduledDurationMinutes ?? 0) - correctionTarget.scheduledBreakMinutes)}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Your actual start time
                </label>
                <input type="datetime-local" value={repStart} onChange={(e) => setRepStart(e.target.value)}
                  style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "8px 12px", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Your actual end time
                </label>
                <input type="datetime-local" value={repEnd} onChange={(e) => setRepEnd(e.target.value)}
                  style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "8px 12px", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Explanation <span style={{ color: "#bb4f46" }}>*</span>
                </label>
                <textarea value={explanation} onChange={(e) => setExplanation(e.target.value.slice(0, 2000))}
                  placeholder="Describe the discrepancy and why the actual hours differ from the schedule…"
                  style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "10px 12px",
                    fontSize: 14, minHeight: 90, resize: "vertical", boxSizing: "border-box" }} />
                <small className="muted">{explanation.length}/2000</small>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="primary" disabled={saving || explanation.length < 10} onClick={submitCorrection}>
                  {saving ? "Submitting…" : "Submit correction request"}
                </button>
                <button className="secondary" onClick={() => { setShowCorrectionForm(false); setExplanation(""); setRepStart(""); setRepEnd(""); }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · My Duty & Recovery</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}
