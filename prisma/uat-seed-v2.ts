// The v2 dataset from `system/mockdata-v2.md` §3 – §13, plus the Royalty
// ownership cases from §9 and §16 that the code now implements.
//
//   npm run uat:seed:v2
//
// Everything is built through the services the screens call, for the reason
// `uat-seed.ts` gives: rows written directly produce a database the application
// itself could never have produced, and a dataset that does not behave like real
// data tests nothing.
//
// GUARDED, and re-runnable: it wipes its own four Projects and its own People
// (mobile numbers beginning 96) and rebuilds. It leaves the v1 dataset — whose
// People begin 97 — alone, so both can stand side by side.
//
// WHAT THIS DOES NOT SEED, and why. §14 onward describes bookings, cycles,
// Buyback acceleration and Recovery whose rules are items 2 – 8 of the second
// Approved Changes pack and are not built yet: position 10+ visible at 0%, the
// two independent performance cycles, an Approved Buyback as an alternative
// milestone, self-purchase by Primary Customer only, Loyalty exhaustion and the
// two conversion routes, and Recovery Outstanding. Seeding those now would
// record outcomes the engine cannot yet produce. §5's North Facing PLC has no
// category in the PLC vocabulary either, and adding one is a change to the PLC
// spec rather than to a dataset.
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();

import {
  aadhaarLastFour,
  blindIndex,
  encryptSensitive,
  maskPan,
  normaliseAadhaar,
  normalisePan,
} from "@/lib/security/identity";
import { prepareInventory, makeAvailable, setRestriction } from "@/lib/services/inventory-service";
import { createEnquiry } from "@/lib/services/enquiry-service";
import { createHold } from "@/lib/services/hold-service";
import {
  cancelBooking,
  decideBookingRequest,
  submitBookingRequest,
} from "@/lib/services/booking-service";
import { decideCancellation } from "@/lib/services/cancellation-service";
import { confirmPaymentReceived } from "@/lib/services/payment-service";
import { activateMember } from "@/lib/services/network-service";
import { enterBankDetails } from "@/lib/services/bank-service";

const db = new PrismaClient();

/** Staff from the Phase 1 seed — §3's eight roles, already on the database. */
const MD = "STF-0001";
const ADMIN = "STF-0002";
const ACC = "STF-0003";
const CRM = "STF-0005";

/** Every Person this script owns. The wipe finds them by it. */
const MOBILE = "96";
/** Every payment reference this script owns, so a re-run does not collide. */
const REF = "V2";

