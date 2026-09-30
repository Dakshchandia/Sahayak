"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare, CheckCircle2, Clock3, AlertCircle,
  ShieldCheck, Info, RefreshCw
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { toast, Toaster } from "sonner";
import { formatDateTime } from "@/lib/utils";

const REASON_LABELS: Record<string, string> = {
  hours_exceed_roster: "Hours exceed roster",
  repeated_additional: "Repeated additional assignments",
  insufficient_recovery: "Insufficient recovery",
  conflicting_deadlines: "Conflicting deadlines",
  postponed_rest: "Postponed rest/leave",
  capacity_exceeded: "Capacity exceeded",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  acknowledged: "Acknowledged",
  under_review: "Under review",
  adjustment_proposed: "Adjustment proposed",
  resolved: "Resolved",
  closed_no_adjustment: "Closed — no adjustment",
};

const TRANSITIONS: Record<string, string[]> = {
  submitted: ["acknowledged", "closed_no_adjustment"],
  acknowledged: ["under_review", "closed_no_adjustment"],
  under_review: ["adjustment_proposed", "closed_no_adjustment"],
  adjustment_proposed: ["resolved"],
};

export default function WorkloadRequestsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [proposedAdjustment, setProposedAdjustment] = useState("");
  const [closureNote, setClosureNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, reqRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/workload/reviews"),
      ]);
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      setUser(me.user);
      setCsrfToken(me.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");
      if (reqRes.ok) setRequests((await reqRes.json()).requests ?? []);
    } catch { }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function updateRequest(id: number) {
    if (!newStatus) return;
    setSaving(true);
    try {
      const res = await fetch("/api/workload/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csrfToken, id, newStatus,
          proposedAdjustment: proposedAdjustment || undefined,
          closureNote: closureNote || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("Request updated. Personnel have been notified.");
      setActiveId(null); setNewStatus(""); setProposedAdjustment(""); setClosureNote("");
      load();
    } catch { toast.error("Network error."); }
    finally { setSaving(false); }
  }

  if (!user) return null;

  const open = requests.filter((r) => !["resolved", "closed_no_adjustment"].includes(r.status));
  const closed = requests.filter((r) => ["resolved", "closed_no_adjustment"].includes(r.status));

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">OPERATIONAL ROSTER</div>
          <h1>Workload Requests</h1>
          <p>Review and respond to personnel workload review requests.</p>
        </div>
      </div>

      <div className="demo-notice">
        <Info size={15} />
        <span>
          These are operational workload requests, not confidential welfare support requests.
          Personnel information here is duty-related only. Wellness data is excluded.
        </span>
      </div>

      {open.length === 0 && !loading && (
        <div className="panel empty compact" style={{ marginBottom: 24 }}>
          <CheckCircle2 size={28} style={{ color: "#509b83" }} />
          <p>No open workload review requests.</p>
        </div>
      )}

      {loading && <div className="panel empty compact"><div className="pulse">⟳</div><p>Loading…</p></div>}

      {open.map((r) => (
        <section key={r.id} className="panel" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 12 }}>
            <div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <b style={{ fontSize: 14 }}>{REASON_LABELS[r.reason] ?? r.reason}</b>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                  background: "#fbf5df", color: "#a79136" }}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
              </div>
              <p style={{ fontSize: 13, marginBottom: 8 }}>{r.explanation}</p>
              {r.preferredAdjustment && (
                <p style={{ fontSize: 13, color: "#5a7a9a", marginBottom: 8 }}>
                  <b>Preferred adjustment:</b> {r.preferredAdjustment}
                </p>
              )}
              {r.personnelResponse && (
                <div style={{ background: "#f4f7f8", borderRadius: 7, padding: "10px 14px", fontSize: 13, marginBottom: 8 }}>
                  <b>Personnel response:</b> {r.personnelResponse}
                </div>
              )}
              <p style={{ fontSize: 11, color: "#8b9ba3" }}>
                Submitted {formatDateTime(r.createdAt)}
              </p>
            </div>
            <button className="secondary" style={{ fontSize: 13, whiteSpace: "nowrap", flexShrink: 0 }}
              onClick={() => {
                setActiveId(activeId === r.id ? null : r.id);
                const next = TRANSITIONS[r.status];
                setNewStatus(next?.[0] ?? "");
              }}>
              {activeId === r.id ? "Cancel" : "Update"}
            </button>
          </div>

          {activeId === r.id && (
            <div style={{ borderTop: "1px solid #edf1f3", paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  New status
                </label>
                <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                  style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14 }}>
                  {(TRANSITIONS[r.status] ?? []).map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                  ))}
                </select>
              </div>

              {newStatus === "adjustment_proposed" && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Proposed adjustment <span style={{ color: "#bb4f46" }}>*</span>
                  </label>
                  <textarea value={proposedAdjustment} onChange={(e) => setProposedAdjustment(e.target.value.slice(0, 2000))}
                    placeholder="Describe the operational adjustment being proposed…"
                    style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "10px 12px",
                      fontSize: 14, minHeight: 80, resize: "vertical", boxSizing: "border-box" }} />
                </div>
              )}

              {["closed_no_adjustment", "resolved"].includes(newStatus) && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Closure note
                  </label>
                  <textarea value={closureNote} onChange={(e) => setClosureNote(e.target.value.slice(0, 1000))}
                    placeholder="Record the outcome or reason for closure…"
                    style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "10px 12px",
                      fontSize: 14, minHeight: 60, resize: "vertical", boxSizing: "border-box" }} />
                </div>
              )}

              <button className="primary" style={{ alignSelf: "flex-start" }}
                disabled={saving || !newStatus || (newStatus === "adjustment_proposed" && !proposedAdjustment)}
                onClick={() => updateRequest(r.id)}>
                {saving ? "Updating…" : `Mark as: ${STATUS_LABELS[newStatus] ?? newStatus}`}
              </button>
            </div>
          )}
        </section>
      ))}

      {closed.length > 0 && (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-heading"><h2>Closed requests ({closed.length})</h2><CheckCircle2 size={18} /></div>
          {closed.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0",
              borderBottom: "1px solid #edf1f3", fontSize: 13 }}>
              <span>{REASON_LABELS[r.reason] ?? r.reason}</span>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                background: r.status === "resolved" ? "#e9f4ee" : "#f0f4f5",
                color: r.status === "resolved" ? "#509479" : "#637780" }}>
                {STATUS_LABELS[r.status] ?? r.status}
              </span>
            </div>
          ))}
        </section>
      )}

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Workload Requests</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}
