// Migration reconciliation — PHASES.md Phase 7; ARCHITECTURE §13; main-PRD §27.3.
//
// Every rule here is an invariant the approved model guarantees. Run it against
// the staging copy after a migration rehearsal and against production before
// go-live: the output is the signed record-count and exception report.
//
// Nothing is repaired automatically. A migration exception is a decision for
// CRM and Accounts, not something a script should silently overwrite.

import { Prisma } from "@prisma/client";
import { db, inWaves } from "@/lib/db";
import { SALE_CAP_PERCENT } from "@/lib/domain/commission";
import { rebuildLoyaltyCount } from "@/lib/domain/completion";

const D = Prisma.Decimal;

export type Exception = { record: string; detail: string };

export type RuleResult = {
  rule: string;
  /** The clause the rule exists for, quoted in the report. */
  source: string;
  checked: number;
  exceptions: Exception[];
};

export type ReconciliationReport = {
  at: Date;
  counts: Record<string, number>;
  rules: RuleResult[];
  exceptionCount: number;
};

/* ------------------------------------------------------------ record counts */

/** main-PRD §27.3 — "verify no protected record is lost". */
export async function recordCounts(): Promise<Record<string, number>> {
  const [
    persons,
    customers,
    members,
    staff,
    portalAccounts,
    projects,
    plots,
    enquiries,
    holds,
    bookings,
    completions,
    paymentsReceived,
    paymentsGiven,
    acquisitions,
    commissions,
    tasks,
    auditEvents,
  ] = await inWaves([
    () => db.person.count(),
    () => db.customerProfile.count(),
    () => db.memberProfile.count(),
    () => db.staffAccount.count(),
    () => db.portalAccount.count(),
    () => db.project.count(),
    () => db.plot.count(),
    () => db.enquiry.count(),
    () => db.hold.count(),
    () => db.booking.count(),
    () => db.bookingCompletion.count(),
    () => db.paymentReceivedEntry.count(),
    () => db.paymentGivenEntry.count(),
    () => db.acquisition.count(),
    () => db.commissionRecord.count(),
    () => db.task.count(),
    () => db.auditEvent.count(),
  ]);

  return {
    persons,
    customers,
    members,
    staff,
    portalAccounts,
    projects,
    plots,
    enquiries,
    holds,
    bookings,
    completions,
    paymentsReceived,
    paymentsGiven,
    acquisitions,
    commissions,
    tasks,
    auditEvents,
  };
}

/* ------------------------------------------------------------------- rules */

/** ARCHITECTURE §13.3 — every Plot reconciles to one active allocation. */
async function oneAllocationPerPlot(): Promise<RuleResult> {
  const plots = await db.plot.findMany({
    select: {
      id: true,
      plotNumber: true,
      holds: { where: { status: "ACTIVE" }, select: { id: true } },
      bookings: {
        where: { status: { in: ["REQUEST_PENDING", "BOOKED", "PAYMENT_COMPLETED", "REFUND_PENDING", "DELIVERED"] } },
        select: { id: true, requestNo: true, status: true },
      },
    },
  });

  const exceptions: Exception[] = [];
  for (const plot of plots) {
    const claims = plot.holds.length + plot.bookings.length;
    if (claims > 1) {
      exceptions.push({
        record: plot.plotNumber,
        detail:
          `${plot.holds.length} active Hold(s) and ${plot.bookings.length} live Booking(s) ` +
          `claim this Plot: ${plot.bookings.map((b) => `${b.requestNo}/${b.status}`).join(", ")}`,
      });
    }
  }
  return {
    rule: "one_allocation_per_plot",
    source: "ARCHITECTURE §13.3 — reconcile every Plot to one active allocation",
    checked: plots.length,
    exceptions,
  };
}

/** ARCHITECTURE §13.4 — Booking and Plot state pairs reconcile. */
async function bookingPlotPairs(): Promise<RuleResult> {
  const PAIR: Record<string, string> = {
    REQUEST_PENDING: "WAITING_FOR_BOOKING_APPROVAL",
    BOOKED: "BOOKED",
    PAYMENT_COMPLETED: "PAYMENT_COMPLETED",
    REFUND_PENDING: "REFUND_PENDING",
    DELIVERED: "DELIVERED",
  };

  const bookings = await db.booking.findMany({
    where: { status: { in: Object.keys(PAIR) as never } },
    select: {
      requestNo: true,
      bookingNumber: true,
      status: true,
      plot: { select: { plotNumber: true, status: true } },
    },
  });

  const exceptions = bookings
    .filter((b) => b.plot.status !== PAIR[b.status])
    .map((b) => ({
      record: b.bookingNumber ?? b.requestNo,
      detail: `Booking is ${b.status} but Plot ${b.plot.plotNumber} is ${b.plot.status}`,
    }));

  return {
    rule: "booking_plot_state_pairs",
    source: "ARCHITECTURE §13.4 — reconcile Booking/Plot state pairs",
    checked: bookings.length,
    exceptions,
  };
}

