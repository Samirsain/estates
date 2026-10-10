// Migration reconciliation — delivery-phases.md Phase 7; ARCHITECTURE §13; prd-complete §27.3.
//
// Every rule here is an invariant the approved model guarantees. Run it against
// the staging copy after a migration rehearsal and against production before
// go-live: the output is the signed record-count and exception report.
//
// Nothing is repaired automatically. A migration exception is a decision for
// CRM and Accounts, not something a script should silently overwrite.

import { Prisma } from "@prisma/client";
import { db, inWaves } from "@/lib/db";
import { CUSTOMER_CLOSING_LOYALTY_LIMIT } from "@/lib/domain/commission";

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

/** prd-complete §27.3 — "verify no protected record is lost". */
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

/**
 * ARCHITECTURE §13.3, the other way round — a Plot claiming an allocation that
 * does not exist.
 *
 * oneAllocationPerPlot catches two claims on one Plot and says nothing about
 * none: a Plot reading HOLD with every Hold on it already closed passes it,
 * because 0 is not greater than 1. That Plot is out of inventory with nothing
 * on the screen to explain why — it cannot be Booked, cannot be Held, and its
 * profile shows no Hold to release. Closing a Hold is what returns the Plot
 * (hold-service.ts: releaseHold), so this is what a write that skipped it
 * leaves behind.
 */
async function heldPlotsHaveAHold(): Promise<RuleResult> {
  const plots = await db.plot.findMany({
    where: { status: "HOLD" },
    select: {
      plotNumber: true,
      holds: { where: { status: { in: ["ACTIVE", "FROZEN"] } }, select: { id: true } },
    },
  });

  const exceptions: Exception[] = plots
    .filter((plot) => plot.holds.length === 0)
    .map((plot) => ({
      record: plot.plotNumber,
      detail: "Plot status is Hold, but no Hold on it is Active or Frozen",
    }));

  return {
    rule: "held_plots_have_a_hold",
    source: "ARCHITECTURE §13.3 — a Plot on Hold reconciles to a live Hold",
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
 * separate, supersession links are intact, and one sale never carries both
 * Direct and Customer Loyalty (SSOT §11 — there is no combined cap).
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
  const saleTypes = new Map<string, Set<string>>();

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

    if (record.isCurrent && record.bookingId && record.payment !== "CANCELLED") {
      const types = saleTypes.get(record.bookingId) ?? new Set<string>();
      types.add(record.type);
      saleTypes.set(record.bookingId, types);
    }
  }

  // v2.1 §11 — one sale never pays both Direct and Loyalty.
  for (const [bookingId, types] of saleTypes) {
    if (types.has("DIRECT") && types.has("LOYALTY")) {
      const record = records.find((r) => r.bookingId === bookingId);
      exceptions.push({
        record: record?.booking?.bookingNumber ?? record?.booking?.requestNo ?? bookingId,
        detail: "Direct and Customer Loyalty are both current on one sale (v2.1 §11)",
      });
    }
  }

  return {
    rule: "commission_integrity",
    source: "PRD §6.9, v2.1 §11 — supersession intact, eligibility and payment separate, never Direct and Loyalty together",
    checked: records.length,
    exceptions,
  };
}

/**
 * v2.1 §21, §25, §77 — at most three Customer-closing Loyalty events qualify per
 * real person, merged-away identities included.
 */
