"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3, Moon, Clock, TrendingUp, ShieldCheck, LockKeyhole,
  Info, AlertCircle, RefreshCw, CheckCircle2, Users, Download
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { toast, Toaster } from "sonner";

interface MemberDist {
  userId: number;
  name: string;
  personnelId: string | null;
  scheduledHours: number;
  verifiedActualHours: number;
  pendingActualHours: number;
  additionalHours: number;
  nightShifts: number;
  consecutiveDays: number;
  missingActualCount: number;
  warnings: string[];
  openWorkloadRequests: number;
}

export default function WorkloadDistributionPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [distribution, setDistribution] = useState<MemberDist[]>([]);
  const [unitSummary, setUnitSummary] = useState<string[]>([]);
  const [policy, setPolicy] = useState<{ label: string; isDemoConfig: boolean } | null>(null);
  const [period, setPeriod] = useState({ from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noAccess, setNoAccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(""); setNoAccess(false);
    try {
      const [meRes, distRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/workload/distribution"),
      ]);
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      setUser(me.user);
      setCsrfToken(me.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");

      if (distRes.status === 403) { setNoAccess(true); return; }
      if (distRes.ok) {
        const d = await distRes.json();
        if (d.suppressed) { setError(d.suppressionReason); return; }
        setDistribution(d.distribution ?? []);
        setUnitSummary(d.unitSummary ?? []);
        setPolicy(d.policy);
        setPeriod(d.period ?? { from: "", to: "" });
      }
    } catch { setError("Could not load distribution data."); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    const lines = [
      "Name,Personnel ID,Scheduled Hours,Verified Actual Hours,Additional Hours,Night Shifts,Consecutive Days,Warnings",
      ...distribution.map((m) =>
        [m.name, m.personnelId ?? "", m.scheduledHours, m.verifiedActualHours,
         m.additionalHours, m.nightShifts, m.consecutiveDays,
         `"${m.warnings.join("; ")}"`].join(",")
      ),
    ];
    const blob = new Blob(["SAHAYAK UNIT WORKLOAD DISTRIBUTION\n" + lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "workload-distribution.csv"; a.click();
    toast.success("Distribution exported");
  }

  if (!user) return null;

  if (noAccess) {
    return (
      <AppShell user={user} csrfToken={csrfToken}>
        <div className="panel" style={{ maxWidth: 540, margin: "60px auto", padding: 32, textAlign: "center" }}>
          <LockKeyhole size={40} style={{ color: "#509b83", margin: "0 auto 16px" }} />
          <h2 style={{ marginBottom: 8 }}>Individual roster access required</h2>
          <p style={{ marginBottom: 16 }}>
            Viewing individual duty records requires duty manager access for this unit.
            Contact your administrator to request access.
          </p>
          <button className="secondary" onClick={() => router.push("/commander")}>
            Return to unit overview
          </button>
        </div>
      </AppShell>
    );
  }

  const totalAdditional = distribution.reduce((s, m) => s + m.additionalHours, 0);
  const withWarnings = distribution.filter((m) => m.warnings.length > 0);
  const withRequests = distribution.filter((m) => m.openWorkloadRequests > 0);

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">OPERATIONAL ROSTER</div>
          <h1>Workload Distribution</h1>
          <p>
            {period.from && period.to ? `${period.from} to ${period.to} · ` : ""}
            {distribution.length} personnel
          </p>
        </div>
        <button className="secondary" onClick={exportCsv} disabled={distribution.length === 0}>
          <Download size={17} /> Export
        </button>
      </div>

      <div className="demo-notice">
        <LockKeyhole size={15} />
        <span>
          Duty records only. Wellness check-ins, psychological scores and counselling notes
          are excluded from this view.
        </span>
      </div>

      {policy?.isDemoConfig && (
        <div style={{ background: "#fffbea", border: "1px solid #e8d98a", borderRadius: 7, padding: "10px 14px",
          fontSize: 12, color: "#7a6820", marginBottom: 16, display: "flex", gap: 8 }}>
          <AlertCircle size={14} />
          <span>Policy: <b>{policy.label}</b> — DEMONSTRATION CONFIGURATION ONLY, not a legal standard.</span>
        </div>
      )}

      {unitSummary.map((s, i) => (
        <div key={i} style={{ background: "#fdf9ec", border: "1px solid #e8d98a", borderRadius: 7, padding: "10px 14px",
          fontSize: 13, color: "#7a6820", marginBottom: 10, display: "flex", gap: 8 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{s}</span>
        </div>
      ))}

      {loading ? (
        <div className="panel empty compact"><div className="pulse">⟳</div><p>Loading…</p></div>
      ) : error ? (
        <div className="panel empty compact"><Info /><p>{error}</p>
          <button className="primary" onClick={load}><RefreshCw size={15} /> Retry</button></div>
      ) : (
        <>
          <div className="metrics" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 24 }}>
            <div className="metric">
              <div className="metric-top"><span>Personnel</span><Users size={18} /></div>
              <strong>{distribution.length}</strong><small>In roster view</small>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Total additional hours</span><TrendingUp size={18} /></div>
              <strong>{totalAdditional.toFixed(1)}h</strong>
              <small>Across unit this period</small>
            </div>
            <div className={`metric ${withWarnings.length > 0 ? "attention" : ""}`}>
              <div className="metric-top"><span>Policy warnings</span><AlertCircle size={18} /></div>
              <strong>{withWarnings.length}</strong><small>Members with flags</small>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Open workload requests</span><CheckCircle2 size={18} /></div>
              <strong>{withRequests.length}</strong><small>Members with requests</small>
            </div>
          </div>

          <section className="panel cases-panel">
            <div className="panel-heading">
              <h2>Per-person duty summary</h2>
              <span className="subtle">Operational records only</span>
            </div>
            <div className="table-wrap" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f4f7f8" }}>
                    {["Personnel", "Scheduled", "Verified actual", "Additional", "Night shifts", "Consec. days", "Flags"].map((h) => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: "left", color: "#637780", fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {distribution.map((m) => (
                    <tr key={m.userId} style={{ borderBottom: "1px solid #edf1f3",
                      background: m.warnings.length > 0 ? "#fffbea" : "transparent" }}>
                      <td style={{ padding: "10px 14px" }}>
                        <b style={{ display: "block", fontSize: 13 }}>{m.name}</b>
                        {m.personnelId && <small style={{ color: "#8b9ba3" }}>{m.personnelId}</small>}
                      </td>
                      <td style={{ padding: "10px 14px" }}>{m.scheduledHours.toFixed(1)}h</td>
                      <td style={{ padding: "10px 14px" }}>
                        {m.verifiedActualHours.toFixed(1)}h
                        {m.pendingActualHours > 0 && (
                          <small style={{ color: "#a79136", display: "block" }}>
                            +{m.pendingActualHours.toFixed(1)}h pending
                          </small>
                        )}
                        {m.missingActualCount > 0 && (
                          <small style={{ color: "#b77b52", display: "block" }}>
                            {m.missingActualCount} missing
                          </small>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", color: m.additionalHours > 5 ? "#b77b52" : "inherit" }}>
                        {m.additionalHours > 0 ? `+${m.additionalHours.toFixed(1)}h` : "—"}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {m.nightShifts > 0 ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <Moon size={13} /> {m.nightShifts}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", color: m.consecutiveDays >= 6 ? "#b77b52" : "inherit" }}>
                        {m.consecutiveDays > 0 ? m.consecutiveDays : "—"}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {m.warnings.length > 0 ? (
                          <div title={m.warnings.join("\n")} style={{ cursor: "help" }}>
                            <AlertCircle size={16} style={{ color: "#b77b52" }} />
                            <small style={{ display: "block", color: "#b77b52" }}>
                              {m.warnings.length} warning{m.warnings.length > 1 ? "s" : ""}
                            </small>
                          </div>
                        ) : m.openWorkloadRequests > 0 ? (
                          <small style={{ color: "#5a7a9a" }}>Review requested</small>
                        ) : (
                          <CheckCircle2 size={14} style={{ color: "#509479" }} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ marginTop: 12 }}>
              Operational planning data only. Wellness, fatigue, mood and counselling data excluded.
              Policy warnings are based on the configured unit policy and do not represent legal findings.
            </p>
          </section>

          {withWarnings.length > 0 && (
            <section className="panel" style={{ marginBottom: 24 }}>
              <div className="panel-heading"><h2>Policy warning details</h2><AlertCircle size={18} /></div>
              {withWarnings.map((m) => (
                <div key={m.userId} style={{ borderBottom: "1px solid #edf1f3", padding: "12px 0" }}>
                  <b style={{ fontSize: 13 }}>{m.name}</b>
                  {m.warnings.map((w, i) => (
                    <p key={i} style={{ fontSize: 13, marginTop: 4, color: "#b77b52" }}>{w}</p>
                  ))}
                </div>
              ))}
              <p className="muted" style={{ marginTop: 12 }}>
                Policy warnings are based on the {policy?.label ?? "unit policy"}.
                {policy?.isDemoConfig && " This is a demonstration configuration — not a legal standard."}
                Review assignment distribution before taking action.
              </p>
            </section>
          )}
        </>
      )}

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Workload Distribution</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}
