"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users, Clock3, ShieldCheck, SlidersHorizontal, LockKeyhole,
  ArrowRight, Info, Activity, RefreshCw, Download
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { Slider } from "@/components/ui/slider";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { toast, Toaster } from "sonner";

interface UnitAggregate {
  unit: string; unitCode: string; suppressed: boolean;
  suppressionReason?: string; count: number;
  elevated?: number; watch?: number; routine?: number;
  avgWeeklyHours?: number; avgNightShifts?: number; avgDeploymentDays?: number;
}

interface ScenarioResult {
  before: number; after: number; personnel: number;
  nightReduction: number; hourReduction: number; disclaimer: string;
}

export default function CommanderDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [units, setUnits] = useState<UnitAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);
  const [nights, setNights] = useState(2);
  const [hours, setHours] = useState(8);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [meRes, aggRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/commander/aggregates"),
      ]);
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      setUser(me.user);
      setCsrfToken(me.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");
      if (aggRes.ok) {
        const d = await aggRes.json();
        setUnits(d.units ?? []);
      }
    } catch { setError("Could not load unit data. Please retry."); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function runScenario() {
    setScenarioLoading(true); setScenario(null);
    try {
      const res = await fetch("/api/commander/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken, nightReduction: nights, hourReduction: hours }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Scenario failed."); return; }
      setScenario(data);
    } catch { toast.error("Network error."); }
    finally { setScenarioLoading(false); }
  }

  function exportCsv() {
    const lines = [
      "Unit,Personnel,Elevated,Watch,Routine,Avg Weekly Hours,Avg Night Shifts",
      ...units
        .filter((u) => !u.suppressed)
        .map((u) => `${u.unit},${u.count},${u.elevated},${u.watch},${u.routine},${u.avgWeeklyHours},${u.avgNightShifts}`),
    ];
    const blob = new Blob(["SAHAYAK UNIT AGGREGATE SUMMARY\n" + lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "sahayak-unit-summary.csv"; a.click();
    toast.success("Aggregate report downloaded");
  }

  if (!user) return null;

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">UNIT WELFARE OVERVIEW</div>
          <h1>A healthier rhythm for your unit.</h1>
          <p>Understand workload patterns. Make room for recovery.</p>
        </div>
        <button className="secondary" onClick={exportCsv}>
          <Download size={17} /> Export summary
        </button>
      </div>

      <div className="demo-notice">
        <LockKeyhole size={15} />
        <span>
          Aggregate only — individual identities, check-ins and counselling records are
          excluded from this view.
        </span>
      </div>

      {loading ? (
        <div className="panel empty" role="status"><Activity className="pulse" /><h2>Loading unit data…</h2></div>
      ) : error ? (
        <div className="panel empty"><Info /><h2>{error}</h2><button className="primary" onClick={load}><RefreshCw size={16} /> Retry</button></div>
      ) : (
        <>
          {/* Summary metrics */}
          <div className="metrics three">
            <div className="metric">
              <div className="metric-top"><span>Personnel represented</span><Users size={18} /></div>
              <strong>{units.filter((u) => !u.suppressed).reduce((s, u) => s + u.count, 0)}</strong>
              <small>Across {units.filter((u) => !u.suppressed).length} units</small>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Average weekly duty</span><Clock3 size={18} /></div>
              <strong>
                {units.filter((u) => !u.suppressed).length > 0
                  ? Math.round(units.filter((u) => !u.suppressed).reduce((s, u) => s + (u.avgWeeklyHours ?? 0), 0) / units.filter((u) => !u.suppressed).length)
                  : "—"} h
              </strong>
              <small>Organizational duty records</small>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Privacy boundary</span><ShieldCheck size={18} /></div>
              <strong style={{ fontSize: 18 }}>Aggregate only</strong>
              <small>No individual wellness records</small>
            </div>
          </div>

          <div className="two-col">
            {/* Unit distribution */}
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Unit welfare distribution</h2>
                  <p>Indicator priority breakdown by unit</p>
                </div>
                <Users size={20} />
              </div>
              {units.map((u) => (
                <div key={u.unit} className="unit-block">
                  {u.suppressed ? (
                    <div style={{ padding: "12px 0" }}>
                      <div className="spread">
                        <b>{u.unit} unit</b>
                        <span>{u.count} personnel</span>
                      </div>
                      <div className="privacy-callout" style={{ marginTop: 8 }}>
                        <LockKeyhole size={14} /> {u.suppressionReason}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="spread">
                        <b>{u.unit} unit</b>
                        <span>{u.count} personnel</span>
                      </div>
                      <div className="stacked">
                        <span style={{ width: `${(u.routine! / u.count) * 100}%` }} className="seg-routine" />
                        <span style={{ width: `${(u.watch! / u.count) * 100}%` }} className="seg-watch" />
                        <span style={{ width: `${(u.elevated! / u.count) * 100}%` }} className="seg-elevated" />
                      </div>
                      <small>{u.routine} routine · {u.watch} watch · {u.elevated} elevated</small>
                    </>
                  )}
                </div>
              ))}
              <div className="privacy-callout">
                <LockKeyhole size={16} /> Individual identities are excluded from this response.
              </div>
            </section>

            {/* Scenario planner */}
            <section className="panel simulator">
              <div className="panel-heading">
                <div>
                  <h2>Workload scenario planner</h2>
                  <p>Explore changes before proposing a rotation.</p>
                </div>
                <SlidersHorizontal size={20} />
              </div>

              <label>
                Reduce night duties <b>{nights} shifts</b>
              </label>
              <Slider
                aria-label="Reduce night duties"
                value={[nights]}
                onValueChange={(v) => { setNights(v[0]); setScenario(null); }}
                min={0} max={6} step={1}
              />

              <label>
                Reduce weekly duty <b>{hours} hours</b>
              </label>
              <Slider
                aria-label="Reduce weekly duty hours"
                value={[hours]}
                onValueChange={(v) => { setHours(v[0]); setScenario(null); }}
                min={0} max={16} step={1}
              />

              <button
                className="primary"
                disabled={scenarioLoading}
                onClick={runScenario}
              >
                Compare scenario <ArrowRight size={17} />
              </button>

              {scenario && (
                <div className="simulation-result">
                  <span>Average workload indicator (organizational factors only)</span>
                  <strong>
                    {scenario.before}
                    <ArrowRight size={24} />
                    {scenario.after}
                  </strong>
                  <small>Across {scenario.personnel} personnel</small>
                </div>
              )}

              <p className="muted" style={{ marginTop: 16 }}>
                Recalculates organizational duty indicators only. Wellness data is excluded from this view. This is not a prediction of mental-health improvement. Staffing coverage is not modeled. No real duty roster is changed.
              </p>
            </section>
          </div>

          {/* Duty patterns table */}
          <section className="panel" style={{ marginBottom: 25 }}>
            <div className="panel-heading">
              <h2>Duty and recovery patterns</h2>
              <span className="subtle">Unit averages</span>
            </div>
            <div className="table-wrap">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unit</TableHead>
                    <TableHead>Personnel</TableHead>
                    <TableHead>Avg weekly hours</TableHead>
                    <TableHead>Avg night shifts</TableHead>
                    <TableHead>Avg deployment days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {units.map((u) => (
                    <TableRow key={u.unit}>
                      <TableCell><b>{u.unit}</b></TableCell>
                      <TableCell>{u.count}</TableCell>
                      <TableCell>{u.suppressed ? "—" : `${u.avgWeeklyHours} h`}</TableCell>
                      <TableCell>{u.suppressed ? "—" : u.avgNightShifts}</TableCell>
                      <TableCell>{u.suppressed ? "—" : `${u.avgDeploymentDays} days`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Commander View</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}
