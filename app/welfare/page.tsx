"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users, HeartPulse, CalendarDays, CheckCheck, ArrowUpRight,
  ArrowRight, ShieldCheck, Search, HeartHandshake, Info, Activity, RefreshCw
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { toast, Toaster } from "sonner";
import { formatDate } from "@/lib/utils";

interface Case {
  case: {
    id: number; status: string; priority: string;
    nextFollowUpDate: string | null; lastActivityAt: string;
    openedAt: string;
  };
  personnel: {
    id: number; name: string; personnelId: string | null; unitId: number | null;
  };
}

function Badge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    elevated: "badge elevated", watch: "badge watch", routine: "badge routine"
  };
  const label: Record<string, string> = { elevated: "Elevated", watch: "Watch", routine: "Routine" };
  return <span className={map[priority] ?? "badge routine"}>{label[priority] ?? priority}</span>;
}

function StatusChip({ status }: { status: string }) {
  return <span className="status">{status.replace("_", " ")}</span>;
}

export default function WelfareDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [meRes, casesRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/welfare/cases?status=${statusFilter}&q=${encodeURIComponent(query)}`),
      ]);
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      setUser(me.user);
      setCsrfToken(me.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");

      if (casesRes.ok) {
        const d = await casesRes.json();
        setCases(d.cases ?? []);
      }
    } catch {
      setError("Could not load welfare cases. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [router, query, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const elevated = cases.filter((c) => c.case.priority === "elevated");
  const followUps = cases.filter((c) => c.case.nextFollowUpDate && !["closed","dismissed"].includes(c.case.status));
  const resolved = cases.filter((c) => c.case.status === "closed").length;
  const active = cases.filter((c) => !["closed","dismissed"].includes(c.case.status));

  if (!user) return null;

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WELFARE OPERATIONS</div>
          <h1>People first. Always.</h1>
          <p>Recognize early signals. Connect people with the right support.</p>
        </div>
        <button className="secondary" onClick={() => { const u = new URL(window.location.href); const csv = "Case ID,Personnel,Status,Priority,Follow-up\n" + cases.map(c => `${c.case.id},${c.personnel.name},${c.case.status},${c.case.priority},${c.case.nextFollowUpDate ?? ""}`).join("\n"); const blob = new Blob(["SAHAYAK WELFARE SUMMARY\n" + csv], {type:"text/csv"}); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "welfare-summary.csv"; a.click(); toast.success("Summary exported"); }}>
          Download summary
        </button>
      </div>

      <div className="demo-notice">
        <Info size={15} />
        <span>Personnel in your assigned unit only. Individual wellness details are confidential.</span>
      </div>

      {/* Metrics */}
      <div className="metrics">
        <div className="metric">
          <div className="metric-top"><span>Open cases</span><Users size={18} /></div>
          <strong>{active.length}</strong>
          <small>Awaiting review or action</small>
        </div>
        <div className="metric attention">
          <div className="metric-top"><span>Elevated priority</span><HeartPulse size={18} /></div>
          <strong>{elevated.length}</strong>
          <small>Need welfare review</small>
        </div>
        <div className="metric">
          <div className="metric-top"><span>Follow-ups scheduled</span><CalendarDays size={18} /></div>
          <strong>{followUps.length}</strong>
          <small>Continue the care conversation</small>
        </div>
        <div className="metric">
          <div className="metric-top"><span>Cases closed</span><CheckCheck size={18} /></div>
          <strong>{resolved}</strong>
          <small>Recorded by welfare officer</small>
        </div>
      </div>

      {/* Cases table */}
      <section className="panel cases-panel">
        <div className="panel-heading">
          <div>
            <h2>Welfare case queue</h2>
            <p>A signal to start a conversation, never a diagnosis.</p>
          </div>
        </div>

        <div className="filters">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Search personnel"
              placeholder="Search name or ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            style={{ border: "1px solid #dce5e8", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#3a5260" }}
          >
            <option value="all">All statuses</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="contacted">Contacted</option>
            <option value="follow_up">Follow-up</option>
            <option value="closed">Closed</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>

        {loading ? (
          <div className="empty compact" role="status"><Activity className="pulse" /><p>Loading cases…</p></div>
        ) : error ? (
          <div className="empty compact"><Info /><p>{error}</p><button className="primary" onClick={load}><RefreshCw size={16} /> Retry</button></div>
        ) : (
          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PERSONNEL</TableHead>
                  <TableHead>STATUS</TableHead>
                  <TableHead>PRIORITY</TableHead>
                  <TableHead>LAST ACTIVITY</TableHead>
                  <TableHead>FOLLOW-UP</TableHead>
                  <TableHead><span className="sr-only">Open</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => (
                  <TableRow key={c.case.id} className="person-row">
                    <TableCell>
                      <div className="person-link">
                        <span className={"avatar av" + c.personnel.name.length % 3}>
                          {c.personnel.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                        </span>
                        <span>
                          <b>{c.personnel.name}</b>
                          <small>{c.personnel.personnelId ?? `#${c.personnel.id}`}</small>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell><StatusChip status={c.case.status} /></TableCell>
                    <TableCell><Badge priority={c.case.priority} /></TableCell>
                    <TableCell>{formatDate(c.case.lastActivityAt)}</TableCell>
                    <TableCell>
                      {c.case.nextFollowUpDate ? (
                        <span style={{ fontSize: 12, color: "#4a8a72" }}>{formatDate(c.case.nextFollowUpDate)}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <button
                        aria-label={`Review ${c.personnel.name}`}
                        className="icon-button"
                        onClick={() => router.push(`/welfare/cases/${c.case.id}`)}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {cases.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="empty compact">
                        <Search size={24} />
                        <p>No matching cases. Try adjusting the search or status filter.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Follow-ups panel */}
      {followUps.length > 0 && (
        <section className="panel" style={{ marginBottom: 25 }}>
          <div className="panel-heading">
            <h2>Upcoming follow-ups</h2>
            <CalendarDays size={18} />
          </div>
          {followUps.slice(0, 5).map((c) => (
            <button
              key={c.case.id}
              className="followup-item"
              onClick={() => router.push(`/welfare/cases/${c.case.id}`)}
            >
              <span className="date-tile">
                <small>{new Date(c.case.nextFollowUpDate! + "T12:00").toLocaleString("en", { month: "short" })}</small>
                <b>{c.case.nextFollowUpDate!.slice(-2)}</b>
              </span>
              <span>
                <b>{c.personnel.name}</b>
                <small>{c.case.status.replace("_", " ")}</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </section>
      )}

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Welfare Officer View</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}
