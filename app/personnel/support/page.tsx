"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  HeartHandshake, ArrowRight, CheckCheck, Clock3, ShieldCheck,
  AlertCircle, Info, LockKeyhole
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { toast, Toaster } from "sonner";
import { formatDateTime } from "@/lib/utils";

const CONTACT_OPTIONS = [
  { value: "in_person", label: "In person", desc: "Meet at your welfare officer's office" },
  { value: "phone",     label: "Phone",     desc: "Your welfare officer will call you" },
  { value: "message",   label: "Written message", desc: "Receive a written response" },
];

export default function SupportPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [preferredContact, setPreferredContact] = useState("in_person");
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [urgency, setUrgency] = useState<"standard" | "urgent">("standard");

  useEffect(() => {
    async function init() {
      const [meRes, reqRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/personnel/support"),
      ]);
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      setUser(me.user);
      setCsrfToken(me.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");
      if (reqRes.ok) {
        const d = await reqRes.json();
        setRequests(d.requests ?? []);
      }
      setLoading(false);
    }
    init();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/personnel/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csrfToken, preferredContact, urgency,
          availabilityNote: availabilityNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Could not submit request."); return; }
      setSubmitted(true);
      setRequests((prev) => [{
        id: data.requestId, acknowledged: false,
        createdAt: new Date().toISOString(), urgency, preferredContact,
      }, ...prev]);
      toast.success("Support request submitted.");
    } catch { toast.error("Network error."); }
    finally { setSaving(false); }
  }

  if (!user || loading) return null;

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR WELLBEING SPACE</div>
          <h1>Request confidential support.</h1>
          <p>A safe space to reach out. No reason or score required.</p>
        </div>
      </div>

      {/* Important notices */}
      <div className="demo-notice" style={{ marginBottom: 12 }}>
        <LockKeyhole size={15} />
        <span>Your request is visible only to your welfare officer. Commanders and HR do not see it.</span>
      </div>
      <div className="demo-notice" style={{ marginBottom: 20, background: "#fffbea", borderColor: "#e8d98a", color: "#7a6820" }}>
        <AlertCircle size={15} />
        <span>
          <b>If you are in immediate danger</b>, contact emergency services by dialling <b>112</b> or speak directly to a trusted colleague.
          This system does not dispatch emergency responders.
        </span>
      </div>

      <div className="two-col">
        {/* Request form */}
        <section className="panel">
          <div className="panel-heading">
            <h2>Submit a support request</h2>
            <HeartHandshake size={21} />
          </div>

          {submitted ? (
            <div style={{ textAlign: "center", padding: "30px 0" }}>
              <CheckCheck size={44} style={{ color: "#509b83", margin: "0 auto 16px" }} />
              <h3 style={{ marginBottom: 8 }}>Request submitted</h3>
              <p style={{ fontSize: 14, marginBottom: 20 }}>
                Your request has been added to the welfare queue. A welfare officer will
                acknowledge it — you will see the status update here when they do.
              </p>
              <button className="secondary" onClick={() => setSubmitted(false)}>
                Submit another request
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <p style={{ fontSize: 14 }}>
                You don't need a particular score or reason to reach out. A welfare officer will
                acknowledge your request and connect with you confidentially.
              </p>

              {/* Preferred contact */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 10 }}>
                  Preferred contact method
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {CONTACT_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        border: `1px solid ${preferredContact === opt.value ? "#147d6e" : "#dce5e8"}`,
                        background: preferredContact === opt.value ? "#edf7f1" : "white",
                        borderRadius: 8, padding: "12px 14px", cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio" name="contact" value={opt.value}
                        checked={preferredContact === opt.value}
                        onChange={() => setPreferredContact(opt.value)}
                        style={{ accentColor: "#147d6e" }}
                      />
                      <div>
                        <b style={{ fontSize: 14 }}>{opt.label}</b>
                        <p style={{ fontSize: 12 }}>{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Availability note */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  When are you generally available? <span style={{ color: "#8b9ba3", fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={availabilityNote}
                  onChange={(e) => setAvailabilityNote(e.target.value.slice(0, 200))}
                  placeholder="e.g. Weekday mornings, after 6pm…"
                  style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6,
                    padding: "9px 12px", fontSize: 14, boxSizing: "border-box" }}
                />
              </div>

              {/* Urgency */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 10 }}>
                  How urgent is this?
                </label>
                <div style={{ display: "flex", gap: 10 }}>
                  {[
                    { v: "standard", label: "Standard", desc: "Within a day or two" },
                    { v: "urgent",   label: "Urgent",   desc: "I need to speak to someone soon" },
                  ].map(({ v, label, desc }) => (
                    <label
                      key={v}
                      style={{
                        flex: 1, display: "flex", alignItems: "center", gap: 10,
                        border: `1px solid ${urgency === v ? (v === "urgent" ? "#bb4f46" : "#147d6e") : "#dce5e8"}`,
                        background: urgency === v ? (v === "urgent" ? "#fdf2f2" : "#edf7f1") : "white",
                        borderRadius: 8, padding: "12px 14px", cursor: "pointer",
                      }}
                    >
                      <input type="radio" name="urgency" value={v}
                        checked={urgency === (v as "standard" | "urgent")}
                        onChange={() => setUrgency(v as "standard" | "urgent")}
                        style={{ accentColor: v === "urgent" ? "#bb4f46" : "#147d6e" }} />
                      <div>
                        <b style={{ fontSize: 13 }}>{label}</b>
                        <p style={{ fontSize: 12 }}>{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <button type="submit" className="primary full" disabled={saving}>
                {saving ? "Submitting…" : "Submit support request"} <ArrowRight size={17} />
              </button>
            </form>
          )}
        </section>

        {/* Request history */}
        <section className="panel">
          <div className="panel-heading">
            <h2>Your request history</h2>
            <Clock3 size={20} />
          </div>

          {requests.length > 0 ? (
            <div>
              {requests.map((r) => (
                <div key={r.id} className="audit-row">
                  <span className="mini-icon">
                    {r.acknowledged
                      ? <CheckCheck size={17} style={{ color: "#509b83" }} />
                      : <Clock3 size={17} style={{ color: "#a06030" }} />
                    }
                  </span>
                  <div>
                    <b>{r.acknowledged ? "Acknowledged" : "Awaiting acknowledgement"}</b>
                    <p>
                      {r.preferredContact?.replace("_", " ")} ·{" "}
                      {r.urgency === "urgent" ? "Urgent" : "Standard"}
                    </p>
                  </div>
                  <time>{formatDateTime(r.createdAt)}</time>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty compact">
              <HeartHandshake size={28} />
              <p>No support requests yet. Reach out whenever you're ready.</p>
            </div>
          )}

          <div className="privacy-callout" style={{ marginTop: 20 }}>
            <ShieldCheck size={15} />
            Requests are visible only to your welfare officer.
            They are never shared with commanders, HR or performance managers.
          </div>
        </section>
      </div>

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Personnel Welfare System</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}
