// Phase 2 to 6 domain checks — PHASES.md Phase 2-6 "Tests".
// Run: node src/lib/domain/domain.check.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchPeople, personLabel } from "./person-search.ts";
import { capPercent, capShare, percentRoom, percentSum, shareRoom, shareSum } from "./shares.ts";
import { calculateRate, formatRupees, parsePercent } from "./rate-calculator.ts";
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
  displayStatus,
  shortSides,
  greenAreaLabel,
  normaliseLink,
  releaseOnActivation,
  derivedFacing,
  plcComponentLabel,
  plcComponentLabels,
  plcDisplayComponents,
  plotReturnState,
  restrictionBlocksSale,
  validatePlcComponents,
  type PlcComponentRule,
  locationChargeLabel,
  canEditPlotDetails,
  canSetRestriction,
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
import { parseTerms } from "../terms.ts";
import {
  SQ_FT_PER_SQ_M,
  SQ_M_PER_HECTARE,
  SQ_M_PER_SQ_FT,
  isValidStatusStage,
  mapPinError,
  metricViews,
  normaliseJamabandi,
  normaliseMobile,
  normaliseOwners,
  ownerError,
  parseAmount,
  planReopen,
  planStageChange,
  rateError,
  toSquareMetres,
  validateReceivedFrom,
} from "./land-inquiry.ts";
import {
  duplicateKey,
  enquiryStatusAfterBookingCancelled,
  validateSource,
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
  classifyApprovedBooking,
  counterYearRolled,
  counterYearStart,
  countsAsUnpaid,
  cycleAchieved,
  cycleWindow,
  generateCommission,
  isLeapYear,
  experienceSince,
  needsPaymentTask,
  nextNetworkPosition,
  opportunityReopens,
  previewInput,
  qualifyingActivityComplete,
  resolveEligibility,
  totalOf,
  type PersonFacts,
} from "./commission.ts";
import {
  BUYING_CAP_PERCENT,
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
// PRD §23.1 — Plot area is exact to four decimal places.
assert.equal(regular.areaSqFt.toFixed(4), "1350.0000");
assert.equal(regular.areaSqYd.toFixed(4), "150.0000");
assert.equal(regular.areaSqM.toFixed(4), "125.4191");

// Deterministic: the same input always produces the same string.
assert.equal(
  calculateAreas({ kind: "REGULAR", widthFt: "30", lengthFt: "45" }).areaSqM.toFixed(4),
  regular.areaSqM.toFixed(4)
);
// Exact decimal, not binary float: 0.1 + 0.2 style drift must not appear.
assert.equal(calculateAreas({ kind: "REGULAR", widthFt: "0.1", lengthFt: "0.2" }).areaSqFt.toFixed(4), "0.0200");

assert.throws(() => calculateAreas({ kind: "REGULAR", widthFt: "0", lengthFt: "45" }));
assert.throws(
  () => calculateAreas({ kind: "EXACT", exactAreaSqFt: "1200", reason: "  " }),
  /compulsory reason/,
  "an irregular Plot override needs a reason"
);
assert.equal(
  calculateAreas({ kind: "EXACT", exactAreaSqFt: "1234.5678", reason: "Irregular corner" }).areaSqFt.toFixed(4),
  "1234.5678"
);

/* ------------------------------------------------------------------- PLC */

const rules: PlcComponentRule[] = [
  { category: "ROAD_WIDTH", threshold: "60", percent: "5" },
  { category: "ROAD_WIDTH", threshold: "40", percent: "3" },
  { category: "ROAD_WIDTH", threshold: "30", percent: "2" },
  { category: "OPEN_SIDES", threshold: "4", percent: "6" },
  { category: "OPEN_SIDES", threshold: "3", percent: "4" },
  { category: "OPEN_SIDES", threshold: "2", percent: "2" },
  { category: "PARK_FACING", threshold: null, percent: "2" },
  { category: "PLAYGROUND_FACING", threshold: null, percent: "1.5" },
];

// A width lands in the band it reaches, not the one it matches exactly.
const banded = buildPlcSnapshot([{ side: "NORTH", kind: "ROAD", roadWidthFt: "45" }], rules);
assert.equal(banded.components[0].label, "Road 40 ft");
assert.equal(banded.totalPercent.toFixed(4), "3.0000");

// Two Road sides are still one Road charge (PRD §16.3), and the widest decides
// the band — 3% for the road, plus 2% for being open on two sides, never 6%.
const twoRoads = buildPlcSnapshot(
  [
    { side: "NORTH", kind: "ROAD", roadWidthFt: "40" },
    { side: "EAST", kind: "ROAD", roadWidthFt: "30" },
  ],
  rules
);
assert.equal(twoRoads.components.filter((c) => c.category === "ROAD_WIDTH").length, 1);
assert.equal(twoRoads.totalPercent.toFixed(4), "5.0000");

// Three open sides charge Three side open alone; Two side open never rides along.
const threeOpen = buildPlcSnapshot(
  [
    { side: "NORTH", kind: "ROAD", roadWidthFt: "40" },
    { side: "EAST", kind: "ROAD", roadWidthFt: "30" },
    { side: "SOUTH", kind: "PARK" },
    { side: "WEST", kind: "PLOT" },
  ],
  rules
);
const openSides = threeOpen.components.filter((c) => c.category === "OPEN_SIDES");
assert.equal(openSides.length, 1);
assert.equal(openSides[0].label, "Three side open");
// Road 40-59 = 3, Three side open = 4, Park facing = 2.
assert.equal(threeOpen.totalPercent.toFixed(4), "9.0000");

// The snapshot names the sides that qualified (PLC spec §7.1).
assert.match(openSides[0].evidence, /North, East, South open/);
assert.match(threeOpen.components.find((c) => c.category === "PARK_FACING")!.evidence, /South facing/);

// Park and playground are one combined green-area category, charged once.
const both = buildPlcSnapshot(
  [
    { side: "NORTH", kind: "PARK" },
    { side: "SOUTH", kind: "PLAYGROUND" },
  ],
  rules
);
assert.equal(both.totalPercent.toFixed(4), "4.0000"); // 2 open + 2 green area, not 2 + 1.5

// A Project may configure the green area under either category name. Charging
// it depended on the category the rule happened to carry, so a version that
// named only Playground facing charged nothing at all — silently.
const playgroundOnly = buildPlcSnapshot(
  [{ side: "NORTH", kind: "PLAYGROUND" }],
  [{ category: "PLAYGROUND_FACING", threshold: null, percent: "1.5" }]
);
assert.equal(playgroundOnly.totalPercent.toFixed(4), "1.5000");
assert.equal(playgroundOnly.components.length, 1);

// Charged once means the dearer of the two, not whichever the array listed
// first: the order of a configured version must not decide the price.
const greenReversed = buildPlcSnapshot(
  [{ side: "NORTH", kind: "PARK" }],
  [
    { category: "PLAYGROUND_FACING", threshold: null, percent: "1.5" },
    { category: "PARK_FACING", threshold: null, percent: "2" },
  ]
);
assert.equal(greenReversed.totalPercent.toFixed(4), "2.0000");

// An open side is one nothing is built against — a facility leaves it open, and
// Other Land, being land the way a Plot is land, closes it.
const withFacility = buildPlcSnapshot(
  [
    { side: "NORTH", kind: "ROAD", roadWidthFt: "30" },
    { side: "EAST", kind: "PLOT" },
    { side: "SOUTH", kind: "PLOT" },
    { side: "WEST", kind: "FACILITIES" },
  ],
  rules
);
// Road 30-39 = 2, and Road + Facilities = two open sides = 2.
assert.equal(withFacility.totalPercent.toFixed(4), "4.0000");
assert.match(
  withFacility.components.find((c) => c.category === "OPEN_SIDES")!.evidence,
  /North, West open/
);

const withOther = buildPlcSnapshot(
  [
    { side: "NORTH", kind: "ROAD", roadWidthFt: "30" },
    { side: "EAST", kind: "PLOT" },
    { side: "SOUTH", kind: "PLOT" },
    { side: "WEST", kind: "OTHER" },
  ],
  rules
);
// One open side reaches no band, so the Road is the whole charge.
assert.equal(withOther.totalPercent.toFixed(4), "2.0000");
assert.equal(
  withOther.components.find((c) => c.category === "OPEN_SIDES"),
  undefined,
  "Other Land closes its side, so the Road is alone and no band is reached"
);

// A Plot is a Plot whatever its type: Commercial and Informal Sector close a
// side just as a Residential one does, while a facility or utility does not.
const mixedNeighbours = buildPlcSnapshot(
  [
    { side: "NORTH", kind: "ROAD", roadWidthFt: "40" },
    { side: "EAST", kind: "COMMERCIAL" },
    { side: "SOUTH", kind: "PARK" },
    { side: "WEST", kind: "PLOT" },
  ],
  rules
);
const mixedOpen = mixedNeighbours.components.find((c) => c.category === "OPEN_SIDES")!;
assert.equal(mixedOpen.label, "Two side open");
assert.match(mixedOpen.evidence, /North, South open/, "Commercial and Plot both close their side");
// Road 40-59 = 3, Two side open = 2, Park facing = 2.
assert.equal(mixedNeighbours.totalPercent.toFixed(4), "7.0000");

// Test distinct Corner Plot (2.5) vs Two Side Open (2) rules:
const rulesWithCorner: PlcComponentRule[] = [
  ...rules,
  { category: "OPEN_SIDES", threshold: "2.5", percent: "3.5" },
];

const cornerPlot = buildPlcSnapshot(
  [
    { side: "NORTH", kind: "ROAD", roadWidthFt: "30" },
    { side: "EAST", kind: "PLOT" },
    { side: "SOUTH", kind: "PLOT" },
    { side: "WEST", kind: "FACILITIES" },
  ],
  rulesWithCorner
);
assert.equal(cornerPlot.components.find((c) => c.category === "OPEN_SIDES")!.label, "Corner Plot");
assert.equal(cornerPlot.totalPercent.toFixed(4), "5.5000");

const oppositePlot = buildPlcSnapshot(
  [
    { side: "NORTH", kind: "ROAD", roadWidthFt: "30" },
    { side: "EAST", kind: "PLOT" },
    { side: "SOUTH", kind: "ROAD", roadWidthFt: "30" },
    { side: "WEST", kind: "PLOT" },
  ],
  rulesWithCorner
);
assert.equal(oppositePlot.components.find((c) => c.category === "OPEN_SIDES")!.label, "Two side open");
assert.equal(oppositePlot.totalPercent.toFixed(4), "4.0000");

assert.equal(
  buildPlcSnapshot(
    [
      { side: "NORTH", kind: "FACILITIES" },
      { side: "EAST", kind: "PUBLIC_UTILITY" },
      { side: "SOUTH", kind: "INFORMAL_SECTOR" },
      { side: "WEST", kind: "PLOT" },
    ],
    rules
  ).totalPercent.toFixed(4),
  "2.0000",
  "facilities and a utility leave two sides open; the informal-sector Plot does not"
);

// Only neighbouring Plots close a side, so four Plot sides charge nothing.
assert.equal(
  buildPlcSnapshot(
    [
      { side: "NORTH", kind: "PLOT" },
      { side: "EAST", kind: "PLOT" },
      { side: "SOUTH", kind: "PLOT" },
      { side: "WEST", kind: "PLOT" },
    ],
    rules
  ).totalPercent.toFixed(4),
  "0.0000"
);

// A Plot with nothing open evaluates to 0%, and says so rather than failing.
assert.equal(buildPlcSnapshot([{ side: "NORTH", kind: "PLOT" }], rules).totalPercent.toFixed(4), "0.0000");
assert.equal(buildPlcSnapshot([], rules).totalPercent.toFixed(4), "0.0000");

// A road with no width cannot be banded, and guessing is forbidden (§5.3).
assert.throws(
  () => buildPlcSnapshot([{ side: "NORTH", kind: "ROAD" }], rules),
  /no width recorded/,
  "an unmeasured Road blocks rather than falling back"
);

// A version that configures the same band twice must not publish (§5.2).
assert.throws(
  () =>
    validatePlcComponents([
      { category: "ROAD_WIDTH", threshold: "40", percent: "3" },
      { category: "ROAD_WIDTH", threshold: "40", percent: "4" },
    ]),
  /configured twice/
);
assert.throws(() => validatePlcComponents([{ category: "ROAD_WIDTH", percent: "3" }]), /needs a band/);
// Unparseable text is refused by name, not by a raw Decimal error.
assert.throws(
  () => validatePlcComponents([{ category: "ROAD_WIDTH", threshold: ".", percent: "3" }]),
  /invalid band value/
);
assert.throws(
  () => validatePlcComponents([{ category: "PARK_FACING", percent: "abc" }]),
  /invalid percentage/
);
assert.throws(
  () => validatePlcComponents([{ category: "PARK_FACING", threshold: "2", percent: "3" }]),
  /does not take a band/
);
assert.throws(
  () => validatePlcComponents([{ category: "OPEN_SIDES", threshold: "5", percent: "3" }]),
  /Open sides must be 2 \(Two Side Open\), 2.5 \(Corner Plot\), 3 \(Three Side Open\), or 4 \(Four Side Open\)/,
  "a Plot has four sides"
);

// The highest band reads as open-ended; the ones below it read as ranges.
assert.equal(plcComponentLabel("ROAD_WIDTH", "60"), "Road 60 ft");
assert.equal(plcComponentLabel("ROAD_WIDTH", "40"), "Road 40 ft");
assert.equal(plcComponentLabel("OPEN_SIDES", "4"), "Four side open");
// The two green-area rows are named apart now. They still charge once; the
// names exist so a Plot facing a park, a playground, or both can be told apart.
assert.equal(plcComponentLabel("PARK_FACING"), "Park facing");
assert.equal(plcComponentLabel("PLAYGROUND_FACING"), "Playground facing");

// A band being typed is empty, then half-typed, before it is ever a number.
// Labelling is display, not validation: it must describe an incomplete row, not
// throw and take the screen down with it.
assert.equal(plcComponentLabel("ROAD_WIDTH", ""), "Road width — band not set");
assert.equal(plcComponentLabel("ROAD_WIDTH", "."), "Road width — band not set");
assert.equal(plcComponentLabel("ROAD_WIDTH", "-"), "Road width — band not set");
assert.equal(plcComponentLabel("OPEN_SIDES", ""), "Open sides — band not set");
assert.equal(plcComponentLabel("ROAD_WIDTH", "40"), "Road 40 ft");
assert.deepEqual(
  plcComponentLabels([{ category: "ROAD_WIDTH", threshold: "", percent: "" }]),
  ["Road width — band not set"]
);

assert.deepEqual(plcComponentLabels(rules), [
  "Road 60 ft",
  "Road 40 ft",
  "Road 30 ft",
  "Four side open",
  "Three side open",
  "Two side open",
  "Park facing",
  "Playground facing",
]);

// plcComponentLabels maps one label per configured row, which is what an editor
// of the version needs. A reader of the version needs the charges instead: the
// two green-area rows are one line, at the price the snapshot would use.
assert.deepEqual(plcDisplayComponents(rules), [
  { label: "Road 60 ft", percent: "5" },
  { label: "Road 40 ft", percent: "3" },
  { label: "Road 30 ft", percent: "2" },
  { label: "Four side open", percent: "6" },
  { label: "Three side open", percent: "4" },
  { label: "Two side open", percent: "2" },
  // One line, at the price the snapshot would use — and named for both,
  // because this version configures both.
  { label: "Park and Playground facing", percent: "2" },
]);

/* ------------------------------------------------------ terms and privacy */

// The document numbers its own clauses and only sometimes marks them with #,
// so the reader keys off the numbering rather than the hashes.
const parsed = parseTerms(
  [
    "2. Member Terms & Conditions",
    "2.1 Parties and acceptance",
    "These Terms govern the relationship between the Company and the Member.",
    "A person becomes a Member only after:",
    "- The required information is submitted.",
    "- The Company completes its review.",
    "",
    "## 2.5 What a Member may not do",
    "A Member may not approve a Booking.",
    "The Company may allow 3 days for a response.",
  ].join(String.fromCharCode(10))
);

assert.deepEqual(parsed[0], { kind: "heading", level: 1, text: "2. Member Terms & Conditions" });
assert.deepEqual(parsed[1], { kind: "heading", level: 2, text: "2.1 Parties and acceptance" });
// Consecutive prose lines are one paragraph, not one per line.
assert.deepEqual(parsed[2], {
  kind: "paragraph",
  text:
    "These Terms govern the relationship between the Company and the Member. " +
    "A person becomes a Member only after:",
});
assert.deepEqual(
  parsed.find((b) => b.kind === "bullets"),
  { kind: "bullets", items: ["The required information is submitted.", "The Company completes its review."] }
);
// A hashed heading reads the same as an unhashed one.
assert.deepEqual(
  parsed.find((b) => b.kind === "heading" && b.text.startsWith("2.5")),
  { kind: "heading", level: 2, text: "2.5 What a Member may not do" }
);
// A sentence opening with a figure is prose, not a clause number.
assert.ok(
  parsed.some((b) => b.kind === "paragraph" && b.text.includes("3 days")),
  "a sentence beginning with a number is not mistaken for a heading"
);

/* ----------------------------------------------- restriction-aware return */

assert.deepEqual(plotReturnState("NONE"), { status: "AVAILABLE", message: null });
assert.equal(plotReturnState("NOT_FOR_SALE", "Owner instruction").status, "NOT_AVAILABLE");
assert.match(plotReturnState("PLEDGE", "Bank pledge").message!, /Pledge: Bank pledge/);
assert.equal(plotReturnState("NOT_YET_RELEASED").status, "NOT_AVAILABLE");
assert.ok(restrictionBlocksSale("NOT_FOR_SALE") && restrictionBlocksSale("PLEDGE"));
assert.ok(!restrictionBlocksSale("NONE"));

// The same rule governs every return path, so cancellation and Change Plot
// cannot drift apart.
for (const path of ["HOLD_EXPIRY", "BOOKING_REJECTED", "BOOKING_CANCELLED", "CHANGE_PLOT"]) {
  assert.equal(plotReturnState("NONE").status, "AVAILABLE", path);
  assert.equal(plotReturnState("PLEDGE", "r").status, "NOT_AVAILABLE", path);
}

assert.deepEqual(canAllocate("AVAILABLE", "NONE", "ACTIVE"), { ok: true });
assert.equal(canAllocate("AVAILABLE", "PLEDGE", "ACTIVE").ok, false);
assert.equal(canAllocate("HOLD", "NONE", "ACTIVE").ok, false);
assert.equal(canAllocate("BOOKED", "NONE", "ACTIVE").ok, false);

// PRD §16.1 — a Project still in Setup / Not Active accepts no Hold or Booking,
// however Available the Plot looks.
const setup = canAllocate("AVAILABLE", "NONE", "SETUP_NOT_ACTIVE");
assert.equal(setup.ok, false);
// The reason reaches the user verbatim (DESIGN §5.4), so it carries the
// screen wording rather than the enum name (DEVIATIONS D-03).
assert.match(setup.ok === false ? setup.reason : "", /Unreleased/);
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
    ]
  ),
  /North \/ East road facing · Corner · 2 open sides/
);
assert.match(
  derivedFacing([{ side: "NORTH", kind: "PARK" }, { side: "SOUTH", kind: "PLAYGROUND" }]),
  /Park facing · Playground facing · 2 open sides/
);
assert.match(
  derivedFacing([{ side: "NORTH", kind: "OTHER" }, { side: "SOUTH", kind: "PLOT" }]),
  /0 open sides/,
  "Other Land closes its side the way a neighbouring Plot does"
);
assert.match(
  derivedFacing([{ side: "NORTH", kind: "FACILITIES" }, { side: "SOUTH", kind: "PLOT" }]),
  /1 open side/,
  "a facility still leaves the side open"
);

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
assert.match(formatIst(holdRequestExpiry(beforeCutOff)), /19\/08\/2026 11:59 PM/);

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

