'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, LockKeyhole, HeartPulse, Network, ShieldCheck } from 'lucide-react';

export default function SoldierCover() {
  return (
    <div className="relative min-h-screen w-full bg-[#04121c] overflow-hidden font-sans">
      <div className="absolute inset-0 z-0">
        <Image
          src="https://images.pexels.com/photos/7342938/pexels-photo-7342938.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
          alt="Soldier at dawn"
          fill
          className="object-cover object-top opacity-30"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#04121c] via-[#04121c]/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#04121c] via-[#04121c]/40 to-transparent" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex w-full items-center justify-between px-6 py-6 sm:px-12 lg:px-24">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="SAHAYAK" width={160} height={40} className="h-8 w-auto" />
          </Link>
        </header>

        <main className="flex flex-1 flex-col justify-center px-6 sm:px-12 lg:px-24">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#20d5d0]/30 bg-[#20d5d0]/10 px-4 py-1.5 backdrop-blur-sm">
              <ShieldCheck className="h-4 w-4 text-[#20d5d0]" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#20d5d0]">Secure Deployment</span>
            </div>

            <h1 className="mb-6 text-5xl font-bold tracking-tight text-white sm:text-7xl lg:text-8xl">
              Protecting those<br />
              <span className="text-[#20d5d0]">who protect us.</span>
            </h1>

            <p className="mb-10 max-w-xl text-lg leading-relaxed text-slate-300 sm:text-xl">
              An advanced AI-driven welfare platform designed specifically for the rigorous demands of armed forces personnel. We anticipate risk, so you can focus on the mission.
            </p>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link 
                href="/login" 
                className="inline-flex items-center justify-center gap-3 rounded-full bg-[#20d5d0] px-8 py-4 text-sm font-bold uppercase tracking-wider text-[#061a2b] transition-all hover:bg-white hover:shadow-[0_0_30px_rgba(32,213,208,0.4)]"
              >
                Access Platform <ArrowRight className="h-4 w-4" />
              </Link>
              
              <Link 
                href="/login" 
                className="inline-flex items-center justify-center gap-3 rounded-full border border-slate-600 px-8 py-4 text-sm font-bold uppercase tracking-wider text-white transition-all hover:border-[#20d5d0] hover:bg-[#20d5d0]/10"
              >
                <LockKeyhole className="h-4 w-4" /> Secure Login
              </Link>
            </div>
          </div>
        </main>

        <footer className="flex w-full flex-col items-center justify-between gap-4 border-t border-white/5 px-6 py-8 sm:flex-row sm:px-12 lg:px-24">
          <div className="flex items-center gap-6 text-[10px] font-medium uppercase tracking-widest text-slate-500">
            <span className="flex items-center gap-2"><HeartPulse className="h-3 w-3" /> Welfare-Focused</span>
            <span>&bull;</span>
            <span className="flex items-center gap-2"><Network className="h-3 w-3" /> AI-Powered</span>
          </div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-slate-600">
            Internal Demonstration Use Only
          </div>
        </footer>
      </div>
    </div>
  );
}