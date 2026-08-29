// A demo Project you can actually walk through — one Project, ten Plots, and a
// spread of the states the CRM can put them in.
// Run: npm run demo
//
// Every record here is made through the same services the screens call:
// prepareInventory, createHold, submitBookingRequest, decideBookingRequest,
// confirmPaymentReceived, recordFinalBuyers, recordCompletion. Writing the rows
// directly would be shorter and would produce a database the application itself
// could never have produced — no PLC snapshot frozen against the Booking, no
// review version, no commission, no loyalty slot, no audit trail. The point of
// demo data is that it behaves like real data.
//
// Re-runnable: it clears its own Project first and rebuilds. It touches nothing
// outside the SRG Project, so the seeded staff, Members and Green Acres stay.
import { PrismaClient } from "@prisma/client";
import {
  aadhaarLastFour,
  blindIndex,
  encryptSensitive,
  maskPan,
  normaliseAadhaar,
  normalisePan,
} from "@/lib/security/identity";
import { prepareInventory, makeAvailable, setRestriction } from "@/lib/services/inventory-service";
import { createHold } from "@/lib/services/hold-service";
import { submitBookingRequest, decideBookingRequest } from "@/lib/services/booking-service";
import { confirmPaymentReceived } from "@/lib/services/payment-service";
import { recordFinalBuyers, recordCompletion } from "@/lib/services/completion-service";
import { activateMember } from "@/lib/services/network-service";
import { createEnquiry } from "@/lib/services/enquiry-service";
import { createAcquisition, confirmPaymentGiven } from "@/lib/services/acquisition-service";

const db = new PrismaClient();

const CODE = "SRG";
const MD = "STF-0001";
const ADMIN = "STF-0002";
/** CRM submits, Accounts decides — never the same account on both sides. */
const ACC = "STF-0003";
const CRM = "STF-0005";

