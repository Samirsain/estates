"use client";

// Staff application shell — DESIGN.md §3.1. Exactly six top-level areas.
// Hiding a nav item is presentation only; server-side permission enforcement
// is the real control (DESIGN.md §1).

import React from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Users,
  Network,
  BarChart3,
  Settings,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { signOut } from "@/app/login/actions";
import type { StaffRole } from "@/lib/security/permissions";

const NAV = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", phase: null },
  {
    label: "Plots & Sales",
    icon: Building2,
    href: null,
    phase: null,
    children: [
      { label: "Projects", href: "/projects", phase: null },
      { label: "Plot Inventory", href: "/plots", phase: null },
      { label: "Enquiries", href: "/enquiries", phase: null },
      { label: "Bookings", href: "/bookings", phase: null },
      { label: "Acquisitions", href: "/acquisitions", phase: null },
    ],
  },
  { label: "Customers", icon: Users, href: "/customers", phase: null },
  { label: "Members", icon: Network, href: "/members", phase: null },
  { label: "Reports", icon: BarChart3, href: "/reports", phase: null },
  { label: "Administration", icon: Settings, href: "/administration", phase: null, admin: true },
] as const;

export function AppShell({
  role,
  actorName,
  staffAccountId,
  children,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  children: React.ReactNode;
}) {
  const canAdminister = role === "MD" || role === "ADMIN";
  const pathname = usePathname();

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="glass-panel border-b md:border-b-0 md:border-r border-border/50 md:min-h-screen">
        <div className="flex items-center gap-3 px-5 py-4">
          <img src="/logo.svg" alt="" className="h-9 w-9" />
          <div>
            <p className="text-sm font-bold tracking-tight gradient-text">3% Club CRM</p>
            <p className="text-[10px] text-muted-foreground">v3.1 baseline</p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {NAV.filter((item) => !("admin" in item && item.admin) || canAdminister).map(
            (item) => {
              const active = item.href === pathname;
              return (
                <div key={item.label} className="min-w-max md:min-w-0">
                  <a
                    href={item.href ?? undefined}
                    aria-disabled={!item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-primary/15 font-semibold text-primary"
                        : item.href
                          ? "text-muted-foreground hover:bg-accent"
                          : "cursor-default text-foreground/70"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                    {item.phase && (
                      <span className="ml-auto hidden rounded-md border border-border/60 px-1.5 py-0.5 text-[9px] text-muted-foreground md:inline">
                        {item.phase}
                      </span>
                    )}
                  </a>
                  {"children" in item && item.children && (
                    <ul className="hidden md:block">
                      {item.children.map((child) => (
                        <li key={child.label}>
                          <a
                            href={child.href ?? undefined}
                            aria-disabled={!child.href}
                            aria-current={child.href === pathname ? "page" : undefined}
                            className={`flex items-center gap-2 rounded-lg py-1 pl-9 pr-3 text-xs ${
                              child.href === pathname
                                ? "font-semibold text-primary"
                                : child.href
                                  ? "text-muted-foreground hover:bg-accent"
                                  : "cursor-default text-muted-foreground"
                            }`}
                          >
                            <span>{child.label}</span>
                            {child.phase && (
                              <span className="ml-auto rounded-md border border-border/60 px-1.5 py-0.5 text-[9px]">
                                {child.phase}
                              </span>
                            )}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            }
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="glass-panel sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b border-border/50 px-5 py-3">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search Plot, Customer ID, Member ID, Booking Number…"
              aria-label="Search records"
            />
          </div>
          <div className="flex items-center gap-3">
            <a href="/account" className="text-right hover:opacity-80" title="My Account">
              <p className="text-xs font-semibold leading-tight">{actorName}</p>
              <p className="text-[10px] text-muted-foreground">
                {staffAccountId} · {role}
              </p>
            </a>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-xl border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