// CR-001 — an Enquiry no longer resolves anything to freeze, so the only
// attribution left on it is that its Source Person is recorded correctly.
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
// The refusal names what was allowed, not only what was exceeded — a fully
// paid Booking has nothing left, and says so.
assert.throws(() => progressAfter("100", "0.0001"), /cannot exceed the remaining 0\.00%/);
// Payment Received This Time is one payment against what is left, not a fresh
// 100 each time: 30% then 80% is 110% and must be refused, however many
// payments a Booking takes to get there.
assert.equal(progressAfter("30", "70").toFixed(4), "100.0000");
assert.throws(() => progressAfter("30", "80"), /cannot exceed the remaining 70\.00%/);
assert.throws(() => progressAfter("30", "80"), /would take Payment Received to 110\.0000%/);
// Four payments of 40 + 30 + 20 leave 10, and the fourth is measured against
// that — not against a fresh 100.
assert.throws(() => progressAfter("90", "11"), /cannot exceed the remaining 10\.00%/);
assert.equal(progressAfter("90", "10").toFixed(4), "100.0000");
assert.equal(
  ["30", "20", "25", "25"].reduce((t, p) => progressAfter(t, p).toString(), "0"),
  "100"
);
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

/* ------------------------- the Calculator's input, built from two people */