let seq = 0;
const key = () => `V2-${Date.now()}-${seq++}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const today = new Date();

const counters: Record<string, number> = {};
const count = (what: string, by = 1) => {
  counters[what] = (counters[what] ?? 0) + by;
};

/* ------------------------------------------------------------ §4 Projects */

const PROJECTS = [
  {
    code: "PRJ-001",
    name: "TEST Amber Greens Township",
    city: "Hanumangarh",
    type: "RESIDENTIAL",
    status: "ACTIVE",
  },
  {
    code: "PRJ-002",
    name: "TEST Canal View Enclave",
    city: "Sri Ganganagar",
    type: "RESIDENTIAL",
    status: "ACTIVE",
  },
  {
    code: "PRJ-003",
    name: "TEST Meridian Commercial Park",
    city: "Hanumangarh",
    type: "COMMERCIAL",
    status: "SETUP_NOT_ACTIVE",
  },
  {
    code: "PRJ-004",
    name: "TEST Heritage Meadows",
    city: "Bikaner",
    type: "RESIDENTIAL",
    status: "SOLD_OUT",
  },
] as const;

/**
 * §5 — the PLC codes the document names, expressed in the vocabulary the PLC
 * engine actually has (PlcCategory: ROAD_WIDTH, OPEN_SIDES, PARK_FACING,
 * PLAYGROUND_FACING).
 *
 *   Corner 5%              → OPEN_SIDES at 2 sides
 *   Park Facing 3%         → PARK_FACING
 *   60-ft Road 4%          → ROAD_WIDTH at 60
 *   40-ft Road 2%          → ROAD_WIDTH at 40
 *   Commercial Frontage 4% → ROAD_WIDTH at 30, on the commercial Project only
 *
 * North Facing 1.5% has no category. Facing direction is not part of the
 * approved PLC vocabulary, and inventing a category — or borrowing
 * PLAYGROUND_FACING for it — would put a percentage on a Plot under a name that
 * does not mean what it says.
 */
const RESIDENTIAL_PLC = [
  { category: "ROAD_WIDTH" as const, threshold: "60.00", percent: "4.0000" },
  { category: "ROAD_WIDTH" as const, threshold: "40.00", percent: "2.0000" },
  { category: "OPEN_SIDES" as const, threshold: "2.00", percent: "5.0000" },
  { category: "PARK_FACING" as const, threshold: null, percent: "3.0000" },
];

/** §5 — Version 2 effective 2026-10-01: Park Facing 3 → 3.5, 40-ft Road 2 → 2.5. */
const RESIDENTIAL_PLC_V2 = [
  { category: "ROAD_WIDTH" as const, threshold: "60.00", percent: "4.0000" },
  { category: "ROAD_WIDTH" as const, threshold: "40.00", percent: "2.5000" },
  { category: "OPEN_SIDES" as const, threshold: "2.00", percent: "5.0000" },
  { category: "PARK_FACING" as const, threshold: null, percent: "3.5000" },
];

const COMMERCIAL_PLC = [
  { category: "ROAD_WIDTH" as const, threshold: "30.00", percent: "4.0000" },
  { category: "OPEN_SIDES" as const, threshold: "2.00", percent: "5.0000" },
];

/* ------------------------------------------------- §6 the 78-Plot inventory

   `plc` is the document's own PLC seed column, turned into the sides that
   actually produce it. ROAD 30 is plain access and earns nothing on a
   residential Project; two ROAD sides is a corner; a PARK side is park facing. */

type Seed = "STD" | "R60" | "R40" | "PARK" | "CORNER" | "CORNER_R60" | "CORNER_PARK" | "PARK_R60" | "COMM" | "COMM_CORNER";

function sides(seed: Seed) {
  const north = (w: string) => ({ side: "NORTH" as const, kind: "ROAD" as const, roadWidthFt: w });
  const eastPlot = { side: "EAST" as const, kind: "PLOT" as const };
  const eastRoad = { side: "EAST" as const, kind: "ROAD" as const, roadWidthFt: "30" };
  const southPark = { side: "SOUTH" as const, kind: "PARK" as const };
  switch (seed) {
    case "STD":
      return [north("30"), eastPlot];
    case "R60":
      return [north("60"), eastPlot];
    case "R40":
      return [north("40"), eastPlot];
    case "PARK":
      return [north("30"), eastPlot, southPark];
    case "CORNER":
      return [north("30"), eastRoad];
    case "CORNER_R60":
      return [north("60"), eastRoad];
    case "CORNER_PARK":
      return [north("30"), eastRoad, southPark];
    case "PARK_R60":
      return [north("60"), eastPlot, southPark];
    case "COMM":
      return [north("30"), eastPlot];
    case "COMM_CORNER":
      return [north("30"), eastRoad];
  }
}

const AG: Array<[string, string, string, Seed]> = [
  ["AG-001", "25", "50", "STD"], ["AG-002", "30", "50", "STD"], ["AG-003", "30", "60", "R60"],
  ["AG-004", "40", "60", "PARK"], ["AG-005", "25", "50", "CORNER"], ["AG-006", "30", "50", "R60"],
  ["AG-007", "30", "60", "STD"], ["AG-008", "40", "60", "PARK"], ["AG-009", "25", "50", "R60"],
  ["AG-010", "30", "50", "CORNER"], ["AG-011", "30", "60", "STD"], ["AG-012", "40", "60", "PARK_R60"],
  ["AG-013", "25", "50", "STD"], ["AG-014", "30", "50", "STD"], ["AG-015", "30", "60", "CORNER_R60"],
  ["AG-016", "40", "60", "PARK"], ["AG-017", "25", "50", "STD"], ["AG-018", "30", "50", "R60"],
  ["AG-019", "30", "60", "STD"], ["AG-020", "40", "60", "CORNER_PARK"], ["AG-021", "25", "50", "R60"],
  ["AG-022", "30", "50", "STD"], ["AG-023", "30", "60", "STD"], ["AG-024", "40", "60", "PARK_R60"],
  ["AG-025", "25", "50", "CORNER"], ["AG-026", "30", "50", "STD"], ["AG-027", "30", "60", "R60"],
  ["AG-028", "40", "60", "PARK"], ["AG-029", "25", "50", "STD"], ["AG-030", "30", "50", "CORNER_R60"],
  ["AG-031", "30", "60", "STD"], ["AG-032", "40", "60", "PARK"], ["AG-033", "25", "50", "R60"],
  ["AG-034", "30", "50", "STD"], ["AG-035", "30", "60", "CORNER"], ["AG-036", "40", "60", "PARK_R60"],
  ["AG-037", "25", "50", "STD"], ["AG-038", "30", "50", "STD"], ["AG-039", "30", "60", "R60"],
  ["AG-040", "40", "60", "CORNER_PARK"],
];

// §6 — CV-005/010/015/020 are the document's North Facing Plots. They are
// prepared as plain Plots, because the PLC vocabulary has no facing category.
const CV: Array<[string, string, string, Seed]> = [
  ["CV-001", "25", "50", "STD"], ["CV-002", "30", "60", "STD"], ["CV-003", "25", "50", "STD"],
  ["CV-004", "30", "60", "R40"], ["CV-005", "25", "50", "STD"], ["CV-006", "30", "60", "CORNER"],
  ["CV-007", "25", "50", "STD"], ["CV-008", "30", "60", "R40"], ["CV-009", "25", "50", "STD"],
  ["CV-010", "30", "60", "STD"], ["CV-011", "25", "50", "STD"], ["CV-012", "30", "60", "CORNER"],
  ["CV-013", "25", "50", "STD"], ["CV-014", "30", "60", "STD"], ["CV-015", "25", "50", "STD"],
  ["CV-016", "30", "60", "R40"], ["CV-017", "25", "50", "STD"], ["CV-018", "30", "60", "CORNER"],
  ["CV-019", "25", "50", "STD"], ["CV-020", "30", "60", "R40"], ["CV-021", "25", "50", "STD"],
  ["CV-022", "30", "60", "STD"], ["CV-023", "25", "50", "STD"], ["CV-024", "30", "60", "CORNER"],
];

const MC: Array<[string, string, string, Seed]> = [
  ["MC-001", "20", "40", "COMM"], ["MC-002", "20", "40", "COMM_CORNER"],
  ["MC-003", "20", "40", "COMM"], ["MC-004", "20", "40", "COMM_CORNER"],
  ["MC-005", "20", "40", "COMM"], ["MC-006", "20", "40", "COMM_CORNER"],
  ["MC-007", "20", "40", "COMM"], ["MC-008", "20", "40", "COMM_CORNER"],
];

const HM: Array<[string, string, string, Seed]> = [
  ["HM-001", "30", "60", "STD"], ["HM-002", "30", "60", "PARK"], ["HM-003", "30", "60", "STD"],
  ["HM-004", "30", "60", "PARK"], ["HM-005", "30", "60", "STD"], ["HM-006", "30", "60", "PARK"],
];

/* --------------------------------------------------------- §7 the Members */

const MEMBERS = [
  { id: "M001", name: "Arjun Mehta", town: "Hanumangarh", inviter: null },
  { id: "M002", name: "Neeraj Bansal", town: "Sri Ganganagar", inviter: null },
  { id: "M101", name: "Raghav Soni", town: "Hanumangarh", inviter: "M001" },
  { id: "M102", name: "Deepak Arora", town: "Hanumangarh", inviter: "M001" },
  { id: "M103", name: "Kunal Bhatia", town: "Hanumangarh", inviter: "M001" },
  { id: "M104", name: "Nitin Goyal", town: "Hanumangarh", inviter: "M001" },
  { id: "M105", name: "Harsh Vyas", town: "Hanumangarh", inviter: "M001" },
  { id: "M106", name: "Manav Jain", town: "Hanumangarh", inviter: "M001" },
  { id: "M107", name: "Aman Chawla", town: "Hanumangarh", inviter: "M001" },
  { id: "M108", name: "Ritesh Beniwal", town: "Hanumangarh", inviter: "M001" },
  { id: "M109", name: "Vikas Dhingra", town: "Hanumangarh", inviter: "M001" },
  // §8 — position 10 lands past the ninth, where the band is 0%.
  { id: "M110", name: "Gaurav Nanda", town: "Hanumangarh", inviter: "M001" },
  { id: "M111", name: "Yash Khatri", town: "Hanumangarh", inviter: "M001" },
  { id: "M112", name: "Pranav Khanna", town: "Bikaner", inviter: null },
  { id: "M113", name: "Siddharth Lamba", town: "Hanumangarh", inviter: "M002" },
  // §18 — M201 converts after three Loyalty and has no inviter; M202 converts
  // voluntarily with M002 as inviter.
  { id: "M201", name: "Kavya Jain", town: "Hanumangarh", inviter: null },
  { id: "M202", name: "Rohit Verma", town: "Sri Ganganagar", inviter: "M002" },
] as const;

/** §9 — the Royalty Customer master, and §11's other Customers. */
const ROYALTY_CUSTOMERS = [
  "Aarav Malhotra", "Meera Sethi", "Tanya Bansal", "Kabir Ahuja", "Ishita Grover",
  "Dev Khurana", "Naina Arora", "Arnav Gera", "Rhea Madan", "Viraj Puri", "Sana Kothari",
];

const OTHER_CUSTOMERS = [
  ["C301", "Kavya Jain"], ["C302", "Rohit Verma"], ["C303", "Manish Batra"],
  ["C304", "Pooja Saluja"], ["C305", "Ajay Wadhwa"], ["C306", "Simran Kaur"],
  ["C307", "Nikhil Taneja"], ["C308", "Ritu Bedi"], ["C309", "Sameer Gulati"],
  ["C310", "Anjali Walia"], ["C311", "Mohit Daga"], ["C312", "Shreya Vohra"],
  ["C313", "Reena Mehta"], ["C314", "Tarun Sikka"], ["C315", "Aditi Saran"],
  ["C316", "Rohan Kohli"], ["C317A", "Vivek Anand"], ["C317B", "Vivek Anand"],
  ["C318", "Jatin Nagpal"], ["C319", "Shruti Tandon"], ["C320", "Varun Oberoi"],
] as const;

/* ------------------------------------------------------------------ people */

type Made = { id: string; name: string; mobile: string };

let mobileSeq = 0;
const nextMobile = () => `${MOBILE}${String(++mobileSeq).padStart(8, "0")}`;

let identitySeq = 0;

async function person(name: string, opts: { mobile?: string } = {}): Promise<Made> {
  const mobile = opts.mobile ?? nextMobile();
  const n = ++identitySeq;
  const aadhaar = `3${String(n).padStart(11, "0")}`;
  const pan = `BBBPZ${String(1000 + n).slice(-4)}B`;

  const created = await db.person.create({
    data: {
      fullName: name,
      primaryMobile: mobile,
      city: "Hanumangarh",
      aadhaarCipher: encryptSensitive(normaliseAadhaar(aadhaar)),
      aadhaarLastFour: aadhaarLastFour(aadhaar),
      aadhaarBlindIndex: blindIndex(normaliseAadhaar(aadhaar)),
      aadhaarStatus: "AVAILABLE",
      panCipher: encryptSensitive(normalisePan(pan)),
      panMasked: maskPan(pan),
      panBlindIndex: blindIndex(normalisePan(pan)),
      panStatus: "AVAILABLE",
    },
  });
  count("persons");
  return { id: created.id, name, mobile };
}

let accountSeq = 0;

async function withVerifiedBank(p: Made) {
  await enterBankDetails({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: p.id,
    accountHolder: p.name,
    bankName: "Punjab National Bank",
    branchName: "Hanumangarh Junction",
    accountNumber: `6${String(++accountSeq).padStart(11, "0")}`,
    ifsc: "PUNB0123400",
  });
}

/* -------------------------------------------------------------------- wipe */

async function dropTasks(recordKind: string, recordIds: string[]) {
  if (recordIds.length === 0) return;
  const ids = (
    await db.task.findMany({
      where: { recordKind, recordId: { in: recordIds } },
      select: { id: true },
    })
  ).map((t) => t.id);
  if (ids.length === 0) return;
  await db.taskEvent.deleteMany({ where: { taskId: { in: ids } } });
  await db.task.deleteMany({ where: { id: { in: ids } } });
}

async function wipe() {
  const projectIds = (
    await db.project.findMany({
      where: { projectCode: { in: PROJECTS.map((p) => p.code) } },
      select: { id: true },
    })
  ).map((p) => p.id);

  if (projectIds.length) {
    const bookingIds = (
      await db.booking.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } })
    ).map((b) => b.id);

    if (bookingIds.length) {
      await db.commissionEvent.deleteMany({ where: { record: { bookingId: { in: bookingIds } } } });
      await db.commissionRecord.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await db.bookingEvent.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await db.bookingParty.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await db.bookingReviewVersion.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await db.bookingCompletion.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await db.paymentReceivedEntry.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await db.paymentScheduleVersion.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await db.cancellationRequest.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await dropTasks("Booking", bookingIds);
      await dropTasks("Booking Request", bookingIds);
    }

    const plotIds = (
      await db.plot.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } })
    ).map((p) => p.id);

    const enquiryIds = (
      await db.enquiry.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } })
    ).map((e) => e.id);
    await dropTasks("Enquiry", enquiryIds);
    await db.enquiryFollowUp.deleteMany({ where: { enquiryId: { in: enquiryIds } } });
    await db.enquiry.deleteMany({ where: { id: { in: enquiryIds } } });

    await db.booking.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.holdExtensionRequest.deleteMany({ where: { hold: { plotId: { in: plotIds } } } });
    await db.hold.deleteMany({ where: { plotId: { in: plotIds } } });
    await db.holdRequest.deleteMany({ where: { plotId: { in: plotIds } } });
    await db.plotEvent.deleteMany({ where: { plotId: { in: plotIds } } });
    await db.plcSnapshot.deleteMany({ where: { plotId: { in: plotIds } } });
    await db.plotBoundary.deleteMany({ where: { plotId: { in: plotIds } } });
    await dropTasks("Plot", plotIds);
    await db.plot.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.plcComponent.deleteMany({ where: { ruleVersion: { projectId: { in: projectIds } } } });
    await db.plcRuleVersion.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
  }

  const personIds = (
    await db.person.findMany({
      where: { primaryMobile: { startsWith: MOBILE } },
      select: { id: true },
    })
  ).map((p) => p.id);

  if (personIds.length) {
    const memberIds = (
      await db.memberProfile.findMany({ where: { personId: { in: personIds } }, select: { id: true } })
    ).map((m) => m.id);
    await db.performanceCycle.deleteMany({ where: { memberProfileId: { in: memberIds } } });
    await db.portalAccount.deleteMany({ where: { memberProfileId: { in: memberIds } } });
    await db.memberTermsAcceptance.deleteMany({ where: { memberProfileId: { in: memberIds } } });
    await db.commissionOpportunity.deleteMany({ where: { subjectPersonId: { in: personIds } } });
    await db.bankDetail.deleteMany({ where: { personId: { in: personIds } } });
    await db.memberProfile.deleteMany({ where: { personId: { in: personIds } } });
    await db.customerProfile.deleteMany({ where: { personId: { in: personIds } } });
    await dropTasks("Customer", personIds);
    await dropTasks("Member", personIds);
    await db.person.deleteMany({ where: { id: { in: personIds } } });
  }

  await db.externalReference.deleteMany({ where: { normalisedKey: { startsWith: REF } } });
}

/* ----------------------------------------------------------------- helpers */

const SCHEDULE = [
  { seq: 1, percent: "30", dueDate: today },
  { seq: 2, percent: "40", dueDate: day(30) },
  { seq: 3, percent: "30", dueDate: day(60) },
];

let refSeq = 0;
const reference = () => `${REF}-${String(++refSeq).padStart(5, "0")}`;

async function bookApproved(args: {
  plotId: string;
  buyer: Made;
  soldByType?: "THREE_PERCENT_CLUB" | "MEMBER" | "CUSTOMER";
  soldByPersonId?: string | null;
  /** Converting a Hold: the Plot is on Hold, not Available, so it is named. */
  holdId?: string | null;
}) {
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: args.plotId,
    holdId: args.holdId ?? null,
    parties: [{ personId: args.buyer.id, role: "PRIMARY" }],
    soldByType: args.soldByType ?? "THREE_PERCENT_CLUB",
    soldByPersonId: args.soldByPersonId ?? null,
    bookingDate: today,
    customerType: "END_USER",
    schedule: SCHEDULE,
  });
  await decideBookingRequest({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: submitted.bookingId,
    approve: true,
    note: "Verified against the agreement.",
  });
  count("approvedBookings");
  return submitted.bookingId;
}

async function pay(bookingId: string, percent: string) {
  await confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId,
    percent,
    paidOn: today,
    reference: reference(),
  });
  count("payments");
}

/* -------------------------------------------------------------------- main */

async function main() {
  await wipe();

  /* --------------------------------------------- §4, §5, §6 the inventory */

  const projects: Record<string, { id: string; plots: Record<string, string> }> = {};

  for (const spec of PROJECTS) {
    const project = await db.project.create({
      data: {
        projectCode: spec.code,
        name: spec.name,
        developer: "Thirty Milestones LLP",
        location: `${spec.city}, Rajasthan`,
        city: spec.city,
        type: spec.type,
        // The Plots have to be prepared into a live Project before it can be
        // Sold Out, so PRJ-004 arrives Active and is closed at the end.
        status: spec.status === "SOLD_OUT" ? "ACTIVE" : spec.status,
      },
    });
    count("projects");

    const commercial = spec.type === "COMMERCIAL";
    await db.plcRuleVersion.create({
      data: {
        projectId: project.id,
        version: 1,
        status: "PUBLISHED",
        effectiveFrom: new Date("2026-01-01"),
        publishedAt: new Date("2026-01-01"),
        reason: "mockdata-v2 §5 configuration",
        components: { create: commercial ? COMMERCIAL_PLC : RESIDENTIAL_PLC },
      },
    });

    // §5 — a second version effective 2026-10-01. It is a Draft, not a second
    // published version: PLC spec §3.5 allows exactly one published version per
    // Project, and a rate that does not take effect until October is precisely
    // a version waiting to be published. Publishing it on the day is the
    // Administration action the freeze tests then exercise.
    if (!commercial) {
      await db.plcRuleVersion.create({
        data: {
          projectId: project.id,
          version: 2,
          status: "DRAFT",
          effectiveFrom: new Date("2026-10-01"),
          reason: "mockdata-v2 §5 — Park Facing 3% to 3.5%, 40-ft Road 2% to 2.5%",
          components: { create: RESIDENTIAL_PLC_V2 },
        },
      });
      count("plcDraftVersions");
    }

    const table =
      spec.code === "PRJ-001" ? AG : spec.code === "PRJ-002" ? CV : spec.code === "PRJ-003" ? MC : HM;

    await prepareInventory({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      projectId: project.id,
      rows: table.map(([plotNumber, widthFt, lengthFt, seed]) => ({
        plotNumber,
        plotType: commercial ? ("COMMERCIAL" as const) : ("RESIDENTIAL" as const),
        widthFt,
        lengthFt,
        boundaries: sides(seed),
      })),
    });
    count("plots", table.length);

    const made = await db.plot.findMany({ where: { projectId: project.id } });
    projects[spec.code] = {
      id: project.id,
      plots: Object.fromEntries(made.map((p) => [p.plotNumber, p.id])),
    };

    // §6 — PRJ-003 stays Not Active on purpose, so its Plots stay unreleased
    // and a Hold on MC-001 is refused.
    if (!commercial) {
      for (const p of made) {
        if (p.status !== "NOT_AVAILABLE") continue;
        await makeAvailable({
          idempotencyKey: key(),
          actorRef: ADMIN,
          actorRole: "ADMIN",
          plotId: p.id,
          reason: "Released for sale",
        });
      }
    }
  }

  // §6 — "at least 3 spare Plots carry Not for Sale / Pledge restriction".
  for (const [number, restriction] of [
    ["AG-036", "PLEDGE"],
    ["AG-038", "NOT_FOR_SALE"],
    ["CV-023", "PLEDGE"],
  ] as const) {
    const project = number.startsWith("AG") ? projects["PRJ-001"] : projects["PRJ-002"];
    await setRestriction({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      plotId: project.plots[number],
      restriction,
      reason:
        restriction === "PLEDGE"
          ? "Pledged against the development loan"
          : "Held back for the developer's own use",
    });
    count("restrictedPlots");
  }

  const crmAccount = await db.staffAccount.findFirstOrThrow({
    where: { staffAccountId: CRM },
    select: { id: true },
  });

  const prj1 = projects["PRJ-001"];
  const prj2 = projects["PRJ-002"];
  const prj3 = projects["PRJ-003"];

  /* ------------------------------------------- §7, §8 Members and the seed */

  const people: Record<string, Made> = {};
  const profileIds: Record<string, string> = {};

  for (const spec of MEMBERS) {
    people[spec.id] = await person(spec.name);
    await withVerifiedBank(people[spec.id]);
  }

  for (const spec of MEMBERS) {
    // §7 — M113 starts RERA Pending; the rest are Registered or Not Applicable.
    const rera =
      spec.id === "M113" ? ("PENDING" as const) : spec.inviter ? ("REGISTERED" as const) : ("NOT_APPLICABLE" as const);
    const result = await activateMember({
      idempotencyKey: key(),
      actorRef: MD,
      actorRole: "MD",
      personId: people[spec.id].id,
      invitedByMemberId: spec.inviter ? profileIds[spec.inviter] : null,
      reraStatus: rera,
      reraNumber: rera === "REGISTERED" ? `TEST-RERA-${spec.id}` : null,
      reraExpiryDate: rera === "REGISTERED" ? day(400) : null,
      reraNotApplicableReason: rera === "NOT_APPLICABLE" ? "Individual referrer" : null,
    });
    profileIds[spec.id] = result.memberProfileId;
    count("members");
  }

  /* --------------------------------------------- §9, §11 the Customer master */

  const customers: Record<string, Made> = {};
  for (const [index, name] of ROYALTY_CUSTOMERS.entries()) {
    customers[`C2${String(index + 1).padStart(2, "0")}`] = await person(name);
  }
  for (const [id, name] of OTHER_CUSTOMERS) {
    // C317A and C317B are the deliberate duplicate identity for the merge test,
    // so they share a mobile the way a real duplicate does.
    customers[id] = await person(
      name,
      id === "C317B" ? { mobile: customers["C317A"].mobile } : {}
    );
  }

  /* ---------------------------------------------------------- §12 Enquiries

     E001 is the point of the whole Royalty change: the Enquiry is entered by
     M102 and the first qualifying sale is closed by M001, so the Royalty
     belongs to M001 and the Enquiry decides nothing. */

  const ENQUIRIES: Array<[string, string, string | null, string]> = [
    ["E001", "C201", "M102", "prove Enquiry does not decide Royalty"],
    ["E002", "C201", "M001", "later duplicate Enquiry, different Project"],
    ["E003", "C202", "M104", "Enquiry different from the Royalty seller"],
    ["E004", "C203", "M103", "same"],
    ["E005", "C305", "M001", "first purchase is later Sold By 3% CLUB — still no Royalty"],
    ["E006", "C307", "M101", "provisional link, later cancelled"],
    ["E007", "C307", "M103", "later Enquiry, no earning effect"],
    ["E008", "C204", null, "walk-in"],
    ["E009", "C205", "M105", "follow-up case"],
    ["E010", "C206", null, "site visit"],
    ["E011", "C207", "M107", "follow-up case"],
    ["E012", "C208", null, "online"],
    ["E013", "C209", "M109", "follow-up case"],
    ["E014", "C210", "M110", "position 10 Customer"],
    ["E015", "C211", "M001", "next cycle Customer"],
    ["E016", "C303", null, "Loyalty exhaustion subject"],
    ["E017", "C304", "M112", "repeat direct Loyalty subject"],
    ["E018", "C306", null, "first purchase later Sold By Customer"],
    ["E019", "C308", "M101", "Member-closed repeat subject"],
    ["E020", "C311", null, "additional buyer case"],
    ["E021", "C315", null, "allotment route"],
    ["E022", "C316", null, "registry route"],
  ];

  for (const [ref, customerId, sourceMemberId, remark] of ENQUIRIES) {
    await createEnquiry({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      personId: customers[customerId].id,
      // §7.1 allows one Active Enquiry per Person, Project and Plot. E002 and
      // E007 are deliberately second Enquiries from the same Person, so they go
      // to the other Project — which is what keeps them second Enquiries rather
      // than refused duplicates.
      projectId: ref === "E002" || ref === "E007" ? prj2.id : prj1.id,
      source: sourceMemberId ? "BY_MEMBER" : ref.endsWith("0") ? "SITE_VISIT" : "ONLINE",
      sourceMemberId: sourceMemberId ? profileIds[sourceMemberId] : null,
      assignedStaffId: crmAccount.id,
      assigneeRole: "CRM",
      nextFollowUpAt: day(3),
      remark: `${ref} — ${remark}`,
    });
    count("enquiries");
  }

  /* -------------------------------------------------------------- §13 Holds */

  const holds: Record<string, string> = {};
  for (const [customerId, plotNumber] of [
    ["C201", "AG-001"],
    ["C201", "AG-002"],
    ["C201", "AG-003"],
    ["C202", "AG-005"],
    ["C203", "AG-006"],
    ["C204", "AG-007"],
    ["C205", "AG-008"],
    ["C206", "AG-009"],
    ["C207", "AG-010"],
    ["C208", "AG-011"],
    ["C209", "AG-013"],
    ["C210", "AG-014"],
  ] as const) {
    const hold = await createHold({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      plotId: prj1.plots[plotNumber],
      personId: customers[customerId].id,
      remark: `mockdata-v2 §13 hold on ${plotNumber}`,
    });
    holds[plotNumber] = (hold as { holdId: string }).holdId;
    count("holds");
  }

  // §13 H11 — a Hold on a Project that is not Active is refused. Proving it
  // here means the dataset carries the evidence, not just the intention.
  let notActiveBlocked = false;
  try {
    await createHold({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      plotId: prj3.plots["MC-001"],
      personId: customers["C206"].id,
      remark: "H11 — must be refused while PRJ-003 is not Active",
    });
  } catch {
    notActiveBlocked = true;
  }
  count("notActiveHoldRefused", notActiveBlocked ? 1 : 0);

  /* ------------------------------- §9, §16 the Royalty ownership scenarios */

  // C201 — enquired by M102, first qualifying sale closed by M001, paid to
  // 100%. The Royalty Linked Member must be M001 (§16 acceptance 1, 2).
  // C201 already holds three Plots, and a fourth open position is refused —
  // that is §13's H04 and it is correct — so the first purchase converts one of
  // the Holds it already has.
  const c201First = await bookApproved({
    plotId: prj1.plots["AG-001"],
    buyer: customers["C201"],
    holdId: holds["AG-001"],
    soldByType: "MEMBER",
    soldByPersonId: people["M001"].id,
  });
  await pay(c201First, "100");
  count("royaltyLinksFinal");

  // C305 — the first purchase is Sold By 3% CLUB, so no Member is ever linked,
  // however many Members sell to them later (§16 acceptance 4).
  const c305First = await bookApproved({
    plotId: prj1.plots["AG-016"],
    buyer: customers["C305"],
  });
  await pay(c305First, "100");
  await bookApproved({
    plotId: prj1.plots["AG-017"],
    buyer: customers["C305"],
    soldByType: "MEMBER",
    soldByPersonId: people["M101"].id,
  });

  // C306 — the first purchase is Sold By Customer, same answer (acceptance 5).
  const c306First = await bookApproved({
    plotId: prj1.plots["AG-019"],
    buyer: customers["C306"],
    soldByType: "CUSTOMER",
    soldByPersonId: customers["C201"].id,
  });
  await pay(c306First, "100");

  // C307 — a provisional link on a first Booking that is then cancelled before
  // any milestone. No position is consumed, and the next valid first purchase
  // establishes a new link under a different Member (acceptance 3).
  const c307Cancelled = await bookApproved({
    plotId: prj1.plots["AG-021"],
    buyer: customers["C307"],
    soldByType: "MEMBER",
    soldByPersonId: people["M101"].id,
  });
  await cancelBooking({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: c307Cancelled,
    reason: "Buyer withdrew before any payment.",
  });
  await decideCancellation({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: c307Cancelled,
    approve: true,
    note: "No payment was received.",
  });
  const c307Second = await bookApproved({
    plotId: prj1.plots["AG-022"],
    buyer: customers["C307"],
    soldByType: "MEMBER",
    soldByPersonId: people["M103"].id,
  });
  await pay(c307Second, "100");
  count("cancelledProvisionalLinks");

  // C308 — a Member-closed repeat purchase leaves the unused Royalty available
  // (acceptance 6).
  const c308First = await bookApproved({
    plotId: prj1.plots["AG-023"],
    buyer: customers["C308"],
    soldByType: "MEMBER",
    soldByPersonId: people["M101"].id,
  });
  await pay(c308First, "100");
  await bookApproved({
    plotId: prj1.plots["AG-025"],
    buyer: customers["C308"],
    soldByType: "MEMBER",
    soldByPersonId: people["M102"].id,
  });

  /* ------------------------------------------------ §4 — PRJ-004 is Sold Out */

  await db.project.update({
    where: { id: projects["PRJ-004"].id },
    data: { status: "SOLD_OUT" },
  });

  /* ------------------------------------------------------------- the report */

  const links = await db.customerProfile.findMany({
    where: { person: { primaryMobile: { startsWith: MOBILE } }, royaltyLinkedMemberId: { not: null } },
    include: { royaltyLinkedMember: { include: { person: true } }, person: true },
  });

  const line = "─".repeat(70);
  console.log(line);
  console.log("mockdata-v2 dataset — §3 to §13, plus the §16 Royalty acceptance cases");
  console.log(line);
  for (const [what, n] of Object.entries(counters)) console.log(`${what.padEnd(24)} ${n}`);
  console.log(line);
  for (const link of links) {
    console.log(
      `${link.customerId} ${link.person.fullName.padEnd(18)} → ${link.royaltyLinkedMember!.memberId} ` +
        `${link.royaltyLinkedMember!.person.fullName.padEnd(16)} ` +
        `${link.royaltyLinkFinalAt ? `final, position ${link.royaltyPosition} at ${link.royaltyRatePercent}%` : "provisional"}`
    );
  }
  console.log(line);
  console.log(
    "Not seeded: §14 onward — bookings and commission scenarios, performance\n" +
      "cycles, Buyback acceleration, Loyalty exhaustion, conversion routes and\n" +
      "Recovery. Those are items 2 to 8 of the second Approved Changes pack and\n" +
      "are not built yet, so seeding their outcomes would record results the\n" +
      "engine cannot produce. §5's North Facing PLC has no category in the PLC\n" +
      "vocabulary and is left out rather than borrowed from another one."
  );
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
