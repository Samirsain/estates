"use client";

// Staff application shell — design.md §3.1, which set six top-level areas.
// Hiding a nav item is presentation only; server-side permission enforcement
// is the real control (design.md §1).

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { findRecordAction } from "@/lib/find-record";
import {
  BarChart3,
  Calculator,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe,
  LandPlot,
  Network,
  Search,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  // Rewards is not here: the owner took it off the menu on 28 Oct 2026 and
  // removed the /rewards page on 11 Nov 2026. Recovery Reviews are decided on
  // the person's own Member / Customer page.
  // Calculator is not here: the owner wants it only as the top-bar button.
  { label: "Reports", icon: BarChart3, href: "/reports", phase: null },
  { label: "Administration", icon: Settings, href: "/administration", phase: null, admin: true },
] as const;

/**
 * A row of links too long for a phone scrolls sideways under a finger. The
 * scrollbar it drew was a grey bar across the header, so it is hidden; the
 * right edge fades instead, which says there is more to swipe to.
 */
/**
 * A rail label arrives once the rail has made room for it, a beat after the
 * label above; leaving, it goes at once (owner, 24 Nov 2026: smooth menu).
 * Only the 4px slide is spatial, so reduced motion keeps the fade alone.
 */
const railLabel = (open: boolean) =>
  `transition-[opacity,transform] ease-house ${
    // Reduced motion: a closing label goes with the width snap, or its first
    // letters linger at the rail's edge while it fades.
    open
      ? "duration-200 md:opacity-100"
      : "duration-100 md:opacity-0 md:motion-safe:-translate-x-1 md:motion-reduce:transition-none"
  }`;
const railDelay = (open: boolean, step: number) =>
  open ? { transitionDelay: `${40 + step * 12}ms` } : undefined;

const SWIPE =
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_85%,transparent)]";

const isOn = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

/**
 * The Public Project Portal's one link, at the right end of the tab bar under
 * Sign out (owner, 3 Nov 2026; was left of Calculator from 29 Oct): /public lists every Project not turned off on its own page, so this is the
 * address to share. Copy for WhatsApp; Open in a new tab, since it is the
 * public site and not a CRM page.
 */