/**
 * PRD §1.2, §21; ARCHITECTURE §13.5 — Payment Received and Payment Given stay
 * separate, and each side's stored progress equals its own confirmed entries.
 */
async function paymentDatasets(): Promise<RuleResult> {
  const exceptions: Exception[] = [];

  const bookings = await db.booking.findMany({
    select: {
      requestNo: true,
      bookingNumber: true,
      paymentReceivedPercent: true,
      paymentEntries: { where: { status: "CONFIRMED" }, select: { percent: true } },
    },
  });
  for (const booking of bookings) {
    const summed = booking.paymentEntries.reduce((sum, e) => sum.add(e.percent), new D(0));
    if (!summed.equals(booking.paymentReceivedPercent)) {
      exceptions.push({
        record: booking.bookingNumber ?? booking.requestNo,
        detail: `Payment Received is stored as ${booking.paymentReceivedPercent.toFixed(4)}% but its confirmed entries total ${summed.toFixed(4)}%`,
      });
    }
  }

  const acquisitions = await db.acquisition.findMany({
    select: {
      acquisitionNo: true,
      paymentGivenPercent: true,
      paymentEntries: { where: { status: "CONFIRMED" }, select: { percent: true } },
    },
  });
  for (const acquisition of acquisitions) {
    const summed = acquisition.paymentEntries.reduce((sum, e) => sum.add(e.percent), new D(0));
    if (!summed.equals(acquisition.paymentGivenPercent)) {
      exceptions.push({
        record: acquisition.acquisitionNo,
        detail: `Payment Given is stored as ${acquisition.paymentGivenPercent.toFixed(4)}% but its confirmed entries total ${summed.toFixed(4)}%`,
      });
    }
  }

  // One external reference value never serves both datasets (PRD §10.3).
  const shared = await db.externalReference.findMany({
    where: { paymentReceivedEntry: { isNot: null }, paymentGivenEntry: { isNot: null } },
    select: { rawValue: true },
  });
  for (const reference of shared) {
    exceptions.push({
      record: reference.rawValue,
      detail: "One Payment Reference No. is attached to both a Payment Received and a Payment Given entry",
    });
  }

  return {
    rule: "payment_datasets_separate",
    source: "PRD §1.2, §21 — Payment Received and Payment Given are separate datasets",
    checked: bookings.length + acquisitions.length,
    exceptions,
  };
}

/**
 * PRD §6.9, §21; ARCHITECTURE §13.6, §13.7 — eligibility and payment states are
 * separate, supersession links are intact, and current sale commission per
 * Booking stays within the 4% cap (RD-03).
 */
async function commissionIntegrity(): Promise<RuleResult> {
  const records = await db.commissionRecord.findMany({
    select: {
      id: true,
      bookingId: true,
      type: true,
      percent: true,
      isCurrent: true,
      effectiveTo: true,
      supersededById: true,
      payment: true,
      eligibility: true,
      booking: { select: { requestNo: true, bookingNumber: true } },
    },
  });

  const exceptions: Exception[] = [];
  const saleTotals = new Map<string, Prisma.Decimal>();

  for (const record of records) {
    const label = record.booking?.bookingNumber ?? record.booking?.requestNo ?? record.id;

    if (record.isCurrent && record.supersededById) {
      exceptions.push({ record: label, detail: `${record.type} is current yet points at a superseding record` });
    }
    if (!record.isCurrent && !record.supersededById && record.payment !== "CANCELLED") {
      exceptions.push({
        record: label,
        detail: `${record.type} is not current, not cancelled, and names no superseding record`,
      });
    }
    if (record.isCurrent && record.effectiveTo) {
      exceptions.push({ record: label, detail: `${record.type} is current but already effective-dated closed` });
    }
    if (record.payment === "PAID" && record.eligibility === "MILESTONE_PENDING") {
      exceptions.push({
        record: label,
        detail: `${record.type} is Paid while its milestone is still pending — eligibility and payment must stay a separate pair`,
      });
    }

    if (record.isCurrent && record.bookingId) {
      const running = saleTotals.get(record.bookingId) ?? new D(0);
      saleTotals.set(record.bookingId, running.add(record.percent));
    }
  }

  for (const [bookingId, total] of saleTotals) {
    if (total.gt(SALE_CAP_PERCENT)) {
      const record = records.find((r) => r.bookingId === bookingId);
      exceptions.push({
        record: record?.booking?.bookingNumber ?? record?.booking?.requestNo ?? bookingId,
        detail: `Current sale commission totals ${total.toFixed(2)}%, above the 4% cap (RD-03)`,
      });
    }
  }

  return {
    rule: "commission_integrity",
    source: "PRD §6.9, RD-03 — supersession intact, eligibility and payment separate, 4% cap held",
    checked: records.length,
    exceptions,
  };
}

