"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  ShieldCheck, LayoutDashboard, Users, HeartPulse, CalendarDays,
  LockKeyhole, BookOpen, ChevronRight, Bell, Globe, LogOut,
  Clock, ClipboardList, MessageSquarePlus, BarChart3, SlidersHorizontal,
  FileText
} from "lucide-react";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup,
  SidebarGroupLabel, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";

type Role = "personnel" | "welfare_officer" | "commander" | "admin";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  href: string;
  roles: Role[];
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  // ── Welfare Officer ──────────────────────────────────────────────────────
  { id: "overview",       label: "Overview",             icon: LayoutDashboard, href: "/welfare",                    roles: ["welfare_officer"] },
  { id: "cases",          label: "Welfare cases",        icon: Users,           href: "/welfare/cases",               roles: ["welfare_officer"] },
  { id: "followups",      label: "Follow-ups",           icon: CalendarDays,    href: "/welfare/followups",           roles: ["welfare_officer"] },
  { id: "wo-import",      label: "Import records",       icon: FileText,        href: "/welfare/import",              roles: ["welfare_officer"] },
  // ── Personnel ────────────────────────────────────────────────────────────
  { id: "dashboard",      label: "My dashboard",         icon: LayoutDashboard, href: "/personnel/dashboard",         roles: ["personnel"] },
  { id: "checkin",        label: "Check-in",             icon: HeartPulse,      href: "/personnel/checkin",           roles: ["personnel"] },
  { id: "support",        label: "Get support",          icon: HeartPulse,      href: "/personnel/support",           roles: ["personnel"] },
  { id: "duty-recovery",  label: "My Duty & Recovery",   icon: Clock,           href: "/workload/recovery",           roles: ["personnel"] },
  { id: "my-assignments", label: "My Assignments",       icon: ClipboardList,   href: "/workload/assignments",        roles: ["personnel"] },
  { id: "workload-review",label: "Workload Review",      icon: MessageSquarePlus,href: "/workload/reviews",           roles: ["personnel"] },
  // ── Commander ────────────────────────────────────────────────────────────
  { id: "commander",      label: "Unit overview",        icon: LayoutDashboard, href: "/commander",                   roles: ["commander"] },
  { id: "distribution",   label: "Workload Distribution",icon: BarChart3,       href: "/roster/distribution",         roles: ["commander"] },
  { id: "wl-requests",    label: "Workload Requests",    icon: MessageSquarePlus,href: "/roster/workload-requests",   roles: ["commander"] },
  { id: "planner",        label: "Rebalancing Planner",  icon: SlidersHorizontal,href: "/roster/planner",             roles: ["commander"] },
  // ── Shared ───────────────────────────────────────────────────────────────
  { id: "privacy",        label: "Privacy & access",     icon: LockKeyhole,     href: "/privacy",                     roles: ["personnel", "welfare_officer", "commander"] },
  { id: "problem",        label: "Problem & approach",   icon: BookOpen,        href: "/problem",                     roles: ["personnel", "welfare_officer", "commander", "admin"] },
  // ── Admin ─────────────────────────────────────────────────────────────────
  { id: "admin",          label: "Administration",       icon: Users,           href: "/admin",                       roles: ["admin"] },
];

interface ShellProps {
  user: { id: number; name: string; email: string; role: Role; unitId: number | null };
  csrfToken: string;
  children: React.ReactNode;
  unreadCount?: number;
}

export function AppShell({ user, csrfToken, children, unreadCount = 0 }: ShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [locale, setLocale] = useState("en");

  const roleLabel = {
    personnel: "Personnel",
    welfare_officer: "Welfare Officer",
    commander: "Commander",
    admin: "Administrator",
  }[user.role];

  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  async function toggleLocale() {
    const next = locale === "en" ? "hi" : "en";
    setLocale(next);
    document.cookie = `locale=${next};path=/;max-age=31536000`;
    window.location.reload();
  }

  const visibleNav = NAV_ITEMS.filter((n) => n.roles.includes(user.role));
  const activeId = visibleNav.find((n) => pathname.startsWith(n.href))?.id ?? "";

  return (
    <SidebarProvider>
      <Sidebar className="app-sidebar">
        <SidebarHeader>
          <a className="brand" href="/" aria-label="Sahayak home">
            <span className="brand-icon"><ShieldCheck size={26} /></span>
            <span>SAHAYAK<small>PERSONNEL WELLBEING</small></span>
          </a>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>WORKSPACE</SidebarGroupLabel>
            <SidebarMenu>
              {visibleNav.map((n) => (
                <SidebarMenuItem key={n.id}>
                  <SidebarMenuButton
                    isActive={activeId === n.id}
                    onClick={() => router.push(n.href)}
                  >
                    <n.icon size={18} />
                    <span>{n.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          <div className="sidebar-note">
            <ShieldCheck size={23} />
            <b>Built around trust</b>
            <p>Confidential care.<br />Human-led decisions.<br />Welfare comes first.</p>
            <button onClick={() => router.push("/privacy")}>
              Our privacy approach <ChevronRight size={15} />
            </button>
          </div>
        </SidebarContent>

        <SidebarFooter>
          <div className="profile">
            <span className="avatar">{initials}</span>
            <div>
              <b>{user.name}</b>
              <small>{roleLabel}</small>
            </div>
          </div>
          <div className="sidebar-actions">
            <button
              className="sidebar-action-btn"
              aria-label="Toggle language (English/Hindi)"
              title="Switch language"
              onClick={toggleLocale}
            >
              <Globe size={16} />
            </button>
            <button
              className="sidebar-action-btn"
              aria-label="Sign out"
              title="Sign out"
              onClick={handleLogout}
            >
              <LogOut size={16} />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>{visibleNav.find((n) => activeId === n.id)?.label ?? "Dashboard"}</b>
          </div>
          <div className="top-right">
            <button
              className="notif-btn"
              aria-label={`Notifications (${unreadCount} unread)`}
              onClick={() => router.push("/notifications")}
            >
              <Bell size={19} />
              {unreadCount > 0 && (
                <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
              )}
            </button>
          </div>
        </header>

        <main className="workspace">{children}</main>
      </SidebarInset>

      <style jsx>{`
        .sidebar-actions {
          display: flex;
          gap: 8px;
          padding: 8px 12px 12px;
          border-top: 1px solid #2a4a55;
          margin-top: 4px;
        }
        .sidebar-action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 7px;
          color: #8fb5c0;
          transition: background 0.15s, color 0.15s;
        }
        .sidebar-action-btn:hover {
          background: #244651;
          color: #aff0da;
        }
        .notif-btn {
          position: relative;
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          border-radius: 8px;
          color: #637780;
          transition: background 0.15s;
        }
        .notif-btn:hover {
          background: #edf5f3;
          color: #147d6e;
        }
        .notif-badge {
          position: absolute;
          top: 4px;
          right: 4px;
          background: #c14b42;
          color: white;
          font-size: 10px;
          font-weight: 700;
          min-width: 16px;
          height: 16px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
        }
      `}</style>
    </SidebarProvider>
  );
}