function PublicPortalMenu() {
  const [origin, setOrigin] = React.useState("");
  const [copy, setCopy] = React.useState<"idle" | "copied" | "failed">("idle");
  React.useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/public`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="ml-auto shrink-0 self-center">
          <Globe className="mr-1 h-4 w-4" /> Public Portal <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          // The menu stays open so the tick can show the copy worked.
          onSelect={(e) => {
            e.preventDefault();
            navigator.clipboard.writeText(link).then(
              () => {
                setCopy("copied");
                setTimeout(() => setCopy("idle"), 1500);
              },
              () => setCopy("failed")
            );
          }}
        >
          {copy === "copied" ? (
            <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-700" />
          ) : (
            <Copy className="mr-1.5 h-3.5 w-3.5" />
          )}
          {copy === "copied" ? "Copied" : copy === "failed" ? "Could not copy — use Open Link" : "Copy Link"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/public" target="_blank" rel="noreferrer">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open Link
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
  const router = useRouter();
  const [searchMiss, setSearchMiss] = React.useState(false);

  // The rail shows icons; opening it is a click, not a hover. A click works the
  // same for a mouse, a finger and a keyboard, and it does not open itself when
  // the pointer merely crosses the edge of the screen.
  const [menuOpen, setMenuOpen] = React.useState(false);

  // Following a link has answered the question the menu was open for.
  React.useEffect(() => setMenuOpen(false), [pathname]);

  // A menu link is followed from the open rail, but the next page's rail is
  // closed: the moving outline went 215px to 40px and hung over the tab bar on
  // the way. Just before the old page is captured, close its rail so the
  // outline slides 40px to 40px inside it (globals.css, [data-nav-swap]).
  // A page restored by Back gets its rail back.
  React.useEffect(() => {
    const root = document.documentElement;
    const swap = (e: Event) => {
      if ((e as Event & { viewTransition?: unknown }).viewTransition) root.dataset.navSwap = "";
    };
    const restore = () => delete root.dataset.navSwap;
    window.addEventListener("pageswap", swap);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pageswap", swap);
      window.removeEventListener("pageshow", restore);
    };
  }, []);

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
        className={`chrome-surface z-50 flex items-center border-b border-border/50 md:block md:sticky md:top-0 md:h-screen md:overflow-hidden md:border-b-0 md:border-r md:transition-[width] md:ease-house md:motion-reduce:transition-none ${
          // Opening takes the longer beat; closing is quicker, as exits are.
          menuOpen ? "md:w-60 md:duration-[280ms]" : "md:w-14 md:duration-200"
        }`}
      >
        <div className="flex shrink-0 items-center gap-3 px-4 py-3 md:py-4">
          <a href="/" aria-label="Home" className="shrink-0">
            <img src="/logo.svg" alt="" className="h-6 w-6" />
          </a>
          <div className={`hidden whitespace-nowrap md:block ${railLabel(menuOpen)}`} style={railDelay(menuOpen, 0)}>
            <p className="text-sm font-bold tracking-tight gradient-text">
              3% REAL ESTATE CLUB
            </p>
          </div>
        </div>

        <nav className={`flex min-w-0 flex-1 gap-1 overflow-x-auto py-2 pr-3 md:flex-col md:overflow-y-auto md:overflow-x-hidden md:px-3 md:pb-3 md:pt-0 md:[mask-image:none] ${SWIPE}`}>
          {NAV.filter((item) => !("admin" in item && item.admin) || canAdminister).map(
            (item, i) => {
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
                      // Only the desktop rail hides labels; a phone shows them, so its tap navigates.
                      if (!menuOpen && window.matchMedia("(min-width: 768px)").matches) {
                        event.preventDefault();
                        setMenuOpen(true);
                      }
                    }}
                    // One geometry open and closed: the row fills the rail and
                    // the rail's own width transition carries it. Closed, the
                    // rail is 32px inside, so min-w-10 keeps a 40px pill with
                    // the icon where it sits open (x 24). Swapping to centred
                    // classes made icons lurch 88px as the rail closed, and
                    // 36px rows open vs 40px closed made them jump vertically.
                    // A press gives, as a Button does.
                    className={`relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-[color,background-color,transform] duration-150 ease-house motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:h-10 md:w-full md:min-w-10 ${
                      active
                        ? "font-semibold text-primary"
                        : item.href
                          ? "text-muted-foreground hover:bg-accent"
                          : "cursor-default text-foreground/70"
                    }`}
                  >
                    {/* The chosen item's outline (owner, 24 Nov 2026). One
                        view-transition name, so opening another page moves
                        this pill to its new row instead of blinking — see
                        @view-transition in globals.css. */}
                    {active && (
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-xl border border-primary/50 bg-primary/10"
                        style={{ viewTransitionName: "nav-active" }}
                      />
                    )}
                    <item.icon className="relative h-4 w-4 shrink-0" />
                    <span
                      // No width collapse: the rail's overflow clips a closed
                      // label, so its fade-out paints instead of vanishing.
                      className={`relative whitespace-nowrap ${railLabel(menuOpen)}`}
                      style={railDelay(menuOpen, i + 1)}
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
            <form
              role="search"
              className="relative min-w-[12rem] flex-1"
              onSubmit={async (e) => {
                e.preventDefault();
                const q = String(new FormData(e.currentTarget).get("q") ?? "");
                const href = await findRecordAction(q).catch(() => null);
                setSearchMiss(!href);
                if (href) router.push(href);
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                name="q"
                className="pl-9"
                placeholder="Search Plot, Customer ID, Member ID, Booking Number…"
                aria-label="Search records"
                aria-invalid={searchMiss || undefined}
                aria-describedby={searchMiss ? "search-miss" : undefined}
                onChange={() => setSearchMiss(false)}
              />
              {searchMiss && (
                <p id="search-miss" role="status" className="mt-1 text-xs text-red-700">
                  No record has exactly that ID or number.
                </p>
              )}
            </form>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <a href="/account" className="text-right hover:opacity-80" title="My Account">
                <p className="text-xs font-semibold leading-tight">{actorName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {/* A User ID that is the role itself (MD) says it once. */}
                  {staffAccountId === role ? role : `${staffAccountId} · ${role}`}
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
            <PublicPortalMenu />
          </nav>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-5">{children}</main>
      </div>
    </div>
  );
}
