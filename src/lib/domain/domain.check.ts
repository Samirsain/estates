// Phase 2 to 6 domain checks — PHASES.md Phase 2-6 "Tests".
// Run: node src/lib/domain/domain.check.ts
import assert from "node:assert/strict";
import {
  canReopenDelivered,
  maskExportRow,
  readyForCompletion,
  rebuildLoyaltyCount,
  validateCompletion,
  validateFinalBuyers,
  validateMergeRequest,
} from "./completion.ts";
import {
  buildPlcSnapshot,
  calculateAreas,
  canAllocate,
  derivedFacing,
  plotReturnState,
  restrictionBlocksSale,
} from "./inventory.ts";
import {
  DEFAULT_CALENDAR,
  HOLD_HOURS,
  MAX_OPEN_POSITIONS,
  checkOpenPositions,
  decideExtension,
  extensionRequiresAdmin,
  holdExpiry,
  holdRequestExpiry,
  isWorkingDay,
  openPositionCount,
} from "./holds.ts";
import {
  duplicateKey,
  enquiryStatusAfterBookingCancelled,
  resolveOriginalIntroducer,
  validateSource,
  assertIntroducerCorrectionAllowed,
} from "./enquiry.ts";
import {
  FROZEN_REVIEW_FIELDS,
  allocatePayment,
  assertProcessFree,
  canTransition,
  canonicalSnapshot,
  freezeHold,
  holdsAllocation,
  instalmentStatus,
  isPaymentComplete,
  normaliseReference,
  notFutureDated,
  progressAfter,
  restoreHold,
  scheduleTotal,
  snapshotChanged,
  validateBookingDate,
  validateRejectReason,
  validateSchedule,
  validateScheduleRevision,
  validateShares,
  type Check,
} from "./booking.ts";
import {
  MAX_LOYALTY_SLOTS,
  afterAffectingChange,
  anniversaryDay,
  bandRate,
  canMarkPaid,
  checkSaleCap,
  counterYearRolled,
  counterYearStart,
  countsAsUnpaid,
  generateCommission,
  isLeapYear,
  membershipExperience,
  needsPaymentTask,
  nextNetworkPosition,
  opportunityReopens,
  resolveEligibility,
  totalOf,
} from "./commission.ts";
import {
  DEAL_CANCELLED_MESSAGE,
  MIN_PAYMENT_GIVEN_FOR_APPROVAL,
  PAYMENT_PENDING_MESSAGE,
  acquisitionDuplicateKey,
  buyingCommissionMilestoneReached,
  canApproveAcquisition,
  cancelAcquisition,
  likelyDuplicateReasons,
  plotStateAfterAcquisitionApproval,
  plotStateAfterAcquisitionCancelled,
  plotStateAfterChangePlot,
  resolvePaymentGivenCorrection,
  validateBuyingCommission,
  validateChangePlot,
} from "./acquisition.ts";
import { istDay, formatIst } from "../tasks.ts";

/** Reads the reason off a failed Check so the assertions stay one-liners. */
const asReason = (check: Check) => (check.ok ? "" : check.reason);

/* ------------------------------------------------------------------ area */

const regular = calculateAreas({ kind: "REGULAR", widthFt: "30", lengthFt: "45" });
assert.equal(regular.areaSqFt.toFixed(3), "1350.000");
assert.equal(regular.areaSqYd.toFixed(3), "150.000");
assert.equal(regular.areaSqM.toFixed(3), "125.419");

// Deterministic: the same input always produces the same string.
assert.equal(
  calculateAreas({ kind: "REGULAR", widthFt: "30", lengthFt: "45" }).areaSqM.toFixed(3),
  regular.areaSqM.toFixed(3)
);
// Exact decimal, not binary float: 0.1 + 0.2 style drift must not appear.
assert.equal(calculateAreas({ kind: "REGULAR", widthFt: "0.1", lengthFt: "0.2" }).areaSqFt.toFixed(3), "0.020");

assert.throws(() => calculateAreas({ kind: "REGULAR", widthFt: "0", lengthFt: "45" }));
assert.throws(
  () => calculateAreas({ kind: "EXACT", exactAreaSqFt: "1200", reason: "  " }),
  /compulsory reason/,
  "an irregular Plot override needs a reason"
);
assert.equal(
  calculateAreas({ kind: "EXACT", exactAreaSqFt: "1234.567", reason: "Irregular corner" }).areaSqFt.toFixed(3),
  "1234.567"
);

/* ------------------------------------------------------------------- PLC */

const rules = [
  { code: "ROAD_FACING", label: "Road facing", percent: "5" },
  { code: "CORNER", label: "Corner", percent: "2.5" },
  { code: "PARK_FACING", label: "Park facing", percent: "3" },
];

