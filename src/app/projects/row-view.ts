// One Project as the Projects list and the Project's own page both read it —
// the shape the Edit, PLC versions and Change status dialogs are built on.

import type { listProjects } from "@/lib/services/project-service";
import { projectSlugs } from "@/lib/domain/public-portal";
import { siteLayout } from "@/lib/project-layouts";
import { getProjectLayoutDocument } from "@/lib/project-documents";
import type { ProjectRowView } from "./projects-client";

type ProjectRow = Awaited<ReturnType<typeof listProjects>>[number];

/**
 * Owner 2 Nov — Layout opens the Public Portal page when it draws a Project's
 * site plan. Same visibility rule and same links as portalProjects(), so the
 * link never leads to a 404, even when two Projects share a name.
 */
export function portalLinks(projects: readonly ProjectRow[]) {
  return projectSlugs(
    projects.filter((p) => p.publicPortal && !p.isExternalResaleGroup && p.status !== "SETUP_NOT_ACTIVE")
  );
}

export function projectRowView(project: ProjectRow, links: Map<string, string>): ProjectRowView {
  const slug = links.get(project.id);
  return {
    id: project.id,
    projectCode: project.projectCode,
    name: project.name,
    type: project.type,
    status: project.status,
    developer: project.developer,
    location: project.location,
    locationUrl: project.locationUrl,
    driveUrl: project.driveUrl,
    layoutUrl:
      getProjectLayoutDocument(project.projectCode)?.url ??
      (slug && siteLayout(project.projectCode) ? `/public/${slug}` : project.driveUrl),
    renderUrl: project.renderUrl,
    city: project.city,
    amenities: project.amenities,
    reraNumber: project.reraNumber,
    isExternalResaleGroup: project.isExternalResaleGroup,
    publicPortal: project.publicPortal,
    plotCount: project._count.plots,
    plotTypeCounts: project.plotTypeCounts,
    roadWidths: project.roadWidths,
    components: (project.plcRuleVersions.find((v) => v.status === "PUBLISHED")?.components ?? []).map(
      (component) => ({
        category: component.category,
        threshold: component.threshold?.toString() ?? null,
        percent: component.percent.toFixed(4),
        remark: component.remark,
      })
    ),
    // PLC spec §15.1 — published, draft and superseded together.
    plcVersions: project.plcRuleVersions.map((version) => ({
      id: version.id,
      version: version.version,
      status: version.status,
      reason: version.reason,
      createdBy: version.createdBy,
      createdAt: version.createdAt.toISOString(),
      publishedBy: version.publishedBy,
      effectiveFrom: version.effectiveFrom?.toISOString() ?? null,
      effectiveTo: version.effectiveTo?.toISOString() ?? null,
      components: version.components.map((component) => ({
        category: component.category,
        threshold: component.threshold?.toString() ?? null,
        percent: component.percent.toFixed(4),
        remark: component.remark,
      })),
    })),
  };
}
