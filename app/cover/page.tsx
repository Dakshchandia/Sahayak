'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, LockKeyhole, HeartPulse, ShieldCheck, Users } from 'lucide-react';

export default function SoldierCover() {
  return (
    <div className="relative min-h-screen w-full bg-[#04121c] overflow-hidden font-sans">
      {/* Background soldier image */}
      <div className="absolute inset-0 z-0">
        <img
          src="/hero-bg.jpg"
          alt="Indian soldier"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#04121c]/90 via-[#04121c]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#04121c]/80 via-transparent to-[#04121c]/30" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Header — logo + Login only */}
        <header className="flex w-full items-center justify-between px-6 py-5 sm:px-12 lg:px-24">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="SAHAYAK" width={160} height={40} className="h-8 w-auto" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-[#20d5d0] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-[#061a2b] transition-all hover:bg-white hover:shadow-[0_0_25px_rgba(32,213,208,0.4)]"
          >
            Login <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </header>

        {/* Main Content */}
        <main className="flex flex-1 flex-col justify-center px-6 sm:px-12 lg:px-24">
          <div className="max-w-2xl">
            {/* Badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#20d5d0]/30 bg-[#20d5d0]/10 px-4 py-1.5 backdrop-blur-sm">
              <ShieldCheck className="h-4 w-4 text-[#20d5d0]" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#20d5d0]">AI-Powered &middot; Privacy-First &middot; Welfare-Focused</span>
            </div>

            {/* Headline */}
            <h1 className="mb-6 text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl leading-[1.1]">
              Predict Stress.<br />
              <span className="text-[#20d5d0]">Protect Personnel.</span><br />
              Strengthen<br />
              Readiness.
            </h1>

            {/* Description */}
            <p className="mb-10 max-w-lg text-base leading-relaxed text-slate-300 sm:text-lg">
              SAHAYAK is a privacy-first predictive welfare platform that identifies early stress and burnout risk indicators and enables timely, human-led support for high-stress personnel.
            </p>

            {/* Buttons */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-3 rounded-full bg-[#20d5d0] px-8 py-4 text-sm font-bold uppercase tracking-wider text-[#061a2b] transition-all hover:bg-white hover:shadow-[0_0_30px_rgba(32,213,208,0.4)]"
              >
                Explore Platform <ArrowRight className="h-4 w-4" />
              </Link>

              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-3 rounded-full border border-slate-500 px-8 py-4 text-sm font-bold uppercase tracking-wider text-white transition-all hover:border-[#20d5d0] hover:bg-[#20d5d0]/10"
              >
                View Dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </main>

        {/* Footer pills */}
        <footer className="flex w-full flex-col items-center justify-between gap-4 border-t border-white/5 px-6 py-8 sm:flex-row sm:px-12 lg:px-24">
          <div className="flex items-center gap-8 text-xs font-medium text-slate-400">
            <span className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-[#20d5d0]" /> Privacy First</span>
            <span className="flex items-center gap-2"><Users className="h-4 w-4 text-[#20d5d0]" /> Human Oversight</span>
            <span className="flex items-center gap-2"><HeartPulse className="h-4 w-4 text-[#20d5d0]" /> Welfare Before Discipline</span>
          </div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-slate-600">
            Internal Demonstration Use Only
          </div>
        </footer>
      </div>
    </div>
  );
}