// The wiring the Calculator screen depends on: the Invite band belongs to the
// seller and the Royalty band to the buyer, and crossing them over would pay
// the wrong person at a rate that still looks right.
{
  const facts = (id: string, over: Partial<PersonFacts> = {}): PersonFacts => ({
    id,
    memberActive: false,
    hasPriorPurchase: false,
    invite: null,
    inviteUsed: false,
    royalty: null,
    royaltyUsed: false,
    loyaltyUsed: 0,
    ...over,
  });

  const seller = facts(M_SELLER, { invite: link(M_INVITER, 2), royalty: link("P-WRONG", 1) });
  const buyer = facts(C_BUYER, { royalty: link(M_INTRODUCER, 4), loyaltyUsed: 1 });

  const sale = previewInput("MEMBER", seller, buyer);
  assert.equal(sale.soldByPersonId, M_SELLER);
  assert.equal(sale.invite?.beneficiaryPersonId, M_INVITER, "the seller's inviting Member");
  assert.equal(sale.royalty?.beneficiaryPersonId, M_INTRODUCER, "the buyer's introducing Member");
  assert.equal(sale.loyaltySlotsConsumed, 1, "the buyer's slots, nobody else's");
  assert.equal(sale.inviteOpportunityOpen, true);

  // A Customer close has no invited Member behind it, and Loyalty belongs to
  // the Customer who closed rather than to the buyer (PRD §6.5).
  const closed = previewInput("CUSTOMER", facts(C_CLOSER, { loyaltyUsed: 3 }), buyer);
  assert.equal(closed.invite, null);
  assert.equal(closed.inviteOpportunityOpen, false, "no invited Member, so no open opportunity");
  assert.equal(closed.loyaltySlotsConsumed, 3, "the closing Customer's slots");

  // A 3% Club close names nobody, whatever is left in the picker.
  const direct = previewInput("THREE_PERCENT_CLUB", seller, buyer);
  assert.equal(direct.soldByPersonId, null);
  assert.equal(direct.invite, null);
  assert.equal(direct.loyaltySlotsConsumed, 1, "the buyer's own slots");

  // A consumed opportunity closes, and it is the subject's own that counts.
  assert.equal(
    previewInput("MEMBER", facts(M_SELLER, { inviteUsed: true }), buyer).inviteOpportunityOpen,
    false
  );
  assert.equal(
    previewInput("MEMBER", seller, facts(C_BUYER, { royaltyUsed: true })).royaltyOpportunityOpen,
    false
  );
}

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
  performanceCycleComplete: null as boolean | null,
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

/* ------------------------- AC-01 · classifying an already-approved Booking */

// Approved Changes §1 — an approved Customer Booking stays Customer business
// after the buyer becomes a Member. The rule that recovers a legacy row's
// classification must therefore never be able to answer from today's status.
{
  const APPROVED = new Date("2026-03-01T00:00:00Z");
  const base = {
    earliestDirectRuleVersion: null as string | null,
    hasAnyCommission: false,
    approvedAt: APPROVED as Date | null,
    memberActivationDate: null as Date | null,
  };
  const resolved = (d: ReturnType<typeof classifyApprovedBooking>) => {
    assert.ok(d.resolved, "expected a resolved classification");
    return d;
  };

  // The commission frozen at approval is the engine's own verdict.
  assert.equal(
    resolved(
      classifyApprovedBooking({ ...base, earliestDirectRuleVersion: "DIRECT/SELF_PURCHASE/3%@100" })
    ).classification,
    "MEMBER",
    "a self-purchase Direct means the buyer held an Active Member capability"
  );
  assert.equal(
    resolved(
      classifyApprovedBooking({ ...base, earliestDirectRuleVersion: "DIRECT/THIRD_PARTY/3%@25" })
    ).classification,
    "CUSTOMER",
    "a third-party Direct means they did not"
  );

  // Commission generated with no Direct component at all — a Sold By Customer
  // close, say. An Active Member buyer always produces a Direct, so this is not
  // one, and the rule must not fall through to the dates.
  assert.equal(
    resolved(classifyApprovedBooking({ ...base, hasAnyCommission: true })).classification,
    "CUSTOMER",
    "commission without a Direct component is Customer business"
  );

  // THE CASE THE PACK IS ABOUT. Approved as Customer business; the buyer was
  // activated as a Member afterwards. Recovery must still say CUSTOMER.
  const converted = classifyApprovedBooking({
    ...base,
    earliestDirectRuleVersion: "DIRECT/THIRD_PARTY/3%@25",
    memberActivationDate: new Date("2026-09-01T00:00:00Z"), // six months later
  });
  assert.equal(
    resolved(converted).classification,
    "CUSTOMER",
    "a later Member activation never reclassifies an approved Customer Booking"
  );
  assert.equal(resolved(converted).note, null, "and the two signals agree, so there is no note");

  // A Member who bought and has since been DEACTIVATED. The dates say MEMBER,
  // the commission says CUSTOMER because the engine read the real status. The
  // commission wins, and the disagreement is reported rather than buried.
  const deactivated = classifyApprovedBooking({
    ...base,
    earliestDirectRuleVersion: "DIRECT/THIRD_PARTY/3%@25",
    memberActivationDate: new Date("2025-01-01T00:00:00Z"), // before approval
  });
  assert.equal(resolved(deactivated).classification, "CUSTOMER", "the commission is authoritative");
  assert.match(
    resolved(deactivated).note ?? "",
    /authoritative/,
    "and the date disagreement is surfaced, not silently dropped"
  );

  // No commission at all — a first 3% Club direct purchase earns nothing. The
  // dates answer it, on either side of the approval date.
  assert.equal(
    resolved(classifyApprovedBooking(base)).classification,
    "CUSTOMER",
    "never activated is Customer business, with no date comparison needed"
  );
  assert.equal(
    resolved(
      classifyApprovedBooking({ ...base, memberActivationDate: new Date("2025-01-01T00:00:00Z") })
    ).classification,
    "MEMBER",
    "activated before approval, and nothing to contradict it"
  );
  assert.equal(
    resolved(
      classifyApprovedBooking({ ...base, memberActivationDate: new Date("2026-09-01T00:00:00Z") })
    ).classification,
    "CUSTOMER",
    "activated after approval is Customer business at the time it was approved"
  );

  // Activated on the approval date itself counts as a Member: activation cannot
  // be backdated (main-PRD §7.1), so it genuinely preceded the approval.
  assert.equal(
    resolved(classifyApprovedBooking({ ...base, memberActivationDate: APPROVED })).classification,
    "MEMBER",
    "the boundary is inclusive"
  );

  // Nothing to go on. Reported, never guessed.
  const unknown = classifyApprovedBooking({
    ...base,
    approvedAt: null,
    memberActivationDate: new Date("2025-01-01T00:00:00Z"),
  });
  assert.equal(unknown.resolved, false, "no commission and no approval date cannot be resolved");
  assert.match(
    unknown.resolved === false ? unknown.reason : "",
    /Nothing on the record says/,
    "and it says why rather than defaulting"
  );

  // No approval date but no activation either is still answerable.
  assert.equal(
    resolved(classifyApprovedBooking({ ...base, approvedAt: null })).classification,
    "CUSTOMER",
    "a buyer who was never a Member needs no approval date to classify"
  );
}

