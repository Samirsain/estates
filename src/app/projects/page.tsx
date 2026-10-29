// Projects and PLC rules — prd-corrections.md §16.1, §16.3.

import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { listProjects } from "@/lib/services/project-service";
import ProjectsClient from "./projects-client";
import { projectRowView } from "./row-view";

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
      rows={projects.map(projectRowView)}
    />
  );
}
