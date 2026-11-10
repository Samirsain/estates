// Every Project the Public Portal shows, with its Plots counted by the three
// public statuses. The list page lists them and every Project page carries
// them in its strip, so both read the same rows. cache() lets a page and its
// metadata share one read per request.

import { cache } from "react";
import { db } from "@/lib/db";
import { projectSlug, publicPlotStatus, type PublicPlotStatus } from "@/lib/domain/public-portal";
import { projectWhere } from "@/app/projects/project-identity";

export type Tally = Record<PublicPlotStatus, number>;

export type PortalProject = {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  developer: string | null;
  where: string | null;
  tally: Tally;
};

/**
 * One read serves every visitor for a moment. Each open tab polls every 2 s
 * (live-refresh), and each poll ran ~5 queries on the CRM's own small
 * connection pool: a shared link opened by 50 people starved staff commands.
 * ponytail: in-process; per node if the app ever runs on more than one.
 */
const SHARED_MS = 2_000;
const memo = new Map<string, { at: number; value: Promise<unknown> }>();
export function shared<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < SHARED_MS) return hit.value as Promise<T>;
  const value = load();
  memo.set(key, { at: Date.now(), value });
  value.catch(() => memo.delete(key));
  return value;
}

export const portalProjects = cache(() => shared("projects", loadPortalProjects));

async function loadPortalProjects(): Promise<PortalProject[]> {
  const projects = await db.project.findMany({
    where: { publicPortal: true, isExternalResaleGroup: false, status: { not: "SETUP_NOT_ACTIVE" } },
    select: { id: true, name: true, projectCode: true, type: true, status: true, developer: true, location: true, city: true },
    orderBy: { name: "asc" },
  });
  // Grouped in the database, so a Project with hundreds of Plots costs a few rows.
  const grouped = await db.plot.groupBy({
    by: ["projectId", "status", "restriction"],
    where: { projectId: { in: projects.map((p) => p.id) } },
    _count: { _all: true },
  });

  const tallies = new Map<string, Tally>();
  for (const row of grouped) {
    const status = publicPlotStatus(row.status, row.restriction);
    if (!status) continue;
    const tally = tallies.get(row.projectId) ?? { AVAILABLE: 0, HOLD: 0, SOLD: 0 };
    tally[status] += row._count._all;
    tallies.set(row.projectId, tally);
  }

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    slug: projectSlug(p.name, p.projectCode),
    type: p.type,
    status: p.status,
    developer: p.developer,
    where: projectWhere(p),
    tally: tallies.get(p.id) ?? { AVAILABLE: 0, HOLD: 0, SOLD: 0 },
  }));
}
