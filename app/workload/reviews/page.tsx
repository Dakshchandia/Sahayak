"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquarePlus, CheckCircle2, Clock3, AlertCircle,
  ShieldCheck, Info, ChevronRight
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { toast, Toaster } from "sonner";
import { formatDateTime } from "@/lib/utils";

const REASONS = [
  { value: "hours_exceed_roster",    label: "Actual hours exceed the roster" },
  { value: "repeated_additional",    label: "Repeated additional assignments" },
  { value: "insufficient_recovery",  label: "Insufficient recovery between duties" },
  { value: "conflicting_deadlines",  label: "Conflicting deadlines" },
  { value: "postponed_rest",         label: "Repeated postponement of rest or leave" },
  { value: "capacity_exceeded",      label: "Work exceeds available capacity" },
  { value: "other",                  label: "Other operational workload concern" },
];

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  acknowledged: "Acknowledged",
  under_review: "Under review",
  adjustment_proposed: "Adjustment proposed",
  resolved: "Resolved",
  closed_no_adjustment: "Closed — no adjustment",
};

const VISIBILITY_NOTE =
  "This request is visible to your operational manager and unit administrator. " +
  "It is NOT sent to the confidential welfare officer. " +
  "Raising a workload concern has no effect on your disciplinary record or performance score.";

