"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft, ShieldCheck, CheckCheck, Clock3, HeartHandshake,
  AlertCircle, Plus, Save, LockKeyhole, BarChart3, Moon
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { toast, Toaster } from "sonner";

const VALID_TRANSITIONS: Record<string, string[]> = {
  new:                  ["reviewed", "dismissed"],
  reviewed:             ["contacted", "dismissed"],
  contacted:            ["intervention_agreed", "follow_up", "dismissed"],
  intervention_agreed:  ["follow_up", "closed"],
  follow_up:            ["closed", "contacted"],
  closed:               [],
  dismissed:            [],
};

const STATUS_LABELS: Record<string, string> = {
  new: "New", reviewed: "Reviewed", contacted: "Contacted",
  intervention_agreed: "Intervention agreed", follow_up: "Follow-up",
  closed: "Closed", dismissed: "Dismissed",
};

const INTERVENTION_OPTIONS = [
  { value: "welfare_conversation", label: "Confidential welfare conversation" },
  { value: "counsellor_referral",  label: "Counsellor referral" },
  { value: "leave_review",         label: "Leave review" },
  { value: "duty_adjustment",      label: "Duty adjustment proposal" },
  { value: "recovery_planning",    label: "Recovery planning" },
  { value: "follow_up_conversation", label: "Follow-up conversation" },
  { value: "no_action_needed",     label: "No action needed" },
];

