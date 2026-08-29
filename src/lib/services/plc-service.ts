// Freezing effective PLC — PRD §16.3; PLC spec §6, §7.
//
// Hold, Booking Request and Change Plot each froze a snapshot with their own
// copy of the same twenty lines. They share this one instead, so the rule that
// effective PLC is computed in exactly one place holds at the service layer too.

import { buildPlcSnapshot, type PlcComponentRule } from "@/lib/domain/inventory";
import { blocked, type Tx } from "./command";

/** Prisma component rows in the shape the domain rule reads. */
export function plcRules(
  components: readonly { category: string; threshold: unknown; percent: unknown; remark?: unknown }[]
): PlcComponentRule[] {
  return components.map((c) => ({
    category: c.category as PlcComponentRule["category"],
    threshold: c.threshold === null || c.threshold === undefined ? null : String(c.threshold),
    percent: String(c.percent),
    remark: c.remark === null || c.remark === undefined ? null : String(c.remark),
  }));
}

const PLOT_WITH_PLC = {
  boundaries: true,
  project: {
    include: {
      plcRuleVersions: { where: { status: "PUBLISHED" as const }, include: { components: true }, take: 1 },
    },
  },
} as const;

/**
 * The one read a PLC freeze needs. Callers that already have to read the Plot
 * for their own state checks read it through this and hand the row over, so a
 * Hold or a Booking Request loads the Plot once instead of twice — five round
 * trips to a database that is a round trip away.
 */
export function loadPlotForPlc(tx: Tx, plotId: string) {
  return tx.plot.findUniqueOrThrow({ where: { id: plotId }, include: PLOT_WITH_PLC });
}

export type PlotForPlc = Awaited<ReturnType<typeof loadPlotForPlc>>;

/**
 * Freezes the Plot's current effective PLC (PLC spec §6.3–6.4). The snapshot
 * keeps the deduplicated breakdown and, for each charged category, the sides
 * that qualified it — the side evidence §7.1 requires, so a later boundary
 * correction can never change how a frozen record reads.
 */
export async function freezePlcSnapshot(tx: Tx, plotOrId: string | PlotForPlc) {
  const plot = typeof plotOrId === "string" ? await loadPlotForPlc(tx, plotOrId) : plotOrId;
  const plotId = plot.id;
  const version = plot.project.plcRuleVersions[0];
  if (!version) blocked("The Project has no current PLC rule version. Complete Project setup first.");

  let snapshot: ReturnType<typeof buildPlcSnapshot>;
  try {
    snapshot = buildPlcSnapshot(plot.boundaries, plcRules(version.components));
  } catch (error) {
    // PLC spec §5.3 — an incomplete or contradictory configuration blocks the
    // transaction with a clear message; it never falls back to a guessed rate.
    blocked(error instanceof Error ? error.message : "Effective PLC could not be evaluated.");
  }

  return tx.plcSnapshot.create({
    data: {
      ruleVersionId: version.id,
      plotId,
      components: snapshot!.components as never,
      totalPercent: snapshot!.totalPercent.toFixed(4),
    },
  });
}
