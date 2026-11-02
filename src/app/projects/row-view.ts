// One Project as the Projects list and the Project's own page both read it —
// the shape the Edit, PLC versions and Change status dialogs are built on.

import type { listProjects } from "@/lib/services/project-service";
import { projectSlug } from "@/lib/domain/public-portal";
import { siteLayout } from "@/lib/project-layouts";
import type { ProjectRowView } from "./projects-client";

export function projectRowView(project: Awaited<ReturnType<typeof listProjects>>[number]): ProjectRowView {
  // Owner 2 Nov — Layout opens the Public Portal page when it draws this
  // Project's site plan. Same visibility rule as portalProjects(), so the
  // link never leads to a 404.
  const onPortal = project.publicPortal && !project.isExternalResaleGroup && project.status !== "SETUP_NOT_ACTIVE";
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
      onPortal && siteLayout(project.projectCode) ? `/p/${projectSlug(project.name)}` : project.driveUrl,
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
