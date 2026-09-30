"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays, AlertCircle, CheckCheck, ShieldCheck, ArrowUpRight, Info
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { toast, Toaster } from "sonner";
import { formatDate } from "@/lib/utils";

export default function FollowUpsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [meRes, casesRes] = await Promise.all([
      fetch("/api/auth/me"),
      fetch("/api/welfare/cases?status=follow_up"),
    ]);
    if (!meRes.ok) { router.push("/login"); return; }
    const me = await meRes.json();
    setUser(me.user);
    setCsrfToken(me.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");
    if (casesRes.ok) {
      const d = await casesRes.json();
      // Include all cases with a follow-up date that aren't closed
      const withFollowUps = (d.cases ?? []).filter(
        (c: any) => c.case.nextFollowUpDate && !["closed", "dismissed"].includes(c.case.status)
      );
      setCases(withFollowUps);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const overdue = cases.filter((c) => c.case.nextFollowUpDate < today);
  const upcoming = cases.filter((c) => c.case.nextFollowUpDate >= today);

  if (!user) return null;

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WELFARE OPERATIONS</div>
          <h1>Follow-ups</h1>
          <p>Track commitments and keep support moving.</p>
        </div>
      </div>

      {overdue.length > 0 && (
        <div className="demo-notice" style={{ background: "#fdf2f2", borderColor: "#e8c2c0", color: "#9b3a36", marginBottom: 20 }}>
          <AlertCircle size={15} />
          <span>
            <b>{overdue.length} overdue follow-up{overdue.length > 1 ? "s" : ""}</b> — review and schedule a new follow-up or close these cases.
          </span>
        </div>
      )}

      {overdue.length > 0 && (
        <section className="panel" style={{ marginBottom: 24, borderColor: "#e8c2c0" }}>
          <div className="panel-heading">
            <h2 style={{ color: "#bb4f46" }}>Overdue follow-ups</h2>
            <AlertCircle size={18} style={{ color: "#bb4f46" }} />
          </div>
          <FollowUpList cases={overdue} router={router} overdue />
        </section>
      )}

      <section className="panel">
        <div className="panel-heading">
          <h2>Upcoming follow-ups</h2>
          <CalendarDays size={18} />
        </div>
        {loading ? (
          <div className="empty compact"><div className="pulse">⟳</div><p>Loading…</p></div>
        ) : upcoming.length > 0 ? (
          <FollowUpList cases={upcoming} router={router} overdue={false} />
        ) : (
          <div className="empty compact">
            <CheckCheck size={28} style={{ color: "#509b83" }} />
            <p>No upcoming follow-ups. Schedule one from a case profile.</p>
          </div>
        )}
      </section>

      <div className="demo-notice" style={{ marginTop: 16 }}>
        <Info size={15} />
        <span>
          Follow-up dates are set from case profiles. Notification previews contain no
          confidential clinical details — only that a follow-up is due.
        </span>
      </div>

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Welfare Officer View</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}

function FollowUpList({ cases, router, overdue }: { cases: any[]; router: any; overdue: boolean }) {
  return (
    <div>
      {cases.map((c) => {
        const followDate = c.case.nextFollowUpDate;
        const month = new Date(followDate + "T12:00").toLocaleString("en", { month: "short" });
        const day = followDate.slice(-2);

        return (
          <button
            key={c.case.id}
            className="followup-item"
            onClick={() => router.push(`/welfare/cases/${c.case.id}`)}
          >
            <span className="date-tile" style={overdue ? { borderColor: "#e8c2c0", background: "#fdf2f2" } : {}}>
              <small style={overdue ? { color: "#bb4f46" } : {}}>{month}</small>
              <b style={overdue ? { color: "#bb4f46" } : {}}>{day}</b>
            </span>
            <span style={{ flex: 1, textAlign: "left" }}>
              <b style={{ display: "block", fontSize: 13 }}>{c.personnel.name}</b>
              <small style={{ color: "#8b9ba3" }}>
                {c.personnel.personnelId ?? `#${c.personnel.id}`} ·{" "}
                <span className="status">{c.case.status.replace("_", " ")}</span>
              </small>
            </span>
            {overdue && (
              <span style={{ fontSize: 11, color: "#bb4f46", fontWeight: 600, marginRight: 8 }}>
                OVERDUE
              </span>
            )}
            <ArrowUpRight size={17} style={{ color: "#8b9ba3" }} />
          </button>
        );
      })}
    </div>
  );
}