export default function WorkloadReviewsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [form, setForm] = useState({ reason: "hours_exceed_roster", explanation: "", preferredAdjustment: "" });
  const [respondId, setRespondId] = useState<number | null>(null);
  const [response, setResponse] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, reviewRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/workload/reviews"),
      ]);
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      setUser(me.user);
      setCsrfToken(me.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");
      if (reviewRes.ok) setRequests((await reviewRes.json()).requests ?? []);
    } catch { }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!acknowledged) { toast.error("Please acknowledge who can see this request."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/workload/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csrfToken,
          reason: form.reason,
          explanation: form.explanation,
          preferredAdjustment: form.preferredAdjustment || undefined,
          visibilityAcknowledged: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("Request submitted. Your manager will be notified.");
      setShowForm(false); setAcknowledged(false);
      setForm({ reason: "hours_exceed_roster", explanation: "", preferredAdjustment: "" });
      load();
    } catch { toast.error("Network error."); }
    finally { setSaving(false); }
  }

  async function submitResponse(id: number) {
    setSaving(true);
    try {
      const res = await fetch("/api/workload/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken, id, personnelResponse: response }),
      });
      if (!res.ok) { toast.error("Could not submit response."); return; }
      toast.success("Response submitted.");
      setRespondId(null); setResponse(""); load();
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
          <div className="eyebrow">WORKLOAD & RECOVERY</div>
          <h1>Workload Review</h1>
          <p>Request a formal review of your operational workload.</p>
        </div>
        <button className="primary" onClick={() => setShowForm(true)}>
          <MessageSquarePlus size={17} /> New review request
        </button>
      </div>

      {/* Privacy notice — shown prominently */}
      <div style={{ background: "#edf6f2", border: "1px solid #dbeae3", borderRadius: 8, padding: "14px 16px",
        fontSize: 13, color: "#54806e", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <b style={{ display: "block", marginBottom: 4 }}>Who can see a workload review request?</b>
            {VISIBILITY_NOTE}
            <br /><br />
            <b>For confidential welfare support</b>, use the separate <button
              onClick={() => router.push("/personnel/support")}
              style={{ color: "#147d6e", fontWeight: 600, textDecoration: "underline" }}>
              Get support
            </button> page.
          </div>
        </div>
      </div>

      {/* Open requests */}
      {!loading && open.length > 0 && (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-heading"><h2>Open requests</h2><Clock3 size={18} /></div>
          {open.map((r) => (
            <div key={r.id} style={{ borderBottom: "1px solid #edf1f3", padding: "16px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {REASONS.find((rr) => rr.value === r.reason)?.label ?? r.reason}
                    </span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                      background: "#fbf5df", color: "#a79136" }}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, marginBottom: 8 }}>{r.explanation}</p>
                  {r.proposedAdjustment && (
                    <div style={{ background: "#e9f0f6", borderRadius: 7, padding: "10px 14px", fontSize: 13, marginBottom: 8 }}>
                      <b style={{ display: "block", marginBottom: 4 }}>Proposed adjustment:</b>
                      {r.proposedAdjustment}
                    </div>
                  )}
                  {r.status === "adjustment_proposed" && !r.personnelResponse && (
                    respondId === r.id ? (
                      <div style={{ marginTop: 10 }}>
                        <textarea value={response} onChange={(e) => setResponse(e.target.value)}
                          placeholder="Your response to the proposed adjustment…"
                          style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "10px 12px",
                            fontSize: 13, minHeight: 70, resize: "vertical", boxSizing: "border-box", marginBottom: 8 }} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="primary" disabled={saving || response.length < 5}
                            onClick={() => submitResponse(r.id)}>Submit response</button>
                          <button className="secondary" onClick={() => { setRespondId(null); setResponse(""); }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button className="secondary" style={{ fontSize: 13, marginTop: 8 }}
                        onClick={() => setRespondId(r.id)}>
                        Respond to proposal
                      </button>
                    )
                  )}
                  {r.personnelResponse && (
                    <div style={{ background: "#f4f7f8", borderRadius: 7, padding: "10px 14px", fontSize: 12, marginTop: 8 }}>
                      <b>Your response:</b> {r.personnelResponse}
                    </div>
                  )}
                  <p style={{ fontSize: 11, color: "#8b9ba3", marginTop: 8 }}>
                    Submitted {formatDateTime(r.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {loading && <div className="panel empty compact"><div className="pulse">⟳</div><p>Loading…</p></div>}

      {!loading && open.length === 0 && (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="empty compact">
            <MessageSquarePlus size={28} style={{ color: "#b3c2c9" }} />
            <p>No open workload review requests. Use the button above to submit one.</p>
          </div>
        </section>
      )}

      {closed.length > 0 && (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-heading"><h2>Past requests</h2><CheckCircle2 size={18} /></div>
          {closed.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0",
              borderBottom: "1px solid #edf1f3", fontSize: 13 }}>
              <span>{REASONS.find((rr) => rr.value === r.reason)?.label ?? r.reason}</span>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                background: r.status === "resolved" ? "#e9f4ee" : "#f0f4f5",
                color: r.status === "resolved" ? "#509479" : "#637780" }}>
                {STATUS_LABELS[r.status] ?? r.status}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* New request form modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,28,36,.45)", display: "grid",
          placeItems: "center", zIndex: 50, padding: 24, overflowY: "auto" }}>
          <div style={{ background: "white", borderRadius: 12, padding: 28, width: "100%", maxWidth: 540 }}>
            <h2 style={{ marginBottom: 16 }}>New workload review request</h2>
            <form onSubmit={submitRequest} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Reason</label>
                <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14 }}>
                  {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Explanation <span style={{ color: "#bb4f46" }}>*</span>
                </label>
                <textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value.slice(0, 2000) })}
                  placeholder="Describe the workload concern in detail…" required minLength={20}
                  style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "10px 12px",
                    fontSize: 14, minHeight: 90, resize: "vertical", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Preferred adjustment <span style={{ color: "#8b9ba3", fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea value={form.preferredAdjustment}
                  onChange={(e) => setForm({ ...form, preferredAdjustment: e.target.value.slice(0, 500) })}
                  placeholder="What change would help? (e.g. reduced night shifts, leave scheduling)"
                  style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "10px 12px",
                    fontSize: 14, minHeight: 60, resize: "vertical", boxSizing: "border-box" }} />
              </div>

              {/* Visibility acknowledgement */}
              <div style={{ background: "#fffbea", border: "1px solid #e8d98a", borderRadius: 7, padding: 14 }}>
                <label style={{ display: "flex", gap: 10, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)}
                    style={{ marginTop: 2, accentColor: "#147d6e" }} />
                  <span>
                    <b>I understand who can see this request:</b> {VISIBILITY_NOTE}
                  </span>
                </label>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" className="primary" disabled={saving || !acknowledged || form.explanation.length < 20}>
                  {saving ? "Submitting…" : "Submit request"}
                </button>
                <button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Workload Review</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}
