"use client";

// Every Project in one strip across the top of a Project's page: switching
// Project is one tap, and each carries its availability bar so the visitor
// sees where Plots are still free before opening it. Sticks to the top while
// the plan scrolls under it.

import React from "react";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import type { PortalProject } from "./portal-projects";
import { AvailabilityBar, noPlotsLine, plotTotal } from "./availability";

export default function ProjectStrip({ projects, active }: { projects: PortalProject[]; active: string }) {
  const row = React.useRef<HTMLDivElement>(null);
  const current = React.useRef<HTMLAnchorElement>(null);

  // The open Project is brought into the strip's middle, never the page scrolled.
  // No fade on the edge (owner, 31 Oct 2026): a chip cut off there says there is more.
  React.useEffect(() => {
    const strip = row.current;
    const chip = current.current;
    if (strip && chip) strip.scrollLeft = chip.offsetLeft - (strip.clientWidth - chip.clientWidth) / 2;
  }, [active]);

  return (
    <nav aria-label="Projects" className="sticky top-0 z-30 border-b border-border/70 bg-background">
      <div
        ref={row}
        className="relative mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Link
          href="/p"
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          All
        </Link>
        {projects.map((project) => {
          const on = project.slug === active;
          return (
            <Link
              key={project.id}
              ref={on ? current : undefined}
              href={`/p/${project.slug}`}
              aria-current={on ? "page" : undefined}
              className={`flex w-40 shrink-0 flex-col justify-center gap-1.5 rounded-xl border px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:bg-secondary"
              }`}
            >
              <span className="truncate text-xs font-semibold">{project.name}</span>
              {plotTotal(project.tally) === 0 ? (
                <span className={`text-[10px] leading-none ${on ? "text-background/80" : "text-muted-foreground"}`}>
                  {noPlotsLine(project.status)}
                </span>
              ) : (
                <AvailabilityBar tally={project.tally} className="h-1" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