// The same category on multiple sides is charged once (PRD §16.3).
const snapshot = buildPlcSnapshot(["ROAD_FACING", "ROAD_FACING", "CORNER"], rules);
assert.equal(snapshot.components.length, 2);
assert.equal(snapshot.totalPercent.toFixed(3), "7.500");
assert.equal(buildPlcSnapshot([], rules).totalPercent.toFixed(3), "0.000");
assert.throws(() => buildPlcSnapshot(["MAIN_ROAD"], rules), /not in the Project's current rule version/);

/* ----------------------------------------------- restriction-aware return */

assert.deepEqual(plotReturnState("NONE"), { lifecycle: "AVAILABLE", message: null });
assert.equal(plotReturnState("NOT_FOR_SALE", "Owner instruction").lifecycle, "NOT_AVAILABLE");
assert.match(plotReturnState("PLEDGE", "Bank pledge").message!, /Pledge: Bank pledge/);
assert.equal(plotReturnState("NOT_YET_RELEASED").lifecycle, "NOT_AVAILABLE");
assert.ok(restrictionBlocksSale("NOT_FOR_SALE") && restrictionBlocksSale("PLEDGE"));
assert.ok(!restrictionBlocksSale("NONE"));

// The same rule governs every return path, so cancellation and Change Plot
// cannot drift apart.
for (const path of ["HOLD_EXPIRY", "BOOKING_REJECTED", "BOOKING_CANCELLED", "CHANGE_PLOT"]) {
  assert.equal(plotReturnState("NONE").lifecycle, "AVAILABLE", path);
  assert.equal(plotReturnState("PLEDGE", "r").lifecycle, "NOT_AVAILABLE", path);
}

assert.deepEqual(canAllocate("AVAILABLE", "NONE", "ACTIVE"), { ok: true });
assert.equal(canAllocate("AVAILABLE", "PLEDGE", "ACTIVE").ok, false);
assert.equal(canAllocate("HOLD", "NONE", "ACTIVE").ok, false);
assert.equal(canAllocate("BOOKED", "NONE", "ACTIVE").ok, false);

// PRD §16.1 — a Project still in Setup / Not Active accepts no Hold or Booking,
// however Available the Plot looks.
const setup = canAllocate("AVAILABLE", "NONE", "SETUP_NOT_ACTIVE");
assert.equal(setup.ok, false);
assert.match(setup.ok === false ? setup.reason : "", /Setup \/ Not Active/);
// Sold Out and Completed still allow it: a returned RESALE Plot in such a
// Project stays sellable as Available (Resale) (PRD §8.8).
assert.deepEqual(canAllocate("AVAILABLE", "NONE", "SOLD_OUT"), { ok: true });
assert.deepEqual(canAllocate("AVAILABLE", "NONE", "COMPLETED"), { ok: true });

/* --------------------------------------------------------------- facing */

assert.match(
  derivedFacing(
    [
      { side: "NORTH", kind: "ROAD", roadWidthFt: 30 },
      { side: "EAST", kind: "ROAD", roadWidthFt: 20 },
      { side: "SOUTH", kind: "PLOT" },
      { side: "WEST", kind: "PLOT" },
    ],
    false
  ),
  /North \/ East road facing · Corner · 2 open sides/
);
assert.match(derivedFacing([{ side: "NORTH", kind: "PLOT" }], true), /Park facing · 1 open side/);

/* ---------------------------------------------------------------- holds */

const start = new Date("2026-08-19T06:00:00Z");
assert.equal(holdExpiry(start).toISOString(), "2026-08-22T06:00:00.000Z");
assert.equal(HOLD_HOURS, 72);

assert.equal(openPositionCount({ activeHolds: 1, waitingBookingApproval: 1, pendingHoldRequests: 1 }), 3);
assert.equal(checkOpenPositions({ activeHolds: 1, waitingBookingApproval: 1, pendingHoldRequests: 0 }).ok, true);
const blocked = checkOpenPositions({ activeHolds: 2, waitingBookingApproval: 0, pendingHoldRequests: 1 });
assert.equal(blocked.ok, false);
assert.match(blocked.ok === false ? blocked.reason : "", /three open Plot positions|3 open Plot positions/);
assert.match(blocked.ok === false ? blocked.reason : "", /Admin\/MD exception/);
assert.equal(MAX_OPEN_POSITIONS, 3);

// First extension is CRM's; any further extension needs Admin (PRD §8.5).
assert.equal(extensionRequiresAdmin(0), false);
assert.equal(extensionRequiresAdmin(1), true);
assert.equal(extensionRequiresAdmin(4), true);

// The timer never pauses: a decision after expiry closes the request as Expired.
const expiry = new Date("2026-08-22T06:00:00Z");
const approved = decideExtension(true, expiry, 24, new Date("2026-08-21T06:00:00Z"));
assert.equal(approved.outcome, "APPROVED");
assert.equal(
  approved.outcome === "APPROVED" ? approved.newExpiresAt.toISOString() : "",
  "2026-08-23T06:00:00.000Z"
);
const late = decideExtension(true, expiry, 24, new Date("2026-08-22T06:00:01Z"));
assert.equal(late.outcome, "EXPIRED", "an expired Hold can never be revived by an old request");
assert.equal(decideExtension(false, expiry, 24, new Date("2026-08-20T06:00:00Z")).outcome, "REJECTED");

/* ------------------------------------------- Member Hold Request expiry */

// Wednesday 19 Aug 2026, 11:30 IST — before the 17:00 cut-off.
const beforeCutOff = new Date("2026-08-19T06:00:00Z");
assert.equal(istDay(holdRequestExpiry(beforeCutOff)), "2026-08-19");
assert.match(formatIst(holdRequestExpiry(beforeCutOff)), /19\/08\/2026 23:59 IST/);

// Same day 18:00 IST — after the cut-off, so it rolls to the next working day.
const afterCutOff = new Date("2026-08-19T12:30:00Z");
assert.equal(istDay(holdRequestExpiry(afterCutOff)), "2026-08-20");

// Saturday after cut-off rolls past Sunday to Monday.
assert.equal(isWorkingDay("2026-08-23", DEFAULT_CALENDAR), false, "Sunday is the configured weekly off");
assert.equal(istDay(holdRequestExpiry(new Date("2026-08-22T12:30:00Z"))), "2026-08-24");
// A request created on the weekly off day expires at the end of the next working day.
assert.equal(istDay(holdRequestExpiry(new Date("2026-08-23T06:00:00Z"))), "2026-08-24");
// Holidays are honoured.
assert.equal(
  istDay(holdRequestExpiry(new Date("2026-08-19T12:30:00Z"), { ...DEFAULT_CALENDAR, holidays: ["2026-08-20"] })),
  "2026-08-21"
);

/* -------------------------------------------------------------- enquiry */

const claims = [
  { enquiryId: "ENQ-2", memberId: "MEM-B", at: new Date("2026-01-02T00:00:00Z") },
  { enquiryId: "ENQ-1", memberId: "MEM-A", at: new Date("2026-01-01T00:00:00Z") },
];
assert.equal(resolveOriginalIntroducer(null, claims).memberId, "MEM-A", "earliest valid claim wins");
assert.equal(
  resolveOriginalIntroducer("MEM-Z", claims).memberId,
  "MEM-Z",
  "a frozen relationship is never silently overwritten"
);
assert.equal(resolveOriginalIntroducer("MEM-Z", claims).frozen, true);
// Exact timestamp tie -> lower Enquiry ID.
const same = new Date("2026-01-01T00:00:00Z");
assert.equal(
  resolveOriginalIntroducer(null, [
    { enquiryId: "ENQ-9", memberId: "MEM-X", at: same },
    { enquiryId: "ENQ-3", memberId: "MEM-Y", at: same },
  ]).memberId,
  "MEM-Y"
);
assert.equal(resolveOriginalIntroducer(null, []).memberId, null);

assert.throws(() => assertIntroducerCorrectionAllowed("CRM", "typo"), /Only Admin or MD/);
assert.throws(() => assertIntroducerCorrectionAllowed("ADMIN", "   "), /compulsory reason/);
assert.doesNotThrow(() => assertIntroducerCorrectionAllowed("MD", "Documented dispute 14/08/2026"));

assert.equal(validateSource("BY_MEMBER", null, null), "Select the Member who sourced this Enquiry.");
assert.equal(validateSource("BY_MEMBER", "MEM-1", null), null);
assert.equal(validateSource("DIRECT", "MEM-1", null), "Source Member applies only to a By Member Enquiry.");
assert.equal(validateSource("DIRECT", null, null), null);

// Plot-wise Enquiries stay separate records.
assert.notEqual(duplicateKey("P1", "PRJ1", "PLT1"), duplicateKey("P1", "PRJ1", "PLT2"));
assert.notEqual(duplicateKey("P1", "PRJ1", null), duplicateKey("P1", "PRJ1", "PLT1"));
assert.equal(duplicateKey("P1", "PRJ1", null), duplicateKey("P1", "PRJ1", null));

assert.equal(enquiryStatusAfterBookingCancelled("BOOKED"), "ACTIVE");
assert.equal(enquiryStatusAfterBookingCancelled("CLOSED"), "CLOSED");

/* ======================================================= Phase 3 — booking */

const bookingDate = new Date("2026-08-19T06:00:00Z"); // 19/08/2026 11:30 IST
const line = (seq: number, percent: string, day: string, got?: string) => ({
  seq,
  scheduledPercent: percent,
  dueDate: new Date(`${day}T06:00:00Z`),
  receivedPercent: got,
});

/* ------------------------------------------------------- payment schedule */

const schedule = [line(1, "30", "2026-08-19"), line(2, "40", "2026-09-19"), line(3, "30", "2026-10-19")];
assert.deepEqual(validateSchedule(schedule, bookingDate), { ok: true });
assert.equal(scheduleTotal(schedule).toFixed(4), "100.0000");

// Exact decimal, not binary float: three thirds plus a hundredth is exactly 100.
assert.deepEqual(
  validateSchedule(
    [line(1, "33.3333", "2026-08-19"), line(2, "33.3333", "2026-09-19"), line(3, "33.3334", "2026-10-19")],
    bookingDate
  ),
  { ok: true }
);

const short = validateSchedule([line(1, "30", "2026-08-19"), line(2, "60", "2026-09-19")], bookingDate);
assert.equal(short.ok, false);
assert.match(short.ok === false ? short.reason : "", /exactly 100%, found 90.0000%/);

assert.equal(validateSchedule([], bookingDate).ok, false);
assert.equal(validateSchedule([line(1, "0", "2026-08-19"), line(2, "100", "2026-09-19")], bookingDate).ok, false);
// No due date before the Booking Date (PRD §11.4).
assert.match(
  asReason(validateSchedule([line(1, "100", "2026-08-18")], bookingDate)),
  /due before the Booking Date/
);
// Due dates stay chronological.
assert.match(
  asReason(validateSchedule([line(1, "50", "2026-10-19"), line(2, "50", "2026-09-19")], bookingDate)),
  /chronological/
);
// A due date on the Booking Date itself is allowed.
assert.deepEqual(validateSchedule([line(1, "100", "2026-08-19")], bookingDate), { ok: true });

/* ------------------------------------------------------- schedule revision */

// Received portions stay locked; only the unpaid remainder may move (PRD §10.2).
const partlyPaid = [line(1, "30", "2026-08-19", "30"), line(2, "40", "2026-09-19"), line(3, "30", "2026-10-19")];

// Splitting and moving the unpaid 70% is allowed.
assert.deepEqual(
  validateScheduleRevision(
    partlyPaid,
    [line(1, "30", "2026-08-19", "30"), line(2, "35", "2026-11-19"), line(3, "35", "2026-12-19")],
    bookingDate
  ),
  { ok: true }
);
// Combining the unpaid portion into one instalment is allowed.
assert.deepEqual(
  validateScheduleRevision(
    partlyPaid,
    [line(1, "30", "2026-08-19", "30"), line(2, "70", "2026-12-19")],
    bookingDate
  ),
  { ok: true }
);
// A part-received instalment may still be reshaped around its receipt: the
// unpaid remainder inside it is exactly what may be moved (PRD §10.2).
const halfPaid = [line(1, "70", "2026-08-19", "40"), line(2, "30", "2026-09-19")];
assert.deepEqual(
  validateScheduleRevision(
    halfPaid,
    [line(1, "40", "2026-08-19", "40"), line(2, "30", "2026-09-19"), line(3, "30", "2026-12-19")],
    bookingDate
  ),
  { ok: true },
  "the unpaid 30% inside a part-received instalment can be moved out"
);
// Its due date may move with the remainder, but never before the Booking Date.
assert.deepEqual(
  validateScheduleRevision(
    partlyPaid,
    [line(1, "30", "2026-08-19", "30"), line(2, "70", "2026-11-19")],
    bookingDate
  ),
  { ok: true }
);
// Scheduling less than what an instalment has received is refused.
assert.match(
  asReason(
    validateScheduleRevision(
      partlyPaid,
      [line(1, "20", "2026-08-19", "30"), line(2, "80", "2026-11-19")],
      bookingDate
    )
  ),
  /credited beyond the percentage it schedules/
);
// A receipt can never be dropped or removed.
assert.match(
  asReason(validateScheduleRevision(partlyPaid, [line(2, "100", "2026-11-19")], bookingDate)),
  /cannot be removed/
);
assert.match(
  asReason(
    validateScheduleRevision(
      partlyPaid,
      [line(1, "30", "2026-08-19"), line(2, "70", "2026-11-19")],
      bookingDate
    )
  ),
  /must be preserved/
);
// Already received + revised unpaid still totals exactly 100%.
assert.match(
  asReason(
    validateScheduleRevision(
      halfPaid,
      [line(1, "40", "2026-08-19", "40"), line(2, "30", "2026-09-19")],
      bookingDate
    )
  ),
  /exactly 100%, found 70.0000%/
);
// Already received + revised unpaid must still total exactly 100%.
assert.match(
  asReason(
    validateScheduleRevision(
      partlyPaid,
      [line(1, "30", "2026-08-19", "30"), line(2, "60", "2026-11-19")],
      bookingDate
    )
  ),
  /exactly 100%/
);

/* --------------------------------------------------- instalment statuses */

// Received only when Remaining is zero — part payment has no separate status.
assert.equal(instalmentStatus(line(1, "30", "2026-08-19", "30")), "RECEIVED");
assert.equal(instalmentStatus(line(1, "30", "2026-08-19", "10"), new Date("2026-08-19T06:00:00Z")), "UPCOMING");
// Overdue starts the day after the due date, not on it.
assert.equal(instalmentStatus(line(1, "30", "2026-08-19"), new Date("2026-08-19T18:29:00Z")), "UPCOMING");
assert.equal(instalmentStatus(line(1, "30", "2026-08-19"), new Date("2026-08-19T18:30:00Z")), "OVERDUE");

/* ------------------------------------------------------ payment allocation */

// Oldest unpaid instalment first, spilling into the next (PRD §12.1).
assert.deepEqual(allocatePayment(schedule, "50").allocations, [
  { seq: 1, percent: "30.0000" },
  { seq: 2, percent: "20.0000" },
]);
// Part payment stops inside the instalment it lands in.
assert.deepEqual(allocatePayment(schedule, "10").allocations, [{ seq: 1, percent: "10.0000" }]);
// A fully received instalment is skipped.
assert.deepEqual(allocatePayment(partlyPaid, "10").allocations, [{ seq: 2, percent: "10.0000" }]);
assert.throws(() => allocatePayment(schedule, "0"), /greater than 0%/);
// PRD §10.4 — no Excess Receipt entry is ever created above 100%.
assert.throws(() => allocatePayment(schedule, "101"), /cannot go above 100%/);
assert.throws(() => allocatePayment(partlyPaid, "71"), /exceeds the outstanding schedule by 1.0000%/);

assert.equal(progressAfter("25", "75").toFixed(4), "100.0000");
assert.throws(() => progressAfter("100", "0.0001"), /cannot go above 100%/);
assert.ok(isPaymentComplete("100") && !isPaymentComplete("99.9999"));

/* ---------------------------------------------------------- ownership shares */

// A single buyer may omit the share and is treated as 100% (PRD §12.1).
assert.deepEqual(validateShares([{ personId: "P1" }]), { ok: true });
assert.deepEqual(validateShares([{ personId: "P1", sharePercent: "100" }]), { ok: true });
assert.equal(validateShares([{ personId: "P1", sharePercent: "60" }]).ok, false);
assert.equal(validateShares([]).ok, false);

// Two or more buyers: every share compulsory, total exactly 100%.
assert.deepEqual(
  validateShares([
    { personId: "P1", sharePercent: "60" },
    { personId: "P2", sharePercent: "40" },
  ]),
  { ok: true }
);
assert.match(
  asReason(
    validateShares([
      { personId: "P1", sharePercent: "60" },
      { personId: "P2", sharePercent: "30" },
    ])
  ),
  /exactly 100%, found 90.0000%/
);
assert.match(
  asReason(validateShares([{ personId: "P1", sharePercent: "60" }, { personId: "P2" }])),
  /Every buyer needs an ownership share/
);

/* --------------------------------------------------------- Accounts decision */

// Accounts may approve at 0%, so Payment Not Received needs a claimed payment.
assert.equal(validateRejectReason("PAYMENT_NOT_RECEIVED", false).ok, false);
assert.match(asReason(validateRejectReason("PAYMENT_NOT_RECEIVED", false)), /Incomplete Details or Other/);
assert.deepEqual(validateRejectReason("PAYMENT_NOT_RECEIVED", true), { ok: true });
assert.deepEqual(validateRejectReason("INCOMPLETE_DETAILS", false), { ok: true });

/* ----------------------------------------------------------- date validation */

const noon = new Date("2026-08-19T06:00:00Z");
assert.deepEqual(notFutureDated("Payment Date", noon, noon), { ok: true });
assert.equal(notFutureDated("Payment Date", new Date("2026-08-20T06:00:00Z"), noon).ok, false);
// Later the same IST day is not a future date.
assert.deepEqual(notFutureDated("Payment Date", new Date("2026-08-19T18:00:00Z"), noon), { ok: true });

assert.deepEqual(validateBookingDate(noon, null, noon), { ok: true });
assert.equal(validateBookingDate(new Date("2026-08-25T06:00:00Z"), "x", noon).ok, false);
assert.match(
  asReason(validateBookingDate(new Date("2026-08-10T06:00:00Z"), "  ", noon)),
  /backdated Booking Date requires a compulsory reason/
);
assert.deepEqual(validateBookingDate(new Date("2026-08-10T06:00:00Z"), "Agreement signed 10/08", noon), {
  ok: true,
});

/* -------------------------------------------------------- external reference */

// Normalised for spaces and case, so these are one and the same reference.
assert.equal(normaliseReference("utr 4471"), "UTR4471");
assert.equal(normaliseReference("  UTR   4471 "), "UTR4471");
assert.equal(normaliseReference("Utr4471"), "UTR4471");
assert.throws(() => normaliseReference("   "), /required/);

/* ------------------------------------------------------------ state machine */

assert.deepEqual(canTransition("REQUEST_PENDING", "BOOKED"), { ok: true });
assert.equal(canTransition("REQUEST_PENDING", "REFUND_PENDING").ok, false);
assert.equal(canTransition("REQUEST_REJECTED", "BOOKED").ok, false, "a rejected request is final");
assert.equal(canTransition("DELIVERED", "BOOKED").ok, false, "Delivered does not reopen through the state machine");
// A reversal below 100% returns Payment Completed to Booked (PRD §12.7).
assert.deepEqual(canTransition("PAYMENT_COMPLETED", "BOOKED"), { ok: true });
// Accounts rejection of a refund restores the exact previous state (PRD §15.4).
assert.deepEqual(canTransition("REFUND_PENDING", "BOOKED"), { ok: true });
assert.deepEqual(canTransition("REFUND_PENDING", "PAYMENT_COMPLETED"), { ok: true });

// Cancel Booking before approval never enters Refund Pending (PRD §9.2).
assert.deepEqual(canTransition("REQUEST_PENDING", "REQUEST_CANCELLED"), { ok: true });
assert.equal(canTransition("REQUEST_PENDING", "CANCELLED").ok, false);
// Cancel Booking after approval does (PRD §9.3).
assert.deepEqual(canTransition("BOOKED", "REFUND_PENDING"), { ok: true });

// Only a live Booking holds the Plot; a rejected or cancelled one releases it.
assert.ok(holdsAllocation("REQUEST_PENDING") && holdsAllocation("BOOKED") && holdsAllocation("REFUND_PENDING"));
assert.ok(!holdsAllocation("REQUEST_REJECTED") && !holdsAllocation("REQUEST_CANCELLED") && !holdsAllocation("CANCELLED"));

assert.deepEqual(assertProcessFree("NONE", "Change Plot"), { ok: true });
const conflict = assertProcessFree("REFUND_PENDING", "Change Plot");
assert.equal(conflict.ok, false);
// The blocked message names the exact process, in the approved wording (DESIGN §4.2).
assert.match(asReason(conflict), /Change Plot is blocked .* already under Refund Pending/);
assert.match(asReason(assertProcessFree("MANAGEMENT_ACTION_REQUIRED", "Buyback")), /Management Action Required/);

/* ------------------------------------------------------------ Hold freezing */

// Submitting freezes the remainder; rejection restores exactly that remainder.
const holdExpiresAt = new Date("2026-08-22T06:00:00Z");
const submittedAt = new Date("2026-08-20T06:00:00Z");
const remaining = freezeHold(holdExpiresAt, submittedAt);
assert.equal(remaining, 48 * 3_600_000);
const decidedAt = new Date("2026-08-21T06:00:00Z");
assert.equal(restoreHold(remaining, decidedAt).toISOString(), "2026-08-23T06:00:00.000Z");
// An already expired Hold restores nothing.
assert.equal(freezeHold(holdExpiresAt, new Date("2026-08-23T06:00:00Z")), 0);

/* ----------------------------------------------------------- review snapshot */

assert.ok(FROZEN_REVIEW_FIELDS.includes("schedule") && FROZEN_REVIEW_FIELDS.includes("soldByType"));
// Key order and Date instances must not make two identical submissions differ.
const snapA = { plotId: "PLT1", bookingDate: new Date("2026-08-19T06:00:00Z"), parties: [{ p: 1, s: "60" }] };
const snapB = { parties: [{ s: "60", p: 1 }], bookingDate: new Date("2026-08-19T06:00:00Z"), plotId: "PLT1" };
assert.ok(!snapshotChanged(snapA, snapB), "canonical snapshots ignore key order");
assert.ok(snapshotChanged(snapA, { ...snapA, plotId: "PLT2" }), "a changed Plot needs a new review version");
assert.equal(
  JSON.stringify(canonicalSnapshot({ b: 1, a: undefined, c: new Date("2026-01-01T00:00:00Z") })),
  '{"b":1,"c":"2026-01-01T00:00:00.000Z"}'
);

/* ==================================================== Phase 4 — commission */

const M_SELLER = "P-SELLER";
const M_INVITER = "P-INVITER";
const M_INTRODUCER = "P-INTRODUCER";
const C_BUYER = "P-BUYER";
const C_CLOSER = "P-CLOSER";

const baseInput = {
  soldByType: "THREE_PERCENT_CLUB" as const,
  soldByPersonId: null as string | null,
  buyerPersonId: C_BUYER,
  buyerIsActiveMember: false,
  buyerHasPriorPurchase: false,
  invite: null,
  inviteOpportunityOpen: true,
  royalty: null,
  royaltyOpportunityOpen: true,
  loyaltySlotsConsumed: 0,
};
const link = (personId: string, position: number) => ({
  beneficiaryPersonId: personId,
  position,
  ratePercent: bandRate(position),
});
const types = (o: ReturnType<typeof generateCommission>) =>
  o.ok ? o.components.map((c) => `${c.type}:${c.percent}@${c.milestonePercent}`) : [`CONFLICT`];

/* ------------------------------------------------------------------ bands */

assert.equal(bandRate(1), "1");
assert.equal(bandRate(3), "1");
assert.equal(bandRate(4), "0.5");
assert.equal(bandRate(6), "0.5");
assert.equal(bandRate(7), "0.25");
assert.equal(bandRate(9), "0.25");
assert.equal(bandRate(10), "0", "after position 9 the band is 0%");
assert.throws(() => bandRate(0));

// Existing positions never renumber; the next one continues past the highest.
assert.equal(nextNetworkPosition([]), 1);
assert.equal(nextNetworkPosition([1, 2, 3]), 4);
assert.equal(nextNetworkPosition([1, 5]), 6, "a gap never gets reused");

/* ------------------------------------------ RD-02 anniversary and counters */

assert.ok(isLeapYear(2024) && isLeapYear(2000));
assert.ok(!isLeapYear(2026) && !isLeapYear(1900));

// A 29 February activation uses 28 February in a non-leap year.
assert.equal(anniversaryDay("2024-02-29", 2026), "2026-02-28");
assert.equal(anniversaryDay("2024-02-29", 2028), "2028-02-29");
assert.equal(anniversaryDay("2024-08-19", 2026), "2026-08-19");

const activation = new Date("2024-02-29T06:00:00Z");
assert.equal(
  counterYearStart(activation, new Date("2026-03-05T06:00:00Z")),
  "2026-02-28",
  "the counter year starts on the fallback anniversary"
);
assert.equal(
  counterYearStart(activation, new Date("2026-02-27T06:00:00Z")),
  "2025-02-28",
  "before the anniversary the previous counter year still runs"
);
assert.ok(counterYearRolled(activation, "2025-02-28", new Date("2026-03-05T06:00:00Z")));
assert.ok(!counterYearRolled(activation, "2026-02-28", new Date("2026-03-05T06:00:00Z")));

/* ------------------------------- main-PRD §25 compatibility matrix, by row */

// Member closes a third-party sale: 3% Direct at 25% + the inviter's band at 100%.
assert.deepEqual(
  types(
    generateCommission({
      ...baseInput,
      soldByType: "MEMBER",
      soldByPersonId: M_SELLER,
      invite: link(M_INVITER, 2),
    })
  ),
  ["DIRECT:3@25", "INVITE:1@100"]
);

// A consumed Invite opportunity yields Direct only.
assert.deepEqual(
  types(
    generateCommission({
      ...baseInput,
      soldByType: "MEMBER",
      soldByPersonId: M_SELLER,
      invite: link(M_INVITER, 2),
      inviteOpportunityOpen: false,
    })
  ),
  ["DIRECT:3@25"]
);

// Past position 9 the band is 0%, so no Invite record is created at all.
assert.deepEqual(
  types(
    generateCommission({
      ...baseInput,
      soldByType: "MEMBER",
      soldByPersonId: M_SELLER,
      invite: link(M_INVITER, 12),
    })
  ),
  ["DIRECT:3@25"]
);

// Active Member buys personally: 3% Direct at 100%, and nothing else. The
// inviting Member's opportunity is deliberately left untouched (main-PRD §14.2).
const selfPurchase = generateCommission({
  ...baseInput,
  soldByType: "MEMBER",
  soldByPersonId: C_BUYER,
  buyerIsActiveMember: true,
  invite: link(M_INVITER, 1),
});
assert.deepEqual(types(selfPurchase), ["DIRECT:3@100"]);

// An Active Member buyer whose Sold By names someone else is a conflict, not a guess.
const misattributed = generateCommission({
  ...baseInput,
  soldByType: "MEMBER",
  soldByPersonId: M_SELLER,
  buyerIsActiveMember: true,
});
assert.equal(misattributed.ok, false);
assert.match(misattributed.ok === false ? misattributed.conflict : "", /Member personal purchase/);

// Customer closes a sale for a different buyer: 1% Loyalty at 100%.
assert.deepEqual(
  types(generateCommission({ ...baseInput, soldByType: "CUSTOMER", soldByPersonId: C_CLOSER })),
  ["LOYALTY:1@100"]
);

// The lifetime limit of three never resets.
assert.deepEqual(
  types(
    generateCommission({
      ...baseInput,
      soldByType: "CUSTOMER",
      soldByPersonId: C_CLOSER,
      loyaltySlotsConsumed: MAX_LOYALTY_SLOTS,
    })
  ),
  [],
  "a fourth Loyalty is never generated"
);

// A Customer cannot close their own purchase as Sold By Customer.
const ownClose = generateCommission({
  ...baseInput,
  soldByType: "CUSTOMER",
  soldByPersonId: C_BUYER,
});
assert.equal(ownClose.ok, false);
assert.match(ownClose.ok === false ? ownClose.conflict : "", /cannot close their own purchase/);

// 3% Club direct, first purchase: nothing at all.
assert.deepEqual(types(generateCommission(baseInput)), []);

// 3% Club direct, repeat purchase: Loyalty for the buyer plus Royalty for the
// Member who originally introduced them — both allowed together (PRD §6.5).
assert.deepEqual(
  types(
    generateCommission({
      ...baseInput,
      buyerHasPriorPurchase: true,
      royalty: link(M_INTRODUCER, 5),
    })
  ),
  ["LOYALTY:1@100", "ROYALTY:0.5@100"]
);

// Royalty is generated only once per introduced Customer.
assert.deepEqual(
  types(
    generateCommission({
      ...baseInput,
      buyerHasPriorPurchase: true,
      royalty: link(M_INTRODUCER, 5),
      royaltyOpportunityOpen: false,
    })
  ),
  ["LOYALTY:1@100"]
);

// A frozen band that disagrees with the table is a data fault, not a silent fix.
assert.throws(
  () =>
    generateCommission({
      ...baseInput,
      soldByType: "MEMBER",
      soldByPersonId: M_SELLER,
      invite: { beneficiaryPersonId: M_INVITER, position: 5, ratePercent: "1" },
    }),
  /frozen rate/
);

/* ------------------------------------------------------- RD-03 the 4% cap */

// 3% Direct + 1% Invite is exactly the cap and is allowed.
const atCap = generateCommission({
  ...baseInput,
  soldByType: "MEMBER",
  soldByPersonId: M_SELLER,
  invite: link(M_INVITER, 1),
});
assert.equal(atCap.ok, true);
assert.equal(atCap.ok === true ? atCap.totalPercent.toFixed(2) : "", "4.00");

// Nothing is ever trimmed to fit: an over-cap combination is reported instead.
assert.equal(checkSaleCap([{ percent: "3" }, { percent: "1" }]).ok, true);
const over = checkSaleCap([{ percent: "3" }, { percent: "1" }, { percent: "1" }]);
assert.equal(over.ok, false);
assert.match(over.ok === false ? over.reason : "", /Commission Conflict — Above 4%/);
assert.equal(checkSaleCap([{ percent: "4.0001" }]).ok, false, "exact decimal, not float");
assert.equal(totalOf([]).toFixed(2), "0.00");

/* ------------------------------------------------------------ eligibility */

const eligibilityBase = {
  type: "DIRECT" as const,
  progressPercent: "100",
  milestonePercent: "25",
  beneficiaryAadhaarAvailable: true,
  beneficiaryBankVerified: true,
  memberStatus: "ACTIVE" as const,
  memberCommissionHold: false,
  reraStatus: "REGISTERED" as const,
  bookingProcess: "NONE" as const,
  acquisitionPaymentPending: false,
  commissionConflictAbove4: false,
};

assert.deepEqual(resolveEligibility(eligibilityBase), { state: "READY", holdReason: null });

// The milestone decides only once the deal-level holds are clear.
assert.equal(
  resolveEligibility({ ...eligibilityBase, progressPercent: "24" }).state,
  "MILESTONE_PENDING"
);
assert.deepEqual(resolveEligibility({ ...eligibilityBase, progressPercent: "25" }).state, "READY");

// Deal-level holds apply whether or not the milestone was reached (PRD §15.3).
assert.deepEqual(
  resolveEligibility({ ...eligibilityBase, progressPercent: "0", bookingProcess: "REFUND_PENDING" }),
  { state: "ON_HOLD", holdReason: "REFUND_PENDING" }
);
assert.equal(
  resolveEligibility({ ...eligibilityBase, bookingProcess: "CHANGE_PLOT_PENDING" }).holdReason,
  "CHANGE_PLOT_PENDING"
);
assert.equal(
  resolveEligibility({ ...eligibilityBase, acquisitionPaymentPending: true }).holdReason,
  "PAYMENT_PENDING"
);

// RD-03 — nothing is Ready while the combination is above 4%.
assert.equal(
  resolveEligibility({ ...eligibilityBase, commissionConflictAbove4: true }).holdReason,
  "COMMISSION_CONFLICT_ABOVE_4"
);

// Member-level holds.
assert.equal(
  resolveEligibility({ ...eligibilityBase, memberStatus: "DEACTIVATED" }).holdReason,
  "MEMBER_DEACTIVATED"
);
assert.equal(
  resolveEligibility({ ...eligibilityBase, memberCommissionHold: true }).holdReason,
  "MEMBER_COMMISSION_HOLD"
);

// Beneficiary conditions. PAN is deliberately absent — it never holds (§14.7).
assert.equal(
  resolveEligibility({ ...eligibilityBase, beneficiaryAadhaarAvailable: false }).holdReason,
  "AADHAAR_PENDING"
);
assert.equal(
  resolveEligibility({ ...eligibilityBase, beneficiaryBankVerified: false }).holdReason,
  "BANK_VERIFICATION_PENDING"
);
assert.equal(resolveEligibility({ ...eligibilityBase, reraStatus: "PENDING" }).holdReason, "RERA_PENDING");
assert.equal(resolveEligibility({ ...eligibilityBase, reraStatus: "EXPIRED" }).holdReason, "RERA_EXPIRED");
// Registered or Not Applicable both satisfy the condition.
assert.equal(resolveEligibility({ ...eligibilityBase, reraStatus: "NOT_APPLICABLE" }).state, "READY");
// RERA is a Member condition; a Customer's Loyalty is never held for it.
assert.equal(
  resolveEligibility({
    ...eligibilityBase,
    type: "LOYALTY",
    milestonePercent: "100",
    memberStatus: null,
    reraStatus: null,
  }).state,
  "READY"
);
assert.equal(
  resolveEligibility({
    ...eligibilityBase,
    type: "LOYALTY",
    milestonePercent: "100",
    memberStatus: "DEACTIVATED",
    reraStatus: "EXPIRED",
  }).state,
  "READY",
  "a Customer's Loyalty does not carry the Member conditions"
);

/* ---------------------------------------------------------- payment states */

assert.deepEqual(canMarkPaid("NOT_PAID", "READY", false), { ok: true });
assert.equal(canMarkPaid("NOT_PAID", "ON_HOLD", false).ok, false);
// Paid Early needs no extra approval and works before Ready (PRD §6.11).
assert.deepEqual(canMarkPaid("NOT_PAID", "MILESTONE_PENDING", true), { ok: true });
assert.equal(canMarkPaid("PAID", "READY", false).ok, false);
assert.match(
  asReason(canMarkPaid("PAID_EARLY", "READY", false)),
  /cannot be marked Paid again/,
  "Paid Early is never paid a second time"
);
assert.equal(canMarkPaid("CANCELLED", "READY", true).ok, false);
assert.equal(canMarkPaid("ACCOUNTS_ADJUSTMENT_REQUIRED", "READY", true).ok, false);

// No second payment task once it is externally processed, and Paid Early is
// excluded from Not Paid totals.
assert.ok(needsPaymentTask("NOT_PAID", "READY"));
assert.ok(!needsPaymentTask("PAID_EARLY", "READY"), "no second task at the normal milestone");
assert.ok(!needsPaymentTask("NOT_PAID", "MILESTONE_PENDING"));
assert.ok(countsAsUnpaid("NOT_PAID") && !countsAsUnpaid("PAID_EARLY"));

// A later change moves an externally processed record to Accounts Adjustment
// Required; an unpaid one simply steps back. Nothing is deleted.
assert.equal(afterAffectingChange("PAID", "MILESTONE_LOST"), "ACCOUNTS_ADJUSTMENT_REQUIRED");
assert.equal(afterAffectingChange("PAID_EARLY", "CANCELLED_BEFORE_COMPLETION"), "ACCOUNTS_ADJUSTMENT_REQUIRED");
assert.equal(afterAffectingChange("NOT_PAID", "MILESTONE_LOST"), "NOT_PAID");
assert.equal(afterAffectingChange("NOT_PAID", "CANCELLED_BEFORE_COMPLETION"), "CANCELLED");
assert.equal(afterAffectingChange("NOT_PAID", "BENEFICIARY_CORRECTED"), "CANCELLED");
assert.equal(afterAffectingChange("CANCELLED", "MILESTONE_LOST"), "CANCELLED");

// PRD §6.1, §6.5 — cancellation before legal completion reopens the slot; a
// completed sale later bought back keeps it consumed.
assert.ok(opportunityReopens(false));
assert.ok(!opportunityReopens(true));

/* ================================================= Phase 5 — acquisition */

/* --------------------------------------------------- approval threshold */

assert.equal(MIN_PAYMENT_GIVEN_FOR_APPROVAL.toFixed(0), "20");
assert.deepEqual(canApproveAcquisition("20"), { ok: true }, "exactly 20% is enough");
assert.deepEqual(canApproveAcquisition("55.5"), { ok: true });
const underThreshold = canApproveAcquisition("19.9999");
assert.equal(underThreshold.ok, false);
assert.match(asReason(underThreshold), /at least 20% Payment Given/);
assert.equal(canApproveAcquisition("0").ok, false);

/* ------------------------------------------------- duplicate detection */

// PRD §11.5 — spaces, punctuation and case are all normalised away.
assert.equal(
  acquisitionDuplicateKey({ propertyName: "Green Valley", location: "Jaipur", propertyNumber: "Plot 12" }),
  acquisitionDuplicateKey({ propertyName: "green  valley", location: "JAIPUR", propertyNumber: "plot-12" }),
  "the same property normalises to the same key"
);
assert.notEqual(
  acquisitionDuplicateKey({ propertyName: "Green Valley", location: "Jaipur", propertyNumber: "12" }),
  acquisitionDuplicateKey({ propertyName: "Green Valley", location: "Jaipur", propertyNumber: "13" })
);
assert.throws(
  () => acquisitionDuplicateKey({ propertyName: "Green Valley", location: "", propertyNumber: "12" }),
  /all required/
);

const dupCandidate = {
  propertyName: "Green Valley",
  location: "Jaipur",
  propertyNumber: "12",
  sellerPersonId: "P-SELLER",
  areaSqFt: "1350",
};
assert.deepEqual(likelyDuplicateReasons(dupCandidate, dupCandidate).length, 5, "every signal matches itself");
assert.deepEqual(
  likelyDuplicateReasons(dupCandidate, { ...dupCandidate, sellerPersonId: "P-OTHER", areaSqFt: "900" }),
  ["same Property/Project Name", "same Location", "same Plot/Property Number"],
  "a different seller and area narrow the warning rather than silencing it"
);
assert.deepEqual(
  likelyDuplicateReasons(dupCandidate, { ...dupCandidate, propertyName: "Blue Ridge", location: "Ajmer", propertyNumber: "9" }),
  ["same Seller", "same Area"]
);

/* ------------------------------------------ approval and cancellation */

// main-PRD §17.6 — Available + RESALE, and Payment Pending while below 100%.
const acqApproved = plotStateAfterAcquisitionApproval("NONE", null, "40");
assert.equal(acqApproved.lifecycle, "AVAILABLE");
assert.equal(acqApproved.isResale, true);
assert.equal(acqApproved.message, PAYMENT_PENDING_MESSAGE);
assert.equal(plotStateAfterAcquisitionApproval("NONE", null, "100").message, null, "no message at 100%");

// PRD §15 — an active restriction still keeps the Plot Not Available, and the
// RESALE tag is independent of availability.
const acqRestricted = plotStateAfterAcquisitionApproval("PLEDGE", "Bank pledge", "100");
assert.equal(acqRestricted.lifecycle, "NOT_AVAILABLE");
assert.equal(acqRestricted.isResale, true, "RESALE is independent of availability");
assert.match(acqRestricted.message!, /Pledge: Bank pledge/);

// PRD §11.4 — with a buyer process the deal cannot simply be acqCancelled.
assert.deepEqual(cancelAcquisition(false), { ok: true });
const blockedCancel = cancelAcquisition(true);
assert.equal(blockedCancel.ok, false);
assert.match(asReason(blockedCancel), /Complete the acquisition or unwind the buyer process/);

const acqCancelled = plotStateAfterAcquisitionCancelled();
assert.equal(acqCancelled.lifecycle, "NOT_AVAILABLE");
assert.equal(acqCancelled.message, DEAL_CANCELLED_MESSAGE);

/* --------------------------- PRD §11.3 Payment Given correction paths */

// Below 20% with no buyer process: the Plot goes Not Available and waits.
const belowNoBuyer = resolvePaymentGivenCorrection({
  previousPercent: "40",
  newPercent: "10",
  hasBuyerProcess: false,
});
assert.equal(belowNoBuyer.plotLifecycle, "NOT_AVAILABLE");
assert.equal(belowNoBuyer.managementActionRequired, false);
assert.match(belowNoBuyer.note, /returns to 20% or the deal is cancelled/);

// Below 20% with a buyer process: nothing is released, management decides.
const belowWithBuyer = resolvePaymentGivenCorrection({
  previousPercent: "40",
  newPercent: "10",
  hasBuyerProcess: true,
});
assert.equal(belowWithBuyer.plotLifecycle, null, "nothing is acqCancelled or released automatically");
assert.equal(belowWithBuyer.managementActionRequired, true);
assert.equal(belowWithBuyer.processMessage, "Management Action Required");

// From 100% to below: Payment Pending again and the Buying Commission steps back.
const fellFromFull = resolvePaymentGivenCorrection({
  previousPercent: "100",
  newPercent: "80",
  hasBuyerProcess: false,
});
assert.equal(fellFromFull.plotLifecycle, null);
assert.equal(fellFromFull.processMessage, PAYMENT_PENDING_MESSAGE);
assert.equal(fellFromFull.buyingCommissionMilestoneLost, true);
assert.equal(fellFromFull.newSaleCommissionOnHold, true);

// A correction that stays above 20% and below 100% is just progress.
const ordinary = resolvePaymentGivenCorrection({
  previousPercent: "60",
  newPercent: "45",
  hasBuyerProcess: false,
});
assert.equal(ordinary.plotLifecycle, null);
assert.equal(ordinary.buyingCommissionMilestoneLost, false);
assert.equal(ordinary.newSaleCommissionOnHold, true, "new-sale commission waits for 100%");

// Reaching 100% clears the pending message entirely.
const givenComplete = resolvePaymentGivenCorrection({
  previousPercent: "60",
  newPercent: "100",
  hasBuyerProcess: false,
});
assert.equal(givenComplete.processMessage, null);
assert.equal(givenComplete.newSaleCommissionOnHold, false);

/* ------------------------------------------------- Buying Commission */

const buying = {
  beneficiaryPersonId: "P-ARRANGER",
  sellerPersonId: "P-SELLER",
  buybackPartyPersonIds: ["P-BUYER", "P-COBUYER"],
  percent: "2",
};
assert.deepEqual(validateBuyingCommission(buying), { ok: true });

// PRD §11.7 — outside the 4% sale cap, so a higher percentage is allowed.
assert.deepEqual(validateBuyingCommission({ ...buying, percent: "6" }), { ok: true });
assert.equal(validateBuyingCommission({ ...buying, percent: "0" }).ok, false);

assert.match(
  asReason(validateBuyingCommission({ ...buying, beneficiaryPersonId: "P-SELLER" })),
  /cannot receive Buying Commission for arranging their own acquisition/
);
assert.match(
  asReason(validateBuyingCommission({ ...buying, beneficiaryPersonId: "P-COBUYER" })),
  /arranging their own return/
);

assert.ok(buyingCommissionMilestoneReached("100"));
assert.ok(!buyingCommissionMilestoneReached("99.9999"));

/* -------------------------------------------------------- Change Plot */

const changePlot = {
  fromProjectId: "PRJ-1",
  toProjectId: "PRJ-1",
  fromPlotId: "PLT-1",
  toPlotId: "PLT-2",
  toPlotLifecycle: "AVAILABLE" as const,
  toPlotRestriction: "NONE" as const,
  heldBySameCustomer: false,
  remark: "Buyer prefers the corner plot.",
};
assert.deepEqual(validateChangePlot(changePlot), { ok: true });

// PRD §5.3 — same Project only.
assert.match(
  asReason(validateChangePlot({ ...changePlot, toProjectId: "PRJ-2" })),
  /same Project only/
);
assert.match(asReason(validateChangePlot({ ...changePlot, remark: "  " })), /compulsory remark/);
assert.match(asReason(validateChangePlot({ ...changePlot, toPlotId: "PLT-1" })), /different Plot/);
assert.match(
  asReason(validateChangePlot({ ...changePlot, toPlotRestriction: "PLEDGE" })),
  /active restriction/
);
assert.match(
  asReason(validateChangePlot({ ...changePlot, toPlotLifecycle: "BOOKED" })),
  /not Available/
);
// The same Customer already holding the replacement may move onto it, and its
// Hold PLC snapshot is the one that carries (PRD §5.3).
assert.deepEqual(
  validateChangePlot({ ...changePlot, toPlotLifecycle: "HOLD", heldBySameCustomer: true }),
  { ok: true }
);
assert.equal(
  validateChangePlot({ ...changePlot, toPlotLifecycle: "HOLD", heldBySameCustomer: false }).ok,
  false,
  "someone else's Hold still blocks it"
);

// PRD §5.3 — the old Plot returns underThreshold its restriction and never gets RESALE.
const returnedPlot = plotStateAfterChangePlot("NONE", null);
assert.equal(returnedPlot.lifecycle, "AVAILABLE");
assert.equal(returnedPlot.isResale, false, "Change Plot adds no RESALE tag");
assert.equal(plotStateAfterChangePlot("NOT_FOR_SALE", "Owner instruction").lifecycle, "NOT_AVAILABLE");

/* =====================================================================
   Phase 6 — Allotment/Registry, Delivered, exports and Person Merge
   ===================================================================== */

const allotment = {
  route: "ALLOTMENT" as const,
  allotmentGiven: true,
  allotmentDate: new Date("2026-03-01"),
  allotmentNumber: "ALT-9001",
  allotmentGivenTo: "Ravi Kumar",
  pattaStatus: "YES" as const,
  pattaDate: new Date("2026-03-05"),
};
const registry = {
  route: "REGISTRY" as const,
  advocateName: "S. Menon",
  registryDate: new Date("2026-03-01"),
};

// PRD §4.2, §4.3 — each route needs its own complete field set.
assert.deepEqual(validateCompletion(allotment), { ok: true });
assert.deepEqual(validateCompletion(registry), { ok: true });
assert.equal(validateCompletion({ ...allotment, allotmentNumber: "  " }).ok, false);
assert.equal(validateCompletion({ ...allotment, allotmentGiven: false }).ok, false);
assert.equal(
  validateCompletion({ ...allotment, pattaStatus: "DONT_KNOW" }).ok,
  false,
  "a Patta Date cannot survive Don't Know"
);
assert.deepEqual(
  validateCompletion({ ...allotment, pattaStatus: "DONT_KNOW", pattaDate: null }),
  { ok: true }
);
assert.equal(validateCompletion({ ...registry, registryDate: null }).ok, false);

// main-PRD §18.2, §18.6 — the completion preconditions.
const buyer = {
  personId: "p1",
  aadhaarRecorded: true,
  dateOfBirth: new Date("1985-07-02"),
  address: "12 Lake Road",
};
const ready = {
  status: "PAYMENT_COMPLETED",
  activeProcess: "NONE",
  paymentReceivedPercent: "100",
  finalBuyers: [buyer],
  alreadyCompleted: false,
};
assert.deepEqual(readyForCompletion(ready), { ok: true });
assert.equal(
  readyForCompletion({ ...ready, paymentReceivedPercent: "99.5" }).ok,
  false,
  "delivery is blocked below 100% Payment Received"
);
assert.equal(readyForCompletion({ ...ready, status: "BOOKED" }).ok, false);
assert.equal(readyForCompletion({ ...ready, activeProcess: "REFUND_PENDING" }).ok, false);
assert.equal(
  readyForCompletion({ ...ready, alreadyCompleted: true }).ok,
  false,
  "Delivered happens once (PRD §4.4)"
);
assert.equal(readyForCompletion({ ...ready, finalBuyers: [] }).ok, false);
assert.equal(
  readyForCompletion({ ...ready, finalBuyers: [{ ...buyer, aadhaarRecorded: false }] }).ok,
  false
);
assert.equal(readyForCompletion({ ...ready, finalBuyers: [{ ...buyer, address: " " }] }).ok, false);

// PRD §12.1 — a single final buyer needs no share; several must total 100%.
assert.deepEqual(validateFinalBuyers([buyer]), { ok: true });
assert.equal(
  validateFinalBuyers([
    { ...buyer, sharePercent: "60" },
    { ...buyer, personId: "p2", sharePercent: "30" },
  ]).ok,
  false,
  "shares must total 100%"
);
assert.deepEqual(
  validateFinalBuyers([
    { ...buyer, sharePercent: "60" },
    { ...buyer, personId: "p2", sharePercent: "40" },
  ]),
  { ok: true }
);

// PRD §4.4 — only MD/Admin reopen a Delivered Booking, always with a reason.
assert.deepEqual(canReopenDelivered("MD", "Recorded against the wrong Plot."), { ok: true });
assert.equal(canReopenDelivered("CRM", "Wrong Plot.").ok, false);
assert.equal(canReopenDelivered("ADMIN", "   ").ok, false);

// PRD §21 — exports stay masked; already-masked columns survive.
assert.deepEqual(
  maskExportRow({
    customer: "Ravi Kumar",
    primaryMobile: "9876543210",
    aadhaarCipher: "xxx",
    aadhaarLastFour: "4471",
    panStatus: "AVAILABLE",
    accountLastFour: "9921",
    ifsc: "HDFC0001234",
    percent: "3.00",
  }),
  {
    customer: "Ravi Kumar",
    primaryMobile: "••••",
    aadhaarCipher: "••••",
    aadhaarLastFour: "4471",
    panStatus: "AVAILABLE",
    accountLastFour: "9921",
    ifsc: "••••",
    percent: "3.00",
  }
);
assert.equal(maskExportRow({ panCipher: null }).panCipher, null, "an absent value stays absent");

// PRD §22 — two Active Members cannot merge; one must be deactivated first.
assert.equal(
  validateMergeRequest(
    { personId: "a", memberStatus: "ACTIVE" },
    { personId: "b", memberStatus: "ACTIVE" }
  ).ok,
  false
);
assert.deepEqual(
  validateMergeRequest(
    { personId: "a", memberStatus: "ACTIVE" },
    { personId: "b", memberStatus: "DEACTIVATED" }
  ),
  { ok: true }
);
assert.equal(validateMergeRequest({ personId: "a" }, { personId: "a" }).ok, false);

// PRD §22 — the Loyalty count is rebuilt from unique qualifying events: the
// same Booking recorded against both identities counts once, and 2 + 2 is not 4.
assert.equal(
  rebuildLoyaltyCount([
    { qualifyingKey: "bk-1" },
    { qualifyingKey: "bk-2" },
    { qualifyingKey: "bk-1" },
    { qualifyingKey: "bk-2" },
  ]),
  2,
  "duplicate events collapse rather than adding up"
);
assert.equal(
  rebuildLoyaltyCount([
    { qualifyingKey: "bk-1" },
    { qualifyingKey: "bk-2" },
    { qualifyingKey: "bk-3" },
    { qualifyingKey: "bk-4" },
  ]),
  3,
  "the rebuilt count is capped at three lifetime slots"
);
assert.equal(rebuildLoyaltyCount([]), 0);

/* ---------------------------- Member experience (derived, never stored) */

// Nothing to show until the Member is activated.
assert.equal(membershipExperience(null), null);
assert.equal(membershipExperience(undefined), null);
// An activation dated in the future is not experience yet.
assert.equal(membershipExperience(new Date("2026-09-01"), new Date("2026-08-21")), null);

// Activated today.
assert.deepEqual(membershipExperience(new Date("2026-08-21"), new Date("2026-08-21")), {
  years: 0,
  months: 0,
  label: "Less than a month",
});

assert.equal(
  membershipExperience(new Date("2025-07-21"), new Date("2026-08-21"))?.label,
  "1 year 1 month",
  "thirteen months reads as one year and one month, singular"
);
assert.equal(
  membershipExperience(new Date("2023-04-10"), new Date("2026-08-21"))?.label,
  "3 years 4 months"
);
assert.equal(
  membershipExperience(new Date("2023-08-21"), new Date("2026-08-21"))?.label,
  "3 years",
  "on the anniversary itself the months are not mentioned"
);
assert.equal(
  membershipExperience(new Date("2026-06-30"), new Date("2026-08-21"))?.label,
  "1 month",
  "a day short of the second month still reads as one"
);

// RD-02 — a 29 February Member gains the year on 28 February in a non-leap
// year, the same day their annual counter rolls. Not a day later.
assert.equal(membershipExperience(new Date("2024-02-29"), new Date("2025-02-28"))?.years, 1);
assert.equal(membershipExperience(new Date("2024-02-29"), new Date("2025-02-27"))?.years, 0);

console.log("domain.check.ts OK");
