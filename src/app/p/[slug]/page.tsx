// Public Project Portal — /p/<name> (owner, 29 Oct 2026).
//
// The one page anyone may open without signing in, from a link staff share on
// WhatsApp. It reads the live Project and Plots on every request — no copy of
// the inventory is kept, so a Plot put on Hold shows Hold the next time the
// link is opened — and it reads nothing but what is safe to show: the
// Project's identity and, per Plot, its number, type, size, facing and one of
// three statuses. No Booking, Hold, Enquiry or Person is queried, so no buyer
// can leak through it.
//
// A Project is shown unless it is turned off on its own page, and once it has
// been released; otherwise the link is a plain Not Found, the same as a wrong one.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { formatPercent, formatPlotSize, formatQuantity } from "@/lib/tasks";
import { locationChargeLabel, plcDisplayComponents } from "@/lib/domain/inventory";
import { projectSlug, publicPlotStatus } from "@/lib/domain/public-portal";
import { plcRules } from "@/lib/services/plc-service";
import { siteLayout } from "@/lib/project-layouts";
import type { ProjectSheet } from "@/lib/pdf/project-sheet";
import { Card } from "@/components/ui/card";
import {
  ProjectIdentity,
  STATUS_LABEL,
  TYPE_LABEL,
  amenityList,
  projectWhere,
} from "@/app/projects/project-identity";
import DownloadPdfButton from "@/app/projects/download-pdf-button";
import PublicPortalClient, { type PublicPlot } from "./portal-client";
import LiveRefresh from "../live-refresh";

export const dynamic = "force-dynamic";

const PLOT_TYPE_LABEL: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INFORMAL_SECTOR: "Informal Sector",
};

// ponytail: reads every public Project to match the name; a stored slug column if Projects run to hundreds.
async function findProject(slug: string) {
  const projects = await db.project.findMany({
    where: { publicPortal: true, isExternalResaleGroup: false, status: { not: "SETUP_NOT_ACTIVE" } },
    select: {
      id: true,
      name: true,
      projectCode: true,
      type: true,
      status: true,
      developer: true,
      reraNumber: true,
      location: true,
      city: true,
      amenities: true,
      driveUrl: true,
      locationUrl: true,
      renderUrl: true,
      isExternalResaleGroup: true,
    },
  });
  return projects.find((p) => projectSlug(p.name) === slug) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const project = await findProject((await params).slug);
  return { title: project ? `${project.name} — Plot Availability` : "Not found" };
}

/** "NORTH-SOUTH TWO SIDE OPEN" → "North-South Two Side Open"; no open side says nothing. */
function facingLines(lines: string[]): string[] {
  return lines
    .filter((line) => line !== "NO OPEN SIDE")
    .map((line) => line.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()));
}

export default async function PublicProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const project = await findProject((await params).slug);
  if (!project) notFound();

  const [plots, published] = await Promise.all([
    db.plot.findMany({
      where: { projectId: project.id },
      select: {
        id: true,
        plotNumber: true,
        plotType: true,
        status: true,
        restriction: true,
        widthFt: true,
        lengthFt: true,
        areaSqFt: true,
        areaSqYd: true,
        areaSqM: true,
        boundaries: { select: { side: true, kind: true } },
      },
    }),
    db.plcRuleVersion.findFirst({
      where: { projectId: project.id, status: "PUBLISHED" },
      include: { components: { orderBy: [{ category: "asc" }, { threshold: "desc" }] } },
    }),
  ]);

  const shown: PublicPlot[] = plots
    .flatMap((plot) => {
      const status = publicPlotStatus(plot.status, plot.restriction);
      if (!status) return [];
      return [
        {
          id: plot.id,
          number: plot.plotNumber,
          type: PLOT_TYPE_LABEL[plot.plotType] ?? plot.plotType,
          status,
          size: formatPlotSize(plot.widthFt?.toString(), plot.lengthFt?.toString()),
          area: [
            `${formatQuantity(plot.areaSqFt.toString())} sq ft`,
            `${formatQuantity(plot.areaSqYd.toDecimalPlaces(2).toString())} sq yd`,
            `${formatQuantity(plot.areaSqM.toDecimalPlaces(2).toString())} sq m`,
          ],
          facing: facingLines(locationChargeLabel(plot.boundaries)),
        },
      ];
    })
    // P-2 before P-10: plot numbers are read as people count them.
    .sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true }));

  // The sheet Download PDF writes — the same one More info hands out, with the
  // counts of the Plots shown here rather than of every Plot on the books.
  const count = (type: string) => shown.filter((p) => p.type === type).length;
  const sheet: ProjectSheet = {
    name: project.name,
    projectCode: project.projectCode,
    type: TYPE_LABEL[project.type] ?? project.type,
    status: STATUS_LABEL[project.status] ?? project.status,
    developer: project.developer,
    reraNumber: project.reraNumber,
    where: projectWhere(project),
    locationUrl: project.locationUrl,
    driveUrl: project.driveUrl,
    renderUrl: project.renderUrl,
    amenities: amenityList(project.amenities),
    inventory: [
      { label: "Total Plots", value: String(shown.length) },
      { label: "Residential Plots", value: String(count("Residential")) },
      { label: "Commercial Plots", value: String(count("Commercial")) },
      ...(count("Informal Sector") > 0
        ? [{ label: "Informal Sector Plots", value: String(count("Informal Sector")) }]
        : []),
    ],
    plcRates: published
      ? plcDisplayComponents(plcRules(published.components)).map((c) => ({
          label: c.label,
          value: formatPercent(c.percent),
        }))
      : null,
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:py-8">
      <LiveRefresh />
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/p"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Projects
        </Link>
        <DownloadPdfButton sheet={sheet} />
      </div>
      <Card className="p-4">
        <ProjectIdentity project={project} />
      </Card>
      <PublicPortalClient
        plots={shown}
        hasLayout={Boolean(project.driveUrl)}
        layout={siteLayout(project.projectCode)}
      />
    </main>
  );
}
