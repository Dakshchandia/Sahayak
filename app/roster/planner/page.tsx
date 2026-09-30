"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  SlidersHorizontal, AlertCircle, CheckCircle2, ShieldCheck,
  Info, RefreshCw, ArrowRight, Users, Calendar
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { toast, Toaster } from "sonner";

interface Proposal {
  type: string;
  description: string;
  affectedUserIds: number[];
  estimatedImpact: string;
}

interface ScenarioResult {
  feasible: boolean;
  infeasibilityReason: string | null;
  uncoveredDutyCount: number;
  proposals: Proposal[];
  policyWarnings: string[];
  operationalSummary: string;
  disclaimer: string;
  assumptions: string[];
}

export default function RebalancingPlannerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [lastScenarioId, setLastScenarioId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    periodStart: "",
    periodEnd: "",
    requiredStaffingPerDay: 1,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, planRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/workload/planner"),
      ]);
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      setUser(me.user);
      setCsrfToken(me.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");
      if (planRes.ok) setScenarios((await planRes.json()).scenarios ?? []);
    } catch { }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function runScenario(e: React.FormEvent) {
    e.preventDefault();
    if (!form.periodStart || !form.periodEnd || !form.title) return;
    setRunning(true); setResult(null);
    try {
      const res = await fetch("/api/workload/planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csrfToken,
          title: form.title,
          description: form.description || undefined,
          unitId: user?.unitId,
          periodStart: new Date(form.periodStart).toISOString(),
          periodEnd: new Date(form.periodEnd + "T23:59:59").toISOString(),
          requiredStaffingPerDay: form.requiredStaffingPerDay,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setResult(data.result);
      setLastScenarioId(data.id);
      load();
    } catch { toast.error("Network error."); }
    finally { setRunning(false); }
  }

  async function approveScenario(id: number, action: "review" | "approve" | "apply") {
    const res = await fetch("/api/workload/planner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csrfToken, id, action }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error); return; }
    toast.success(`Scenario ${action === "apply" ? "applied" : action === "approve" ? "approved" : "marked for review"}.`);
    load();
  }

  if (!user) return null;

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">OPERATIONAL ROSTER</div>
          <h1>Rebalancing Planner</h1>
          <p>Generate coverage-aware workload scenarios. Scenarios are separate from the live roster.</p>
        </div>
      </div>

      <div className="demo-notice">
        <Info size={15} />
        <span>
          Scenario estimates only. Wellness data excluded. No schedules are changed until a scenario
          is explicitly applied after approval. Infeasibility is reported honestly when constraints cannot be met.
        </span>
      </div>

      <div className="two-col">
        {/* Scenario form */}
        <section className="panel">
          <div className="panel-heading">
            <h2>New scenario</h2>
            <SlidersHorizontal size={20} />
          </div>
          <form onSubmit={runScenario} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Scenario title <span style={{ color: "#bb4f46" }}>*</span>
              </label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                required placeholder="e.g. October night-shift rotation"
                style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Period start</label>
                <input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
                  required style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Period end</label>
                <input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
                  required style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Required staffing per duty day: <b>{form.requiredStaffingPerDay}</b>
              </label>
              <input type="range" min={1} max={10} value={form.requiredStaffingPerDay}
                onChange={(e) => setForm({ ...form, requiredStaffingPerDay: parseInt(e.target.value) })}
                style={{ width: "100%", accentColor: "#147d6e" }} />
            </div>
            <button type="submit" className="primary" disabled={running}>
              {running ? "Generating…" : "Generate scenario"} <ArrowRight size={17} />
            </button>
          </form>

          {/* Result */}
          {result && (
            <div style={{ marginTop: 20, borderTop: "1px solid #edf1f3", paddingTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                {result.feasible
                  ? <CheckCircle2 size={20} style={{ color: "#509b83" }} />
                  : <AlertCircle size={20} style={{ color: "#bb4f46" }} />}
                <b style={{ fontSize: 14 }}>{result.feasible ? "Feasible scenario" : "Infeasible scenario"}</b>
              </div>

              {!result.feasible && result.infeasibilityReason && (
                <div style={{ background: "#fdf2f2", border: "1px solid #f0c8c4", borderRadius: 7,
                  padding: "12px 14px", fontSize: 13, color: "#9b3a36", marginBottom: 12 }}>
                  <b style={{ display: "block", marginBottom: 4 }}>Infeasibility explanation:</b>
                  {result.infeasibilityReason}
                </div>
              )}

              <p style={{ fontSize: 13, marginBottom: 12 }}>{result.operationalSummary}</p>

              {result.policyWarnings.length > 0 && result.policyWarnings.map((w, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#b77b52",
                  padding: "6px 0", borderBottom: "1px solid #f0e8e0" }}>
                  <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{w}</span>
                </div>
              ))}

              {result.proposals.map((p, i) => (
                <div key={i} style={{ background: "#f4f7f8", borderRadius: 7, padding: "10px 14px",
                  fontSize: 13, marginTop: 10 }}>
                  <b style={{ display: "block", marginBottom: 4, textTransform: "capitalize" }}>
                    {p.type.replace(/_/g, " ")}
                  </b>
                  <p style={{ marginBottom: 4 }}>{p.description}</p>
                  <small style={{ color: "#8b9ba3" }}>{p.estimatedImpact}</small>
                </div>
              ))}

              <div style={{ background: "#fffbea", border: "1px solid #e8d98a", borderRadius: 7,
                padding: "10px 14px", fontSize: 11, color: "#7a6820", marginTop: 12 }}>
                {result.disclaimer}
              </div>

              {result.feasible && lastScenarioId && (
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button className="secondary" style={{ fontSize: 13 }}
                    onClick={() => approveScenario(lastScenarioId, "review")}>Mark for review</button>
                  <button className="primary" style={{ fontSize: 13 }}
                    onClick={() => approveScenario(lastScenarioId, "approve")}>Approve scenario</button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Scenario history */}
        <section className="panel">
          <div className="panel-heading"><h2>Scenario history</h2><Calendar size={20} /></div>
          {loading ? (
            <div className="empty compact"><div className="pulse">⟳</div><p>Loading…</p></div>
          ) : scenarios.length === 0 ? (
            <div className="empty compact">
              <SlidersHorizontal size={28} style={{ color: "#b3c2c9" }} />
              <p>No scenarios yet. Generate one using the form.</p>
            </div>
          ) : (
            scenarios.map((s) => {
              const fr = s.feasibilityResult as any;
              return (
                <div key={s.id} style={{ borderBottom: "1px solid #edf1f3", padding: "14px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <b style={{ fontSize: 13 }}>{s.title}</b>
                      <p style={{ fontSize: 12, color: "#8b9ba3", marginTop: 3 }}>
                        {new Date(s.periodStart).toLocaleDateString()} – {new Date(s.periodEnd).toLocaleDateString()}
                      </p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                        background: s.status === "applied" ? "#e9f4ee" : s.status === "approved" ? "#e9f0f6" : "#f0f4f5",
                        color: s.status === "applied" ? "#509479" : s.status === "approved" ? "#5a7a9a" : "#637780" }}>
                        {s.status}
                      </span>
                      {fr && (
                        <span style={{ fontSize: 11, color: fr.feasible ? "#509479" : "#bb4f46" }}>
                          {fr.feasible ? "Feasible" : "Infeasible"}
                        </span>
                      )}
                    </div>
                  </div>
                  {s.status === "approved" && (
                    <button className="primary" style={{ fontSize: 12, marginTop: 8, padding: "6px 14px" }}
                      onClick={() => approveScenario(s.id, "apply")}>
                      Apply to live roster
                    </button>
                  )}
                </div>
              );
            })
          )}
        </section>
      </div>

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Rebalancing Planner</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}
