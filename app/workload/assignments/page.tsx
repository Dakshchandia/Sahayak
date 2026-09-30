"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList, Clock, AlertCircle, CheckCircle2, ShieldCheck,
  Info, RefreshCw, Calendar
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { formatDate } from "@/lib/utils";

interface Assignment {
  id: number;
  title: string;
  description: string | null;
  estimatedEffortHours: number | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  deadline: string | null;
  priority: string;
  effortType: string;
  status: string;
  assignmentReason: string | null;
}

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  low: { bg: "#e9f4ee", color: "#509479" },
  normal: { bg: "#f0f4f5", color: "#637780" },
  high: { bg: "#fbf5df", color: "#a79136" },
  critical: { bg: "#fcf0e9", color: "#b77b52" },
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: "#f0f4f5", color: "#8b9ba3" },
  pending_approval: { bg: "#fbf5df", color: "#a79136" },
  approved: { bg: "#e9f0f6", color: "#5a7a9a" },
  in_progress: { bg: "#e9f4ee", color: "#509479" },
  completed: { bg: "#e9f4ee", color: "#278c72" },
  cancelled: { bg: "#f0f4f5", color: "#8b9ba3" },
  rejected: { bg: "#fdf2f2", color: "#bb4f46" },
};

export default function MyAssignmentsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [meRes, assignRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/workload/assignments"),
      ]);
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      setUser(me.user);
      setCsrfToken(me.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");
      if (assignRes.ok) setAssignments((await assignRes.json()).assignments ?? []);
    } catch { setError("Could not load assignments."); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  if (!user) return null;

  const active = assignments.filter((a) => !["completed", "cancelled", "rejected"].includes(a.status));
  const past = assignments.filter((a) => ["completed", "cancelled", "rejected"].includes(a.status));
  const overdue = active.filter((a) => a.deadline && new Date(a.deadline) < new Date());

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKLOAD & RECOVERY</div>
          <h1>My Assignments</h1>
          <p>Operational tasks assigned to you. Capacity is checked before each assignment is confirmed.</p>
        </div>
      </div>

      <div className="demo-notice">
        <Info size={15} />
        <span>
          Assignment capacity checks use duty records and leave records only.
          Your wellness data is never used in assignment decisions.
        </span>
      </div>

      {overdue.length > 0 && (
        <div style={{ background: "#fdf2f2", border: "1px solid #f0c8c4", borderRadius: 8, padding: "12px 16px",
          fontSize: 13, color: "#9b3a36", display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
          <AlertCircle size={15} />
          <span><b>{overdue.length} assignment(s)</b> have passed their deadline. Contact your manager to update the status.</span>
        </div>
      )}

      <div className="metrics three">
        <div className="metric"><div className="metric-top"><span>Active</span><ClipboardList size={18} /></div>
          <strong>{active.length}</strong><small>In progress or pending</small></div>
        <div className={`metric ${overdue.length > 0 ? "attention" : ""}`}>
          <div className="metric-top"><span>Overdue</span><AlertCircle size={18} /></div>
          <strong>{overdue.length}</strong><small>Past deadline</small></div>
        <div className="metric"><div className="metric-top"><span>Completed</span><CheckCircle2 size={18} /></div>
          <strong>{past.filter((a) => a.status === "completed").length}</strong><small>Finished</small></div>
      </div>

      <section className="panel cases-panel">
        <div className="panel-heading">
          <h2>Active assignments</h2>
          <span className="subtle">{active.length} assignments</span>
        </div>

        {loading ? (
          <div className="empty compact"><div className="pulse">⟳</div><p>Loading…</p></div>
        ) : error ? (
          <div className="empty compact"><AlertCircle /><p>{error}</p>
            <button className="primary" onClick={load}><RefreshCw size={15} /> Retry</button></div>
        ) : active.length === 0 ? (
          <div className="empty compact"><ClipboardList size={28} style={{ color: "#b3c2c9" }} />
            <p>No active assignments. Your manager will notify you when tasks are assigned.</p></div>
        ) : (
          active.map((a) => {
            const pc = PRIORITY_COLORS[a.priority] ?? PRIORITY_COLORS.normal;
            const sc = STATUS_COLORS[a.status] ?? STATUS_COLORS.draft;
            const isOverdue = a.deadline && new Date(a.deadline) < new Date();
            return (
              <div key={a.id} style={{ borderBottom: "1px solid #edf1f3", padding: "16px 0",
                background: isOverdue ? "#fff9f0" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <b style={{ fontSize: 14 }}>{a.title}</b>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600, ...pc }}>
                        {a.priority}
                      </span>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600, ...sc }}>
                        {a.status.replace(/_/g, " ")}
                      </span>
                      {a.effortType === "within_shift" && (
                        <span style={{ fontSize: 11, background: "#edf7f1", color: "#278c72", padding: "2px 7px", borderRadius: 4 }}>
                          within shift
                        </span>
                      )}
                    </div>
                    {a.description && <p style={{ fontSize: 13, marginBottom: 8 }}>{a.description}</p>}
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#8b9ba3" }}>
                      {a.estimatedEffortHours != null && (
                        <span><Clock size={12} style={{ display: "inline" }} /> {a.estimatedEffortHours}h estimated
                          {a.effortType === "additional" ? " (additional to duty)" : " (within scheduled shift)"}</span>
                      )}
                      {a.plannedStart && <span><Calendar size={12} style={{ display: "inline" }} /> {formatDate(a.plannedStart)}</span>}
                      {a.deadline && (
                        <span style={{ color: isOverdue ? "#bb4f46" : "#8b9ba3", fontWeight: isOverdue ? 600 : 400 }}>
                          Deadline: {formatDate(a.deadline)}{isOverdue ? " — OVERDUE" : ""}
                        </span>
                      )}
                    </div>
                    {a.assignmentReason && (
                      <p style={{ fontSize: 12, marginTop: 6, color: "#687b83" }}>
                        Reason: {a.assignmentReason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      {past.length > 0 && (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-heading"><h2>Past assignments</h2><span className="subtle">{past.length}</span></div>
          {past.map((a) => {
            const sc = STATUS_COLORS[a.status] ?? STATUS_COLORS.draft;
            return (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0",
                borderBottom: "1px solid #edf1f3", fontSize: 13 }}>
                <div>
                  <b>{a.title}</b>
                  {a.deadline && <p style={{ fontSize: 12 }}>{formatDate(a.deadline)}</p>}
                </div>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600, ...sc, alignSelf: "flex-start" }}>
                  {a.status.replace(/_/g, " ")}
                </span>
              </div>
            );
          })}
        </section>
      )}

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · My Assignments</span>
      </footer>
    </AppShell>
  );
}