/* --------------------------------------- AC-02 · performance cycles */

// A cycle window opens on the anniversary and closes the day before the next
// one, so consecutive windows tile without a gap or an overlap.
{
  const window = cycleWindow(new Date("2024-06-10T00:00:00+05:30"), new Date("2026-08-22T12:00:00+05:30"));
  assert.equal(window.start, "2026-06-10");
  assert.equal(window.end, "2027-06-09");

  // Before the anniversary the transaction still belongs to the previous cycle.
  const earlier = cycleWindow(new Date("2024-06-10T00:00:00+05:30"), new Date("2026-06-09T23:00:00+05:30"));
  assert.equal(earlier.start, "2025-06-10");
  assert.equal(earlier.end, "2026-06-09");

  // RD-02's 29 February rule carries into the cycle, so the cycle and the
  // annual counter roll on the same day rather than a day apart.
  const leap = cycleWindow(new Date("2024-02-29T00:00:00+05:30"), new Date("2027-03-05T12:00:00+05:30"));
  assert.equal(leap.start, "2027-02-28");
}

// Approved Changes §1 — "not simply by recording a transaction". The payment
// milestone records the qualifying activity; PRD §6.3's legal completion
// completes it. Neither half alone is enough.
assert.ok(
  qualifyingActivityComplete({ milestoneReached: true, legallyCompleted: true }),
  "milestone reached and legally completed is complete qualifying activity"
);
assert.ok(
  !qualifyingActivityComplete({ milestoneReached: true, legallyCompleted: false }),
  "100% Payment Received alone is a recorded transaction, not completed activity"
);
assert.ok(
  !qualifyingActivityComplete({ milestoneReached: false, legallyCompleted: true }),
  "legal completion without the milestone is not complete qualifying activity"
);
assert.ok(!qualifyingActivityComplete({ milestoneReached: false, legallyCompleted: false }));

// TC-ROY-001 "satisfy all cycle conditions" against TC-ROY-002 "only part of the
// qualifying conditions are met". A cycle is achieved on all of its qualifying
// activity, never on a subset and never while empty.
assert.ok(!cycleAchieved(0, 0), "an empty cycle is not achieved");
assert.ok(cycleAchieved(1, 1), "one qualifying transaction, completed, is achieved");
assert.ok(!cycleAchieved(2, 1), "half a two-transaction cycle is partial, not achieved");
assert.ok(cycleAchieved(3, 3), "all three completed is achieved");
assert.ok(!cycleAchieved(3, 0), "three recorded and none completed is not achieved");
assert.ok(
  !cycleAchieved(0, 1),
  "a completion count that outran the qualifying count is not treated as achievement"
);

// Royalty holds until its cycle is complete; nothing else is affected by it.
assert.equal(
  resolveEligibility({ ...eligibilityBase, type: "ROYALTY", milestonePercent: "100", performanceCycleComplete: null })
    .holdReason,
  "PERFORMANCE_CYCLE_INCOMPLETE",
  "Royalty with no cycle yet is held, not Ready"
);
assert.equal(
  resolveEligibility({ ...eligibilityBase, type: "ROYALTY", milestonePercent: "100", performanceCycleComplete: false })
    .holdReason,
  "PERFORMANCE_CYCLE_INCOMPLETE",
  "a partially completed cycle holds the Royalty"
);
assert.equal(
  resolveEligibility({ ...eligibilityBase, type: "ROYALTY", milestonePercent: "100", performanceCycleComplete: true })
    .state,
  "READY",
  "a completed cycle releases the Royalty"
);
assert.equal(
  resolveEligibility({ ...eligibilityBase, type: "ROYALTY", progressPercent: "99", milestonePercent: "100" }).state,
  "MILESTONE_PENDING",
  "the milestone is still judged before the cycle"
);
assert.equal(
  resolveEligibility({ ...eligibilityBase, type: "DIRECT", performanceCycleComplete: false }).state,
  "READY",
  "Direct is not a cycle-earned component"
);
assert.equal(
  resolveEligibility({ ...eligibilityBase, type: "ROYALTY", milestonePercent: "100", performanceCycleComplete: true, beneficiaryAadhaarAvailable: false })
    .holdReason,
  "AADHAAR_PENDING",
  "a complete cycle does not skip the beneficiary conditions"
);

/* ---------------------------------------------------------- payment states */

assert.deepEqual(canMarkPaid("NOT_PAID", "READY", false), { ok: true });
assert.equal(canMarkPaid("NOT_PAID", "ON_HOLD", false).ok, false);
// AC-03 — Paid Early works before Ready, but only with a recorded MD approval.
assert.deepEqual(canMarkPaid("NOT_PAID", "MILESTONE_PENDING", true, true), { ok: true });
assert.match(
  asReason(canMarkPaid("NOT_PAID", "MILESTONE_PENDING", true)),
  /requires a recorded MD approval/,
  "Paid Early without approval is refused"
);
assert.equal(
  canMarkPaid("NOT_PAID", "ON_HOLD", true, false).ok,
  false,
  "an unapproved Paid Early is refused whatever the hold reason"
);
assert.deepEqual(
  canMarkPaid("NOT_PAID", "READY", false, false),
  { ok: true },
  "an ordinary Paid needs no MD approval — AC-03 changes Paid Early only"
);
assert.equal(
  canMarkPaid("PAID", "READY", true, true).ok,
  false,
  "an approval never reopens a record that is already Paid"
);
assert.equal(canMarkPaid("PAID", "READY", false).ok, false);
assert.match(
  asReason(canMarkPaid("PAID_EARLY", "READY", false)),
  /cannot be marked Paid again/,
  "Paid Early is never paid a second time"
);
assert.equal(canMarkPaid("CANCELLED", "READY", true, true).ok, false);
assert.equal(canMarkPaid("ACCOUNTS_ADJUSTMENT_REQUIRED", "READY", true, true).ok, false);

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
assert.equal(acqApproved.status, "AVAILABLE");
assert.equal(acqApproved.isResale, true);
assert.equal(acqApproved.message, PAYMENT_PENDING_MESSAGE);
assert.equal(plotStateAfterAcquisitionApproval("NONE", null, "100").message, null, "no message at 100%");

// PRD §15 — an active restriction still keeps the Plot Not Available, and the
// RESALE tag is independent of availability.
const acqRestricted = plotStateAfterAcquisitionApproval("PLEDGE", "Bank pledge", "100");
assert.equal(acqRestricted.status, "NOT_AVAILABLE");
assert.equal(acqRestricted.isResale, true, "RESALE is independent of availability");
assert.match(acqRestricted.message!, /Pledge: Bank pledge/);

// PRD §11.4 — with a buyer process the deal cannot simply be acqCancelled.
assert.deepEqual(cancelAcquisition(false), { ok: true });
const blockedCancel = cancelAcquisition(true);
assert.equal(blockedCancel.ok, false);
assert.match(asReason(blockedCancel), /Complete the acquisition or unwind the buyer process/);

const acqCancelled = plotStateAfterAcquisitionCancelled();
assert.equal(acqCancelled.status, "NOT_AVAILABLE");
assert.equal(acqCancelled.message, DEAL_CANCELLED_MESSAGE);

/* --------------------------- PRD §11.3 Payment Given correction paths */

// Below 20% with no buyer process: the Plot goes Not Available and waits.
const belowNoBuyer = resolvePaymentGivenCorrection({
  previousPercent: "40",
  newPercent: "10",
  hasBuyerProcess: false,
});
assert.equal(belowNoBuyer.plotStatus, "NOT_AVAILABLE");
assert.equal(belowNoBuyer.managementActionRequired, false);
assert.match(belowNoBuyer.note, /returns to 20% or the deal is cancelled/);

// Below 20% with a buyer process: nothing is released, management decides.
const belowWithBuyer = resolvePaymentGivenCorrection({
  previousPercent: "40",
  newPercent: "10",
  hasBuyerProcess: true,
});
assert.equal(belowWithBuyer.plotStatus, null, "nothing is acqCancelled or released automatically");
assert.equal(belowWithBuyer.managementActionRequired, true);
assert.equal(belowWithBuyer.processMessage, "Management Action Required");

// From 100% to below: Payment Pending again and the Buying Commission steps back.
const fellFromFull = resolvePaymentGivenCorrection({
  previousPercent: "100",
  newPercent: "80",
  hasBuyerProcess: false,
});
assert.equal(fellFromFull.plotStatus, null);
assert.equal(fellFromFull.processMessage, PAYMENT_PENDING_MESSAGE);
assert.equal(fellFromFull.buyingCommissionMilestoneLost, true);
assert.equal(fellFromFull.newSaleCommissionOnHold, true);

// A correction that stays above 20% and below 100% is just progress.
const ordinary = resolvePaymentGivenCorrection({
  previousPercent: "60",
  newPercent: "45",
  hasBuyerProcess: false,
});
assert.equal(ordinary.plotStatus, null);
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

