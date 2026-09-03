// AC-01 — backfilling `Booking.originalClassification` onto Bookings approved
// before the column existed.
//
// Approved Changes §1: "Existing approved Customer Bookings remain classified as
// Customer Bookings after activation" and "Historical records must not be
// retroactively reclassified merely because the person's Member status changes."
//
// New Bookings freeze their classification at Accounts approval. Rows approved
// before that code shipped carry null, and null is not harmless: the Dashboard
// reports them as unclassified, and the lazy recovery inside
// `freezeClassification` only reaches a Booking that something else touches
// again. A Booking nobody corrects stays null for good. This closes that.
//
// Nothing here reads the buyer's Member status *today*. That is the one source
// which is wrong for exactly the converted Customer the pack is about — see
// `classifyApprovedBooking` in domain/commission for what is read instead.
//
// Unresolvable rows are listed, never guessed at. That follows the rule the
// reconciliation report already states: a migration exception is a decision for
// CRM and Accounts, not something a script should silently overwrite.

import type { BookingClassification } from "@/lib/domain/commission";
import { classifyApprovedBooking } from "@/lib/domain/commission";
import { db } from "@/lib/db";
import { classificationEvidence } from "@/lib/services/commission-service";

export type BackfillRow = {
  bookingId: string;
  reference: string;
  buyer: string;
  classification: BookingClassification;
  source: string;
  /** Set where the second signal disagreed. Applied, but worth an eye. */
  note: string | null;
};

export type BackfillException = {
  bookingId: string;
  reference: string;
  buyer: string;
  reason: string;
};

export type BackfillReport = {
  at: Date;
  /** Approved Bookings that already carry a classification. */
  alreadyClassified: number;
  /** Approved Bookings this run considered. */
  candidates: number;
  planned: BackfillRow[];
  exceptions: BackfillException[];
  /** False for a dry run: the report is identical, nothing was written. */
  applied: boolean;
};

/**
 * Only approved Bookings are in scope. A request that was never approved has no
 * historical classification to preserve — it froze nothing, and it will freeze
 * its own the day Accounts approve it.
 */
const SCOPE = { bookingNumber: { not: null }, originalClassification: null } as const;

export async function backfillClassification(
  options: { apply: boolean } = { apply: false }
): Promise<BackfillReport> {
  const alreadyClassified = await db.booking.count({
    where: { bookingNumber: { not: null }, originalClassification: { not: null } },
  });

  const candidates = await db.booking.findMany({
    where: SCOPE,
    select: {
      id: true,
      bookingNumber: true,
      requestNo: true,
      primaryPerson: { select: { fullName: true } },
    },
    orderBy: { approvedAt: "asc" },
  });

  const planned: BackfillRow[] = [];
  const exceptions: BackfillException[] = [];

  for (const booking of candidates) {
    const reference = booking.bookingNumber ?? booking.requestNo;
    const buyer = booking.primaryPerson.fullName;

    const decision = classifyApprovedBooking(await classificationEvidence(db, booking.id));
    if (!decision.resolved) {
      exceptions.push({ bookingId: booking.id, reference, buyer, reason: decision.reason });
      continue;
    }
    planned.push({
      bookingId: booking.id,
      reference,
      buyer,
      classification: decision.classification,
      source: decision.source,
      note: decision.note,
    });
  }

  if (options.apply && planned.length > 0) {
    // One transaction. A half-applied backfill would leave the Dashboard's
    // Customer/Member split disagreeing with itself between two page loads, and
    // there would be nothing to say which half had run.
    await db.$transaction(async (tx) => {
      for (const row of planned) {
        // Re-check inside the transaction: a Booking approved between the read
        // above and here would already have frozen its own classification, and
        // that one is better evidence than anything recovered after the fact.
        const live = await tx.booking.findUniqueOrThrow({
          where: { id: row.bookingId },
          select: { originalClassification: true },
        });
        if (live.originalClassification !== null) continue;

        await tx.booking.update({
          where: { id: row.bookingId },
          data: { originalClassification: row.classification },
        });
        await tx.bookingEvent.create({
          data: {
            bookingId: row.bookingId,
            actorRef: "MIGRATION",
            action: "CLASSIFICATION_FROZEN",
            detail: {
              originalClassification: row.classification,
              source: row.source,
              note: row.note,
              backfill: true,
            },
            reason:
              `Backfilled from ${row.source}. The buyer's Member status today was not read: ` +
              `Approved Changes §1 keeps an approved Customer Booking classified as Customer ` +
              `business after the same person becomes a Member.`,
          },
        });
      }
    });
  }

  return {
    at: new Date(),
    alreadyClassified,
    candidates: candidates.length,
    planned,
    exceptions,
    applied: options.apply,
  };
}

/** The printed report — the copy that gets kept with the migration record. */
export function formatBackfillReport(report: BackfillReport): string {
  const lines: string[] = [];
  const rule = "─".repeat(78);

  lines.push(rule);
  lines.push(
    `Booking classification backfill — ${report.applied ? "APPLIED" : "DRY RUN (nothing written)"}`
  );
  lines.push(`${report.at.toISOString()}`);
  lines.push(rule);
  lines.push("");
  lines.push(`Approved Bookings already classified : ${report.alreadyClassified}`);
  lines.push(`Approved Bookings needing a value    : ${report.candidates}`);
  lines.push(`  resolved                           : ${report.planned.length}`);
  lines.push(`  exceptions                         : ${report.exceptions.length}`);
  lines.push("");

  const customer = report.planned.filter((r) => r.classification === "CUSTOMER").length;
  const member = report.planned.filter((r) => r.classification === "MEMBER").length;
  lines.push(`  → CUSTOMER : ${customer}`);
  lines.push(`  → MEMBER   : ${member}`);
  lines.push("");

  if (report.planned.length > 0) {
    lines.push(rule);
    lines.push("Resolved");
    lines.push(rule);
    for (const row of report.planned) {
      lines.push(`${row.reference.padEnd(14)} ${row.classification.padEnd(9)} ${row.buyer}`);
      lines.push(`  from ${row.source}`);
      if (row.note) lines.push(`  NOTE ${row.note}`);
    }
    lines.push("");
  }

  if (report.exceptions.length > 0) {
    lines.push(rule);
    lines.push("Exceptions — decided by CRM and Accounts, not by this script");
    lines.push(rule);
    for (const row of report.exceptions) {
      lines.push(`${row.reference.padEnd(14)} ${row.buyer}`);
      lines.push(`  ${row.reason}`);
    }
    lines.push("");
    lines.push(
      "Each of these stays null and is reported as unclassified on the Dashboard until " +
        "someone sets it deliberately."
    );
    lines.push("");
  }

  if (!report.applied && report.planned.length > 0) {
    lines.push("Re-run with --confirm to write these values.");
  }

  return lines.join("\n");
}