/**
 * PRD §6.5, §22 — Loyalty slots are rebuilt from unique qualifying events, so a
 * migrated count must equal the events behind it and never exceed three.
 */
async function loyaltySlots(): Promise<RuleResult> {
  const customers = await db.customerProfile.findMany({
    select: { customerId: true, personId: true, loyaltySlotsConsumed: true },
  });
  const opportunities = await db.commissionOpportunity.findMany({
    where: { kind: "LOYALTY", status: "CONSUMED" },
    select: { subjectPersonId: true, consumedByBookingId: true },
  });

  const byPerson = new Map<string, { qualifyingKey: string }[]>();
  for (const opportunity of opportunities) {
    const list = byPerson.get(opportunity.subjectPersonId) ?? [];
    list.push({ qualifyingKey: opportunity.consumedByBookingId! });
    byPerson.set(opportunity.subjectPersonId, list);
  }

  const exceptions: Exception[] = [];
  for (const customer of customers) {
    const rebuilt = rebuildLoyaltyCount(byPerson.get(customer.personId) ?? []);
    if (rebuilt !== customer.loyaltySlotsConsumed) {
      exceptions.push({
        record: customer.customerId,
        detail: `Loyalty slots consumed is ${customer.loyaltySlotsConsumed}, but the unique qualifying events rebuild to ${rebuilt}`,
      });
    }
  }

  return {
    rule: "loyalty_slots_rebuilt",
    source: "PRD §6.5, §22 — rebuilt from unique qualifying events, capped at three",
    checked: customers.length,
    exceptions,
  };
}

/**
 * RD-02; ARCHITECTURE §13.8 — annual positions are rebuilt without renumbering,
 * so within one counter year a position is issued once.
 */
async function annualPositions(): Promise<RuleResult> {
  const members = await db.memberProfile.findMany({
    where: { invitePosition: { not: null } },
    select: { memberId: true, invitedByMemberId: true, invitePosition: true, inviteYearStart: true },
  });
  const customers = await db.customerProfile.findMany({
    where: { introducedPosition: { not: null } },
    select: {
      customerId: true,
      originalIntroducedByMemberId: true,
      introducedPosition: true,
      introducedYearStart: true,
    },
  });

  const exceptions: Exception[] = [];
  const seen = new Set<string>();

  for (const member of members) {
    const key = `invite:${member.invitedByMemberId}:${member.inviteYearStart?.toISOString() ?? "none"}:${member.invitePosition}`;
    if (seen.has(key)) {
      exceptions.push({
        record: member.memberId,
        detail: `Invite position ${member.invitePosition} is issued twice in the same counter year`,
      });
    }
    seen.add(key);
  }

  for (const customer of customers) {
    const key = `introduced:${customer.originalIntroducedByMemberId}:${customer.introducedYearStart?.toISOString() ?? "none"}:${customer.introducedPosition}`;
    if (seen.has(key)) {
      exceptions.push({
        record: customer.customerId,
        detail: `Introduced position ${customer.introducedPosition} is issued twice in the same counter year`,
      });
    }
    seen.add(key);
  }

  return {
    rule: "annual_positions_not_renumbered",
    source: "RD-02 — annual counters rebuilt without renumbering existing relationships",
    checked: members.length + customers.length,
    exceptions,
  };
}

/** PRD §22; ARCHITECTURE §13.11 — merged and duplicate Persons reconcile. */
async function personMerges(): Promise<RuleResult> {
  const persons = await db.person.findMany({
    where: { mergeStatus: { not: "NONE" } },
    select: { id: true, fullName: true, mergeStatus: true, survivingPersonId: true },
  });

  const exceptions: Exception[] = [];
  for (const person of persons) {
    if (person.mergeStatus === "MERGED_AWAY" && !person.survivingPersonId) {
      exceptions.push({ record: person.fullName, detail: "Merged away with no surviving Person recorded" });
    }
    if (person.mergeStatus === "SURVIVOR" && person.survivingPersonId) {
      exceptions.push({ record: person.fullName, detail: "Marked as survivor yet points at another survivor" });
    }
  }

  const undecided = await db.personMergeRequest.count({ where: { status: "PENDING" } });
  if (undecided > 0) {
    exceptions.push({
      record: "PersonMergeRequest",
      detail: `${undecided} merge request(s) are still waiting for the MD decision`,
    });
  }

  return {
    rule: "person_merges_reconciled",
    source: "PRD §22 — one surviving identity, old IDs preserved",
    checked: persons.length,
    exceptions,
  };
}