// PRD §11.7 — outside the 4% sale cap, so it may sit above 4%.
assert.deepEqual(validateBuyingCommission({ ...buying, percent: "4.5" }), { ok: true });
assert.equal(validateBuyingCommission({ ...buying, percent: "0" }).ok, false);

// AC-04 — but it has a 5% cap of its own, enforced here rather than on a screen.
assert.equal(BUYING_CAP_PERCENT.toFixed(0), "5");
assert.deepEqual(
  validateBuyingCommission({ ...buying, percent: "5" }),
  { ok: true },
  "exactly 5% is inside the cap"
);
assert.match(
  asReason(validateBuyingCommission({ ...buying, percent: "5.0001" })),
  /capped at 5%/,
  "a hair above the cap is refused, judged on exact decimals"
);
assert.match(asReason(validateBuyingCommission({ ...buying, percent: "6" })), /capped at 5%/);
assert.match(asReason(validateBuyingCommission({ ...buying, percent: "100" })), /capped at 5%/);
assert.equal(
  validateBuyingCommission({ ...buying, percent: "-1" }).ok,
  false,
  "a negative percentage is refused before the cap is reached"
);

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
  toPlotStatus: "AVAILABLE" as const,
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
  asReason(validateChangePlot({ ...changePlot, toPlotStatus: "BOOKED" })),
  /not Available/
);
// The same Customer already holding the replacement may move onto it, and its
// Hold PLC snapshot is the one that carries (PRD §5.3).
assert.deepEqual(
  validateChangePlot({ ...changePlot, toPlotStatus: "HOLD", heldBySameCustomer: true }),
  { ok: true }
);
assert.equal(
  validateChangePlot({ ...changePlot, toPlotStatus: "HOLD", heldBySameCustomer: false }).ok,
  false,
  "someone else's Hold still blocks it"
);

// PRD §5.3 — the old Plot returns underThreshold its restriction and never gets RESALE.
const returnedPlot = plotStateAfterChangePlot("NONE", null);
assert.equal(returnedPlot.status, "AVAILABLE");
assert.equal(returnedPlot.isResale, false, "Change Plot adds no RESALE tag");
assert.equal(plotStateAfterChangePlot("NOT_FOR_SALE", "Owner instruction").status, "NOT_AVAILABLE");

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
assert.equal(experienceSince(null), null);
assert.equal(experienceSince(undefined), null);
// An activation dated in the future is not experience yet.
assert.equal(experienceSince(new Date("2026-09-01"), new Date("2026-08-21")), null);

// Activated today.
assert.deepEqual(experienceSince(new Date("2026-08-21"), new Date("2026-08-21")), {
  years: 0,
  months: 0,
  label: "Less than a month",
});

assert.equal(
  experienceSince(new Date("2025-07-21"), new Date("2026-08-21"))?.label,
  "1 year 1 month",
  "thirteen months reads as one year and one month, singular"
);
assert.equal(
  experienceSince(new Date("2023-04-10"), new Date("2026-08-21"))?.label,
  "3 years 4 months"
);
assert.equal(
  experienceSince(new Date("2023-08-21"), new Date("2026-08-21"))?.label,
  "3 years",
  "on the anniversary itself the months are not mentioned"
);
assert.equal(
  experienceSince(new Date("2026-06-30"), new Date("2026-08-21"))?.label,
  "1 month",
  "a day short of the second month still reads as one"
);

// RD-02 — a 29 February Member gains the year on 28 February in a non-leap
// year, the same day their annual counter rolls. Not a day later.
assert.equal(experienceSince(new Date("2024-02-29"), new Date("2025-02-28"))?.years, 1);
assert.equal(experienceSince(new Date("2024-02-29"), new Date("2025-02-27"))?.years, 0);

// PRD §16.1 — activating a Project releases the inventory that was waiting on
// it, and nothing else. The two filters are the whole rule, so both directions
// are worth pinning: what must move, and what must be left exactly as it is.
assert.equal(releaseOnActivation("NOT_AVAILABLE", "NOT_YET_RELEASED"), "RELEASE");
assert.equal(
  releaseOnActivation("NOT_AVAILABLE", "NONE"),
  "RELEASE",
  "a Plot released and put back Not Available goes out again"
);

// Somebody decided these about one Plot. A Project-wide action does not undo them.
assert.equal(releaseOnActivation("NOT_AVAILABLE", "NOT_FOR_SALE"), "RESTRICTED");
assert.equal(releaseOnActivation("NOT_AVAILABLE", "PLEDGE"), "RESTRICTED");

// Anything already in play is untouched, whatever its restriction says.
for (const status of [
  "AVAILABLE",
  "HOLD",
  "WAITING_FOR_BOOKING_APPROVAL",
  "BOOKED",
  "PAYMENT_COMPLETED",
  "REFUND_PENDING",
  "DELIVERED",
] as const) {
  assert.equal(
    releaseOnActivation(status, "NONE"),
    "ALLOCATED",
    `${status} is never rewritten by a Project activation`
  );
}

// The release and the sale gate must agree: every Plot activation makes
// Available has to be one canAllocate then accepts, or the screen offers a Plot
// the next click refuses.
assert.equal(releaseOnActivation("NOT_AVAILABLE", "NOT_YET_RELEASED"), "RELEASE");
assert.deepEqual(canAllocate("AVAILABLE", "NONE", "ACTIVE"), { ok: true });

// The row must not offer what the next click refuses. An Unreleased Project
// blocks every Hold and Booking (canAllocate), so an Available badge inside one
// would be a promise nothing can keep.
assert.deepEqual(displayStatus("AVAILABLE", "SETUP_NOT_ACTIVE"), {
  status: "NOT_AVAILABLE",
  because: "Project is Unreleased",
});
assert.deepEqual(displayStatus("AVAILABLE", "ACTIVE"), {
  status: "AVAILABLE",
  because: null,
});

// Everything else keeps its own word, Unreleased Project or not — those states
// are more specific than "not available" and stay true regardless.
for (const status of ["HOLD", "BOOKED", "DELIVERED", "NOT_AVAILABLE"] as const) {
  assert.equal(
    displayStatus(status, "SETUP_NOT_ACTIVE").status,
    status,
    `${status} is not rewritten by an Unreleased Project`
  );
}

// And the tie between the two: wherever the row still says Available, the sale
// gate must actually agree. This is the pair that would drift apart silently.
for (const projectStatus of ["SETUP_NOT_ACTIVE", "ACTIVE", "SOLD_OUT", "COMPLETED"] as const) {
  const shown = displayStatus("AVAILABLE", projectStatus);
  if (shown.status === "AVAILABLE") {
    assert.equal(
      canAllocate("AVAILABLE", "NONE", projectStatus).ok,
      true,
      `a row reading Available under ${projectStatus} must really be allocatable`
    );
  }
}

// A Project link becomes an href on a page other people open, so the scheme is
// the whole check: javascript: runs on click and data: can carry a document.
assert.equal(normaliseLink("", "Location link"), null, "empty is not a link, it is no link");
assert.equal(normaliseLink(null, "Location link"), null);
assert.equal(normaliseLink("  https://maps.app.goo.gl/x  ", "Location link"), "https://maps.app.goo.gl/x");
assert.equal(normaliseLink("http://example.com/a", "Drive link"), "http://example.com/a");

for (const bad of [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "file:///etc/passwd",
]) {
  assert.throws(() => normaliseLink(bad, "Drive link"), /Drive link/, `${bad} is refused`);
}
// Not a URL at all, which is what a pasted place name looks like.
assert.throws(() => normaliseLink("Ajmer Road, Jaipur", "Location link"), /full link/);

// Park and Playground are one charge with two rows. The rows exist so a Plot's
// own facing can be told apart afterwards; the charge must not double.
assert.equal(greenAreaLabel(true, false), "Park facing");
assert.equal(greenAreaLabel(false, true), "Playground facing");
assert.equal(greenAreaLabel(true, true), "Park and Playground facing");

const greenPair = [
  { category: "PARK_FACING" as const, threshold: null, percent: "5" },
  { category: "PLAYGROUND_FACING" as const, threshold: null, percent: "5" },
];

// One side each, and greenBoth configured: still one charge, named for greenBoth.
const greenBoth = buildPlcSnapshot(
  [
    { side: "NORTH", kind: "PARK" },
    { side: "EAST", kind: "PLAYGROUND" },
  ] as never,
  greenPair
);
assert.equal(greenBoth.components.length, 1, "a Plot facing greenBoth is charged once, not twice");
assert.equal(greenBoth.totalPercent.toString(), "5");
assert.equal(greenBoth.components[0].label, "Park and Playground facing");

// Park only.
const greenParkOnly = buildPlcSnapshot([{ side: "NORTH", kind: "PARK" }] as never, greenPair);
assert.equal(greenParkOnly.components[0].label, "Park facing");
assert.equal(greenParkOnly.totalPercent.toString(), "5");

// Playground only — this could not even be configured before, because
// PLAYGROUND_FACING was missing from PLC_CATEGORY_ORDER and a category absent
// from it is dropped from the snapshot without a word.
const greenPlayOnly = buildPlcSnapshot([{ side: "SOUTH", kind: "PLAYGROUND" }] as never, greenPair);
assert.equal(greenPlayOnly.components[0].label, "Playground facing");
assert.equal(greenPlayOnly.totalPercent.toString(), "5");

