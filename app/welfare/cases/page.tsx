"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users, HeartPulse, ArrowUpRight, Search, ShieldCheck,
  Info, Activity, RefreshCw, CalendarDays, CheckCheck, Filter
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { toast, Toaster } from "sonner";
import { formatDate } from "@/lib/utils";

interface WelfareCase {
  case: {
    id: number;
    status: string;
    priority: string;
    nextFollowUpDate: string | null;
    lastActivityAt: string;
    openedAt: string;
  };
  personnel: {
    id: number;
    name: string;
    personnelId: string | null;
    unitId: number | null;
  };
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "contacted", label: "Contacted" },
  { value: "intervention_agreed", label: "Intervention agreed" },
  { value: "follow_up", label: "Follow-up" },
  { value: "closed", label: "Closed" },
  { value: "dismissed", label: "Dismissed" },
];

const PRIORITY_COLORS: Record<string, string> = {
  elevated: "badge elevated",
  watch: "badge watch",
  routine: "badge routine",
};

export default function WelfareCasesPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [cases, setCases] = useState<WelfareCase[]>([]);
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
      } else {
        setError("Could not load cases.");
      }
    } catch {
      setError("Network error. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [router, query, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const elevated = cases.filter((c) => c.case.priority === "elevated" && !["closed","dismissed"].includes(c.case.status));
  const active   = cases.filter((c) => !["closed","dismissed"].includes(c.case.status));

  if (!user) return null;

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      {/* Page heading */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">WELFARE OPERATIONS</div>
          <h1>Every signal deserves context.</h1>
          <p>Review, act and follow up — one person at a time.</p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            const csv = [
              "Case ID,Personnel,Personnel ID,Status,Priority,Last Activity,Follow-up",
              ...cases.map((c) =>
                [c.case.id, c.personnel.name, c.personnel.personnelId ?? "",
                 c.case.status, c.case.priority,
                 formatDate(c.case.lastActivityAt),
                 c.case.nextFollowUpDate ? formatDate(c.case.nextFollowUpDate) : ""].join(",")
              ),
            ].join("\n");
            const blob = new Blob(["SAHAYAK WELFARE CASE SUMMARY\n" + csv], { type: "text/csv" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "welfare-cases.csv";
            a.click();
            toast.success("Case summary exported");
          }}
        >
          Export summary
        </button>
      </div>

      {/* Notice */}
      <div className="demo-notice">
        <Info size={15} />
        <span>
          Showing cases for your assigned unit only. Individual wellness details remain confidential.
        </span>
      </div>

      {/* Summary metrics */}
      <div className="metrics">
        <div className="metric">
          <div className="metric-top"><span>Total cases</span><Users size={18} /></div>
          <strong>{cases.length}</strong>
          <small>All statuses</small>
        </div>
        <div className="metric attention">
          <div className="metric-top"><span>Elevated priority</span><HeartPulse size={18} /></div>
          <strong>{elevated.length}</strong>
          <small>Open cases needing review</small>
        </div>
        <div className="metric">
          <div className="metric-top"><span>Active cases</span><Activity size={18} /></div>
          <strong>{active.length}</strong>
          <small>Not closed or dismissed</small>
        </div>
        <div className="metric">
          <div className="metric-top"><span>Closed</span><CheckCheck size={18} /></div>
          <strong>{cases.filter((c) => c.case.status === "closed").length}</strong>
          <small>Resolved cases</small>
        </div>
      </div>

      {/* Cases table */}
      <section className="panel cases-panel">
        <div className="panel-heading">
          <div>
            <h2>Welfare case queue</h2>
            <p>A signal to start a conversation — never a diagnosis.</p>
          </div>
        </div>

        {/* Filters */}
        <div className="filters">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Search personnel"
              placeholder="Search by name or personnel ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            style={{ border: "1px solid #dce5e8", borderRadius: 6, padding: "8px 14px", fontSize: 13, color: "#3a5260", background: "white" }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button
            className="secondary"
            style={{ padding: "8px 14px", fontSize: 13 }}
            onClick={() => { setQuery(""); setStatusFilter("all"); }}
          >
            <Filter size={15} /> Clear
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="empty compact" role="status">
            <Activity className="pulse" size={28} />
            <p>Loading cases…</p>
          </div>
        ) : error ? (
          <div className="empty compact">
            <Info size={28} />
            <p>{error}</p>
            <button className="primary" onClick={load}><RefreshCw size={15} /> Retry</button>
          </div>
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
                  <TableHead>CASE #</TableHead>
                  <TableHead><span className="sr-only">Open</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <div className="empty compact">
                        <Search size={24} />
                        <p>No cases match the current filters.</p>
                        <button className="secondary" style={{ fontSize: 13, padding: "7px 14px" }}
                          onClick={() => { setQuery(""); setStatusFilter("all"); }}>
                          Clear filters
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  cases.map((c) => (
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
                      <TableCell>
                        <span className="status">{c.case.status.replace(/_/g, " ")}</span>
                      </TableCell>
                      <TableCell>
                        <span className={PRIORITY_COLORS[c.case.priority] ?? "badge routine"}>
                          {c.case.priority}
                        </span>
                      </TableCell>
                      <TableCell style={{ fontSize: 13, color: "#687b83" }}>
                        {formatDate(c.case.lastActivityAt)}
                      </TableCell>
                      <TableCell>
                        {c.case.nextFollowUpDate ? (
                          <span style={{ fontSize: 12, color: "#4a8a72", display: "flex", alignItems: "center", gap: 5 }}>
                            <CalendarDays size={13} />
                            {formatDate(c.case.nextFollowUpDate)}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span style={{ fontSize: 12, color: "#8b9ba3" }}>#{c.case.id}</span>
                      </TableCell>
                      <TableCell>
                        <button
                          aria-label={`Review case for ${c.personnel.name}`}
                          className="icon-button"
                          onClick={() => router.push(`/welfare/cases/${c.case.id}`)}
                        >
                          <ArrowUpRight size={18} />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Welfare Officer View</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}
