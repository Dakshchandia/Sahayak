"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, LockKeyhole, Check, AlertCircle, Info } from "lucide-react";
import { AppShell } from "@/components/shell";
import { Switch } from "@/components/ui/switch";
import { toast, Toaster } from "sonner";
import { formatDateTime } from "@/lib/utils";

interface ConsentRecord {
  id: number; scope: string; granted: boolean;
  policyVersion: string; grantedAt: string | null; withdrawnAt: string | null;
}

const SCOPE_META: Record<string, { label: string; desc: string }> = {
  wellness_checkins: {
    label: "Wellness check-ins",
    desc: "Share mood, sleep and fatigue responses for welfare review. An unanswered check-in never adds risk points.",
  },
  wearable: {
    label: "Wearable / health device data",
    desc: "Link an approved wearable device. Integration is not currently enabled in this installation.",
  },
  ai_processing: {
    label: "AI-assisted explanations",
    desc: "Allow anonymised contributing factor data to be sent to an AI provider for plain-language summaries. Your name, ID and location are never sent.",
  },
};

export default function PrivacyPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const [meRes, consentRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/personnel/consent"),
      ]);
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      setUser(me.user);
      setCsrfToken(me.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");

      if (consentRes.ok) {
        const d = await consentRes.json();
        setConsents(d.consents ?? []);
      }
      setLoading(false);
    }
    init();
  }, [router]);

  function getConsent(scope: string) {
    return consents.find((c) => c.scope === scope);
  }

  async function updateConsent(scope: string, granted: boolean) {
    if (!granted) { setConfirmWithdraw(scope); return; }
    await doConsent(scope, true);
  }

  async function doConsent(scope: string, granted: boolean) {
    setSaving(scope);
    setConfirmWithdraw(null);
    try {
      const res = await fetch("/api/personnel/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken, scope, granted }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Could not update consent."); return; }
      setConsents((prev) => {
        const existing = prev.find((c) => c.scope === scope);
        if (existing) return prev.map((c) => c.scope === scope ? { ...c, granted } : c);
        return [...prev, { id: Date.now(), scope, granted, policyVersion: "1.0",
          grantedAt: granted ? new Date().toISOString() : null,
          withdrawnAt: granted ? null : new Date().toISOString() }];
      });
      toast.success(granted ? "Consent enabled." : "Consent withdrawn. Check-ins removed from future assessments.");
    } catch { toast.error("Network error."); }
    finally { setSaving(null); }
  }

  if (!user || loading) return null;

  const isPersonnel = user.role === "personnel";

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TRUST IS PART OF THE SYSTEM</div>
          <h1>Privacy & access</h1>
          <p>Understand what is shared, why it is used, and who can see it.</p>
        </div>
      </div>

      <div className="two-col">
        <section className="panel privacy-intro">
          <span className="large-icon"><LockKeyhole /></span>
          <h2>Support begins with trust.</h2>
          <p>
            Wellness responses belong in a confidential support workflow. Commanders receive
            only unit aggregates — counselling details stay outside their view.
          </p>
          <div className="privacy-callout">
            For welfare support only.
            <br />
            <strong>No disciplinary or performance scoring.</strong>
          </div>
          <p className="muted" style={{ marginTop: 16 }}>
            Organizational data (duty, deployment, leave) is supplied by authorized HR records.
            You cannot opt out of organizational records, but you control all voluntary wellness sharing.
          </p>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Data and consent</h2>
            <ShieldCheck size={20} />
          </div>

          {isPersonnel ? (
            Object.entries(SCOPE_META).map(([scope, meta]) => {
              const record = getConsent(scope);
              const isGranted = record?.granted ?? false;
              const isDisabled = scope === "wearable"; // Not implemented yet

              return (
                <div key={scope}>
                  <div className="consent-row">
                    <div>
                      <b>{meta.label}</b>
                      <p style={{ fontSize: 12, maxWidth: 280, marginTop: 6 }}>{meta.desc}</p>
                      {record && !isGranted && record.withdrawnAt && (
                        <small className="muted">
                          Withdrawn: {formatDateTime(record.withdrawnAt)}
                        </small>
                      )}
                    </div>
                    <Switch
                      checked={isGranted}
                      disabled={saving === scope || isDisabled}
                      aria-label={`Toggle ${meta.label}`}
                      onCheckedChange={(v) => updateConsent(scope, v)}
                    />
                  </div>

                  {confirmWithdraw === scope && (
                    <div style={{ background: "#fdf2f2", border: "1px solid #e8c2c0", borderRadius: 7,
                      padding: "14px 16px", marginBottom: 16 }}>
                      <p style={{ fontSize: 13, color: "#9b3a36", marginBottom: 12 }}>
                        <AlertCircle size={14} style={{ display: "inline", marginRight: 6 }} />
                        {scope === "wellness_checkins"
                          ? "Withdrawing wellness consent will remove your stored check-ins from future assessments. Duty records and audit events are retained."
                          : "This will withdraw your consent for this data type."}
                      </p>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button className="primary" style={{ background: "#bb4f46" }}
                          onClick={() => doConsent(scope, false)}>
                          Withdraw consent
                        </button>
                        <button className="secondary" onClick={() => setConfirmWithdraw(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p>Personnel manage voluntary wellness sharing in their own view. An unanswered check-in never adds risk points.</p>
          )}

          <div className="access-list">
            <div><Check size={17} /><span>Organizational data: duty and deployment</span></div>
            <div><Check size={17} /><span>Optional data: sleep, fatigue and mood (with consent)</span></div>
            <div><LockKeyhole size={17} /><span>Biometric integration: not enabled</span></div>
            <div><LockKeyhole size={17} /><span>Counselling notes: welfare officers only</span></div>
          </div>
        </section>
      </div>

      {/* Audit history */}
      {isPersonnel && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Access and action history</h2>
            <span className="subtle">Your audit trail</span>
          </div>
          <p className="muted" style={{ marginBottom: 16 }}>
            Access events for your profile, consent changes, check-in submissions and case reviews
            appear here. Individual records are visible only to you and authorized welfare officers.
          </p>
          <div className="demo-notice">
            <Info size={15} />
            <span>
              Audit records show actions taken on your data. They are stored in the database and
              are NOT cryptographically signed — this is audit history, not an immutable ledger.
            </span>
          </div>
        </section>
      )}

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Privacy Policy v1.0</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}