// Two park sides are still one charge (plc.md §2.3).
const greenTwoParks = buildPlcSnapshot(
  [
    { side: "NORTH", kind: "PARK" },
    { side: "SOUTH", kind: "PARK" },
  ] as never,
  greenPair
);
assert.equal(greenTwoParks.totalPercent.toString(), "5", "the same category on two sides charges once");

// Compass shorthand is display only — the stored evidence keeps the full word,
// so this has to work on any string the snapshot happens to hold.
assert.equal(shortSides("North, East facing"), "N, E facing");
assert.equal(shortSides("North, South, East, West open"), "N, S, E, W open");
assert.equal(shortSides("2 open sides"), "2 open sides", "nothing to shorten is left alone");
// Only the whole word, or "Northgate Road" would become "Ngate Road".
assert.equal(shortSides("Northgate Road facing"), "Northgate Road facing");
assert.equal(shortSides("Eastern Avenue"), "Eastern Avenue");

/* -------------------------------------- Location Charge for: the catalogue */

const SIDES = ["NORTH", "EAST", "SOUTH", "WEST"] as const;
const open = (...sides: (typeof SIDES)[number][]) =>
  SIDES.map((side) => ({ side, kind: sides.includes(side) ? "ROAD" : "PLOT" }));

assert.deepEqual(locationChargeLabel(open("NORTH") as never), ["NORTH FACING"]);
assert.deepEqual(locationChargeLabel(open("WEST") as never), ["WEST FACING"]);
// Two adjacent sides are a corner, always named North or South first.
assert.deepEqual(locationChargeLabel(open("EAST", "NORTH") as never), ["NORTH-EAST CORNER"]);
assert.deepEqual(locationChargeLabel(open("WEST", "SOUTH") as never), ["SOUTH-WEST CORNER"]);
// Two opposite sides are a through Plot, not a corner.
assert.deepEqual(locationChargeLabel(open("NORTH", "SOUTH") as never), ["NORTH-SOUTH TWO SIDE OPEN"]);
assert.deepEqual(locationChargeLabel(open("EAST", "WEST") as never), ["EAST-WEST TWO SIDE OPEN"]);
// Three open sides are named by the one that is closed.
assert.deepEqual(locationChargeLabel(open("NORTH", "EAST", "SOUTH") as never), [
  "N-E-S THREE SIDE OPEN",
]);
assert.deepEqual(locationChargeLabel(open("EAST", "NORTH", "WEST") as never), [
  "E-N-W THREE SIDE OPEN",
]);
assert.deepEqual(locationChargeLabel(open(...SIDES) as never), ["N-E-S-W FOUR SIDE OPEN"]);
assert.deepEqual(locationChargeLabel(open() as never), ["NO OPEN SIDE"]);

// A green side adds one line and never changes the one above it. Park and
// Playground are two catalogue categories, so each is named for what it is.
assert.deepEqual(
  locationChargeLabel([
    { side: "NORTH", kind: "ROAD" },
    { side: "EAST", kind: "PARK" },
    { side: "SOUTH", kind: "PLOT" },
    { side: "WEST", kind: "PLOT" },
  ] as never),
  ["NORTH-EAST CORNER", "PARK FACING"]
);
assert.deepEqual(
  locationChargeLabel([
    { side: "NORTH", kind: "PLAYGROUND" },
    { side: "EAST", kind: "PLOT" },
    { side: "SOUTH", kind: "PLOT" },
    { side: "WEST", kind: "PLOT" },
  ] as never),
  ["NORTH FACING", "PLAYGROUND FACING"]
);
// A Plot on both keeps both lines, in catalogue order.
assert.deepEqual(
  locationChargeLabel([
    { side: "NORTH", kind: "PARK" },
    { side: "EAST", kind: "PLAYGROUND" },
    { side: "SOUTH", kind: "PLOT" },
    { side: "WEST", kind: "PLOT" },
  ] as never),
  ["NORTH-EAST CORNER", "PARK FACING", "PLAYGROUND FACING"]
);

/*
 * The whole vocabulary, and nothing outside it: every one of the sixteen
 * open/closed combinations, with and without a green side, must land on one of
 * the thirty-one names below — thirty from the catalogue plus the closed Plot.
 */
const CATALOGUE = new Set([
  "NO OPEN SIDE",
  "NORTH FACING",
  "SOUTH FACING",
  "EAST FACING",
  "WEST FACING",
  "NORTH-EAST CORNER",
  "NORTH-WEST CORNER",
  "SOUTH-EAST CORNER",
  "SOUTH-WEST CORNER",
  "NORTH-SOUTH TWO SIDE OPEN",
  "EAST-WEST TWO SIDE OPEN",
  "N-E-S THREE SIDE OPEN",
  "N-W-S THREE SIDE OPEN",
  "E-S-W THREE SIDE OPEN",
  "E-N-W THREE SIDE OPEN",
  "N-E-S-W FOUR SIDE OPEN",
]);
const produced = new Set<string>();
for (let mask = 0; mask < 16; mask++) {
  for (const green of [false, true]) {
    // A green side is an open side, so the park goes on the first side this
    // mask already opens — a Plot closed on all four has no green twin.
    const firstOpen = [0, 1, 2, 3].find((i) => mask & (1 << i));
    const boundaries = SIDES.map((side, i) => ({
      side,
      kind: mask & (1 << i) ? (green && i === firstOpen ? "PARK" : "ROAD") : "PLOT",
    }));
    const lines = locationChargeLabel(boundaries as never);
    assert.ok(CATALOGUE.has(lines[0]), `${lines[0]} is not in the catalogue`);
    if (lines.length > 1) assert.equal(lines[1], "PARK FACING");
    produced.add(lines.join(" / "));
  }
}
assert.equal(produced.size, 31, "fifteen named positions plus the closed Plot, each with a green twin");

/* ------------------------------------------ what a committed Plot still allows */

// Unallocated inventory is the Plot's own to correct.
for (const status of ["NOT_AVAILABLE", "AVAILABLE"] as const) {
  assert.equal(canEditPlotDetails(status), true, `${status} is still editable`);
  assert.equal(canSetRestriction(status), true, `${status} can still be restricted`);
}

// A Hold answers "may this be sold", so a restriction has nothing left to say;
// the Plot's own measurements are still correctable until a Booking freezes them.
assert.equal(canSetRestriction("HOLD"), false, "a held Plot is already allocated");
assert.equal(canEditPlotDetails("HOLD"), true, "a Hold does not freeze the measurements");

// From the submitted request onward the Plot is inside a Booking snapshot.
for (const status of [
  "WAITING_FOR_BOOKING_APPROVAL",
  "BOOKED",
  "PAYMENT_COMPLETED",
  "REFUND_PENDING",
  "DELIVERED",
] as const) {
  assert.equal(canEditPlotDetails(status), false, `${status} freezes the Plot details`);
  assert.equal(canSetRestriction(status), false, `${status} is past restricting`);
}

/* ------------------------------------------------ finding one Person, fast */

// The id leads the label, because that is what staff type in full.
assert.equal(
  personLabel({ fullName: "Samir Sain", primaryMobile: "9876543210", customerId: "CUS-3390" }),
  "CUS-3390 · Samir Sain · 9876543210"
);
// A Person with neither profile is still a name and a number, not a blank.
assert.equal(personLabel({ fullName: "Walk In", mobileMasked: "98****3210" }), "Walk In · 98****3210");
// mobileMasked wins over the raw number when a screen passes both.
assert.equal(
  personLabel({ fullName: "A", mobileMasked: "98****10", primaryMobile: "9876543210" }),
  "A · 98****10"
);

// A field headed Member leads with the Member ID, so typing it ranks the row
// first; a Person who is both still shows both ids either way.
const bothIds = { fullName: "Samir Sain", mobileMasked: "98****10", customerId: "CUS-3390", memberId: "MEM-0012" };
assert.equal(personLabel(bothIds), "CUS-3390 · MEM-0012 · Samir Sain · 98****10");
assert.equal(personLabel(bothIds, "MEMBER"), "MEM-0012 · CUS-3390 · Samir Sain · 98****10");
assert.equal(
  matchPeople([{ id: "b", label: personLabel(bothIds, "MEMBER") }], "mem-0012").length,
  1,
  "a Member ID finds the row it leads"
);

const directory = [
  { id: "1", label: "CUS-0001 · Anita Rao · 98****11" },
  { id: "2", label: "CUS-3390 · Samir Sain · 98****10" },
  { id: "3", label: "MEM-0012 · Sain Enterprises · 98****12" },
];

// Every word must appear, in any order.
assert.deepEqual(matchPeople(directory, "sain 3390").map((o) => o.id), ["2"]);
assert.deepEqual(matchPeople(directory, "3390 sain").map((o) => o.id), ["2"]);
// A word nobody has matches nobody — never "everyone" by accident.
assert.deepEqual(matchPeople(directory, "sain zzz"), []);
// An empty query is the whole list, so opening the picker shows everyone.
assert.equal(matchPeople(directory, "   ").length, 3);

// The id typed in full ranks first even though the name matches two rows.
assert.deepEqual(matchPeople(directory, "sain").map((o) => o.id), ["2", "3"]);
assert.equal(matchPeople(directory, "mem-0012")[0].id, "3", "an id prefix wins the top");
assert.equal(matchPeople(directory, "cus")[0].id, "1", "ties keep the caller's order");

// The cap is a cap, not a filter: nothing below it is lost, only unlisted.
assert.equal(matchPeople(directory, "", 2).length, 2);

/* --------------------------------- a percentage column a form cannot overfill */

