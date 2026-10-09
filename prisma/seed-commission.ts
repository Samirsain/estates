// v2.1 §14 — every seeded Project needs an approved commission version before a
// Booking Request can be submitted on it. Direct 3%, Loyalty 1%, so the mock
// scenarios still read naturally (Part 1 design spec §7).
import type { PrismaClient } from "@prisma/client";

export async function ensureActiveCommissionVersion(
  db: PrismaClient,
  projectId: string,
  actorRef: string
): Promise<{ id: string; version: number }> {
  const active = await db.projectCommissionVersion.findFirst({ where: { projectId, status: "ACTIVE" } });
  if (active) return active;
  const latest = await db.projectCommissionVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  const now = new Date();
  return db.projectCommissionVersion.create({
    data: {
      projectId,
      version: (latest?.version ?? 0) + 1,
      status: "ACTIVE",
      directEnabled: true,
      directPercent: "3",
      loyaltyEnabled: true,
      loyaltyPercent: "1",
      reason: "Seeded mock settings",
      preparedByRef: actorRef,
      submittedAt: now,
      decidedByRef: actorRef,
      decidedAt: now,
      decisionNote: "Seeded",
      effectiveFrom: now,
    },
  });
}
