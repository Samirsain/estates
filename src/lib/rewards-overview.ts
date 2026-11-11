// Recovery circumvention reviews — CP §55. Read on the reviewed person's own
// Member and Customer pages; the /rewards overview page was removed (owner,
// 11 Nov 2026).

import { db } from "@/lib/db";
import { istDay } from "@/lib/tasks";

/** CP §55 — one person's circumvention reviews, open first. */
export async function reviewRows(personId: string) {
  const circumventions = await db.circumventionReview.findMany({
    where: { subjectPersonId: personId },
    include: {
      subjectPerson: { select: { id: true, fullName: true } },
      recovery: { select: { recoveryNo: true, status: true, person: { select: { fullName: true } } } },
    },
    orderBy: [{ status: "asc" }, { raisedAt: "desc" }],
    take: 200,
  });
  const decided = (by: string | null, at: Date | null, why: string | null) => (by && at ? `${by} · ${istDay(at)} · ${why ?? ""}` : null);
  return circumventions.map((c) => ({
    id: c.id,
    person: c.subjectPerson.fullName,
    personId: c.subjectPerson.id,
    benefit: `${c.recovery.recoveryNo} · owed by ${c.recovery.person.fullName} (${c.recovery.status.toLowerCase()})`,
    detail: `Shared ${c.indicators.map((i) => i.replaceAll("_", " ").toLowerCase()).join(", ")}`,
    status: c.status,
    decided: decided(c.decidedByRef, c.decidedAt, c.reason),
  }));
}