let seq = 0;
const key = () => `DEMO-${Date.now()}-${seq++}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const today = new Date();

/* --------------------------------------------------------------- people */

const BUYERS = [
  { name: "Ramesh Agarwal", mobile: "9811100001", city: "Jaipur" },
  { name: "Sunita Devi", mobile: "9811100002", city: "Jaipur" },
  { name: "Imran Qureshi", mobile: "9811100003", city: "Ajmer" },
  { name: "Lakshmi Menon", mobile: "9811100004", city: "Jaipur" },
  // The Booking that reaches Delivered — a final buyer cannot be recorded
  // without an Aadhaar, so this one carries identity documents.
  {
    name: "Harpreet Singh",
    mobile: "9811100005",
    city: "Sikar",
    aadhaar: "411122223333",
    pan: "AXQPS4412M",
  },
  { name: "Neha Bansal", mobile: "9811100006", city: "Jaipur" },
];

const MEMBERS = [
  { name: "Vikas Chandra", mobile: "9822200001", city: "Jaipur" },
  { name: "Pooja Saxena", mobile: "9822200002", city: "Jaipur" },
];

type Human = { name: string; mobile: string; city: string; aadhaar?: string; pan?: string };

async function person(p: Human) {
  const data = {
    fullName: p.name,
    city: p.city,
    ...(p.aadhaar
      ? {
          aadhaarCipher: encryptSensitive(normaliseAadhaar(p.aadhaar)),
          aadhaarLastFour: aadhaarLastFour(p.aadhaar),
          aadhaarBlindIndex: blindIndex(normaliseAadhaar(p.aadhaar)),
          aadhaarStatus: "AVAILABLE" as const,
        }
      : {}),
    ...(p.pan
      ? {
          panCipher: encryptSensitive(normalisePan(p.pan)),
          panMasked: maskPan(p.pan),
          panBlindIndex: blindIndex(normalisePan(p.pan)),
          panStatus: "AVAILABLE" as const,
        }
      : {}),
  };
  const existing = await db.person.findFirst({ where: { primaryMobile: p.mobile } });
  return existing
    ? db.person.update({ where: { id: existing.id }, data })
    : db.person.create({ data: { ...data, primaryMobile: p.mobile } });
}

/* ---------------------------------------------------------------- plots */

/**
 * Ten Plots whose sides between them produce most of the Location Charge
 * catalogue: a single facing, both kinds of two-side, corners, three-side,
 * four-side, and park-facing twins of several.
 */
const PLOTS = [
  {
    number: "S-01",
    width: "30",
    length: "50",
    sides: { NORTH: "ROAD:40", EAST: "PLOT", SOUTH: "PLOT", WEST: "PLOT" },
  },
  {
    number: "S-02",
    width: "30",
    length: "50",
    sides: { NORTH: "ROAD:60", EAST: "ROAD:30", SOUTH: "PLOT", WEST: "PLOT" },
  },
  {
    number: "S-03",
    width: "25",
    length: "40",
    sides: { NORTH: "PLOT", EAST: "PARK", SOUTH: "ROAD:30", WEST: "PLOT" },
  },
  {
    number: "S-04",
    width: "30",
    length: "45",
    sides: { NORTH: "ROAD:40", EAST: "PLOT", SOUTH: "ROAD:30", WEST: "PLOT" },
  },
  {
    number: "S-05",
    width: "35",
    length: "55",
    sides: { NORTH: "ROAD:60", EAST: "ROAD:40", SOUTH: "PARK", WEST: "PLOT" },
  },
  {
    number: "S-06",
    width: "30",
    length: "45",
    sides: { NORTH: "PLOT", EAST: "PLOT", SOUTH: "PLOT", WEST: "ROAD:30" },
  },
  {
    number: "S-07",
    width: "40",
    length: "60",
    sides: { NORTH: "ROAD:60", EAST: "ROAD:40", SOUTH: "ROAD:30", WEST: "ROAD:30" },
  },
  {
    number: "S-08",
    width: "25",
    length: "45",
    sides: { NORTH: "PLOT", EAST: "ROAD:40", SOUTH: "PLOT", WEST: "PLAYGROUND" },
  },
  {
    number: "S-09",
    width: "30",
    length: "50",
    sides: { NORTH: "ROAD:40", EAST: "PLOT", SOUTH: "PLOT", WEST: "ROAD:30" },
  },
  {
    number: "S-10",
    width: "30",
    length: "50",
    sides: { NORTH: "PLOT", EAST: "PLOT", SOUTH: "ROAD:60", WEST: "PARK" },
  },
];

function boundariesOf(sides: Record<string, string>) {
  return Object.entries(sides).map(([side, spec]) => {
    const [kind, width] = spec.split(":");
    return {
      side: side as "NORTH",
      kind: kind as "ROAD",
      ...(width ? { roadWidthFt: width } : {}),
    };
  });
}

/** 30 / 40 / 30 across three months, totalling exactly 100%. */
const SCHEDULE = [
  { seq: 1, percent: "30", dueDate: today },
  { seq: 2, percent: "40", dueDate: day(30) },
  { seq: 3, percent: "30", dueDate: day(60) },
];

/* ----------------------------------------------------------------- main */

/** A Task carries its own events, and they hold it in place. */
async function dropTasks(recordKind: string, recordIds: string[]) {
  if (recordIds.length === 0) return;
  const ids = (
    await db.task.findMany({ where: { recordKind, recordId: { in: recordIds } }, select: { id: true } })
  ).map((t) => t.id);
  if (ids.length === 0) return;
  await db.taskEvent.deleteMany({ where: { taskId: { in: ids } } });
  await db.task.deleteMany({ where: { id: { in: ids } } });
}

async function wipe() {
  const project = await db.project.findUnique({ where: { projectCode: CODE } });
  if (!project) return;

  // Children first: the demo owns this Project entirely, so everything hanging
  // off it goes with it and nothing outside it is touched.
  const bookings = await db.booking.findMany({
    where: { projectId: project.id },
    select: { id: true },
  });
  const ids = bookings.map((b) => b.id);
  if (ids.length) {
    await db.commissionEvent.deleteMany({ where: { record: { bookingId: { in: ids } } } });
    await db.commissionRecord.deleteMany({ where: { bookingId: { in: ids } } });
    await db.bookingEvent.deleteMany({ where: { bookingId: { in: ids } } });
    await db.bookingParty.deleteMany({ where: { bookingId: { in: ids } } });
    await db.bookingReviewVersion.deleteMany({ where: { bookingId: { in: ids } } });
    await db.bookingCompletion.deleteMany({ where: { bookingId: { in: ids } } });
    await db.paymentReceivedEntry.deleteMany({ where: { bookingId: { in: ids } } });
    // The version goes and its instalments cascade with it. Deleting the
    // instalments on their own trips the "a schedule totals 100%" constraint,
    // which is exactly what that constraint is there to do.
    await db.paymentScheduleVersion.deleteMany({ where: { bookingId: { in: ids } } });
    await db.primaryCustomerChange.deleteMany({ where: { bookingId: { in: ids } } });
    await db.soldByCorrection.deleteMany({ where: { bookingId: { in: ids } } });
    await db.cancellationRequest.deleteMany({ where: { bookingId: { in: ids } } });
    await db.changePlotRequest.deleteMany({ where: { bookingId: { in: ids } } });
    // Tasks point at a record by kind and id, not by a relation. The kind is
    // "Booking", not "BOOKING": the wrong case matched nothing and left every
    // previous run's tasks behind, pointing at Bookings that no longer existed.
    await dropTasks("Booking", ids);
  }
  const plotIds = (
    await db.plot.findMany({ where: { projectId: project.id }, select: { id: true } })
  ).map((p) => p.id);

  // A Buyback holds the Plot, so it has to go before the Plot does — and one
  // active acquisition per Plot means a leftover blocks the next run outright.
  const acqIds = (
    await db.acquisition.findMany({ where: { plotId: { in: plotIds } }, select: { id: true } })
  ).map((a) => a.id);
  if (acqIds.length) {
    await db.commissionEvent.deleteMany({
      where: { record: { acquisitionId: { in: acqIds } } },
    });
    await db.commissionRecord.deleteMany({ where: { acquisitionId: { in: acqIds } } });
    await db.paymentGivenEntry.deleteMany({ where: { acquisitionId: { in: acqIds } } });
    await db.paymentScheduleVersion.deleteMany({ where: { acquisitionId: { in: acqIds } } });
    await db.acquisitionEvent.deleteMany({ where: { acquisitionId: { in: acqIds } } });
    await dropTasks("Acquisition", acqIds);
    await db.acquisition.deleteMany({ where: { id: { in: acqIds } } });
  }

  const enquiryIds = (
    await db.enquiry.findMany({ where: { projectId: project.id }, select: { id: true } })
  ).map((e) => e.id);
  await dropTasks("Enquiry", enquiryIds);
  await db.enquiryFollowUp.deleteMany({ where: { enquiry: { projectId: project.id } } });
  await db.enquiry.deleteMany({ where: { projectId: project.id } });
  await db.booking.deleteMany({ where: { projectId: project.id } });
  await db.holdExtensionRequest.deleteMany({ where: { hold: { plotId: { in: plotIds } } } });
  await db.hold.deleteMany({ where: { plotId: { in: plotIds } } });
  await db.holdRequest.deleteMany({ where: { plotId: { in: plotIds } } });
  await db.plotEvent.deleteMany({ where: { plotId: { in: plotIds } } });
  await db.plcSnapshot.deleteMany({ where: { plotId: { in: plotIds } } });
  await db.plotBoundary.deleteMany({ where: { plotId: { in: plotIds } } });
  await dropTasks("Plot", plotIds);
  await db.plot.deleteMany({ where: { projectId: project.id } });
  await db.plcComponent.deleteMany({ where: { ruleVersion: { projectId: project.id } } });
  await db.plcRuleVersion.deleteMany({ where: { projectId: project.id } });
  await db.project.delete({ where: { id: project.id } });

  // Payment references are unique across the whole system and outlive the
  // Project, so the demo's own have to go with it or the next run collides.
  await db.externalReference.deleteMany({ where: { normalisedKey: { startsWith: "UTR-SRG-" } } });
}

async function main() {
  await wipe();

  /* ------------------------------------------------- Project and its PLC */

  const project = await db.project.create({
    data: {
      projectCode: CODE,
      name: "Sunrise Greens",
      developer: "Thirty Milestones LLP",
      location: "Ajmer Road",
      city: "Jaipur",
      type: "RESIDENTIAL",
      status: "ACTIVE",
    },
  });

  await db.plcRuleVersion.create({
    data: {
      projectId: project.id,
      version: 1,
      status: "PUBLISHED",
      effectiveFrom: new Date(),
      publishedAt: new Date(),
      reason: "Demo configuration",
      components: {
        create: [
          { category: "ROAD_WIDTH", threshold: "60.00", percent: "5.0000" },
          { category: "ROAD_WIDTH", threshold: "40.00", percent: "3.0000" },
          { category: "ROAD_WIDTH", threshold: "30.00", percent: "2.0000" },
          { category: "OPEN_SIDES", threshold: "4.00", percent: "6.0000" },
          { category: "OPEN_SIDES", threshold: "3.00", percent: "4.0000" },
          { category: "OPEN_SIDES", threshold: "2.50", percent: "3.0000" },
          { category: "OPEN_SIDES", threshold: "2.00", percent: "2.0000" },
          { category: "PARK_FACING", threshold: null, percent: "2.0000" },
          { category: "PLAYGROUND_FACING", threshold: null, percent: "2.0000" },
        ],
      },
    },
  });

  /* ----------------------------------------------------- ten Plots, once */

  await prepareInventory({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    projectId: project.id,
    rows: PLOTS.map((p) => ({
      plotNumber: p.number,
      plotType: "RESIDENTIAL" as const,
      widthFt: p.width,
      lengthFt: p.length,
      boundaries: boundariesOf(p.sides),
    })),
  });

  const plots = Object.fromEntries(
    (await db.plot.findMany({ where: { projectId: project.id } })).map((p) => [p.plotNumber, p])
  );

  // prepareInventory lands every Plot Not Available. Eight are released; S-09
  // stays unreleased and S-10 is pledged, so the list shows both reasons a Plot
  // can sit outside the market.
  for (const number of ["S-01", "S-02", "S-03", "S-04", "S-05", "S-06", "S-07", "S-08"]) {
    await makeAvailable({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      plotId: plots[number].id,
      reason: "Released for sale",
    });
  }

  await setRestriction({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    plotId: plots["S-10"].id,
    restriction: "PLEDGE",
    reason: "Pledged against the development loan",
  });

  /* --------------------------------------------------- Members and buyers */

  const memberPeople = [];
  for (const m of MEMBERS) memberPeople.push(await person(m));

  /**
   * Activation cannot be repeated, and this script can be. So an already
   * activated Member is left alone rather than re-activated — the Network
   * position, the loyalty slots and the activation date are all history by
   * then, and history is not something a demo rebuild should rewrite.
   */
  async function member(
    personId: string,
    rera: Parameters<typeof activateMember>[0],
    invitedBy?: string
  ) {
    const existing = await db.memberProfile.findFirst({ where: { personId } });
    if (existing?.activationDate) return existing;
    await activateMember({ ...rera, personId, invitedByMemberId: invitedBy ?? null });
    return db.memberProfile.findFirstOrThrow({ where: { personId } });
  }

  const vikas = await member(memberPeople[0].id, {
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    personId: memberPeople[0].id,
    reraStatus: "REGISTERED",
    reraNumber: "RAJ/A/2026/0001",
    reraExpiryDate: day(400),
  });
  // Introduced by the first Member, so the Network has a second level.
  // invitedByMemberId is the profile's own id, not the MEM-#### it displays.
  await member(
    memberPeople[1].id,
    {
      idempotencyKey: key(),
      actorRef: MD,
      actorRole: "MD",
      personId: memberPeople[1].id,
      reraStatus: "NOT_APPLICABLE",
      reraNotApplicableReason: "Sells only within the Club",
    },
    vikas.id
  );

  const buyers = [];
  for (const b of BUYERS) buyers.push(await person(b));

  /* -------------------------------------------------------- what happened */

  // S-01 — Booked, part paid, sold by the Club itself.
  const one = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plots["S-01"].id,
    parties: [{ personId: buyers[0].id, role: "PRIMARY" }],
    soldByType: "THREE_PERCENT_CLUB",
    bookingDate: day(-20),
    bookingDateReason: "Paperwork reached Accounts late",
    customerType: "END_USER",
    schedule: SCHEDULE,
  });
  await decideBookingRequest({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: one.bookingId,
    approve: true,
    note: "Verified against the file",
  });
  await confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: one.bookingId,
    percent: "30",
    paidOn: day(-18),
    reference: "UTR-SRG-0001",
    remark: "First instalment",
  });

  // S-02 — Booked through a Member, so a commission exists to look at.
  const two = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plots["S-02"].id,
    parties: [
      { personId: buyers[1].id, role: "PRIMARY", sharePercent: "60" },
      { personId: buyers[2].id, role: "ADDITIONAL", sharePercent: "40" },
    ],
    soldByType: "MEMBER",
    soldByPersonId: memberPeople[0].id,
    bookingDate: day(-15),
    bookingDateReason: "Backdated to the agreement date",
    customerType: "INVESTOR",
    schedule: SCHEDULE,
  });
  await decideBookingRequest({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: two.bookingId,
    approve: true,
    note: "Member sale, commission generated",
  });

  // S-03 — paid in full, waiting on Allotment.
  const three = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plots["S-03"].id,
    parties: [{ personId: buyers[3].id, role: "PRIMARY" }],
    soldByType: "MEMBER",
    soldByPersonId: memberPeople[1].id,
    bookingDate: day(-60),
    bookingDateReason: "Recorded from the original agreement",
    customerType: "END_USER",
    schedule: [{ seq: 1, percent: "100", dueDate: day(-55) }],
  });
  await decideBookingRequest({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: three.bookingId,
    approve: true,
    note: "Approved",
  });
  await confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: three.bookingId,
    percent: "100",
    paidOn: day(-50),
    reference: "UTR-SRG-0003",
    remark: "Paid in full",
  });

  // S-04 — the whole way through: paid, buyers recorded, Allotment given.
  const four = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plots["S-04"].id,
    parties: [{ personId: buyers[4].id, role: "PRIMARY" }],
    soldByType: "CUSTOMER",
    soldByPersonId: buyers[0].id,
    bookingDate: day(-120),
    bookingDateReason: "Historic Booking loaded into the CRM",
    customerType: "END_USER",
    schedule: [{ seq: 1, percent: "100", dueDate: day(-115) }],
  });
  await decideBookingRequest({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: four.bookingId,
    approve: true,
    note: "Approved",
  });
  await confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: four.bookingId,
    percent: "100",
    paidOn: day(-110),
    reference: "UTR-SRG-0004",
    remark: "Paid in full",
  });
  await recordFinalBuyers({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    bookingId: four.bookingId,
    buyers: [
      {
        personId: buyers[4].id,
        dateOfBirth: new Date("1984-06-11"),
        address: "22 Civil Lines, Sikar, Rajasthan 332001",
      },
    ],
  });
  await recordCompletion({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    bookingId: four.bookingId,
    completion: {
      route: "ALLOTMENT",
      allotmentGiven: true,
      allotmentDate: day(-30),
      allotmentNumber: "ALT-SRG-0004",
      allotmentGivenTo: "Harpreet Singh",
      pattaStatus: "YES",
      pattaDate: day(-20),
    },
  });

  // S-05 — submitted and still with Accounts, so there is something to review.
  await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plots["S-05"].id,
    parties: [{ personId: buyers[5].id, role: "PRIMARY" }],
    soldByType: "MEMBER",
    soldByPersonId: memberPeople[1].id,
    bookingDate: today,
    customerType: "INVESTOR",
    schedule: SCHEDULE,
  });

  // S-06 — a live Hold, with its timer running.
  await createHold({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plots["S-06"].id,
    personId: buyers[2].id,
    remark: "Site visit done, deciding this week",
  });

  // S-04 comes back to the Club: a Buyback against the Delivered Booking, so
  // Buyback / Resale has a live deal and the Plot carries the process against
  // it. The seller is the owner; the Club arranges it, so no arranging Person —
  // the seller cannot also be the arranger.
  const buyback = await createAcquisition({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    type: "BUYBACK",
    sourceBookingId: four.bookingId,
    sellerPersonId: buyers[4].id,
    arrangedByType: "THREE_PERCENT_CLUB",
    purchaseDate: day(-5),
    remark: "Owner relocating; Club buying the Plot back for resale",
    schedule: [
      { seq: 1, percent: "50", dueDate: day(-5) },
      { seq: 2, percent: "50", dueDate: day(25) },
    ],
  });
  // Accounts cannot approve a buyback on nothing: at least 20% Payment Given
  // has to be confirmed first, so the first instalment goes out before the
  // decision — the order the rule forces, and the order it happens in.
  await confirmPaymentGiven({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    acquisitionId: buyback.acquisitionId,
    percent: "50",
    paidOn: day(-4),
    reference: "UTR-SRG-BB01",
    remark: "First buyback instalment",
  });
  /*
   * Left with Accounts rather than approved. Approving returns the Plot to
   * inventory, which would take the one Delivered Booking off the board and
   * make S-04 look like any other Available Plot. Pending shows the process
   * where it can be seen: the Plot reads Buyback Under Process, the old sale's
   * unpaid commission goes on hold, and Accounts has a decision waiting. Press
   * Approve on the Buyback / Resale screen to watch the rest happen.
   */

  // S-07 and S-08 stay Available — the inventory anyone can still sell.

  /* ------------------------------------------------------------ Enquiries */

  const crm = await db.staffAccount.findFirstOrThrow({ where: { staffAccountId: CRM } });

  await createEnquiry({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: buyers[5].id,
    projectId: project.id,
    plotId: plots["S-07"].id,
    source: "BY_MEMBER",
    // The Member profile's id, not the Person's — soldByPersonId above is the
    // Person, and the two are easy to hand to the wrong field.
    sourceMemberId: vikas.id,
    assignedStaffId: crm.id,
    assigneeRole: "CRM",
    nextFollowUpAt: day(2),
    remark: "Wants a corner plot, budget confirmed",
  });
  await createEnquiry({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: buyers[3].id,
    projectId: project.id,
    source: "DIRECT",
    assignedStaffId: crm.id,
    assigneeRole: "CRM",
    nextFollowUpAt: day(5),
    remark: "Walk-in at the site office",
  });

  /*
   * A Booking records the Customer Type it was sold under; the Customer's own
   * profile carries it separately, and nothing in the Booking flow fills that
   * in. Set here so the Customers list has a Type to show — demo data, not a
   * change to how the application behaves.
   */
  const TYPES: Record<string, "END_USER" | "INVESTOR"> = {
    "9811100001": "END_USER",
    "9811100002": "INVESTOR",
    "9811100003": "INVESTOR",
    "9811100004": "END_USER",
    "9811100005": "END_USER",
    "9811100006": "INVESTOR",
  };
  for (const [mobile, customerType] of Object.entries(TYPES)) {
    await db.customerProfile.updateMany({
      where: { person: { primaryMobile: mobile } },
      data: { customerType },
    });
  }

  /* --------------------------------------------------------------- report */

  const rows = await db.plot.findMany({
    where: { projectId: project.id },
    orderBy: { plotNumber: "asc" },
    select: { plotNumber: true, status: true, restriction: true },
  });
  const bookings = await db.booking.count({ where: { projectId: project.id } });
  const acquisitions = await db.acquisition.count({
    where: { plot: { projectId: project.id } },
  });
  const commissions = await db.commissionRecord.count({
    where: { booking: { projectId: project.id } },
  });

  console.log(`\nSunrise Greens (${CODE}) — ${rows.length} Plots`);
  for (const r of rows) {
    const restriction = r.restriction === "NONE" ? "" : ` · ${r.restriction.replaceAll("_", " ")}`;
    console.log(`  ${r.plotNumber}  ${r.status.replaceAll("_", " ")}${restriction}`);
  }
  console.log(
    `
${bookings} Bookings, ${acquisitions} Buyback, ${commissions} commission records, ` +
      `2 Members, 2 Enquiries.`
  );
  console.log("Sign in as STF-0001 and open /plots.\n");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