async function customerClosingLoyalty(): Promise<RuleResult> {
  const qualified = await db.commissionRecord.findMany({
    where: {
      type: "LOYALTY",
      beneficiaryRole: "CLOSING_CUSTOMER",
      isCurrent: true,
      payment: { not: "CANCELLED" },
      qualifiedAt: { not: null },
    },
    select: { beneficiaryPerson: { select: { id: true, fullName: true, survivingPersonId: true } } },
  });

  const byPerson = new Map<string, { name: string; count: number }>();
  for (const { beneficiaryPerson: p } of qualified) {
    const key = p.survivingPersonId ?? p.id;
    const entry = byPerson.get(key) ?? { name: p.fullName, count: 0 };
    entry.count++;
    byPerson.set(key, entry);
  }

  const exceptions: Exception[] = [];
  for (const { name, count } of byPerson.values()) {
    if (count > CUSTOMER_CLOSING_LOYALTY_LIMIT) {
      exceptions.push({
        record: name,
        detail: `${count} Customer-closing Loyalty events qualified; the lifetime limit is ${CUSTOMER_CLOSING_LOYALTY_LIMIT}`,
      });
    }
  }

  return {
    rule: "customer_closing_loyalty_limit",
    source: "v2.1 §21, §25 — three successful Customer-closing events for life",
    checked: byPerson.size,
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
 * UAT plan §28 — the standing v2 integrity queries that the database does not
 * already refuse. One-current-record, one Reference / Royalty / Own-Sale credit,
 * rate caps on a version and one credit per reward are database constraints
 * (CP §80) and cannot occur; the old Invite/Royalty cash types no longer exist
 * in the schema at all (items 23–24).
 */
async function businessModelV2(): Promise<RuleResult> {
  const exceptions: Exception[] = [];
  const add = (record: string, detail: string) => exceptions.push({ record, detail });

  // 1. Approved Booking without its frozen Project Settings Version.
  const unfrozen = await db.booking.findMany({
    where: {
      status: { in: ["BOOKED", "PAYMENT_COMPLETED", "DELIVERED"] },
      commissionVersionId: null,
      project: { isExternalResaleGroup: false },
    },
    select: { bookingNumber: true, requestNo: true },
  });
  for (const b of unfrozen) add(b.bookingNumber ?? b.requestNo, "Approved Booking without a frozen Project Settings Version (§28.1)");

  // 2, 3. A decided version effective before its approval, or above the rate caps.
  const versions = await db.projectCommissionVersion.findMany({
    where: { status: { in: ["APPROVED", "ACTIVE", "SUPERSEDED"] } },
    select: { version: true, effectiveFrom: true, decidedAt: true, directPercent: true, loyaltyPercent: true, project: { select: { name: true } } },
  });
  for (const v of versions) {
    const name = `${v.project.name} v${v.version}`;
    if (v.effectiveFrom && v.decidedAt && v.effectiveFrom < v.decidedAt) add(name, "Effective before its MD approval (§28.2)");
    if (v.directPercent?.gt(5) || v.loyaltyPercent?.gt(3)) add(name, "Direct above 5% or Loyalty above 3% (§28.3)");
  }

  // 12. A Buyback-qualified non-cash reward fulfilled before Stable Buyback Completion.
  const stable = async (bookingId: string) =>
    (await db.acquisition.count({ where: { sourceBookingId: bookingId, type: "BUYBACK", stableCompletedAt: { not: null } } })) > 0;
  const gifts = await db.royaltyCredit.findMany({
    where: { state: "DELIVERED", qualificationRoute: "APPROVED_BUYBACK" },
    select: { id: true, triggerBookingId: true, triggerBooking: { select: { bookingNumber: true, paymentReceivedPercent: true } } },
  });
  for (const g of gifts) {
    if (g.triggerBooking.paymentReceivedPercent.lt(100) && !(await stable(g.triggerBookingId))) {
      add(g.triggerBooking.bookingNumber ?? g.id, "Buyback-qualified Gift delivered before Stable Completion (§28.12)");
    }
  }
  const travelledOnBuyback = await db.tripCredit.findMany({
    where: { state: "USED", qualificationRoute: "APPROVED_BUYBACK" },
    select: { id: true, sourceBookingId: true, sourceBooking: { select: { bookingNumber: true, paymentReceivedPercent: true } } },
  });
  for (const c of travelledOnBuyback) {
    if (c.sourceBooking.paymentReceivedPercent.lt(100) && !(await stable(c.sourceBookingId))) {
      add(c.sourceBooking.bookingNumber ?? c.id, "Buyback-qualified Trip credit used before Stable Completion (§28.12)");
    }
  }

  // 13, 14. A fulfilled reward whose opportunity was reopened.
  const reopenedGifts = await db.royaltyCredit.findMany({
    where: { state: "DELIVERED", customerProfile: { royaltyOpportunityConsumedAt: null } },
    select: { customerProfile: { select: { customerId: true } } },
  });
  for (const g of reopenedGifts) add(g.customerProfile.customerId, "Delivered Gift with the Royalty opportunity reopened (§28.13)");
  const reopenedRefs = await db.tripCredit.findMany({
    where: { state: "USED", creditType: "REFERENCE", introducedMember: { referenceOpportunityConsumedAt: null } },
    select: { introducedMember: { select: { memberId: true } } },
  });
  for (const c of reopenedRefs) add(c.introducedMember?.memberId ?? "?", "Travelled Trip's Reference opportunity reopened (§28.14)");

  // 17. An Active Member recorded as Sold By Customer.
  const customerSales = await db.booking.findMany({
    where: { soldByType: "CUSTOMER", status: { in: ["BOOKED", "PAYMENT_COMPLETED", "DELIVERED", "REQUEST_PENDING"] } },
    select: { bookingNumber: true, requestNo: true, createdAt: true, soldByPerson: { select: { memberProfile: { select: { activationDate: true } } } } },
  });
  for (const b of customerSales) {
    const activated = b.soldByPerson?.memberProfile?.activationDate;
    if (activated && activated <= b.createdAt) add(b.bookingNumber ?? b.requestNo, "Active Member recorded as Sold By Customer (§28.17)");
  }

  // 18. A Customer closer's benefit released without KYC or Terms.
  const closings = await db.commissionRecord.findMany({
    where: { type: "LOYALTY", beneficiaryRole: "CLOSING_CUSTOMER", isCurrent: true, OR: [{ eligibility: "READY" }, { payment: "PAID" }] },
    select: {
      id: true,
      beneficiaryPerson: { select: { fullName: true, aadhaarStatus: true, customerProfile: { select: { _count: { select: { termsAcceptances: true } } } } } },
    },
  });
  for (const c of closings) {
    const p = c.beneficiaryPerson;
    if (p.aadhaarStatus !== "VERIFIED" || !p.customerProfile?._count.termsAcceptances) {
      add(p.fullName, "Customer-closing Loyalty released without verified KYC and accepted Terms (§28.18)");
    }
  }

  // 19. A non-family nominee fulfilled without MD approval.
  const nominees = await Promise.all([
    db.tripReward.count({ where: { state: { in: ["BOOKED", "TRAVELLED"] }, recipient: "NON_FAMILY", recipientApprovedAt: null } }),
    db.royaltyCredit.count({ where: { state: { in: ["ORDERED", "DELIVERED"] }, recipient: "NON_FAMILY", recipientApprovedAt: null } }),
  ]);
  if (nominees[0] + nominees[1] > 0) add("Rewards", `${nominees[0] + nominees[1]} non-family nominee(s) fulfilled without MD approval (§28.19)`);

  // 20. A staff or declared-relative benefit paid or fulfilled without MD approval.
  const [staff, relatives, approved] = await Promise.all([
    db.staffAccount.findMany({ select: { personId: true } }),
    db.staffRelative.findMany({ where: { endedAt: null }, select: { relativePersonId: true } }),
    db.staffConflictReview.findMany({ where: { status: "APPROVED" }, select: { recordId: true } }),
  ]);
  const conflicted = [...new Set([...staff.map((s) => s.personId), ...relatives.map((r) => r.relativePersonId)])];
  const cleared = new Set(approved.map((a) => a.recordId));
  const [paidToConflicted, giftsToConflicted, tripsToConflicted] = await Promise.all([
    db.commissionRecord.findMany({
      where: { beneficiaryPersonId: { in: conflicted }, payment: { in: ["PAID", "PAID_EARLY"] } },
      select: { id: true, beneficiaryPerson: { select: { fullName: true } } },
    }),
    db.royaltyCredit.findMany({
      where: { memberProfile: { personId: { in: conflicted } }, state: { in: ["ORDERED", "DELIVERED"] } },
      select: { id: true, memberProfile: { select: { memberId: true } } },
    }),
    db.tripReward.findMany({
      where: { memberProfile: { personId: { in: conflicted } }, state: { in: ["BOOKED", "TRAVELLED"] } },
      select: { id: true, memberProfile: { select: { memberId: true } } },
    }),
  ]);
  for (const r of paidToConflicted) if (!cleared.has(r.id)) add(r.beneficiaryPerson.fullName, "Staff/relative benefit paid without conflict approval (§28.20)");
  for (const r of [...giftsToConflicted, ...tripsToConflicted]) {
    if (!cleared.has(r.id)) add(r.memberProfile.memberId, "Staff/relative reward fulfilled without conflict approval (§28.20)");
  }

  // 21. One verified bank account shared by unrelated Persons without a joint-account exception.
  const banks = await db.bankDetail.findMany({
    where: { status: "VERIFIED", accountBlindIndex: { not: null } },
    select: { accountBlindIndex: true, accountLastFour: true, jointAccountProof: true, person: { select: { id: true, survivingPersonId: true } } },
  });
  const byAccount = new Map<string, typeof banks>();
  for (const b of banks) byAccount.set(b.accountBlindIndex!, [...(byAccount.get(b.accountBlindIndex!) ?? []), b]);
  for (const rows of byAccount.values()) {
    const people = new Set(rows.map((r) => r.person.survivingPersonId ?? r.person.id));
    if (people.size > 1 && rows.filter((r) => !r.jointAccountProof).length > 1) {
      add(`Bank ••${rows[0].accountLastFour}`, `Verified for ${people.size} Persons without a joint-account exception (§28.21)`);
    }
  }

  // 22. A benefit released while its circumvention review is undecided or restricted.
  const reviews = await db.circumventionReview.findMany({
    where: { status: { in: ["PENDING_REVIEW", "RESTRICTED"] }, recovery: { status: "OUTSTANDING" } },
    select: { subjectPersonId: true, raisedAt: true, subjectPerson: { select: { fullName: true } } },
  });
  for (const r of reviews) {
    const released = await db.commissionRecord.count({
      where: { beneficiaryPersonId: r.subjectPersonId, payment: { in: ["PAID", "PAID_EARLY"] }, paidOn: { gt: r.raisedAt } },
    });
    if (released > 0) add(r.subjectPerson.fullName, "Paid while a Recovery Circumvention Review holds (§28.22)");
  }

  // 25. The removed "Commission Conflict — Above 4%" task.
  const above4 = await db.task.count({ where: { title: { contains: "Above 4%" }, status: "PENDING" } });
  if (above4 > 0) add("Task", `${above4} open "Commission Conflict — Above 4%" task(s) (§28.25)`);

  return {
    rule: "business_model_v2_integrity",
    source: "UAT plan §28 — standing v2 integrity queries must return zero exceptions",
    checked: unfrozen.length + versions.length + banks.length + reviews.length + closings.length + customerSales.length,
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
  heldPlotsHaveAHold,
  bookingPlotPairs,
  paymentDatasets,
  commissionIntegrity,
  customerClosingLoyalty,
  personMerges,
  portalLogins,
  deliveredCompletions,
  businessModelV2,
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