// The same rule holds wherever a column of percentages has to reach exactly
// 100 — ownership shares and a Payment Given schedule are the same arithmetic.
assert.equal(percentSum(["25", "75"]), 100);
assert.equal(percentSum(["", "60"]), 60, "a blank counts as nothing");
assert.equal(percentRoom(["25", "75"], 1), 75, "the field being typed frees its own value");
// Typing past the remainder lands on the remainder, so the schedule can never
// be built past 100 in the first place.
assert.equal(capPercent(["60", ""], 1, "80"), "40");
assert.equal(capPercent(["60", ""], 1, "150"), "40");
assert.equal(capPercent(["100", ""], 1, "5"), "0");
assert.equal(capPercent(["25", "75"], 0, "30"), "25", "an instalment cannot grow past the rest");

/* ------------------------------------------- shares a form cannot overfill */

// The total is what a percentage field reads, not what a float holds.
assert.equal(shareSum([{ sharePercent: "33.33" }, { sharePercent: "33.33" }, { sharePercent: "33.34" }]), 100);
assert.equal(shareSum([{ sharePercent: "" }, { sharePercent: "60" }]), 60, "a blank counts as nothing");

// What is left is 100 minus everyone else, never the row's own share.
const two = [{ sharePercent: "60" }, { sharePercent: "40" }];
assert.equal(shareRoom(two, 0), 60, "the row being edited frees its own share");
assert.equal(shareRoom([{ sharePercent: "100" }, { sharePercent: "" }], 1), 0, "nothing left to give");

// Typing past the remainder lands on the remainder, not on a total above 100.
assert.equal(capShare([{ sharePercent: "60" }, { sharePercent: "" }], 1, "80"), "40");
assert.equal(capShare([{ sharePercent: "60" }, { sharePercent: "" }], 1, "25"), "25", "under the cap is untouched");
assert.equal(capShare([{ sharePercent: "100" }, { sharePercent: "" }], 1, "5"), "0");
// Blank stays blank: a sole buyer leaves it empty and is treated as 100%.
assert.equal(capShare([{ sharePercent: "" }], 0, ""), "");
assert.equal(capShare([{ sharePercent: "" }], 0, "  "), "");
// Nonsense and negatives never reach the server as a share.
assert.equal(capShare([{ sharePercent: "" }], 0, "abc"), "");
assert.equal(capShare([{ sharePercent: "" }], 0, "-5"), "0");
// Editing a row down and back up is not blocked by its own old value.
assert.equal(capShare([{ sharePercent: "40" }, { sharePercent: "60" }], 0, "40"), "40");

// However many buyers there are, the cap is still the whole remainder.
const five = [
  { sharePercent: "20" },
  { sharePercent: "20" },
  { sharePercent: "20" },
  { sharePercent: "20" },
  { sharePercent: "" },
];
assert.equal(shareRoom(five, 4), 20, "four at 20% leave 20% for the fifth");
assert.equal(capShare(five, 4, "90"), "20", "the fifth cannot take more than is left");
assert.equal(capShare(five, 4, "20"), "20");
assert.equal(shareSum([...five.slice(0, 4), { sharePercent: "20" }]), 100);
// A sixth buyer added onto a full 100% can only take nothing until room is made.
assert.equal(shareRoom([...five.slice(0, 4), { sharePercent: "20" }, { sharePercent: "" }], 5), 0);


/* ------------------------------------- Plot Rate & Area Calculator */

// The area rule is calculateAreas() and nothing else — the calculator reads
// what it produced rather than deriving a second set of numbers.
{
  const regular = calculateAreas({ kind: "REGULAR", widthFt: "30", lengthFt: "50" });
  assert.equal(regular.areaSqFt.toFixed(2), "1500.00", "30 x 50 ft is 1,500 Sq. Ft.");
  assert.equal(regular.areaSqYd.toFixed(4), "166.6667", "and 166.6667 Sq. Yd.");
  assert.equal(regular.areaSqM.toFixed(2), "139.35", "and 139.35 Sq. M.");

  // A rate per Sq. Ft. uses the Sq. Ft. area, and only that one.
  const perFt = calculateRate({
    rateType: "SQ_FT",
    rate: "2000",
    areaSqFt: regular.areaSqFt,
    areaSqYd: regular.areaSqYd,
  });
  assert.ok(perFt.ok);
  assert.equal(perFt.total.toFixed(2), "3000000.00", "1,500 Sq. Ft. at Rs 2,000");
  assert.equal(formatRupees(perFt.total), "\u20b930,00,000.00", "Indian grouping");

  // A rate per Sq. Yd. uses the Sq. Yd. area. Switching the type switches the
  // area with it — the two are never multiplied together.
  const perYd = calculateRate({
    rateType: "SQ_YD",
    rate: "18000",
    areaSqFt: regular.areaSqFt,
    areaSqYd: regular.areaSqYd,
  });
  assert.ok(perYd.ok);
  assert.equal(perYd.total.toFixed(2), "3000000.60", "166.6667 Sq. Yd. at Rs 18,000");
  assert.notEqual(perFt.total.toString(), perYd.total.toString());
  assert.equal(perFt.unit, "Sq. Ft.");
  assert.equal(perYd.unit, "Sq. Yd.");
}

// Decimal dimensions and a decimal rate both carry through.
{
  const areas = calculateAreas({ kind: "REGULAR", widthFt: "30.25", lengthFt: "20.75" });
  assert.equal(areas.areaSqFt.toFixed(4), "627.6875");
  const out = calculateRate({
    rateType: "SQ_FT",
    rate: "2150.75",
    areaSqFt: areas.areaSqFt,
    areaSqYd: areas.areaSqYd,
  });
  assert.ok(out.ok);
  assert.equal(out.total.toFixed(2), "1349998.89");
}

// An irregular Plot calculates on its approved exact area, and the stored
// width and length are not part of it.
{
  const exact = calculateAreas({
    kind: "EXACT",
    exactAreaSqFt: "1442",
    reason: "Surveyed after the boundary correction.",
  });
  assert.equal(exact.areaSqFt.toFixed(2), "1442.00");
  const out = calculateRate({
    rateType: "SQ_FT",
    rate: "2000",
    areaSqFt: exact.areaSqFt,
    areaSqYd: exact.areaSqYd,
  });
  assert.ok(out.ok);
  assert.equal(out.total.toFixed(2), "2884000.00");
}

// Zero and negative dimensions are refused by the existing area rule, so the
// calculator never gets an area to charge against.
assert.throws(
  () => calculateAreas({ kind: "REGULAR", widthFt: "0", lengthFt: "50" }),
  /greater than zero/
);
assert.throws(
  () => calculateAreas({ kind: "REGULAR", widthFt: "30", lengthFt: "-5" }),
  /greater than zero/
);

// A rate has to be a positive number, and every other shape a number input can
// hold is a refusal with a reason rather than a NaN on the screen.
{
  const area = { areaSqFt: "1500", areaSqYd: "166.6667" };
  const refused = (rate: string) => {
    const out = calculateRate({ rateType: "SQ_FT", rate, ...area });
    assert.equal(out.ok, false, `rate ${JSON.stringify(rate)} must be refused`);
    return out.ok ? "" : out.reason;
  };
  assert.match(refused("0"), /greater than zero/);
  assert.match(refused("-1"), /greater than zero/);
  assert.match(refused("-0.5"), /greater than zero/);
  assert.match(refused(""), /required/);
  assert.match(refused("   "), /required/);
  assert.match(refused("abc"), /must be a number/);
  assert.match(refused("Infinity"), /must be a number/);
  assert.match(refused("-Infinity"), /must be a number/);
  assert.match(refused("NaN"), /must be a number/);

  // 1e400 is not Infinity here: Decimal carries arbitrary precision, so an
  // absurd rate is still an exact number and is allowed to be one.
  const huge = calculateRate({ rateType: "SQ_FT", rate: "1e400", ...area });
  assert.ok(huge.ok, "a very large rate is a number, not an overflow");

  // A Rate Type is required, and nothing else is one.
  const noType = calculateRate({ rateType: "" as never, rate: "2000", ...area });
  assert.equal(noType.ok, false);
  assert.match(noType.ok ? "" : noType.reason, /Rate Type/);

  // No area means no calculation — a Plot with neither dimensions nor an exact
  // area cannot be charged against.
  const noArea = calculateRate({ rateType: "SQ_FT", rate: "2000", areaSqFt: "", areaSqYd: "" });
  assert.equal(noArea.ok, false);
  assert.match(noArea.ok ? "" : noArea.reason, /Area/);
}

// A commission percentage typed by hand on the calculator.
{
  assert.equal(parsePercent("3")?.toString(), "3");
  assert.equal(parsePercent(" 0.25 ")?.toString(), "0.25");
  // Zero is a real band rate — a network position past 9 earns exactly that.
  assert.equal(parsePercent("0")?.toString(), "0");
  assert.equal(parsePercent("100")?.toString(), "100");
  for (const bad of ["", "   ", "abc", "-1", "100.01", "NaN", "Infinity"]) {
    assert.equal(parsePercent(bad), null, `${bad || "blank"} is not a percentage`);
  }
}

// Very large dimensions stay exact rather than drifting into float noise.
{
  const areas = calculateAreas({ kind: "REGULAR", widthFt: "12000", lengthFt: "9500" });
  const out = calculateRate({
    rateType: "SQ_FT",
    rate: "7500",
    areaSqFt: areas.areaSqFt,
    areaSqYd: areas.areaSqYd,
  });
  assert.ok(out.ok);
  assert.equal(out.total.toFixed(2), "855000000000.00");
  assert.equal(formatRupees(out.total), "\u20b98,55,00,00,00,000.00");
}