export default function CaseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const caseId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [caseData, setCaseData] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dutyContext, setDutyContext] = useState<any>(null);

  // Form state
  const [newStatus, setNewStatus] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [closureReason, setClosureReason] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [interventionType, setInterventionType] = useState("welfare_conversation");

  useEffect(() => {
    async function init() {
      const [meRes] = await Promise.all([fetch("/api/auth/me")]);
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      setUser(me.user);
      const tok = me.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "";
      setCsrfToken(tok);

      // Open/load case
      const caseRes = await fetch("/api/welfare/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken: tok, action: "open", personnelId: undefined, caseId: parseInt(caseId) }),
      });

      // For opening we use the case ID from URL
      const detailRes = await fetch(`/api/welfare/cases?caseId=${caseId}`);
      const notesRes = await fetch(`/api/welfare/notes?caseId=${caseId}`);

      if (detailRes.ok) {
        const d = await detailRes.json();
        setCaseData(d);
        setNewStatus(d.case?.status ?? "new");
        setFollowUpDate(d.case?.nextFollowUpDate ?? "");
        // Load duty context for the welfare officer (operational data only)
        if (d.personnel?.id) {
          fetch(`/api/workload/context?userId=${d.personnel.id}`)
            .then((r) => r.ok ? r.json() : null)
            .then((ctx) => setDutyContext(ctx))
            .catch(() => {});
        }
      }
      if (notesRes.ok) {
        const d = await notesRes.json();
        setNotes(d.notes ?? []);
      }
      setLoading(false);
    }
    init();
  }, [caseId, router]);

  async function saveStatus() {
    if (!caseData) return;
    setSaving(true);
    try {
      const res = await fetch("/api/welfare/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csrfToken,
          action: "update_status",
          caseId: caseData.case.id,
          status: newStatus,
          nextFollowUpDate: followUpDate || null,
          closureReason: closureReason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Could not update case."); return; }
      toast.success("Case updated.");
      setCaseData((prev: any) => ({ ...prev, case: { ...prev.case, status: newStatus } }));
    } catch {
      toast.error("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!noteContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/welfare/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csrfToken,
          caseId: parseInt(caseId),
          content: noteContent.trim(),
          isConfidential: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Could not save note."); return; }
      toast.success("Note saved.");
      setNoteContent("");
      setNotes((prev) => [{ id: data.noteId, content: noteContent, createdAt: new Date().toISOString(), isConfidential: true }, ...prev]);
    } catch {
      toast.error("Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (!user || loading) return null;
  if (!caseData) return <div style={{ padding: 40, textAlign: "center" }}><p>Case not found.</p></div>;

  const { case: wcase, personnel, assessment } = caseData;
  const availableTransitions = VALID_TRANSITIONS[wcase.status] ?? [];
  const factors = assessment?.factors ?? [];

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <button
          onClick={() => router.push("/welfare")}
          style={{ display: "flex", alignItems: "center", gap: 8, color: "#637780", fontSize: 13, marginBottom: 20 }}
        >
          <ArrowLeft size={16} /> Back to cases
        </button>

        <div className="page-heading">
          <div>
            <div className="eyebrow">CONFIDENTIAL WELFARE REVIEW</div>
            <h1>{personnel.name}</h1>
            <p>{personnel.personnelId ?? `User #${personnel.id}`} · Welfare case #{wcase.id}</p>
          </div>
          <span className={`badge ${wcase.priority}`}>{wcase.priority}</span>
        </div>

        <div className="demo-notice">
          <LockKeyhole size={15} />
          <span>This case is confidential. Notes and details are visible only to authorized welfare officers.</span>
        </div>

        <div className="two-col">
          {/* Assessment factors */}
          <section className="panel">
            <div className="panel-heading">
              <h2>Assessment factors</h2>
              <span className="subtle">Rule-based · Not a diagnosis</span>
            </div>
            {factors.length > 0 ? (
              <>
                <div className="score-card">
                  <div>
                    <span>Welfare indicator (illustrative, not clinical)</span>
                    <strong>
                      {assessment.totalScore}
                      <small>/{assessment.maxPossibleScore ?? "—"}</small>
                    </strong>
                  </div>
                  <span className={`badge ${assessment.priority}`}>{assessment.priority}</span>
                </div>
                <p className="muted" style={{ marginBottom: 16 }}>
                  Raw score out of the maximum possible for available data. Not a diagnosis or clinical probability.
                  Priority threshold: Elevated ≥55 pts · Watch ≥25 pts.
                </p>
                {factors.map((f: any) => (
                  <div className="factor" key={f.name}>
                    <div>
                      <b>{f.name}</b>
                      <small>{f.value}</small>
                    </div>
                    <span style={{ fontSize: 13, color: "#bc875f" }}>
                      {f.points > 0 ? `+${f.points}` : "—"}
                    </span>
                  </div>
                ))}
                {assessment.plainExplanation && (
                  <div style={{ marginTop: 16, padding: 14, background: "#f4f7f8", borderRadius: 7, fontSize: 13 }}>
                    <b style={{ display: "block", marginBottom: 6 }}>Plain-language summary</b>
                    <p>{assessment.plainExplanation}</p>
                    {assessment.aiExplanationSource === "gemini" && (
                      <small className="muted" style={{ marginTop: 8, display: "block" }}>
                        AI-assisted explanation (Gemini). Reviewed by welfare officer before use.
                      </small>
                    )}
                    {assessment.aiExplanationSource === "template" && (
                      <small className="muted" style={{ marginTop: 8, display: "block" }}>
                        Template explanation (AI unavailable).
                      </small>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="muted">No assessment available yet for this case.</p>
            )}
          </section>

          {/* Case management */}
          <section className="panel">
            <div className="panel-heading">
              <h2>Case management</h2>
              <ShieldCheck size={20} />
            </div>

            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              Current status: <span className="status">{STATUS_LABELS[wcase.status]}</span>
            </label>

            {availableTransitions.length > 0 && (
              <>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", margin: "16px 0 8px" }}>
                  Update status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14 }}
                >
                  <option value={wcase.status}>{STATUS_LABELS[wcase.status]} (current)</option>
                  {availableTransitions.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </>
            )}

            <label style={{ fontSize: 13, fontWeight: 600, display: "block", margin: "16px 0 8px" }}>
              Follow-up date
            </label>
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" }}
            />

            {(newStatus === "closed" || newStatus === "dismissed") && (
              <>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", margin: "16px 0 8px" }}>
                  {newStatus === "dismissed" ? "Dismissal reason" : "Closure reason"}
                </label>
                <textarea
                  value={closureReason}
                  onChange={(e) => setClosureReason(e.target.value.slice(0, 500))}
                  placeholder="Record why this case is being closed…"
                  style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "10px 12px",
                    fontSize: 14, minHeight: 70, resize: "vertical", boxSizing: "border-box" }}
                />
              </>
            )}

            <button
              className="primary full"
              style={{ marginTop: 20 }}
              disabled={saving}
              onClick={saveStatus}
            >
              {saving ? "Saving…" : "Save case update"} <CheckCheck size={17} />
            </button>
            <p className="muted" style={{ marginTop: 12 }}>
              Welfare recommendations require human approval. No duty records are changed automatically.
            </p>
          </section>
        </div>

        {/* Confidential notes */}
        <section className="panel" style={{ marginBottom: 25 }}>
          <div className="panel-heading">
            <div>
              <h2>Confidential notes</h2>
              <p>Visible to welfare officers only. Not shared with commanders or HR.</p>
            </div>
            <LockKeyhole size={18} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value.slice(0, 2000))}
              placeholder="Record context, agreed next steps or observations from a welfare conversation…"
              style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 7, padding: "10px 12px",
                fontSize: 14, minHeight: 90, resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <small className="muted">{noteContent.length}/2000</small>
              <button
                className="primary"
                disabled={saving || !noteContent.trim()}
                onClick={addNote}
              >
                <Plus size={16} /> Add note
              </button>
            </div>
          </div>

          {notes.length > 0 ? (
            <div>
              {notes.map((note) => (
                <div key={note.id} className="audit-row">
                  <span className="mini-icon"><LockKeyhole size={17} /></span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, color: "#2d4a55", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                      {note.content}
                    </p>
                  </div>
                  <time style={{ fontSize: 12, color: "#8b9ba3", whiteSpace: "nowrap" }}>
                    {new Date(note.createdAt).toLocaleString()}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No notes yet for this case.</p>
          )}
        </section>
      </div>

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Welfare Officer View</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}
