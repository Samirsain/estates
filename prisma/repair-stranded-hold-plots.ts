// Returns a Plot that reads Hold with no Hold left on it.
//
// The reconcile rule held_plots_have_a_hold finds these; this is the repair.
// uat-seed.ts used to close a Hold by writing the row directly, which skipped
// everything else releaseHold does — so the Hold ended and the Plot stayed
// where it was, out of inventory and unbookable, with no Hold on its profile to
// release. The seed goes through releaseHold now; this clears what the old one
// already wrote.
//
// releaseHold itself cannot do it: it returns early unless the Hold is still
// ACTIVE, and these are long closed. So the Plot side is redone here the same
// way releaseHold does it — plotReturnState decides the status, because a
// restricted Plot goes back to Not Available rather than Available — and the
// PlotEvent is written so the jump is on the record rather than appearing to
// have happened by itself.
//
// Idempotent: a second run finds nothing to do.
//
// Run: node --env-file=.env --import ./prisma/alias-loader.mjs prisma/repair-stranded-hold-plots.ts

import { PrismaClient } from "@prisma/client";
import { plotReturnState } from "@/lib/domain/inventory";

const db = new PrismaClient();
const ACTOR = "SYSTEM:HOLD_PLOT_REPAIR";

async function main() {
  const stranded = await db.plot.findMany({
    where: { status: "HOLD", holds: { none: { status: { in: ["ACTIVE", "FROZEN"] } } } },
    include: {
      holds: { orderBy: { closedAt: "desc" }, take: 1 },
    },
  });

  if (stranded.length === 0) {
    console.log("Nothing stranded — every Plot on Hold has a live Hold.");
    return;
  }

  for (const plot of stranded) {
    const next = plotReturnState(plot.restriction, plot.restrictionReason);
    const last = plot.holds[0];
    const because = last
      ? `the Hold closed ${last.status.toLowerCase().replaceAll("_", " ")}`
      : "no Hold was ever recorded";

    await db.$transaction(async (tx) => {
      await tx.plot.update({ where: { id: plot.id }, data: { status: next.status } });
      await tx.plotEvent.create({
        data: {
          plotId: plot.id,
          actorRef: ACTOR,
          action: "HOLD_PLOT_REPAIRED",
          fromStatus: plot.status,
          toStatus: next.status,
          reason:
            `Returned to ${next.status.replaceAll("_", " ").toLowerCase()}: the Plot read Hold but ` +
            `${because}. ${next.message ?? ""}`.trim(),
        },
      });
    });

    console.log(`${plot.plotNumber}: HOLD → ${next.status}  (${because})`);
  }

  console.log(`\nRepaired ${stranded.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
