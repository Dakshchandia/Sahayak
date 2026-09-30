"use client";
/**
 * AI-Assisted Check-in and Support Journey
 * ─────────────────────────────────────────
 * Stages:
 *   form   → submitting → analyzing → result → (optional) conversation
 *
 * Preserved:
 *   - All existing form fields and server validation
 *   - Consent gate
 *   - Same-day edit policy
 *   - Assessment engine (untouched, server-side)
 *   - Existing support-request flow
 *   - NavShell / CSS design
 *
 * New:
 *   - 3-section progress indicator on the form
 *   - POST then auto-request /api/personnel/checkin/analysis
 *   - Personalized result screen with observations, trend, actions
 *   - Optional follow-up questions (≤ 2, skippable)
 *   - Optional AI conversation drawer (linked to this check-in only)
 *   - Urgent-support pathway always visible
 *   - Template fallback clearly labeled
 */
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Smile, Moon, Activity, HeartHandshake, ArrowRight, AlertCircle,
  ShieldCheck, CheckCheck, Info, RefreshCw, ChevronRight, ChevronLeft,
  MessageCircle, Send, Loader2, TriangleAlert, X, Bot
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast, Toaster } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type Stage = "form" | "submitting" | "analyzing" | "result";

interface CheckInData {
  checkInId: number;
  mood: number;
  sleepHours: number;
  sleepQuality: number;
  fatigue: number;
  perceivedWorkload: number;
  concern: string;
  requestedSupport: boolean;
  assessment: { rawScore: number; maxPossibleScore: number; priority: string } | null;
}

interface Observation { id: string; text: string; inputRef: string; kind: string }
interface SuggestedAction { actionId: string; reason: string; label: string; href: string }
interface FollowUpQ {
  id: string; text: string;
  options: Array<{ id: string; text: string }>;
}

interface Analysis {
  id: number;
  summary: string;
  summarySource: "gemini" | "template";
  observations: Observation[];
  trendSummary: { period: string; comparison: string; note: string } | null;
  suggestedActions: SuggestedAction[];
  followUpQuestions: FollowUpQ[];
  followUpAnswers: Array<{ questionId: string; answerId: string; answerText: string }>;
  revisedSummary: string | null;
  missingContext: string[];
}

interface ConvMessage { role: "user" | "assistant"; content: string; source?: string }

// ─── Constants ─────────────────────────────────────────────────────────────────
const MOOD_LABELS = ["", "Very low", "Low", "Okay", "Good", "Great"];
const MOOD_EMOJIS = ["", "😔", "😕", "😐", "🙂", "😊"];
const PRIORITY_BG: Record<string, string> = { elevated: "#fcf0e9", watch: "#fbf5df", routine: "#e9f4ee" };
const PRIORITY_COLOR: Record<string, string> = { elevated: "#b77b52", watch: "#a79136", routine: "#509479" };
const PRIORITY_LABEL: Record<string, string> = { elevated: "Elevated", watch: "Watch", routine: "Routine" };

// ─── Sections for the form progress indicator ──────────────────────────────────
const SECTIONS = [
  { id: "wellbeing", label: "How you feel" },
  { id: "rest",      label: "Rest & energy" },
  { id: "support",   label: "Support" },
];

