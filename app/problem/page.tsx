"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, BookOpen, AlertCircle, CheckCheck, ArrowRight, Info,
  Users, LockKeyhole, Brain, BarChart3, HeartHandshake, FileText
} from "lucide-react";
import { AppShell } from "@/components/shell";

export default function ProblemPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      if (!r.ok) { router.push("/login"); return; }
      const d = await r.json();
      setUser(d.user);
      setCsrfToken(d.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");
    });
  }, [router]);

  if (!user) return null;

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      {/* Hero */}
      <section className="problem-hero">
        <div className="eyebrow">PROBLEM STATEMENT</div>
        <h2>Protecting those<br />who protect us.</h2>
        <p>
          Develop an AI-powered Personnel Stress and Welfare Monitoring System for CAPFs,
          Armed Forces and other uniformed services that identifies early indicators of strain
          from authorized organizational records and voluntarily shared wellness data, and
          enables confidential, accountable human support.
        </p>
      </section>

      {/* The gap */}
      <div className="two-col">
        <section className="panel">
          <h2 style={{ marginBottom: 14 }}>01 · The existing gap</h2>
          <p>
            Extended deployments, irregular duty, family separation, frequent transfers and
            exposure to difficult incidents can create welfare concerns. Manual observation
            and self-reporting alone can leave emerging patterns unnoticed.
          </p>
          <p style={{ marginTop: 12 }}>
            Records are fragmented across duty schedules, HR systems and welfare conversations.
            Officers need context and a structured way to prioritize who needs a conversation —
            not a score to replace that conversation.
          </p>
          <div className="privacy-callout" style={{ marginTop: 20 }}>
            <AlertCircle size={15} />
            <span>
              Personnel also need a credible privacy boundary before they will trust
              any wellness system with honest responses.
            </span>
          </div>
        </section>

        <section className="panel">
          <h2 style={{ marginBottom: 14 }}>02 · What SAHAYAK does</h2>
          <ul className="problem-list">
            <li><CheckCheck size={14} style={{ display: "inline", marginRight: 8, color: "#509b83" }} />Analyzes authorized duty, deployment, leave and workload records</li>
            <li><CheckCheck size={14} style={{ display: "inline", marginRight: 8, color: "#509b83" }} />Accepts optional voluntary wellness check-ins with full consent control</li>
            <li><CheckCheck size={14} style={{ display: "inline", marginRight: 8, color: "#509b83" }} />Identifies explainable patterns using a versioned rule engine</li>
            <li><CheckCheck size={14} style={{ display: "inline", marginRight: 8, color: "#509b83" }} />Helps welfare officers coordinate confidential support</li>
            <li><CheckCheck size={14} style={{ display: "inline", marginRight: 8, color: "#509b83" }} />Gives commanders aggregated workload data — never individual wellness scores</li>
            <li><CheckCheck size={14} style={{ display: "inline", marginRight: 8, color: "#509b83" }} />Tracks interventions, follow-ups and outcomes</li>
            <li><CheckCheck size={14} style={{ display: "inline", marginRight: 8, color: "#509b83" }} />Protects personnel from disciplinary or performance use of wellness information</li>
          </ul>
        </section>
      </div>

      {/* Hard boundaries */}
      <section className="panel" style={{ marginBottom: 25 }}>
        <div className="panel-heading">
          <h2>03 · What SAHAYAK must never do</h2>
          <AlertCircle size={20} style={{ color: "#bb4f46" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { icon: Brain,         text: "Diagnose psychiatric conditions" },
            { icon: FileText,      text: "Determine fitness for duty" },
            { icon: AlertCircle,   text: "Make automatic employment or disciplinary decisions" },
            { icon: BarChart3,     text: "Present a score as clinical probability of any condition" },
            { icon: HeartHandshake,text: "Automatically contact family, commanders or emergency services" },
            { icon: LockKeyhole,   text: "Penalise personnel for skipping a check-in" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} style={{ display: "flex", gap: 10, alignItems: "flex-start",
              background: "#fdf2f2", border: "1px solid #f0c8c4", borderRadius: 8, padding: "12px 14px" }}>
              <Icon size={15} style={{ color: "#bb4f46", flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 13, color: "#7a3530" }}>{text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* How the engine works */}
      <section className="panel" style={{ marginBottom: 25 }}>
        <div className="panel-heading">
          <h2>04 · How the assessment engine works</h2>
          <span className="subtle">Transparent rule-based baseline</span>
        </div>
        <p style={{ marginBottom: 18 }}>
          Every assessment is calculated from a versioned set of rules. There is no black box.
          Every contributing factor, its threshold and its point value are visible to the
          welfare officer reviewing a case.
        </p>
        <div className="table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f4f7f8" }}>
                <th style={{ padding: "8px 14px", textAlign: "left", color: "#637780", fontWeight: 500 }}>Factor</th>
                <th style={{ padding: "8px 14px", textAlign: "left", color: "#637780", fontWeight: 500 }}>Kind</th>
                <th style={{ padding: "8px 14px", textAlign: "left", color: "#637780", fontWeight: 500 }}>High threshold</th>
                <th style={{ padding: "8px 14px", textAlign: "left", color: "#637780", fontWeight: 500 }}>Max points</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Weekly duty hours", "Workload", ">60 hours = 20pts, >48 = 10pts", "20"],
                ["Night shifts this month", "Recovery", ">8 shifts = 20pts, >5 = 10pts", "20"],
                ["Consecutive duty days", "Recovery", ">10 days = 15pts, >6 = 8pts", "15"],
                ["Deployment duration", "Deployment", ">45 days = 15pts, >20 = 8pts", "15"],
                ["Days since last leave", "Leave", ">90 days = 15pts, >60 = 7pts", "15"],
                ["Transfers (last 6 months)", "Transfer", "≥2 = 10pts, ≥1 = 5pts", "10"],
                ["Training days (last 30)", "Workload", ">20 days = 8pts, >10 = 4pts", "8"],
                ["Self-reported sleep ✦", "Wellness", "<4h = 15pts, <5h = 8pts", "15"],
                ["Self-reported fatigue ✦", "Wellness", "≥8/10 = 15pts, ≥6 = 8pts", "15"],
                ["Perceived workload ✦", "Wellness", "≥8/10 = 10pts, ≥6 = 5pts", "10"],
              ].map(([name, kind, threshold, pts]) => (
                <tr key={name} style={{ borderBottom: "1px solid #edf1f3" }}>
                  <td style={{ padding: "10px 14px", color: "#2e5560" }}>{name}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4,
                      background: kind === "Wellness" ? "#edf7f1" : "#f0f4f5",
                      color: kind === "Wellness" ? "#509b83" : "#637780" }}>{kind}</span>
                  </td>
                  <td style={{ padding: "10px 14px", color: "#687b83" }}>{threshold}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: "#3a5260" }}>{pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          ✦ Wellness factors (marked above) are only included when the personnel member has enabled wellness
          consent AND submitted data. Missing data adds <strong>zero points</strong> — silence never counts
          against someone.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 20 }}>
          {[
            { range: "0 – 24", level: "Routine", color: "#e9f4ee", text: "#509479" },
            { range: "25 – 54", level: "Watch", color: "#fbf5df", text: "#a79136" },
            { range: "55+", level: "Elevated", color: "#fcf0e9", text: "#b77b52" },
          ].map(({ range, level, color, text }) => (
            <div key={level} style={{ background: color, borderRadius: 8, padding: "14px 16px", textAlign: "center" }}>
              <strong style={{ fontSize: 22, display: "block", color: text }}>{level}</strong>
              <span style={{ fontSize: 13, color: text }}>{range} points</span>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy model */}
      <div className="two-col">
        <section className="panel">
          <div className="panel-heading">
            <h2>05 · Privacy model</h2>
            <LockKeyhole size={20} />
          </div>
          <div className="access-list">
            {[
              { icon: CheckCheck, text: "Personnel see only their own data" },
              { icon: CheckCheck, text: "Welfare officers see their unit's cases" },
              { icon: CheckCheck, text: "Commanders see unit aggregates only" },
              { icon: CheckCheck, text: "Administrators manage accounts — no counselling note access" },
              { icon: LockKeyhole, text: "No individual wellness data ever reaches commanders" },
              { icon: LockKeyhole, text: "Confidential notes visible to welfare officers only" },
              { icon: LockKeyhole, text: "Audit trail of every data access — visible to the personnel member" },
            ].map(({ icon: Icon, text }) => (
              <div key={text}><Icon size={17} /><span>{text}</span></div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>06 · Honest limitations</h2>
            <Info size={20} />
          </div>
          <ul className="problem-list">
            <li>Thresholds are illustrative and have NOT been clinically validated</li>
            <li>The rule engine does not model causation — correlation only</li>
            <li>No live CAPF/HR integration — organizational data imported via CSV</li>
            <li>The ML pipeline (experimental) learns to reproduce the rules, not real welfare outcomes</li>
            <li>Audit records are not cryptographically tamper-proof</li>
            <li>Case notes are not field-encrypted (require KMS in production)</li>
            <li>Rate limiting is in-process — needs Redis for multi-server deployments</li>
            <li>Wearable integration UI exists but is not connected</li>
          </ul>
        </section>
      </div>

      {/* Process */}
      <section className="panel" style={{ marginBottom: 25 }}>
        <div className="panel-heading">
          <h2>07 · End-to-end workflow</h2>
          <ArrowRight size={20} />
        </div>
        <div className="process-grid">
          {[
            { n: "01", title: "Data import", desc: "Authorized duty, deployment, leave and transfer records imported via CSV or HR connector" },
            { n: "02", title: "Check-in", desc: "Personnel voluntarily shares mood, sleep and fatigue. Consent is separate and withdrawable at any time" },
            { n: "03", title: "Assessment", desc: "Rule engine calculates an explainable indicator score. Every factor is visible. AI drafts a plain-language summary (optional)" },
            { n: "04", title: "Case review", desc: "Welfare officer reviews the context, records an intervention and schedules a follow-up" },
            { n: "05", title: "Follow-up", desc: "Overdue follow-ups surface automatically. Case progresses through a tracked state machine" },
            { n: "06", title: "Commander view", desc: "Unit-level aggregates only — workload patterns and scenario planning without individual wellness data" },
            { n: "07", title: "Audit", desc: "Every access, change and consent action is logged. Personnel can see their own access history" },
            { n: "08", title: "Outcome", desc: "Human welfare officer makes all decisions. No automated intervention, no automatic contact, no automatic case closure" },
          ].map(({ n, title, desc }) => (
            <div key={n}>
              <span style={{ fontSize: 28, color: "#a6cabe", fontWeight: 500 }}>{n}</span>
              <h3 style={{ margin: "10px 0 8px" }}>{title}</h3>
              <p style={{ fontSize: 13 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Problem Statement & Approach</span>
      </footer>
    </AppShell>
  );
}
