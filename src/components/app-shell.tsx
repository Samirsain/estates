"use client";

// Staff application shell — design.md §3.1, which set six top-level areas.
// Hiding a nav item is presentation only; server-side permission enforcement
// is the real control (design.md §1).

import React from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Calculator,
  LandPlot,
  Network,
  Search,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotificationBell } from "@/components/notification-bell";
import { signOut } from "@/app/login/actions";
import type { StaffRole } from "@/lib/security/permissions";

/** Task List and Plots & Sales — solid buttons in the top bar of every page,
 *  so any of them is one click from anywhere. The owner took the Plots & Sales
 *  group out of the sidebar once these were there. */
const TOP_LINKS = [
  { label: "Task List", href: "/dashboard", phase: null },
  { label: "Projects", href: "/projects", phase: null },
  { label: "Plot Inventory", href: "/plots", phase: null },
  { label: "Enquiries", href: "/enquiries", phase: null },
  { label: "Bookings", href: "/bookings", phase: null },
  { label: "Buyback / Resale", href: "/acquisitions", phase: null },
] as const;

// Task List is not here: the owner wants it only in the top bar (TOP_LINKS).
// The first four are in the order the owner set on 28 Oct 2026.
const NAV = [
  { label: "Members", icon: Network, href: "/members", phase: null },
  { label: "Customers", icon: Users, href: "/customers", phase: null },
  { label: "Investor Leads", icon: TrendingUp, href: "/potential-investors", phase: null },
  // Land Inquiry spec §23.1 asks for its own navigation entry. It sat under
  // the old Plots & Sales group to avoid widening DESIGN §3.1's top-level list; the owner
  // asked for it at the top level, so here it is — recorded rather than left
  // to look like a slip. Pre-acquisition
  // sourcing is its own stage of the business and reads oddly filed under the
  // Plots it does not have yet.
  { label: "Land Inquiries", icon: LandPlot, href: "/land-inquiries", phase: null },
  // Rewards is not here: the owner took it off the menu on 28 Oct 2026. The
  // /rewards page stays for the Task List and the bell, which link into it.
  // Calculator is not here: the owner wants it only as the top-bar button.
  { label: "Reports", icon: BarChart3, href: "/reports", phase: null },
  { label: "Administration", icon: Settings, href: "/administration", phase: null, admin: true },
] as const;

/**
 * A row of links too long for a phone scrolls sideways under a finger. The
 * scrollbar it drew was a grey bar across the header, so it is hidden; the
 * right edge fades instead, which says there is more to swipe to.
 */
const SWIPE =
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_85%,transparent)]";

const isOn = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

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
  const canAdminister = role === "MD";
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
        // Below md the rail is one row: the logo, then the links beside it.
        className={`chrome-surface z-50 flex items-center border-b border-border/50 md:block md:sticky md:top-0 md:h-screen md:overflow-hidden md:border-b-0 md:border-r md:transition-[width] md:duration-200 ${
          menuOpen ? "md:w-60" : "md:w-14"
        }`}
      >
        <div className="flex shrink-0 items-center gap-3 px-4 py-3 md:py-4">
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

        <nav className={`flex min-w-0 flex-1 gap-1 overflow-x-auto py-2 pr-3 md:flex-col md:overflow-y-auto md:overflow-x-hidden md:px-3 md:pb-3 md:pt-0 md:[mask-image:none] ${SWIPE}`}>
          {NAV.filter((item) => !("admin" in item && item.admin) || canAdminister).map(
            (item) => {
              const active = isOn(pathname, item.href);
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
                </div>
              );
            }
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="chrome-surface sticky top-0 z-40 border-b border-border/50">
          <div className="flex flex-wrap items-center gap-3 px-5 pt-3">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search Plot, Customer ID, Member ID, Booking Number…"
                aria-label="Search records"
              />
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
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
          </div>
          {/* Tabs, not solid buttons: solid pills are what actions look like
              (Deliver, Payment, Prepare Inventory), and a row of them read as
              six more actions. Left-aligned with the search and the page
              heading; the current page is the one underlined. Below md it
              scrolls sideways instead of wrapping, so the sticky bar keeps
              its height. Calculator, after them, is the one solid pill: the
              owner asked for it as a call to action, not another tab.
              DESIGN §1 says not to reintroduce a standalone calculator; the
              owner asked for it anyway. It reads Plot dimensions and stores
              nothing. */}
          <nav aria-label="Task List, Plots & Sales" className={`flex gap-1 overflow-x-auto px-5 pt-1 lg:[mask-image:none] ${SWIPE}`}>
            {TOP_LINKS.map((link) => {
              const active = isOn(pathname, link.href);
              return (
                <a
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? "border-primary font-semibold text-primary"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  {link.label}
                </a>
              );
            })}
            <Button asChild size="sm" className="ml-2 shrink-0 self-center">
              <a href="/calculator" aria-current={isOn(pathname, "/calculator") ? "page" : undefined}>
                <Calculator className="mr-1 h-4 w-4" /> Calculator
              </a>
            </Button>
          </nav>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-5">{children}</main>
      </div>
    </div>
  );
}
