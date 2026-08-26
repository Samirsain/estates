// Projects and PLC rules — PRD.md §16.1, §16.3.

import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { listProjects } from "@/lib/services/project-service";
import ProjectsClient from "./projects-client";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const actor = await requireStaff("REPORT_VIEW");
  const projects = await listProjects();

  return (
    <ProjectsClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      canSetup={can(actor.role, "PROJECT_SETUP", actor.extraPermissions)}
      rows={projects.map((project) => ({
        id: project.id,
        projectCode: project.projectCode,
        name: project.name,
        type: project.type,
        lifecycle: project.lifecycle,
        developer: project.developer,
        location: project.location,
        locationUrl: project.locationUrl,
        driveUrl: project.driveUrl,
        city: project.city,
        amenities: project.amenities,
        reraNumber: project.reraNumber,
        isExternalResaleGroup: project.isExternalResaleGroup,
        plotCount: project._count.plots,
        plotTypeCounts: project.plotTypeCounts,
        plcVersion: project.plcRuleVersions.find((v) => v.status === "PUBLISHED")?.version ?? null,
        components: (
          project.plcRuleVersions.find((v) => v.status === "PUBLISHED")?.components ?? []
        ).map((component) => ({
          category: component.category,
          threshold: component.threshold?.toString() ?? null,
          percent: component.percent.toFixed(4),
          remark: component.remark,
        })),
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
      }))}
    />
  );
}
