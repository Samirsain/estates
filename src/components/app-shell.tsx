"use client";

// Staff application shell — DESIGN.md §3.1. Exactly six top-level areas.
// Hiding a nav item is presentation only; server-side permission enforcement
// is the real control (DESIGN.md §1).

import React from "react";
import { usePathname } from "next/navigation";
import {
  Calculator,
  LayoutDashboard,
  Building2,
  Users,
  Network,
  BarChart3,
  Settings,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signOut } from "@/app/login/actions";
import type { StaffRole } from "@/lib/security/permissions";

const NAV = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", phase: null },
  {
    label: "Plots & Sales",
    icon: Building2,
    href: "/plots",
    phase: null,
    children: [
      { label: "Projects", href: "/projects", phase: null },
      { label: "Plot Inventory", href: "/plots", phase: null },
      { label: "Enquiries", href: "/enquiries", phase: null },
      { label: "Bookings", href: "/bookings", phase: null },
      { label: "Buyback / Resale", href: "/acquisitions", phase: null },
    ],
  },
  { label: "Customers", icon: Users, href: "/customers", phase: null },
  { label: "Members", icon: Network, href: "/members", phase: null },
  // DESIGN §3.1 lists six top-level areas and §1 says not to reintroduce a
  // standalone calculator. The owner asked for it at the top level anyway, so
  // this is a deliberate seventh — recorded here rather than left to look like
  // a slip. It reads Plot dimensions and stores nothing.
  { label: "Calculator", icon: Calculator, href: "/calculator", phase: null },
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

  // The rail shows icons; opening it is a click, not a hover. A click works the
  // same for a mouse, a finger and a keyboard, and it does not open itself when
  // the pointer merely crosses the edge of the screen.
  const [menuOpen, setMenuOpen] = React.useState(false);

  // Following a link has answered the question the menu was open for.
  React.useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[3.5rem_1fr]">
      {/*
        A rail at rest, the full menu on hover.

        The column stays 3.5rem wide and the aside grows over the page instead
        of pushing it, so opening the menu never reflows what is being read
        underneath. focus-within is there with hover because a menu that only
        answers a mouse is a menu a keyboard cannot reach — it costs one class
        and changes nothing for the pointer.
      */}
      {/* The open menu covers the page rather than pushing it, so there has to
          be a way out that is not "pick something". Clicking the page closes
          it; Escape does too, for anyone not using a pointer. */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 hidden cursor-default md:block"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        onKeyDown={(event) => {
          if (event.key === "Escape") setMenuOpen(false);
        }}
        className={`chrome-surface z-50 border-b border-border/50 md:sticky md:top-0 md:h-screen md:overflow-hidden md:border-b-0 md:border-r md:transition-[width] md:duration-200 ${
          menuOpen ? "md:w-60" : "md:w-14"
        }`}
      >
        <div className="flex items-center gap-3 px-4 py-4">
          <img src="/logo.svg" alt="" className="h-6 w-6 shrink-0" />
          <div
            className={`hidden whitespace-nowrap transition-opacity md:block ${
              menuOpen ? "md:opacity-100" : "md:opacity-0"
            }`}
          >
            <p className="text-sm font-bold tracking-tight gradient-text">
              3% REAL ESTATE CLUB
            </p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-y-auto md:overflow-x-hidden">
          {NAV.filter((item) => !("admin" in item && item.admin) || canAdminister).map(
            (item) => {
              const active =
                Boolean(item.href && (pathname === item.href || pathname.startsWith(item.href + "/"))) ||
                ("children" in item &&
                  Boolean(
                    item.children?.some(
                      (child) =>
                        child.href && (pathname === child.href || pathname.startsWith(child.href + "/"))
                    )
                  ));
              return (
                <div key={item.label} className="min-w-max md:min-w-0">
                  <a
                    href={item.href ?? undefined}
                    aria-disabled={!item.href}
                    aria-current={active ? "page" : undefined}
                    aria-expanded={menuOpen}
                    title={menuOpen ? undefined : item.label}
                    // Closed, the icon is the way in: it opens the menu instead
                    // of navigating, so one click never lands somewhere the
                    // label was not readable.
                    onClick={(event) => {
                      if (!menuOpen) {
                        event.preventDefault();
                        setMenuOpen(true);
                      }
                    }}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                      // Closed, the label is gone, so the icon and its pill
                      // centre on the rail instead of sitting where the text
                      // used to start.
                      menuOpen
                        ? ""
                        : "md:h-10 md:w-10 md:mx-auto md:justify-center md:gap-0 md:px-0"
                    } ${
                      active
                        ? "bg-primary/15 font-semibold text-primary"
                        : item.href
                          ? "text-muted-foreground hover:bg-accent"
                          : "cursor-default text-foreground/70"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span
                      className={`whitespace-nowrap transition-opacity ${
                        menuOpen ? "md:opacity-100" : "md:w-0 md:overflow-hidden md:opacity-0"
                      }`}
                    >
                      {item.label}
                    </span>
                    {item.phase && (
                      <span
                        className={`ml-auto hidden rounded-md border border-border/60 px-1.5 py-0.5 text-[9px] text-muted-foreground ${
                          menuOpen ? "md:inline" : ""
                        }`}
                      >
                        {item.phase}
                      </span>
                    )}
                  </a>
                  {"children" in item && item.children && (
                    // No icon of their own, so nothing to show on the rail —
                    // these appear with the labels or not at all.
                    <ul
                      className={`hidden md:block md:overflow-hidden ${
                        menuOpen ? "md:h-auto" : "md:h-0"
                      }`}
                    >
                      {item.children.map((child) => {
                        const childActive =
                          Boolean(child.href && (pathname === child.href || pathname.startsWith(child.href + "/")));
                        return (
                          <li key={child.label}>
                            <a
                              href={child.href ?? undefined}
                              aria-disabled={!child.href}
                              aria-current={childActive ? "page" : undefined}
                              className={`flex items-center gap-2 rounded-lg py-1.5 pl-9 pr-3 text-xs transition-colors ${
                                childActive
                                  ? "font-semibold text-primary bg-primary/10"
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
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            }
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="chrome-surface sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b border-border/50 px-5 py-3">
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
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-5">{children}</main>
      </div>
    </div>
  );
}
