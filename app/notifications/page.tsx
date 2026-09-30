"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, ShieldCheck, ArrowRight, Info } from "lucide-react";
import { AppShell } from "@/components/shell";
import { toast, Toaster } from "sonner";
import { formatDateTime } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  support_request_received: "New support request",
  case_assigned:            "Case assigned",
  appointment_scheduled:    "Appointment scheduled",
  appointment_updated:      "Appointment updated",
  follow_up_due:            "Follow-up due",
  overdue_follow_up:        "Overdue follow-up",
  case_status_changed:      "Case status changed",
  system:                   "System notification",
};

export default function NotificationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const [meRes, notifRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/notifications"),
      ]);
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      setUser(me.user);
      setCsrfToken(me.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");
      if (notifRes.ok) {
        const d = await notifRes.json();
        setNotifs(d.notifications ?? []);
      }
      setLoading(false);
    }
    init();
  }, [router]);

  async function markRead(id: number) {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_read", notificationId: id, csrfToken }),
    });
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read", csrfToken }),
    });
    setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
    toast.success("All notifications marked as read.");
  }

  if (!user) return null;

  const unread = notifs.filter((n) => !n.isRead);

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR WORKSPACE</div>
          <h1>Notifications</h1>
          <p>{unread.length > 0 ? `${unread.length} unread notification${unread.length > 1 ? "s" : ""}` : "All caught up."}</p>
        </div>
        {unread.length > 0 && (
          <button className="secondary" onClick={markAllRead}>
            <CheckCheck size={17} /> Mark all read
          </button>
        )}
      </div>

      <section className="panel">
        {loading ? (
          <div className="empty compact"><div className="pulse">⟳</div><p>Loading…</p></div>
        ) : notifs.length === 0 ? (
          <div className="empty compact">
            <Bell size={32} style={{ color: "#b3c2c9" }} />
            <p>No notifications yet. Actions and updates will appear here.</p>
          </div>
        ) : (
          <div>
            {notifs.map((n) => (
              <div
                key={n.id}
                style={{
                  display: "flex", gap: 14, alignItems: "flex-start",
                  borderBottom: "1px solid #edf1f3",
                  background: n.isRead ? "transparent" : "#f4faf7",
                  margin: "0 -24px", padding: "14px 24px",
                }}
              >
                <span className="mini-icon" style={{ background: n.isRead ? "#f0f4f5" : "#e3f4ec",
                  color: n.isRead ? "#8b9ba3" : "#278c72", flexShrink: 0 }}>
                  <Bell size={17} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <b style={{ fontSize: 13 }}>{n.title}</b>
                    <time style={{ fontSize: 12, color: "#8b9ba3", whiteSpace: "nowrap" }}>
                      {formatDateTime(n.createdAt)}
                    </time>
                  </div>
                  <p style={{ fontSize: 13, marginTop: 4 }}>{n.body}</p>
                  <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#8b9ba3", background: "#f0f4f5",
                      padding: "2px 8px", borderRadius: 4 }}>
                      {TYPE_LABELS[n.type] ?? n.type}
                    </span>
                    {!n.isRead && (
                      <button
                        style={{ fontSize: 12, color: "#147d6e", display: "flex", alignItems: "center", gap: 5 }}
                        onClick={() => markRead(n.id)}
                      >
                        <Check size={14} /> Mark read
                      </button>
                    )}
                    {n.link && (
                      <button
                        style={{ fontSize: 12, color: "#147d6e", display: "flex", alignItems: "center", gap: 5 }}
                        onClick={() => router.push(n.link)}
                      >
                        View <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="demo-notice" style={{ marginTop: 16 }}>
        <Info size={15} />
        <span>
          Notifications are stored in the database and polled on page load.
          Optional email delivery uses the configured SMTP adapter — check Mailhog at port 8025 in Docker.
          Notification content is kept generic and never includes sensitive clinical details.
        </span>
      </div>

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Notifications</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}
