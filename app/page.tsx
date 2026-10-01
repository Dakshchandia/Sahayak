'use client';
import { Lock, Users, Shield, Heart, HeartPulse, ShieldCheck, Network, ArrowRight, Check, X, Menu, ChevronRight, LockKeyhole, ArrowDown, BarChart3, BellRing, BrainCircuit, ClipboardCheck, Eye, Fingerprint, Gauge, Scale, Sparkles, UserRound, UsersRound } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

const heroImage = 'https://images.pexels.com/photos/38038466/pexels-photo-38038466.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';

const features = [
  { icon: BrainCircuit, title: 'Predictive Stress Analytics', text: 'See emerging patterns before they become a crisis.' },
  { icon: ClipboardCheck, title: 'Wellness Self-Assessment', text: 'Give personnel a private, simple way to check in.' },
  { icon: BarChart3, title: 'Workload Intelligence', text: 'Understand pressure across schedules and roles.' },
  { icon: Network, title: 'Deployment Pattern Analysis', text: 'Connect operational rhythms with wellbeing signals.' },
  { icon: Sparkles, title: 'Welfare Recommendations', text: 'Turn indicators into practical next steps for care.' },
  { icon: BellRing, title: 'Authorized Alerts', text: 'Surface the right signal to the right human.' },
  { icon: UsersRound, title: 'Role-Based Dashboards', text: 'Give every welfare role a focused view.' },
  { icon: Fingerprint, title: 'Privacy-Preserving Analytics', text: 'Learn from trends without exposing identities.' },
];

const security = [
  { icon: LockKeyhole, title: 'Encryption', text: 'Protected handling across every touchpoint.' },
  { icon: ShieldCheck, title: 'Role-Based Access', text: 'Information is visible only to authorized roles.' },
  { icon: Check, title: 'Consent Management', text: 'Clear, intentional participation by design.' },
  { icon: Scale, title: 'Data Minimization', text: 'Collect only what supports the welfare mission.' },
  { icon: UserRound, title: 'Anonymization', text: 'Aggregate insight without unnecessary exposure.' },
  { icon: ClipboardCheck, title: 'Audit Logging', text: 'Accountability built into every access path.' },
];

const pipeline = [
  { number: '01', title: 'DATA', items: ['HR patterns', 'Leave', 'Deployment', 'Duty schedule', 'Workload'] },
  { number: '02', title: 'WELLNESS', items: ['Self assessment', 'Wellness check-ins', 'Optional authorized biometrics'] },
  { number: '03', title: 'AI ENGINE', items: ['Behavioral pattern analysis', 'Risk prediction', 'Trend detection'] },
  { number: '04', title: 'RISK INDICATORS', items: ['Stress risk', 'Burnout risk', 'Workload risk', 'Wellness trend'] },
  { number: '05', title: 'WELFARE ACTION', items: ['Counselling', 'Workload review', 'Wellness follow-up'] },
  { number: '06', title: 'HUMAN REVIEW', items: ['Authorized welfare personnel'] },
];

function Logo({ compact = false }: { compact?: boolean }) {
  return <Image src="/logo.png" alt="SAHAYAK" width={256} height={256} className={compact ? 'h-10 w-auto object-contain' : 'h-32 sm:h-40 w-auto object-contain'} />;
}

function SectionLabel({ children }: { children: string }) {
  return <p className="font-mono text-[10px] font-medium uppercase tracking-[0.28em] text-[#20d5d0]">{children}</p>;
}

function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <main className="welcome-screen relative flex min-h-screen items-center justify-center overflow-hidden bg-[#061a2b] px-5 py-12 text-center text-white">
      <div className="welcome-grid absolute inset-0 opacity-60" />
      <div className="welcome-orb welcome-orb-one absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#10c9c3]/15 blur-[110px]" />
      <div className="welcome-orb welcome-orb-two absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-[#20d5d0]/10 blur-[120px]" />
      <svg className="welcome-ekg absolute left-0 top-1/2 h-24 w-full -translate-y-1/2" viewBox="0 0 1200 100" preserveAspectRatio="none">
        <path className="welcome-ekg-path" d="M0 50 H 300 L 340 50 L 360 20 L 380 80 L 400 50 H 600 L 640 50 L 660 15 L 680 85 L 700 50 H 900 L 940 50 L 960 25 L 980 75 L 1000 50 H 1200" fill="none" stroke="#20d5d0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center">
        <div className="welcome-logo-wrap relative flex h-44 w-44 items-center justify-center sm:h-52 sm:w-52">
          <div className="welcome-hex-ring absolute inset-0" />
          <div className="welcome-hex-ring welcome-hex-ring-2 absolute inset-[-8px]" />
          <div className="welcome-pulse-ring absolute inset-0 rounded-full border border-[#20d5d0]/40" />
          <div className="welcome-logo-shell relative flex h-40 w-40 items-center justify-center rounded-full border border-[#20d5d0]/35 bg-[#0b2940]/80 shadow-[0_0_75px_rgba(32,213,208,.18)] backdrop-blur-xl sm:h-48 sm:w-48">
            <div className="welcome-logo-img"><Logo compact={false} /></div>
          </div>
        </div>
        <div className="welcome-divider mt-10 flex items-center gap-4 text-[#20d5d0]"><span className="h-px w-12 bg-[#20d5d0]/60" /><HeartPulse size={16} /><span className="h-px w-12 bg-[#20d5d0]/60" /></div>
        <h1 className="welcome-title mt-5 text-4xl font-extrabold tracking-[-0.06em] text-white sm:text-6xl"><span className="welcome-title-inner inline-block">SAHAYAK</span><span className="welcome-cursor" /></h1>
        <p className="welcome-subtitle mt-4 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-[#20d5d0] sm:text-xs">AI-powered personnel welfare</p>
        <p className="welcome-desc mx-auto mt-8 max-w-lg text-sm leading-7 text-slate-300 sm:text-base">Technology protecting the people who protect others through early insight, secure intelligence, and human-led care.</p>
        <div className="welcome-chips mt-8 flex max-w-md flex-wrap justify-center gap-2"><span className="welcome-chip"><HeartPulse size={13} /> Human-led care</span><span className="welcome-chip"><ShieldCheck size={13} /> Privacy-first</span><span className="welcome-chip"><Network size={13} /> Predictive intelligence</span></div>
        <button onClick={onContinue} className="welcome-continue group mt-14 inline-flex items-center gap-3 rounded-full border border-[#20d5d0]/60 bg-[#20d5d0] px-7 py-3.5 text-xs font-extrabold uppercase tracking-[0.15em] text-[#061a2b] shadow-[0_0_35px_rgba(32,213,208,.18)] transition hover:bg-white hover:shadow-[0_0_45px_rgba(32,213,208,.3)]">Enter platform <ArrowRight size={15} className="transition group-hover:translate-x-1" /></button>
        <div className="welcome-progress-wrap mt-14 flex w-full max-w-xs items-center gap-3"><div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10"><div className="welcome-progress h-full rounded-full bg-[#20d5d0]" /></div><span className="font-mono text-[9px] uppercase tracking-[0.15em] text-slate-500">Demo</span></div>
        <p className="welcome-footnote mt-4 text-[10px] uppercase tracking-[0.16em] text-slate-600">Fictional demonstration data - No medical diagnosis</p>
      </div>
    </main>
  );
}

import SoldierCover from './cover/page';

function App() {
  const [showWelcome, setShowWelcome] = useState(true);

  if (showWelcome) {
    return <WelcomeScreen onContinue={() => setShowWelcome(false)} />;
  }

  return <SoldierCover />;
}

export default App;