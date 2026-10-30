// Public Project Portal, all Projects — /p (owner, 29 Oct 2026).
//
// The link staff share once, from the top bar: every Project not turned off on
// its own page, each
// opening to its own Plots at /p/<name>. Like that page it needs no sign-in,
// reads live data and nothing private — the Project's public identity and how
// many of its Plots are Available, on Hold or Sold / Booked. The counts are
// grouped in the database, so a Project with hundreds of Plots costs a few rows.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { projectSlug, publicPlotStatus, PUBLIC_STATUS_LABEL, type PublicPlotStatus } from "@/lib/domain/public-portal";
import { projectWhere } from "@/app/projects/project-identity";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import LiveRefresh from "./live-refresh";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Projects — Plot Availability" };

const TYPE_LABEL: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  AGRICULTURAL: "Agricultural",
  MIXED: "Mixed",
};

/** The portal's three colours, as on each Project's page. */
const DOT: Record<PublicPlotStatus, string> = {
  AVAILABLE: "bg-emerald-500",
  HOLD: "bg-amber-400",
  SOLD: "bg-red-500",
};

export default async function PublicProjectsPage() {
  const projects = await db.project.findMany({
    where: { publicPortal: true, isExternalResaleGroup: false, status: { not: "SETUP_NOT_ACTIVE" } },
    select: { id: true, name: true, projectCode: true, type: true, developer: true, location: true, city: true },
    orderBy: { name: "asc" },
  });
  const grouped = await db.plot.groupBy({
    by: ["projectId", "status", "restriction"],
    where: { projectId: { in: projects.map((p) => p.id) } },
    _count: { _all: true },
  });

  const counts = new Map<string, Record<PublicPlotStatus, number>>();
  for (const row of grouped) {
    const status = publicPlotStatus(row.status, row.restriction);
    if (!status) continue;
    const tally = counts.get(row.projectId) ?? { AVAILABLE: 0, HOLD: 0, SOLD: 0 };
    tally[status] += row._count._all;
    counts.set(row.projectId, tally);
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:py-8">
      <LiveRefresh />
      <header className="flex items-center gap-3">
        <img src="/logo.svg" alt="" className="h-10 w-10" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">Projects</h1>
          <p className="text-xs font-semibold text-muted-foreground">Open a Project to see its Plots and what is available.</p>
        </div>
      </header>

      {projects.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 px-3 py-10 text-center text-xs text-muted-foreground">
          No Projects to show yet.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const tally = counts.get(project.id) ?? { AVAILABLE: 0, HOLD: 0, SOLD: 0 };
            const where = projectWhere(project);
            return (
              <Link key={project.id} href={`/p/${projectSlug(project.name)}`} className="group block">
                <Card className="flex h-full flex-col gap-3 p-4 transition-colors group-hover:border-foreground/30">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold leading-tight tracking-tight text-foreground group-hover:text-primary">
                        {project.name}
                      </h2>
                      {project.developer && (
                        <p className="mt-0.5 text-xs font-semibold text-muted-foreground">By {project.developer}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {TYPE_LABEL[project.type] ?? project.type}
                    </Badge>
                  </div>
                  {where && (
                    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                      {where}
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-xs">
                    {(["AVAILABLE", "HOLD", "SOLD"] as const).map((status) => (
                      <span key={status} className="flex items-center gap-1.5 text-muted-foreground">
                        <span className={`h-2.5 w-2.5 rounded-full ${DOT[status]}`} />
                        <span className="font-bold tabular-nums text-foreground">{tally[status]}</span>
                        {PUBLIC_STATUS_LABEL[status]}
                      </span>
                    ))}
                    <span className="ml-auto flex items-center gap-1 font-semibold text-primary">
                      View Plots <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
