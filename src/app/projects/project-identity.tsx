// A Project's identity, as its own page heads it and as the Projects list's
// More info shows it (owner, 29 Oct 2026), so a Project reads one way wherever
// it is opened. lib/pdf/project-sheet.ts draws the same block on paper. No hooks and no "use client": the server page renders it, and
// the list's dialog imports it into the client.

import { Box, Layers, Map as MapIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isWebAddress, sentenceCase } from "@/lib/pdf/project-sheet";
import type { ProjectRowView } from "./projects-client";

export const STATUS_LABEL: Record<string, string> = {
  // Screen wording only. The enum value stays SETUP_NOT_ACTIVE — DEVIATIONS D-03.
  SETUP_NOT_ACTIVE: "Unreleased",
  ACTIVE: "Active",
  SOLD_OUT: "Sold Out",
  COMPLETED: "Completed",
};

export const TYPE_LABEL: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  AGRICULTURAL: "Agricultural",
  MIXED: "Mixed",
};

/**
 * Amenities are stored one per line, without the bullet. The bullet belongs to
 * the field you type in and to the block you read; storing it would put a
 * decoration inside the data.
 */
export function amenityList(amenities: string | null): string[] {
  return (amenities ?? "")
    .split("\n")
    .map((a) => a.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * The address line. The city is added only when the address does not already
 * name it — "…Jaipur, Rajasthan 302029, Jaipur" said it twice.
 */
export function projectWhere(project: Pick<ProjectRowView, "location" | "city">): string | null {
  return project.location && project.city && !project.location.toLowerCase().includes(project.city.toLowerCase())
    ? `${project.location}, ${project.city}`
    : (project.location ?? project.city);
}

type IdentityFields = Pick<
  ProjectRowView,
  | "name"
  | "status"
  | "projectCode"
  | "type"
  | "isExternalResaleGroup"
  | "developer"
  | "reraNumber"
  | "location"
  | "city"
  | "amenities"
  | "driveUrl"
  | "locationUrl"
  | "renderUrl"
>;

export function ProjectIdentity({
  project,
  heading: Heading = "h1",
  sections = false,
}: {
  project: IdentityFields;
  /** h1 on the Project's page, h2 inside the list's dialog. */
  heading?: "h1" | "h2";
  /** Head the amenities and links as the downloaded sheet does: More info only. */
  sections?: boolean;
}) {
  const amenities = amenityList(project.amenities);
  const links = [
    { label: "Layout", url: project.driveUrl, Icon: Layers },
    { label: "Location", url: project.locationUrl, Icon: MapIcon },
    { label: "3D Visuals", url: project.renderUrl, Icon: Box },
  ].filter((link): link is typeof link & { url: string } => isWebAddress(link.url));
  const where = projectWhere(project);
  const type = project.isExternalResaleGroup
    ? "External Resale Property Group"
    : (TYPE_LABEL[project.type] ?? project.type);

  return (
    <div className="space-y-4">
      {/* The name, then the type and "By" the developer centred, and RERA
          against the right edge, all on the name's own line; the address goes
          under it as plain text. Every fact here is bold; only the amenities
          stay regular. On a phone the line wraps and RERA keeps to the right. */}
      <div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Heading className="text-xl font-bold tracking-tight">{project.name}</Heading>
            <Badge variant={project.status === "ACTIVE" ? "success" : "outline"}>
              {STATUS_LABEL[project.status] ?? project.status}
            </Badge>
            <span className="text-xs font-semibold text-muted-foreground">{project.projectCode}</span>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2 sm:justify-center">
            <Badge variant="outline">{type}</Badge>
            {project.developer && (
              <p className="text-xs font-semibold text-foreground">
                <span className="text-muted-foreground">By</span> {project.developer}
              </p>
            )}
          </div>
          <p className="ml-auto text-xs font-semibold">
            <span className="text-muted-foreground">RERA</span>{" "}
            <span className="tabular-nums text-foreground">{project.reraNumber ?? "—"}</span>
          </p>
        </div>
        {where && <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{where}</p>}
      </div>

      {/* Amenities under a hairline, in even columns, after a quiet
          "Amenities" label (owner's card prompt, 30 Oct 2026) — a label, not a
          heading; in More info headed as the downloaded sheet heads it. */}
      {amenities.length > 0 && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          {sections ? (
            <SheetHeading>Project Amenities</SheetHeading>
          ) : (
            <p className="text-xs text-muted-foreground">Amenities</p>
          )}
          <ul className="grid gap-x-8 gap-y-1.5 text-xs text-foreground sm:grid-cols-2 lg:grid-cols-3">
            {amenities.map((a) => (
              <li key={a} className="flex items-start gap-2">
                <span className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                {sentenceCase(a)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The same three links as the Project's card on the list, in the same
          order and with the same names, each only when it is a web address.
          noreferrer carries noopener: the opened tab cannot reach back through
          window.opener and navigate this one. */}
      {links.length > 0 && (
        <div className="space-y-2">
          {sections && <SheetHeading>Project Resources</SheetHeading>}
          <div className="flex flex-wrap items-center gap-2">
            {links.map(({ label, url, Icon }) => (
              <Button key={label} size="xs" variant="outline" className="h-7 px-2.5 text-[11px]" asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  <Icon className="mr-1 h-3 w-3" /> {label}
                </a>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A part's name after a small terracotta bar, as the downloaded sheet draws it. */
export function SheetHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <span className="h-4 w-1 rounded-sm bg-primary" />
      {children}
    </h3>
  );
}
