// Public Project Portal, all Projects — /p (owner, 29 Oct 2026).
//
// The link staff share once, from the top bar: every Project not turned off on
// its own page, each opening to its own Plots at /p/<name>. Like that page it
// needs no sign-in, reads live data and nothing private — the Project's public
// identity and how many of its Plots are Available, on Hold or Sold / Booked.
// No logo and no page heading above the list (owner, 31 Oct 2026).

import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { PUBLIC_STATUS_LABEL } from "@/lib/domain/public-portal";
import { TYPE_LABEL } from "@/app/projects/project-identity";
import LiveRefresh from "./live-refresh";
import { portalProjects } from "./portal-projects";
import { AvailabilityBar, STATUSES, TONE, noPlotsLine, plotTotal } from "./availability";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Projects — Plot Availability" };

export default async function PublicProjectsPage() {
  const projects = await portalProjects();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5 md:py-10">
      <LiveRefresh />
      <h1 className="sr-only">Projects</h1>

      {projects.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          No Projects to show yet.
        </p>
      ) : (
        <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70 bg-card">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/p/${project.slug}`}
                className="group flex items-center gap-3 px-4 py-4 transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none sm:px-5 sm:py-5"
              >
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="truncate text-base font-bold tracking-tight text-foreground sm:text-lg">
                        {project.name}
                      </h2>
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">
                        {TYPE_LABEL[project.type] ?? project.type}
                      </span>
                    </div>
                    {(project.developer || project.where) && (
                      <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                        {project.where && <MapPin className="mt-px h-3 w-3 shrink-0" />}
                        <span className="line-clamp-2">
                          {[project.where, project.developer && `By ${project.developer}`].filter(Boolean).join(" · ")}
                        </span>
                      </p>
                    )}
                  </div>
                  {plotTotal(project.tally) === 0 ? (
                    <p className="text-xs font-medium text-muted-foreground">{noPlotsLine(project.status)}</p>
                  ) : (
                    <>
                      <AvailabilityBar tally={project.tally} className="h-2" />
                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground">
                        {STATUSES.map((status) => (
                          <span key={status} className="flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${TONE[status].dot}`} />
                            <span className="font-bold tabular-nums">{project.tally[status]}</span>
                            {PUBLIC_STATUS_LABEL[status]}
                          </span>
                        ))}
                      </p>
                    </>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
