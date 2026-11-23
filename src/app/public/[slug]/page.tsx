// Public Project Portal — /public/<name> (owner, 29 Oct 2026).
//
// The one page anyone may open without signing in, from a link staff share on
// WhatsApp. It reads the live Project and Plots on every request — no copy of
// the inventory is kept, so a Plot put on Hold shows Hold the next time the
// page refreshes itself — and it reads nothing but what is safe to show: the
// Project's identity and, per Plot, its number, type, size, facing and one of
// three statuses. No Booking, Hold, Enquiry or Person is queried, so no buyer
// can leak through it.
//
// Laid out for a phone (owner, 31 Oct 2026): the strip of every Project on
// top, then this Project's name, its counts and its Plots; what the Project is
// about folds away below them, so nobody scrolls past it to reach a Plot.
//
// A Project is shown unless it is turned off on its own page, and once it has
// been released; otherwise the link is a plain Not Found, the same as a wrong one.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Box, ChevronDown, Layers, Map as MapIcon, MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { formatPlotSize, formatQuantity } from "@/lib/tasks";
import { isOpenSide, locationChargeLabel } from "@/lib/domain/inventory";
import { plotSides } from "@/components/plot-shape";
import { publicPlotStatus } from "@/lib/domain/public-portal";
import { siteLayout } from "@/lib/project-layouts";
import { getProjectLayoutDocument } from "@/lib/project-documents";
import { isWebAddress, sentenceCase } from "@/lib/pdf/project-sheet";
import { Button } from "@/components/ui/button";
import { TYPE_LABEL, amenityList, projectWhere } from "@/app/projects/project-identity";
import PublicPortalClient, { type PublicPlot } from "./portal-client";
import LiveRefresh from "../live-refresh";
import ProjectStrip from "../project-strip";
import { portalProjects, shared } from "../portal-projects";
import { ProjectHeading, noPlotsLine } from "../availability";

export const dynamic = "force-dynamic";

const PLOT_TYPE_LABEL: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INFORMAL_SECTOR: "Informal Sector",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const project = (await portalProjects()).find((p) => p.slug === slug);
  return { title: project ? `${project.name} — Plot Availability` : "Not found" };
}

/** "NORTH-SOUTH TWO SIDE OPEN" → "North-South Two Side Open"; no open side says nothing. */
function facingLines(lines: string[]): string[] {
  return lines
    .filter((line) => line !== "NO OPEN SIDE")
    .map((line) => line.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()));
}

export default async function PublicProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const projects = await portalProjects();
  const entry = projects.find((p) => p.slug === slug);
  if (!entry) notFound();

  const [project, plots] = await shared(`project:${entry.id}`, () => Promise.all([
    db.project.findUniqueOrThrow({
      where: { id: entry.id },
      select: {
        name: true,
        projectCode: true,
        type: true,
        status: true,
        location: true,
        city: true,
        amenities: true,
        driveUrl: true,
        locationUrl: true,
        renderUrl: true,
      },
    }),
    db.plot.findMany({
      where: { projectId: entry.id },
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
        boundaries: { select: { side: true, kind: true, roadWidthFt: true, reference: true } },
      },
    }),
  ]));

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
            `${formatQuantity(plot.areaSqFt.toDecimalPlaces(2).toString())} sq ft`,
            `${formatQuantity(plot.areaSqYd.toDecimalPlaces(2).toString())} sq yd`,
            `${formatQuantity(plot.areaSqM.toDecimalPlaces(2).toString())} sq m`,
          ],
          facing: facingLines(locationChargeLabel(plot.boundaries)),
          // The drawing the CRM Plot page shows (owner, 23 Nov 2026); none for an irregular Plot.
          shape:
            plot.widthFt && plot.lengthFt
              ? {
                  widthFt: plot.widthFt.toString(),
                  lengthFt: plot.lengthFt.toString(),
                  sides: plotSides(plot.boundaries.map((b) => ({ ...b, open: isOpenSide(b.kind) }))),
                }
              : null,
        },
      ];
    })
    // P-2 before P-10: plot numbers are read as people count them.
    .sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true }));

  const layoutDocument = getProjectLayoutDocument(project.projectCode);
  // The picture, not the PDF: it opens on every phone (owner, 23 Nov 2026).
  const layoutTarget = layoutDocument?.imageUrl ?? project.driveUrl;

  const where = projectWhere(project);
  const amenities = amenityList(project.amenities);
  const links = [
    { label: "Layout", url: layoutTarget, Icon: Layers },
    { label: "Location", url: project.locationUrl, Icon: MapIcon },
    { label: "3D Visuals", url: project.renderUrl, Icon: Box },
  ].filter((link): link is typeof link & { url: string } => isWebAddress(link.url));

  return (
    <>
      <LiveRefresh />
      <ProjectStrip projects={projects} active={slug} />

      <main className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-10 pt-4 md:pt-6">
        {/* Name, city, type — nothing more (owner, 21 Nov 2026). The rest folds below the Plots. */}
        <header>
          <ProjectHeading as="h1" name={project.name} city={project.city} type={TYPE_LABEL[project.type] ?? project.type} />
        </header>

        <PublicPortalClient
          projectName={project.name}
          plots={shown}
          layout={siteLayout(project.projectCode)}
          layoutUrl={links.find((l) => l.label === "Layout")?.url ?? null}
          layoutDocument={layoutDocument}
          noPlots={noPlotsLine(project.status)}
        />

        {/* About this project: closed by default, one tap away. Nothing to say, no card. */}
        {(where || amenities.length > 0 || links.length > 0) && (
        <details className="group rounded-2xl border border-border/70 bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-sm font-semibold text-foreground">About this project</span>
              <span className="block text-xs text-muted-foreground">
                {[where && "Location", amenities.length > 0 && "Amenities", links.length > 0 && "Layout"]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="space-y-4 border-t border-border/60 px-4 py-4">
            {where && (
              <p className="flex items-start gap-1.5 text-sm text-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {where}
              </p>
            )}
            {amenities.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground">Amenities</h2>
                <ul className="grid gap-x-8 gap-y-1.5 text-sm text-foreground sm:grid-cols-2">
                  {amenities.map((a) => (
                    <li key={a} className="flex items-start gap-2">
                      <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-primary/70" />
                      {sentenceCase(a)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* noreferrer carries noopener: the opened tab cannot reach back through window.opener. */}
            {links.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
                {links.map(({ label, url, Icon }) => (
                  <Button key={label} size="xs" variant="outline" className="h-9 rounded-full px-3.5 text-xs" asChild>
                    <a href={url} target="_blank" rel="noreferrer">
                      <Icon className="mr-1.5 h-3.5 w-3.5" /> {label}
                    </a>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </details>
        )}
      </main>
    </>
  );
}