// Grouping is Indian at every scale, and paise are kept.
assert.equal(formatRupees("0.5"), "\u20b90.50");
assert.equal(formatRupees("999"), "\u20b9999.00");
assert.equal(formatRupees("1000"), "\u20b91,000.00");
assert.equal(formatRupees("100000"), "\u20b91,00,000.00");
assert.equal(formatRupees("30000000"), "\u20b93,00,00,000.00");

/* --------------------------------------------------- land inquiry (spec §32) */

// The source is a discriminated union, and the database CHECK says the same
// thing. Every wrong pairing has to be refused here, or the constraint is the
// first thing that notices.
assert.equal(
  validateReceivedFrom({ receivedFrom: "MEMBER", sourcePersonId: "p1", anotherDealerMobile: null }),
  null
);
assert.match(
  validateReceivedFrom({ receivedFrom: "MEMBER", sourcePersonId: null, anotherDealerMobile: null }) ?? "",
  /Select the Member/
);
assert.match(
  validateReceivedFrom({ receivedFrom: "MEMBER", sourcePersonId: "p1", anotherDealerMobile: "9876543210" }) ?? "",
  /applies only to an Another Dealer/
);
assert.equal(
  validateReceivedFrom({
    receivedFrom: "ANOTHER_DEALER",
    sourcePersonId: null,
    anotherDealerMobile: "+91 98765-43210",
  }),
  null,
  "a dealer mobile is accepted the way people type it"
);
assert.match(
  validateReceivedFrom({
    receivedFrom: "ANOTHER_DEALER",
    sourcePersonId: "p1",
    anotherDealerMobile: "9876543210",
  }) ?? "",
  /never a Person on file/,
  "an Another Dealer inquiry can never carry a Person id"
);
assert.match(
  validateReceivedFrom({ receivedFrom: "ANOTHER_DEALER", sourcePersonId: null, anotherDealerMobile: "12345" }) ?? "",
  /valid 10-digit/
);
assert.equal(
  validateReceivedFrom({
    receivedFrom: "THREE_PERCENT_CLUB",
    sourcePersonId: null,
    anotherDealerMobile: null,
  }),
  null,
  "a 3% Club inquiry is the company's own and names nobody"
);
assert.equal(normaliseMobile("+91 98765 43210"), "9876543210");

// Spec §22 — Working with a Rejected / Closed stage is the one invalid pair.
assert.equal(isValidStatusStage("WORKING", "NEGOTIATION"), true);
assert.equal(isValidStatusStage("CLOSED", "REJECTED_CLOSED"), true);
assert.equal(isValidStatusStage("CLOSED", "APPROVED_FOR_ACQUISITION"), true);
assert.equal(isValidStatusStage("WORKING", "REJECTED_CLOSED"), false);

// Spec §21 — one step forward is ordinary; a skip or a step back is a decision
// and carries its reason. Rejected / Closed takes the Status with it.
{
  const forward = planStageChange({ status: "WORKING", from: "NEW", to: "DOCUMENTS_PENDING", reason: "" });
  assert.ok(forward.ok && forward.nextStatus === "WORKING" && !forward.reasonRequired);

  const skip = planStageChange({ status: "WORKING", from: "NEW", to: "NEGOTIATION", reason: "" });
  assert.ok(!skip.ok && /Skipping a stage/.test(skip.error));
  assert.ok(planStageChange({ status: "WORKING", from: "NEW", to: "NEGOTIATION", reason: "Arrived advanced" }).ok);

  const back = planStageChange({ status: "WORKING", from: "NEGOTIATION", to: "SITE_VISIT", reason: "" });
  assert.ok(!back.ok && /back a stage/.test(back.error));

  const closed = planStageChange({ status: "WORKING", from: "NEW", to: "REJECTED_CLOSED", reason: "Owner withdrew" });
  assert.ok(closed.ok && closed.nextStatus === "CLOSED");
  assert.ok(!planStageChange({ status: "WORKING", from: "NEW", to: "REJECTED_CLOSED", reason: " " }).ok);

  // A Closed inquiry does not move until Admin or MD reopens it.
  assert.ok(!planStageChange({ status: "CLOSED", from: "REJECTED_CLOSED", to: "NEW", reason: "x" }).ok);
}

// Reopening a rejected inquiry has to land on a stage it can actually work at.
assert.ok(!planReopen({ stage: "REJECTED_CLOSED", restoredStage: null, reason: "Owner returned" }).ok);
assert.ok(
  !planReopen({ stage: "REJECTED_CLOSED", restoredStage: "REJECTED_CLOSED", reason: "Owner returned" }).ok
);
assert.ok(planReopen({ stage: "REJECTED_CLOSED", restoredStage: "NEGOTIATION", reason: "Owner returned" }).ok);
assert.ok(!planReopen({ stage: "REJECTED_CLOSED", restoredStage: "NEW", reason: "  " }).ok);

// Spec §11 — the metric conversions are the exact published factors, and there
// is deliberately no Bigha or Biswa conversion anywhere in this module: the
// Rajasthan Land Revenue rules publish different equivalents per district, so
// one statewide factor would silently restate what an owner said.
assert.equal(SQ_M_PER_HECTARE, 10000);
assert.equal(SQ_M_PER_SQ_FT, 0.09290304);
assert.equal(SQ_FT_PER_SQ_M, 10.763910416709722);
assert.equal(toSquareMetres(1, "HECTARE"), 10000);
assert.equal(toSquareMetres(1, "SQ_M"), 1);
assert.equal(toSquareMetres(1, "SQ_FT"), 0.09290304);
assert.equal(metricViews(10000).hectare, 1);
assert.ok(Math.abs(metricViews(1).sqFt - 10.763910416709722) < 1e-12);
// Round trip: a square-foot entry comes back as the same square feet.
assert.ok(Math.abs(metricViews(toSquareMetres(1000, "SQ_FT")).sqFt - 1000) < 1e-9);
{
  const source = readFileSync(new URL("./land-inquiry.ts", import.meta.url), "utf8");
  assert.ok(
    !/BIGHA_|SQ_M_PER_BIGHA|bighaToSq/i.test(source),
    "no universal Bigha conversion exists — Rajasthan publishes different equivalents per district"
  );
}

// Spec §16 — a rate needs its basis and a basis needs its rate.
assert.equal(rateError([{ value: "5000", basis: "PER_SQ_FT", label: "Owner Asking Rate" }]), null);
assert.match(
  rateError([{ value: "5000", basis: null, label: "Owner Asking Rate" }]) ?? "",
  /needs a rate basis/
);
assert.match(
  rateError([{ value: "", basis: "PER_BIGHA", label: "DLC Rate" }]) ?? "",
  /basis but no rate/
);
assert.match(
  rateError([{ value: "0", basis: "TOTAL", label: "DLC Rate" }]) ?? "",
  /positive amount/
);
assert.equal(rateError([{ value: null, basis: null, label: "DLC Rate" }]), null);
assert.equal(parseAmount("1,25,00,000"), "12500000", "Indian grouping in, plain decimal out");

// Spec §8 — the first owner is Primary, exactly one is, and a removed Primary
// promotes the earliest one left.
{
  const owners = normaliseOwners([
    { ownerName: " Ram Lal ", mobile: "+91 98765 43210", isPrimary: false },
    { ownerName: "Sita Devi", mobile: "", isPrimary: false },
    { ownerName: "   ", mobile: "", isPrimary: false },
  ]);
  assert.equal(owners.length, 2, "a blank owner row is dropped, not rejected");
  assert.deepEqual(owners.map((o) => o.isPrimary), [true, false]);
  assert.equal(owners[0].ownerName, "Ram Lal");
  assert.equal(owners[0].mobile, "9876543210");
  assert.equal(owners[1].mobile, null, "an owner mobile is optional");
  assert.equal(normaliseOwners([]).length, 0, "zero owners is a valid partial inquiry");

  const promoted = normaliseOwners([
    { ownerName: "A", mobile: null, isPrimary: false },
    { ownerName: "B", mobile: null, isPrimary: true },
  ]);
  assert.deepEqual(promoted.map((o) => o.isPrimary), [false, true], "a chosen Primary is kept");
}
assert.match(
  ownerError([{ ownerName: "Ram", mobile: "12345", isPrimary: true }]) ?? "",
  /invalid mobile/
);

// Spec §10 — an all-blank Jamabandi row records nothing and never persists.
assert.equal(
  normaliseJamabandi([
    { murbbaNo: " ", patwarNo: "", khasraNo: "" },
    { murbbaNo: "", patwarNo: "", khasraNo: " 145/2 " },
  ]).length,
  1
);
assert.equal(
  normaliseJamabandi([{ murbbaNo: "", patwarNo: "", khasraNo: "145/2" }])[0].khasraNo,
  "145/2"
);

// A map pin is a pair or it is nothing.
assert.equal(mapPinError("", ""), null);
assert.match(mapPinError("26.9124", "") ?? "", /both latitude and longitude/);
assert.match(mapPinError("95", "75.7873") ?? "", /Latitude/);
assert.match(mapPinError("26.9124", "200") ?? "", /Longitude/);
assert.equal(mapPinError("26.9124", "75.7873"), null);

console.log("domain.check.ts OK");