// ─── Main component ────────────────────────────────────────────────────────────
export default function CheckInPage() {
  const router = useRouter();
  const [user, setUser]       = useState<any>(null);
  const [csrfToken, setCsrf]  = useState("");
  const [consent, setConsent] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stage, setStage]     = useState<Stage>("form");
  const [section, setSection] = useState(0); // 0 | 1 | 2

  // Form fields
  const [mood, setMood]                   = useState(3);
  const [sleepHours, setSleepHours]       = useState(6);
  const [sleepQuality, setSleepQuality]   = useState(3);
  const [fatigue, setFatigue]             = useState(5);
  const [workload, setWorkload]           = useState(5);
  const [concern, setConcern]             = useState("");
  const [requestSupport, setRequestSupport] = useState(false);
  const [includeConcern, setIncludeConcern] = useState(false); // opt-in to send concern to AI

  // Result state
  const [saved, setSaved]             = useState<CheckInData | null>(null);
  const [analysis, setAnalysis]       = useState<Analysis | null>(null);
  const [analysisFailed, setFailed]   = useState(false);

  // Follow-up state
  const [fqAnswers, setFqAnswers]     = useState<Record<string, string>>({});
  const [fqSubmitting, setFqSub]      = useState(false);
  const [fqDone, setFqDone]           = useState(false);

  // Conversation state
  const [convOpen, setConvOpen]       = useState(false);
  const [messages, setMessages]       = useState<ConvMessage[]>([]);
  const [chatInput, setChatInput]     = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const convEndRef = useRef<HTMLDivElement>(null);

  // Urgent support
  const [urgentOpen, setUrgentOpen]   = useState(false);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [meRes, consentRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/personnel/consent"),
      ]);
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      setUser(me.user);
      const tok = me.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "";
      setCsrf(tok);
      if (consentRes.ok) {
        const d = await consentRes.json();
        const consents = d.consents ?? [];
        setConsent(!!consents.find((c: any) => c.scope === "wellness_checkins" && c.granted));
        setAiConsent(!!consents.find((c: any) => c.scope === "ai_processing" && c.granted));
      }
      setLoading(false);
    }
    init();
  }, [router]);

  // Scroll conversation to bottom
  useEffect(() => {
    convEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Submit handler ────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!consent) { toast.error("Enable wellness sharing in Privacy & access first."); return; }
    setStage("submitting");

    const res = await fetch("/api/personnel/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        csrfToken,
        mood,
        sleepHours,
        sleepQuality,
        fatigue,
        perceivedWorkload: workload,
        concern: concern.trim() || undefined,
        requestedSupport: requestSupport,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Could not save check-in.");
      setStage("form");
      return;
    }

    const checkinData: CheckInData = {
      checkInId: data.checkInId,
      mood, sleepHours, sleepQuality, fatigue, perceivedWorkload: workload,
      concern, requestedSupport: requestSupport,
      assessment: data.assessment ?? null,
    };
    setSaved(checkinData);
    setStage("analyzing");

    // Request analysis — does not create a new check-in
    await requestAnalysis(data.checkInId, checkinData);
  }

  async function requestAnalysis(checkInId: number, checkinData: CheckInData, force = false) {
    try {
      const res = await fetch("/api/personnel/checkin/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csrfToken,
          checkInId,
          includeOptionalText: includeConcern && aiConsent,
          forceRegenerate: force,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setAnalysis(d.analysis);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setStage("result");
    }
  }

  // ── Follow-up answer submission ────────────────────────────────────────────
  async function submitFollowUp() {
    if (!saved) return;
    setFqSub(true);
    const answers = Object.entries(fqAnswers).map(([qId, aId]) => {
      const q = analysis?.followUpQuestions.find((fq) => fq.id === qId);
      const opt = q?.options.find((o) => o.id === aId);
      return { questionId: qId, answerId: aId, answerText: opt?.text ?? aId };
    }).filter((a) => a.answerId !== "skip");

    if (answers.length === 0) { setFqDone(true); setFqSub(false); return; }

    const res = await fetch("/api/personnel/checkin/followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csrfToken, checkInId: saved.checkInId, answers }),
    });
    if (res.ok) {
      const d = await res.json();
      setAnalysis(d.analysis);
    }
    setFqDone(true);
    setFqSub(false);
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!chatInput.trim() || !saved) return;
    const msg = chatInput.trim();
    setChatInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setChatLoading(true);
    try {
      const res = await fetch("/api/personnel/checkin/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken, checkInId: saved.checkInId, message: msg }),
      });
      const d = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: d.reply, source: d.source }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant",
        content: "I could not generate a response right now. For direct support, use the support request option.", source: "template" }]);
    } finally {
      setChatLoading(false);
    }
  }

  if (loading || !user) return null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppShell user={user} csrfToken={csrfToken}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR WELLBEING SPACE</div>
          <h1>
            {stage === "form"       ? "A moment for yourself."     :
             stage === "submitting" ? "Saving your check-in…"      :
             stage === "analyzing"  ? "Preparing your summary…"    :
                                      "Your check-in summary"}
          </h1>
          <p>
            {stage === "form"
              ? "There are no right answers. Share what feels true today."
              : stage === "result"
              ? "Based on what you shared and your authorized records."
              : "Please wait a moment."}
          </p>
        </div>
        {/* Urgent support — always visible */}
        <button
          className="secondary"
          style={{ borderColor: "#e8c2c0", color: "#9b3a36", background: "#fdf9f9" }}
          onClick={() => setUrgentOpen(true)}
          aria-label="I need support now"
        >
          <TriangleAlert size={16} /> I need support now
        </button>
      </div>

      {/* Consent notice */}
      {!consent && stage === "form" && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", background: "#fffbea",
          border: "1px solid #e8d98a", borderRadius: 8, padding: "12px 16px", fontSize: 13,
          color: "#7a6820", marginBottom: 20 }}>
          <AlertCircle size={16} />
          <span>Wellness sharing is disabled.{" "}
            <button onClick={() => router.push("/privacy")}
              style={{ fontWeight: 600, color: "#7a6820", textDecoration: "underline" }}>
              Enable it in Privacy & access
            </button>{" "}
            to submit a check-in.
          </span>
        </div>
      )}

      {/* ── FORM ──────────────────────────────────────────────────────────── */}
      {stage === "form" && (
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          {/* Progress indicator */}
          <div style={{ display: "flex", gap: 0, marginBottom: 28, borderRadius: 8,
            overflow: "hidden", border: "1px solid #e0e8eb" }}>
            {SECTIONS.map((s, i) => (
              <button key={s.id} onClick={() => setSection(i)}
                aria-current={section === i ? "step" : undefined}
                style={{
                  flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 600,
                  background: section === i ? "#147d6e" : i < section ? "#d0ede8" : "#f4f7f8",
                  color: section === i ? "white" : i < section ? "#0e6155" : "#8b9ba3",
                  borderRight: i < SECTIONS.length - 1 ? "1px solid #e0e8eb" : "none",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                {i < section && <CheckCheck size={13} />}
                {s.label}
              </button>
            ))}
          </div>

          {/* Section 0: How you feel */}
          {section === 0 && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <label style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 14 }}>
                  How are you feeling today?
                </label>
                <div className="mood-options">
                  {MOOD_LABELS.slice(1).map((label, i) => (
                    <button key={label} type="button"
                      className={mood === i + 1 ? "chosen" : ""}
                      onClick={() => setMood(i + 1)}
                      aria-pressed={mood === i + 1}
                      aria-label={label}>
                      <Smile size={22} />
                      <span style={{ fontSize: 11 }}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <SliderField label="How tired do you feel?" value={fatigue} onChange={setFatigue}
                min={1} max={10} step={1} display={`${fatigue}/10`}
                leftLabel="Rested" rightLabel="Very tired" ariaLabel="Fatigue level" />
              <SliderField label="Perceived workload today" value={workload} onChange={setWorkload}
                min={1} max={10} step={1} display={`${workload}/10`}
                leftLabel="Light" rightLabel="Very heavy" ariaLabel="Perceived workload" />
            </div>
          )}

          {/* Section 1: Rest & energy */}
          {section === 1 && (
            <div>
              <SliderField label="How much did you sleep?" value={sleepHours} onChange={setSleepHours}
                min={0} max={16} step={0.5} display={`${sleepHours} hours`}
                ariaLabel="Hours slept" />
              <SliderField label="Sleep quality" value={sleepQuality} onChange={setSleepQuality}
                min={1} max={5} step={1} display={`${sleepQuality}/5`}
                leftLabel="Very poor" rightLabel="Excellent" ariaLabel="Sleep quality" />
              <div style={{ marginTop: 24 }}>
                <label style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 8 }}>
                  Anything you'd like to note?{" "}
                  <span style={{ color: "#8b9ba3", fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea value={concern}
                  onChange={(e) => setConcern(e.target.value.slice(0, 500))}
                  placeholder="Any context for your welfare officer…"
                  style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 7,
                    padding: "10px 12px", fontSize: 14, minHeight: 70, resize: "vertical",
                    boxSizing: "border-box" }} />
                <small className="muted">{concern.length}/500</small>
              </div>
              {aiConsent && concern.trim() && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 0", marginTop: 8 }}>
                  <div>
                    <b style={{ fontSize: 13 }}>Include this note in AI summary</b>
                    <p style={{ fontSize: 12, color: "#8b9ba3", marginTop: 2 }}>
                      Sends your note to Gemini. Requires AI-processing consent.
                    </p>
                  </div>
                  <Switch checked={includeConcern} onCheckedChange={setIncludeConcern}
                    aria-label="Include optional note in AI summary" />
                </div>
              )}
            </div>
          )}

          {/* Section 2: Support */}
          {section === 2 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 0", borderBottom: "1px solid #edf1f3", marginBottom: 20 }}>
                <div>
                  <b style={{ fontSize: 14, display: "block" }}>I'd like to speak with a welfare officer</b>
                  <small style={{ color: "#8b9ba3" }}>
                    A confidential request — no score threshold required
                  </small>
                </div>
                <Switch checked={requestSupport} onCheckedChange={setRequestSupport}
                  aria-label="Request welfare officer conversation" />
              </div>

              <div style={{ background: "#f4f7f8", borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 13 }}>
                <b style={{ display: "block", marginBottom: 6 }}>What happens after you submit</b>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 2, color: "#637780" }}>
                  <li>Your check-in is saved immediately.</li>
                  <li>The assessment engine runs using your duty records.</li>
                  <li>A personalized summary is prepared{aiConsent ? " using AI" : " from a template"}.</li>
                  {requestSupport && <li>A confidential support request is sent to your welfare officer.</li>}
                </ul>
              </div>

              <p className="muted" style={{ marginBottom: 24 }}>
                Your responses are shared only with your welfare officer.
                Never used for performance or disciplinary decisions.
              </p>

              <button className="primary full" onClick={handleSubmit}
                disabled={!consent}
                aria-label="Save and analyse check-in">
                Save my check-in <ArrowRight size={17} />
              </button>
            </div>
          )}

          {/* Section navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
            {section > 0 ? (
              <button className="secondary" onClick={() => setSection(section - 1)}>
                <ChevronLeft size={16} /> Back
              </button>
            ) : <span />}
            {section < SECTIONS.length - 1 && (
              <button className="primary" onClick={() => setSection(section + 1)}>
                Continue <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── SUBMITTING / ANALYZING ────────────────────────────────────────── */}
      {(stage === "submitting" || stage === "analyzing") && (
        <div className="panel" style={{ maxWidth: 480, margin: "60px auto", textAlign: "center", padding: 40 }}>
          <Loader2 size={40} style={{ color: "#147d6e", margin: "0 auto 16px",
            animation: "spin 1s linear infinite" }} />
          <h2 style={{ marginBottom: 8 }}>
            {stage === "submitting" ? "Saving your check-in…" : "Preparing your summary…"}
          </h2>
          <p style={{ color: "#637780" }}>
            {stage === "submitting"
              ? "Storing your responses securely."
              : "Analysing your check-in and duty context. This takes a moment."}
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── RESULT ────────────────────────────────────────────────────────── */}
      {stage === "result" && saved && (
        <div style={{ maxWidth: 660, margin: "0 auto" }}>

          {/* A. Check-in summary */}
          <section className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-heading" style={{ marginBottom: 14 }}>
              <h2>Your check-in summary</h2>
              <span style={{ fontSize: 12, color: "#8b9ba3" }}>
                {new Date().toLocaleString("en-IN", { day: "numeric", month: "short",
                  year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <SummaryChip label="Mood" value={`${MOOD_EMOJIS[saved.mood]} ${MOOD_LABELS[saved.mood]}`} />
              <SummaryChip label="Sleep" value={`${saved.sleepHours}h`} />
              <SummaryChip label="Sleep quality" value={`${saved.sleepQuality}/5`} />
              <SummaryChip label="Fatigue" value={`${saved.fatigue}/10`} />
              <SummaryChip label="Workload" value={`${saved.perceivedWorkload}/10`} />
              {saved.requestedSupport && (
                <SummaryChip label="Support" value="Requested ✓" highlight />
              )}
            </div>
            {saved.assessment && (
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12,
                background: PRIORITY_BG[saved.assessment.priority] ?? "#f4f7f8",
                borderRadius: 8, padding: "10px 14px" }}>
                <span style={{ fontSize: 12, color: PRIORITY_COLOR[saved.assessment.priority] ?? "#637780",
                  fontWeight: 600 }}>
                  Welfare indicator: {saved.assessment.rawScore}/{saved.assessment.maxPossibleScore}
                  {" — "}{PRIORITY_LABEL[saved.assessment.priority] ?? saved.assessment.priority}
                </span>
                <span style={{ fontSize: 11, color: "#8b9ba3", marginLeft: "auto" }}>
                  Prioritization aid, not a diagnosis
                </span>
              </div>
            )}
          </section>

          {/* Analysis failed — show retry without losing check-in */}
          {analysisFailed && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", background: "#fffbea",
              border: "1px solid #e8d98a", borderRadius: 8, padding: "12px 16px",
              fontSize: 13, color: "#7a6820", marginBottom: 20 }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>Your check-in was saved. The summary could not be generated.</span>
              <button onClick={() => requestAnalysis(saved.checkInId, saved, true)}
                style={{ marginLeft: "auto", fontWeight: 600, color: "#7a6820" }}>
                <RefreshCw size={13} /> Retry
              </button>
            </div>
          )}

          {analysis && (
            <>
              {/* B. What stands out */}
              {analysis.observations.length > 0 && (
                <section className="panel" style={{ marginBottom: 20 }}>
                  <h2 style={{ marginBottom: 14 }}>What stands out</h2>
                  {analysis.observations.map((obs) => (
                    <div key={obs.id} style={{ display: "flex", gap: 10, padding: "8px 0",
                      borderBottom: "1px solid #edf1f3", fontSize: 13, alignItems: "flex-start" }}>
                      <span style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                        background: obs.kind === "organizational" ? "#e9f0f6" : "#edf7f1",
                        display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                        {obs.kind === "organizational" ? <Activity size={12} style={{ color: "#5a7a9a" }} /> :
                         <Smile size={12} style={{ color: "#278c72" }} />}
                      </span>
                      <span style={{ color: "#2e5560" }}>{obs.text}</span>
                      <span style={{ marginLeft: "auto", fontSize: 10, color: "#a0adb4",
                        whiteSpace: "nowrap", alignSelf: "center" }}>
                        {obs.kind === "organizational" ? "duty records" :
                         obs.kind === "reported" ? "self-reported" : obs.kind}
                      </span>
                    </div>
                  ))}
                </section>
              )}

              {/* C. Trend */}
              <section className="panel" style={{ marginBottom: 20 }}>
                <h2 style={{ marginBottom: 10 }}>Changes over time</h2>
                {analysis.trendSummary ? (
                  <>
                    <p style={{ fontSize: 13, marginBottom: 6 }}>{analysis.trendSummary.comparison}</p>
                    <small style={{ color: "#8b9ba3" }}>
                      Period: {analysis.trendSummary.period} · {analysis.trendSummary.note}
                    </small>
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: "#8b9ba3" }}>
                    {analysis.missingContext.find((m) => m.toLowerCase().includes("history")) ??
                      "Insufficient check-in history to show a trend. Submit a few more check-ins to see comparisons."}
                  </p>
                )}
              </section>

              {/* AI summary */}
              <section className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-heading" style={{ marginBottom: 10 }}>
                  <h2>Summary</h2>
                  <span style={{ fontSize: 11, color: "#8b9ba3" }}>
                    {analysis.summarySource === "gemini" ? "AI-assisted" : "Standard summary"}
                  </span>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: "#2e5560" }}>
                  {(analysis.revisedSummary ?? analysis.summary)
                    .replace(/^\[Standard summary.*?\] /, "")
                    .replace(/^\[Template explanation.*?\] /, "")}
                </p>
                {analysis.summarySource === "template" && (
                  <p style={{ fontSize: 11, color: "#a0adb4", marginTop: 6, fontStyle: "italic" }}>
                    Standard summary — AI assistance was unavailable or not enabled.
                    Enable AI-processing consent in Privacy &amp; access for AI-assisted summaries.
                  </p>
                )}
              </section>

              {/* Follow-up questions */}
              {analysis.followUpQuestions.length > 0 && !fqDone && (
                <section className="panel" style={{ marginBottom: 20 }}>
                  <h2 style={{ marginBottom: 4 }}>A couple of optional questions</h2>
                  <p style={{ fontSize: 13, color: "#637780", marginBottom: 16 }}>
                    These help refine your summary. You can skip any or all.
                  </p>
                  {analysis.followUpQuestions.map((q) => (
                    <div key={q.id} style={{ marginBottom: 20 }}>
                      <b style={{ fontSize: 13, display: "block", marginBottom: 10 }}>{q.text}</b>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {q.options.map((opt) => (
                          <label key={opt.id} style={{ display: "flex", alignItems: "center", gap: 10,
                            border: `1px solid ${fqAnswers[q.id] === opt.id ? "#147d6e" : "#dce5e8"}`,
                            background: fqAnswers[q.id] === opt.id ? "#edf7f1" : "white",
                            borderRadius: 7, padding: "9px 14px", cursor: "pointer", fontSize: 13 }}>
                            <input type="radio" name={q.id} value={opt.id}
                              checked={fqAnswers[q.id] === opt.id}
                              onChange={() => setFqAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                              style={{ accentColor: "#147d6e" }} />
                            {opt.text}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button className="primary" disabled={fqSubmitting} onClick={submitFollowUp}
                    style={{ fontSize: 13 }}>
                    {fqSubmitting ? "Updating…" : "Update summary with my answers"}
                  </button>
                  <button onClick={() => setFqDone(true)}
                    style={{ fontSize: 13, color: "#8b9ba3", marginLeft: 12 }}>
                    Skip
                  </button>
                </section>
              )}

              {/* D. Suggested next steps */}
              {analysis.suggestedActions.length > 0 && (
                <section className="panel" style={{ marginBottom: 20 }}>
                  <h2 style={{ marginBottom: 14 }}>Suggested next steps</h2>
                  {analysis.suggestedActions.map((action) => (
                    <div key={action.actionId} style={{ display: "flex", gap: 14,
                      alignItems: "flex-start", padding: "12px 0", borderBottom: "1px solid #edf1f3" }}>
                      <div style={{ flex: 1 }}>
                        <b style={{ fontSize: 14 }}>{action.label}</b>
                        <p style={{ fontSize: 13, marginTop: 3 }}>{action.reason}</p>
                      </div>
                      <a href={action.href}
                        className="secondary"
                        style={{ fontSize: 12, padding: "7px 14px", whiteSpace: "nowrap",
                          textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        Go <ArrowRight size={13} />
                      </a>
                    </div>
                  ))}
                </section>
              )}

              {/* E. Human support — always visible */}
              <section className="panel" style={{ marginBottom: 20,
                borderColor: "#dbeae3", background: "#f8fdf9" }}>
                <div className="panel-heading" style={{ marginBottom: 10 }}>
                  <h2>Your support options</h2>
                  <ShieldCheck size={18} style={{ color: "#278c72" }} />
                </div>
                <p style={{ fontSize: 13, marginBottom: 14 }}>
                  You can request confidential welfare support at any time, regardless of your indicator score.
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <a href="/personnel/support" className="primary"
                    style={{ fontSize: 13, textDecoration: "none",
                      display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <HeartHandshake size={15} /> Request welfare support
                  </a>
                  <a href="/workload/reviews" className="secondary"
                    style={{ fontSize: 13, textDecoration: "none",
                      display: "inline-flex", alignItems: "center", gap: 8 }}>
                    Request workload review
                  </a>
                </div>
                <p style={{ fontSize: 11, color: "#8b9ba3", marginTop: 12 }}>
                  If you are in immediate danger, contact emergency services (dial 112) or a trusted person
                  directly. This system does not dispatch emergency responders.
                </p>
              </section>

              {/* Discuss with AI button */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                {aiConsent ? (
                  <button className="secondary" onClick={() => setConvOpen(true)}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <Bot size={16} /> Discuss this check-in with AI
                  </button>
                ) : (
                  <p style={{ fontSize: 12, color: "#8b9ba3", textAlign: "center" }}>
                    Enable AI-processing consent in{" "}
                    <a href="/privacy" style={{ color: "#147d6e" }}>Privacy &amp; access</a>{" "}
                    to discuss your check-in with AI.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Navigation */}
          <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
            <button className="secondary" onClick={() => router.push("/personnel/dashboard")}>
              Back to dashboard
            </button>
          </div>
        </div>
      )}

      {/* ── AI Conversation Drawer ──────────────────────────────────────── */}
      {convOpen && saved && (
        <div style={{ position: "fixed", bottom: 0, right: 0, width: "min(420px, 100vw)",
          height: "min(540px, 90vh)", background: "white", boxShadow: "0 -4px 24px #0005",
          borderTopLeftRadius: 16, borderTopRightRadius: 16, zIndex: 60,
          display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px",
            borderBottom: "1px solid #edf1f3", flexShrink: 0 }}>
            <Bot size={20} style={{ color: "#147d6e" }} />
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 14 }}>Discuss this check-in with AI</b>
              <p style={{ fontSize: 11, color: "#8b9ba3", marginTop: 2 }}>
                AI assistant · limited to this check-in context
              </p>
            </div>
            <button className="icon-button" onClick={() => setConvOpen(false)} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          {/* Disclaimer */}
          <div style={{ background: "#f4f7f8", padding: "8px 14px", fontSize: 11, color: "#8b9ba3",
            flexShrink: 0, lineHeight: 1.6 }}>
            I am an AI assistant. I can help explain your results and support options.
            I cannot diagnose conditions, execute actions, or access other people&apos;s data.
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px",
            display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.length === 0 && (
              <p style={{ fontSize: 13, color: "#8b9ba3", textAlign: "center", marginTop: 20 }}>
                Ask me anything about your check-in results or support options.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "80%", padding: "9px 13px", borderRadius: 12, fontSize: 13,
                  background: m.role === "user" ? "#137e6d" : "#f0f4f5",
                  color: m.role === "user" ? "white" : "#2e5560",
                  borderBottomRightRadius: m.role === "user" ? 2 : 12,
                  borderBottomLeftRadius: m.role === "assistant" ? 2 : 12,
                }}>
                  {m.content}
                  {m.source === "template" && m.role === "assistant" && (
                    <div style={{ fontSize: 10, color: "#a0adb4", marginTop: 4 }}>
                      Standard response
                    </div>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", color: "#8b9ba3" }}>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: 12 }}>Thinking…</span>
              </div>
            )}
            <div ref={convEndRef} />
          </div>

          {/* Input */}
          <div style={{ display: "flex", gap: 8, padding: "12px 14px",
            borderTop: "1px solid #edf1f3", flexShrink: 0 }}>
            <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Type a message…"
              style={{ flex: 1, border: "1px solid #dce5e8", borderRadius: 8,
                padding: "9px 12px", fontSize: 13 }}
              aria-label="Message to AI assistant" />
            <button className="primary" onClick={sendMessage}
              disabled={!chatInput.trim() || chatLoading}
              style={{ padding: "0 14px", minHeight: 40 }} aria-label="Send message">
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Urgent support modal ────────────────────────────────────────── */}
      {urgentOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,28,36,.5)",
          display: "grid", placeItems: "center", zIndex: 70, padding: 24 }}>
          <div style={{ background: "white", borderRadius: 14, padding: 32,
            maxWidth: 440, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ color: "#9b3a36" }}>Immediate support</h2>
              <button className="icon-button" onClick={() => setUrgentOpen(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div style={{ background: "#fdf2f2", border: "1px solid #f0c8c4",
              borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <b style={{ fontSize: 14, display: "block", marginBottom: 6 }}>
                If you are in immediate danger
              </b>
              <p style={{ fontSize: 13 }}>
                Contact emergency services by dialling <b>112</b>, or speak directly to a
                trusted colleague or supervisor near you.
              </p>
            </div>
            <p style={{ fontSize: 13, color: "#637780", marginBottom: 16 }}>
              This application stores your request in the internal queue. It does not monitor
              in real-time or dispatch emergency responders. A welfare officer will see your
              request during their next working session.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a href="/personnel/support" className="primary"
                style={{ textDecoration: "none", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 8, fontSize: 14 }}
                onClick={() => setUrgentOpen(false)}>
                <HeartHandshake size={16} /> Submit support request to welfare officer
              </a>
              <button className="secondary" onClick={() => setUrgentOpen(false)}>
                I'm okay — continue check-in
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="page-footer" style={{ marginTop: 30 }}>
        <span><ShieldCheck size={14} /> WELFARE FIRST. HUMAN ALWAYS.</span>
        <span>SAHAYAK · Personnel Welfare System</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}

// ─── Small helper components ──────────────────────────────────────────────────

function SliderField({ label, value, onChange, min, max, step, display, leftLabel, rightLabel, ariaLabel }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; display: string;
  leftLabel?: string; rightLabel?: string; ariaLabel: string;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <label style={{ display: "flex", justifyContent: "space-between", fontSize: 14,
        fontWeight: 600, marginBottom: 12 }}>
        <span>{label}</span>
        <b style={{ color: "#378572" }}>{display}</b>
      </label>
      <Slider aria-label={ariaLabel} value={[value]}
        onValueChange={(v) => onChange(v[0])} min={min} max={max} step={step} />
      {(leftLabel || rightLabel) && (
        <div className="spread subtle" style={{ marginTop: 6 }}>
          {leftLabel && <span>{leftLabel}</span>}
          {rightLabel && <span>{rightLabel}</span>}
        </div>
      )}
    </div>
  );
}

function SummaryChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ background: highlight ? "#e9f4ee" : "#f4f7f8", borderRadius: 8, padding: "8px 10px" }}>
      <small style={{ fontSize: 10, fontWeight: 600, color: "#8b9ba3",
        display: "block", letterSpacing: "0.5px", marginBottom: 2 }}>
        {label.toUpperCase()}
      </small>
      <span style={{ fontSize: 13, fontWeight: 600, color: highlight ? "#278c72" : "#2e5560" }}>
        {value}
      </span>
    </div>
  );
}
