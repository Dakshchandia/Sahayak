"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  HeartPulse, Moon, Activity, HeartHandshake, Plus, ArrowRight,
  CheckCheck, ShieldCheck, Clock3, Info, RefreshCw, Calendar, Users
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { CheckInCalendar } from "@/components/checkin-calendar";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { toast, Toaster } from "sonner";
import { formatDate } from "@/lib/utils";

interface CheckIn {
  id: number;
  checkInDate: string;
  mood: number | null;
  sleepHours: number | null;
  fatigue: number | null;
  perceivedWorkload: number | null;
  requestedSupport: boolean;
  createdAt: string;
}

interface SupportRequest {
  id: number;
  acknowledged: boolean;
  createdAt: string;
}

interface User {
  id: number; name: string; email: string;
  role: "personnel"; unitId: number | null; personnelId: string | null;
}

function Badge({ priority }: { priority: string }) {
  const cls = { elevated: "badge elevated", watch: "badge watch", routine: "badge routine" }[priority] ?? "badge routine";
  const label = { elevated: "Elevated", watch: "Watch", routine: "Routine" }[priority] ?? priority;
  return <span className={cls}>{label}</span>;
}

function Metric({ label, value, detail, icon: Icon, tone = "" }: {
  label: string; value: string | number; detail: string; icon: React.ComponentType<{size?:number}>; tone?: string;
}) {
  return (
    <div className={"metric " + tone}>
      <div className="metric-top"><span>{label}</span><Icon size={18} /></div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export default function PersonnelDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Incrementing this triggers a calendar refresh after a new check-in
  const [calendarRefresh, setCalendarRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [meRes, checkRes, supRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/personnel/checkin"),
        fetch("/api/personnel/support"),
      ]);

      if (!meRes.ok) { router.push("/login"); return; }

      const meData = await meRes.json();
      setUser(meData.user);
      setCsrfToken(meData.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");

      if (checkRes.ok) {
        const d = await checkRes.json();
        setCheckIns(d.checkIns ?? []);
      }
      if (supRes.ok) {
        const d = await supRes.json();
        setSupportRequests(d.requests ?? []);
      }
    } catch {
      setError("Could not load your dashboard. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  // Navigate to check-in page and signal calendar to refresh on return
  function goToCheckin() {
    // Use router.push then on focus/visibility refresh both dashboard and calendar
    router.push("/personnel/checkin");
  }

  // When navigating back from check-in, reload dashboard data and bump calendar
  useEffect(() => {
    function handleFocus() {
      load();
      setCalendarRefresh((n) => n + 1);
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [load]);

  if (!user) return null;

  const latestCheckin = checkIns[0];
  const latestSupport = supportRequests[0];

  // Build trend data from check-ins (last 10)
  const trendData = [...checkIns].reverse().slice(-10).map((c, i) => ({
    name: `${i + 1}`,
    fatigue: c.fatigue ?? 0,
    sleep: c.sleepHours ?? 0,
  }));

  return (
    <AppShell user={user as any} csrfToken={csrfToken}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR WELLBEING SPACE</div>
          <h1>A little check-in. A step forward.</h1>
          <p>A private space to reflect, find support and feel heard.</p>
        </div>
        <button className="secondary" onClick={() => router.push("/personnel/support")}>
          <HeartHandshake size={17} /> Request support
        </button>
      </div>

      <div className="demo-notice">
        <Info size={15} />
        <span>
          Your wellness data is shared only with your welfare officer.
          Commanders receive only anonymous aggregates.
        </span>
      </div>

      {loading ? (
        <div className="panel empty" role="status">
          <Activity className="pulse" />
          <h2>Loading your dashboard</h2>
          <p>Fetching your check-in history and support status…</p>
        </div>
      ) : error ? (
        <div className="panel empty">
          <Info />
          <h2>Dashboard unavailable</h2>
          <p>{error}</p>
          <button className="primary" onClick={load}><RefreshCw size={16} /> Retry</button>
        </div>
      ) : (
        <>
          {/* Hero */}
          <section className="personal-hero">
            <div>
              <span className="eyebrow light">GOOD TO SEE YOU, {user.name.split(" ")[0].toUpperCase()}</span>
              <h2>How are you feeling today?</h2>
              <p>
                Take a moment for yourself. Your check-in is voluntary
                <br />and shared only with your welfare support view.
              </p>
              <button className="white-button" onClick={goToCheckin}>
                <Plus size={18} /> Start a check-in <span>~30 seconds</span>
              </button>
            </div>
            <div className="wellness-orbit">
              <HeartPulse size={60} />
              <span>Small steps.<br />Meaningful support.</span>
            </div>
          </section>

          {/* Metrics */}
          <div className="metrics three">
            <Metric
              label="Latest sleep check-in"
              value={latestCheckin?.sleepHours != null ? `${latestCheckin.sleepHours} h` : "Not shared"}
              detail="Your own reported experience"
              icon={Moon}
            />
            <Metric
              label="Fatigue check-in"
              value={latestCheckin?.fatigue != null ? `${latestCheckin.fatigue}/10` : "Not shared"}
              detail="A reflection, not a diagnosis"
              icon={Activity}
            />
            <Metric
              label="Support status"
              value={latestSupport ? (latestSupport.acknowledged ? "Acknowledged" : "Requested") : "Available"}
              detail={latestSupport ? "Your welfare officer has been notified" : "Reach out whenever you need"}
              icon={HeartHandshake}
            />
          </div>

          {/* Trend + Support */}
          <div className="two-col">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Your check-in timeline</h2>
                  <p>Sleep and fatigue over recent check-ins</p>
                </div>
              </div>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={225}>
                  <AreaChart data={trendData} margin={{ left: -25, right: 12, top: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="fillSleep" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#219a89" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#219a89" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#e7edef" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false}
                      tick={{ fill: "#78868c", fontSize: 12 }} tickFormatter={(v) => `#${v}`} />
                    <YAxis domain={[0, 10]} axisLine={false} tickLine={false}
                      tick={{ fill: "#78868c", fontSize: 12 }} />
                    <Tooltip formatter={(v, n) => [v, n === "sleep" ? "Sleep hours" : "Fatigue"]} />
                    <Area type="monotone" dataKey="sleep" stroke="#168b7a" strokeWidth={2.5} fill="url(#fillSleep)" />
                    <Area type="monotone" dataKey="fatigue" stroke="#d69a46" strokeWidth={2} fill="none" strokeDasharray="4 2" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty compact">
                  <Calendar size={28} />
                  <p>Submit your first check-in to see your trend here.</p>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>Make space for support</h2>
                <HeartHandshake size={21} />
              </div>
              <p>
                You don&apos;t need a particular score to ask for help. A welfare officer can
                discuss your concerns and available support.
              </p>
              <div className="resource">
                <span className="mini-icon"><Clock3 size={19} /></span>
                <div>
                  <b>Recovery conversation</b>
                  <p>Discuss duty patterns and opportunities for rest.</p>
                </div>
              </div>
              <div className="resource">
                <span className="mini-icon"><Users size={19} /></span>
                <div>
                  <b>Someone to talk to</b>
                  <p>Request a confidential welfare conversation.</p>
                </div>
              </div>
              <button className="primary" onClick={() => router.push("/personnel/support")}>
                Request confidential support <ArrowRight size={17} />
              </button>
              <p className="muted" style={{ marginTop: 12 }}>
                If you are in immediate danger, contact emergency services (dial 112).
                This system does not dispatch emergency responders.
              </p>
            </section>
          </div>

          {/* Check-in history list */}
          <section className="panel">
            <h2 style={{ marginBottom: 16 }}>Check-in history</h2>
            {checkIns.length > 0 ? (
              <div className="history-list">
                {checkIns.slice(0, 20).map((c) => (
                  <div className="audit-row" key={c.id}>
                    <CheckCheck size={20} style={{ color: "#509b83", flexShrink: 0 }} />
                    <div>
                      <b>{formatDate(c.checkInDate)}</b>
                      <p>
                        {c.sleepHours != null ? `Sleep ${c.sleepHours} h` : "Sleep not shared"}
                        {c.fatigue != null ? ` · Fatigue ${c.fatigue}/10` : ""}
                        {c.requestedSupport ? " · Support requested" : ""}
                      </p>
                    </div>
                    <span className="mood-chip">Mood {c.mood ?? "—"}/5</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Your first submitted check-in will appear here.</p>
            )}
          </section>

          {/* ── MY CHECK-IN CALENDAR ─────────────────────────────────────── */}
          <CheckInCalendar
            onCheckin={goToCheckin}
            refreshTrigger={calendarRefresh}
          />
        </>
      )}

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Personnel Welfare System</span>
      </footer>
      <Toaster richColors position="bottom-right" />
      <style jsx>{`
        .history-list { display: flex; flex-direction: column; }
        .mood-chip { margin-left: auto; font-size: 12px; color: #8b9ba3; white-space: nowrap; }
      `}</style>
    </AppShell>
  );
}