/**
 * PRD §17.1; ARCHITECTURE §13.10 — a Member logs in with the Member ID, and the
 * old Customer portal is disabled rather than deleted. The approved model has no
 * Customer portal account at all, so any portal account must belong to a Member.
 */
async function portalLogins(): Promise<RuleResult> {
  const accounts = await db.portalAccount.findMany({
    select: {
      loginId: true,
      status: true,
      memberProfile: { select: { memberId: true, status: true } },
    },
  });

  const exceptions: Exception[] = [];
  for (const account of accounts) {
    if (account.loginId !== account.memberProfile.memberId) {
      exceptions.push({
        record: account.loginId,
        detail: `Portal login does not equal the Member ID ${account.memberProfile.memberId}`,
      });
    }
    if (account.memberProfile.status === "DEACTIVATED" && account.status !== "DISABLED") {
      exceptions.push({
        record: account.loginId,
        detail: "A deactivated Member still has an enabled portal account",
      });
    }
  }

  return {
    rule: "member_id_login",
    source: "PRD §17.1 — Member ID login; old Customer portal disabled, not deleted",
    checked: accounts.length,
    exceptions,
  };
}

/** PRD §4.4 — Delivered means a completed route, on both sides of the pair. */
async function deliveredCompletions(): Promise<RuleResult> {
  const delivered = await db.booking.findMany({
    where: { status: "DELIVERED" },
    select: {
      requestNo: true,
      bookingNumber: true,
      completions: { where: { reopenedAt: null }, select: { id: true } },
    },
  });
  const live = await db.bookingCompletion.findMany({
    where: { reopenedAt: null },
    select: { id: true, booking: { select: { requestNo: true, bookingNumber: true, status: true } } },
  });

  const exceptions: Exception[] = [];
  for (const booking of delivered) {
    if (booking.completions.length !== 1) {
      exceptions.push({
        record: booking.bookingNumber ?? booking.requestNo,
        detail: `Delivered with ${booking.completions.length} live completion records`,
      });
    }
  }
  for (const completion of live) {
    if (completion.booking.status !== "DELIVERED") {
      exceptions.push({
        record: completion.booking.bookingNumber ?? completion.booking.requestNo,
        detail: `A live Allotment/Registry completion exists while the Booking is ${completion.booking.status}`,
      });
    }
  }

  return {
    rule: "delivered_has_completion",
    source: "PRD §4.4 — Delivered is the completed route, recorded once",
    checked: delivered.length + live.length,
    exceptions,
  };
}

/* ----------------------------------------------------------------- report */

const RULES = [
  oneAllocationPerPlot,
  bookingPlotPairs,
  paymentDatasets,
  commissionIntegrity,
  loyaltySlots,
  annualPositions,
  personMerges,
  portalLogins,
  deliveredCompletions,
];

export async function reconcile(): Promise<ReconciliationReport> {
  const counts = await recordCounts();
  const rules: RuleResult[] = [];
  for (const rule of RULES) rules.push(await rule());

  return {
    at: new Date(),
    counts,
    rules,
    exceptionCount: rules.reduce((sum, r) => sum + r.exceptions.length, 0),
  };
}

/** The signed report, as plain text (ARCHITECTURE §13.12). */
export function formatReport(report: ReconciliationReport): string {
  const lines: string[] = [
    "3% Club CRM — migration reconciliation report",
    `Generated: ${report.at.toISOString()}`,
    "",
    "Record counts",
    ...Object.entries(report.counts).map(([name, count]) => `  ${name.padEnd(18)} ${count}`),
    "",
    "Reconciliation rules",
  ];

  for (const rule of report.rules) {
    lines.push(
      `  ${rule.exceptions.length === 0 ? "PASS" : "FAIL"}  ${rule.rule} (${rule.checked} checked)`,
      `        ${rule.source}`
    );
    for (const exception of rule.exceptions) {
      lines.push(`        · ${exception.record}: ${exception.detail}`);
    }
  }

  lines.push("", `Exceptions: ${report.exceptionCount}`);
  return lines.join("\n");
}
