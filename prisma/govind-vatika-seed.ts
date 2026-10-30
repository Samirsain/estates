// One Project, six Plots, every field and every PLC option used.
//
//   node --env-file=.env --import ./prisma/alias-loader.mjs prisma/govind-vatika-seed.ts
//
// Govind Vatika (GV) fills every Project field and configures every PLC
// category with all its bands. Between them the Plots reach each band:
//
//   G-21  Road 60 + Three side open + Park and Playground facing   9%
//   G-22  20 ft lane only — below every band                       0%
//   G-23  Road 40 + Two side open (North and South)                4%
//   G-24  Road 30 + Corner Plot + Park facing                      6%
//   G-25  Road 60 + Four side open + Playground facing, irregular 10%
//   C-1   Commercial corner shop: Road 60 + Corner Plot             6%
//
// G-21 then carries a Plot's whole life (story), one Booking carries every
// correction a Booking can take (bookingStory: G-22 → G-23), and one Land
// Inquiry fills every field of the form and passes every stage (landStory).
//
// GUARDED and re-runnable: the Project is created once, only Plots it does not
// have yet are added, and the story runs only on a G-21 with no history.
import { PrismaClient, type LandInquiryStage } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";
import { ensureActiveCommissionVersion } from "./seed-commission.ts";

assertCheckDatabase();

import { createProject, setProjectStatus } from "@/lib/services/project-service";
import { prepareInventory, type PlotRow } from "@/lib/services/inventory-service";
import { MEMBER_TERMS_VERSION } from "@/lib/terms";
import { aadhaarLastFour, blindIndex, encryptSensitive, normaliseAadhaar } from "@/lib/security/identity";
import { activateMember } from "@/lib/services/network-service";
import { enterBankDetails } from "@/lib/services/bank-service";
import { verifyAadhaar } from "@/lib/services/customer-closer-service";
import { closeEnquiry, createEnquiry, recordFollowUp } from "@/lib/services/enquiry-service";
import { cancelHold, createHold } from "@/lib/services/hold-service";
import {
  cancelBooking,
  changeOwnershipShares,
  decideBookingRequest,
  decidePrimaryCustomerChange,
  decideSoldByCorrection,
  requestPrimaryCustomerChange,
  requestSoldByCorrection,
  reviseBookingRequest,
  submitBookingRequest,
} from "@/lib/services/booking-service";
import { decideCancellation } from "@/lib/services/cancellation-service";
import { decideChangePlot, submitChangePlot } from "@/lib/services/change-plot-service";
import {
  confirmPaymentReceived,
  correctPaymentReceived,
  decideScheduleRevision,
  reviseSchedule,
} from "@/lib/services/payment-service";
import { recordCompletion, recordFinalBuyers, reopenDelivered } from "@/lib/services/completion-service";
import {
  approveCommissionPaidEarly,
  markCommissionPaid,
  requestCommissionPaidEarly,
} from "@/lib/services/commission-service";
import {
  changeLandInquiryStage,
  createLandInquiry,
  setLandInquiryStatus,
  updateLandInquiry,
} from "@/lib/services/land-inquiry-service";
import { emptyInput, type LandInquiryInput } from "@/lib/domain/land-inquiry";
import {
  confirmPaymentGiven,
  createAcquisition,
  decideAcquisition,
  recordBuyingCommission,
} from "@/lib/services/acquisition-service";

const db = new PrismaClient();
const MD = "STF-0001";
const ACC = "STF-0003";
const CRM = "STF-0005";
const ACC2 = "STF-0004";
const actor = { actorRef: MD, actorRole: "MD" };
const accounts = { actorRef: ACC, actorRole: "ACCOUNTS" };
const crm = { actorRef: CRM, actorRole: "CRM" };
let seq = 0;
const key = () => `GV-${Date.now()}-${seq++}`;

const PLOTS: PlotRow[] = [
  {
    plotNumber: "G-21",
    plotType: "RESIDENTIAL",
    widthFt: "40",
    lengthFt: "60",
    boundaries: [
      { side: "NORTH", kind: "ROAD", roadWidthFt: "60" },
      { side: "EAST", kind: "PARK", reference: "Central Park P-1" },
      { side: "SOUTH", kind: "PLAYGROUND", reference: "Children's Playground PG-1" },
      { side: "WEST", kind: "PLOT", reference: "G-20" },
    ],
  },
  {
    plotNumber: "G-22",
    plotType: "RESIDENTIAL",
    widthFt: "30",
    lengthFt: "50",
    boundaries: [
      { side: "NORTH", kind: "ROAD", roadWidthFt: "20" },
      { side: "EAST", kind: "PLOT", reference: "G-23" },
      { side: "SOUTH", kind: "PLOT", reference: "G-32" },
      { side: "WEST", kind: "PLOT", reference: "G-26" },
    ],
  },
  {
    plotNumber: "G-23",
    plotType: "RESIDENTIAL",
    widthFt: "30",
    lengthFt: "60",
    boundaries: [
      { side: "NORTH", kind: "ROAD", roadWidthFt: "40" },
      { side: "EAST", kind: "PLOT", reference: "G-24" },
      { side: "SOUTH", kind: "ROAD", roadWidthFt: "30" },
      { side: "WEST", kind: "PLOT", reference: "G-22" },
    ],
  },
  {
    plotNumber: "G-24",
    plotType: "RESIDENTIAL",
    widthFt: "35",
    lengthFt: "55",
    boundaries: [
      { side: "NORTH", kind: "ROAD", roadWidthFt: "30" },
      { side: "EAST", kind: "PARK", reference: "Neighbourhood Park P-2" },
      { side: "SOUTH", kind: "PLOT", reference: "G-34" },
      { side: "WEST", kind: "PLOT", reference: "G-23" },
    ],
  },
  {
    // An island Plot cut by the road curve, so its area is measured, not W × L.
    plotNumber: "G-25",
    plotType: "RESIDENTIAL",
    exactAreaSqFt: "3150",
    exactAreaReason: "Irregular island plot on the road curve; area as per JDA layout plan",
    boundaries: [
      { side: "NORTH", kind: "ROAD", roadWidthFt: "60" },
      { side: "EAST", kind: "ROAD", roadWidthFt: "40" },
      { side: "SOUTH", kind: "PLAYGROUND", reference: "Sports Playground PG-2" },
      { side: "WEST", kind: "ROAD", roadWidthFt: "30" },
    ],
  },
  {
    // Corner shop on the main road. Commercial and Informal Sector close a side
    // exactly as a Plot does.
    plotNumber: "C-1",
    plotType: "COMMERCIAL",
    widthFt: "25",
    lengthFt: "60",
    boundaries: [
      { side: "NORTH", kind: "ROAD", roadWidthFt: "60" },
      { side: "EAST", kind: "ROAD", roadWidthFt: "40" },
      { side: "SOUTH", kind: "COMMERCIAL", reference: "C-2" },
      { side: "WEST", kind: "INFORMAL_SECTOR", reference: "Kiosk K-1" },
    ],
  },
];

async function main() {
  let project = await db.project.findUnique({ where: { projectCode: "GV" } });

  if (!project) {
    const { projectId } = await createProject({
      ...actor,
      idempotencyKey: key(),
      projectCode: "GV",
      name: "Govind Vatika",
      type: "RESIDENTIAL",
      developer: "Shree Govind Infra Developers Pvt. Ltd.",
      location: "Vatika Road, near Sanganer Sadar, Jaipur, Rajasthan 302029",
      locationUrl: "https://maps.google.com/?q=Vatika+Road,+Sanganer,+Jaipur",
      driveUrl: "https://drive.google.com/drive/folders/govind-vatika-layout",
      renderUrl: "https://www.youtube.com/watch?v=govind-vatika-3d",
      city: "Jaipur",
      amenities: [
        "JDA approved layout",
        "60 ft and 40 ft wide roads",
        "Gated entry with 24x7 security",
        "Central park and children's playground",
        "Underground electricity and water lines",
        "Temple and community hall",
      ].join("\n"),
      reraNumber: "RAJ/P/2026/3418",
      components: [
        { category: "ROAD_WIDTH", threshold: "30", percent: "1" },
        { category: "ROAD_WIDTH", threshold: "40", percent: "2" },
        { category: "ROAD_WIDTH", threshold: "60", percent: "3" },
        { category: "OPEN_SIDES", threshold: "2", percent: "2" },
        { category: "OPEN_SIDES", threshold: "2.5", percent: "3" },
        { category: "OPEN_SIDES", threshold: "3", percent: "4" },
        { category: "OPEN_SIDES", threshold: "4", percent: "5" },
        // One green-area charge: both rows carry the same percentage.
        { category: "PARK_FACING", percent: "2" },
        { category: "PLAYGROUND_FACING", percent: "2" },
      ],
    });
    // v2.1 §14 — no Booking Request is accepted without approved settings.
    await ensureActiveCommissionVersion(db, projectId, MD);
    project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  }

  const have = new Set(
    (await db.plot.findMany({ where: { projectId: project.id }, select: { plotNumber: true } })).map(
      (p) => p.plotNumber
    )
  );
  const rows = PLOTS.filter((p) => !have.has(p.plotNumber));
  if (rows.length > 0) {
    await prepareInventory({ ...actor, idempotencyKey: key(), projectId: project.id, rows });
  }

  // Activation releases the Plots: Not Available → Available. Plots added to an
  // already Active Project arrive Available.
  if (project.status !== "ACTIVE") {
    await setProjectStatus({
      ...actor,
      idempotencyKey: key(),
      projectId: project.id,
      status: "ACTIVE",
      reason: "Layout approved, sales open",
    });
  }

  console.log(`Govind Vatika (GV): added ${rows.map((r) => r.plotNumber).join(", ") || "nothing"}.`);

  const g21 = await db.plot.findFirstOrThrow({
    where: { projectId: project.id, plotNumber: "G-21" },
    include: { _count: { select: { enquiries: true, holds: true, bookings: true } } },
  });
  const { enquiries, holds, bookings } = g21._count;
  if (enquiries + holds + bookings === 0) await story(project.id, g21.id);
  else console.log("G-21 already has its story. Nothing to do.");

  const [g22, g23] = await Promise.all(
    ["G-22", "G-23"].map((plotNumber) =>
      db.plot.findFirstOrThrow({
        where: { projectId: project.id, plotNumber },
        include: { _count: { select: { bookings: true, changePlotTo: true } } },
      })
    )
  );
  if (g22._count.bookings + g23._count.bookings + g23._count.changePlotTo === 0) {
    await bookingStory(project.id, g22.id, g23.id);
  } else console.log("The every-step Booking already exists. Nothing to do.");

  if ((await db.landInquiry.count({ where: { createRequestId: { startsWith: LAND } } })) === 0) await landStory();
  else console.log("The every-field Land Inquiry already exists. Nothing to do.");
}

/* -------------------------------------------------------------- G-21's story */
//
// Every stage a Plot passes through, on one Plot, in order:
//
//   Pooja Saini     walk-in Enquiry → follow-up → Hold → Hold cancelled →
//                   Enquiry closed
//   Sanjay & Rekha  Kailash's Enquiry → site visit → Hold → Booking Request,
//   Khandelwal      corrected, rejected (cheque returned) → a new Request from
//                   the same Hold → approved → 30% → cancellation asked and
//                   refused → 35% + 35% → final buyers → Registry → Delivered →
//                   Kailash's Direct commission paid
//   Buyback         the company buys G-21 back from Sanjay, arranged by
//                   Kailash (Buying Commission) → paid → approved → Available,
//                   tagged Resale
//   Neeraj Gupta    Sanjay's referral → Hold → Booking Sold By Customer Sanjay
//                   → approved → paid in full → Allotment with Patta. G-21 ends
//                   Delivered, every Completion field filled.
//
// It all happens today: the services stamp their own times. People are new,
// with mobiles beginning 92 and Aadhaar beginning 8, so they collide with no
// other dataset.

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);
const RUN = Date.now().toString(36).toUpperCase();
let refSeq = 0;
const ref = (kind: "UTR" | "NEFT") => `${kind}GV${RUN}${++refSeq}`;

const STREETS = ["Pratap Nagar", "Sanganer", "Malviya Nagar", "Mansarovar", "Jagatpura"];
let personSeq = 0;

async function person(name: string, opts: { verified?: boolean; bank?: boolean } = {}) {
  const n = ++personSeq;
  const aadhaar = `8${92_000_000_000 + n * 13}`;
  const created = await db.person.create({
    data: {
      fullName: name,
      primaryMobile: `92${41_000_000 + n * 7}`,
      city: "Jaipur",
      addressLine: `${20 + n * 3}, ${STREETS[n % STREETS.length]}, Jaipur`,
      aadhaarCipher: encryptSensitive(normaliseAadhaar(aadhaar)),
      aadhaarLastFour: aadhaarLastFour(aadhaar),
      aadhaarBlindIndex: blindIndex(normaliseAadhaar(aadhaar)),
      aadhaarStatus: "AVAILABLE",
    },
  });
  if (opts.verified) await verifyAadhaar({ ...accounts, idempotencyKey: key(), personId: created.id });
  if (opts.bank) {
    await enterBankDetails({
      ...crm,
      idempotencyKey: key(),
      personId: created.id,
      accountHolder: name,
      bankName: "State Bank of India",
      branchName: "Sanganer, Jaipur",
      accountNumber: `6${20_400_500_000 + n * 11}`,
      ifsc: "SBIN0031025",
    });
  }
  return created;
}

/** An Active Member with RERA, Member Terms, verified KYC and a bank account. */
async function member(name: string, reraNumber: string) {
  const made = await person(name, { verified: true, bank: true });
  const { memberProfileId } = await activateMember({
    ...actor,
    idempotencyKey: key(),
    personId: made.id,
    invitedByMemberId: null,
    reraStatus: "REGISTERED",
    reraNumber,
    reraExpiryDate: new Date("2028-03-31T00:00:00+05:30"),
  });
  await db.memberTermsAcceptance.create({ data: { memberProfileId, version: MEMBER_TERMS_VERSION } });
  return { ...made, memberProfileId };
}

const SCHEDULE = () => [
  { seq: 1, percent: "30", dueDate: new Date() },
  { seq: 2, percent: "35", dueDate: inDays(30) },
  { seq: 3, percent: "35", dueDate: inDays(60) },
];

const pay = (bookingId: string, percent: string) =>
  confirmPaymentReceived({
    ...accounts,
    idempotencyKey: key(),
    bookingId,
    percent,
    paidOn: new Date(),
    reference: ref("UTR"),
  });

const approve = (bookingId: string, note: string) =>
  decideBookingRequest({ ...accounts, idempotencyKey: key(), bookingId, approve: true, note });

async function story(projectId: string, plotId: string) {
  const step = (what: string) => console.log(`- ${what}`);
  const crmStaffId = (await db.staffAccount.findUniqueOrThrow({ where: { staffAccountId: CRM } })).id;
  const enquiry = async (
    personId: string,
    source: "DIRECT" | "BY_MEMBER" | "BY_CUSTOMER",
    remark: string,
    from: { sourceMemberId?: string; sourceCustomerId?: string } = {}
  ) => {
    const made = await createEnquiry({
      ...crm,
      idempotencyKey: key(),
      personId,
      projectId,
      plotId,
      source,
      ...from,
      assignedStaffId: crmStaffId,
      assigneeRole: "CRM",
      nextFollowUpAt: inDays(2),
      remark,
    });
    return (made as { enquiryId: string }).enquiryId;
  };

  step("People: Member Kailash; buyers Sanjay and Rekha; Pooja; Neeraj");
  const kailash = await member("Kailash Chand Sharma", "RAJ/A/2026/0921");
  const { memberProfileId } = kailash;
  const sanjay = await person("Sanjay Khandelwal", { verified: true, bank: true });
  const rekha = await person("Rekha Khandelwal", { verified: true });
  const pooja = await person("Pooja Saini");
  const neeraj = await person("Neeraj Gupta");

  step("Pooja: walk-in Enquiry, Hold, then chose a smaller Plot");
  const poojaEnquiry = await enquiry(pooja.id, "DIRECT", "Walked in from the Vatika Road hoarding.");
  await recordFollowUp({
    ...crm,
    idempotencyKey: key(),
    enquiryId: poojaEnquiry,
    outcome: "CALL_LATER",
    remark: "Discussing the budget with her husband.",
    nextAt: inDays(1),
  });
  const poojaHold = await createHold({
    ...crm,
    idempotencyKey: key(),
    plotId,
    personId: pooja.id,
    enquiryId: poojaEnquiry,
    remark: "Holding while she arranges the token amount.",
  });
  await cancelHold({ ...crm, idempotencyKey: key(), holdId: poojaHold.holdId, reason: "Chose a smaller Plot within budget." });
  await closeEnquiry({ ...crm, idempotencyKey: key(), enquiryId: poojaEnquiry, closeReason: "Chose a smaller Plot within budget." });

  step("Sanjay: Kailash's Enquiry, site visit, Hold");
  const sanjayEnquiry = await enquiry(sanjay.id, "BY_MEMBER", "Kailash brought him; wants a corner Plot facing the park.", {
    sourceMemberId: memberProfileId,
  });
  await recordFollowUp({
    ...crm,
    idempotencyKey: key(),
    enquiryId: sanjayEnquiry,
    outcome: "SITE_VISIT_PLANNED",
    remark: "Site visit on Sunday with his wife Rekha.",
    nextAt: inDays(1),
  });
  const sanjayHold = await createHold({
    ...crm,
    idempotencyKey: key(),
    plotId,
    personId: sanjay.id,
    enquiryId: sanjayEnquiry,
    sourcedByType: "MEMBER",
    sourcedByPersonId: kailash.id,
    remark: "Liked G-21 at the site visit; booking this week.",
  });

  const request = {
    ...crm,
    plotId,
    parties: [
      { personId: sanjay.id, role: "PRIMARY" as const, sharePercent: "50" },
      { personId: rekha.id, role: "ADDITIONAL" as const, sharePercent: "50" },
    ],
    soldByType: "MEMBER" as const,
    soldByPersonId: kailash.id,
    bookingDate: new Date(),
    enquiryId: sanjayEnquiry,
    holdId: sanjayHold.holdId,
  };

  step("Sanjay: Booking Request, corrected, then rejected — the cheque came back");
  const first = await submitBookingRequest({
    ...request,
    idempotencyKey: key(),
    schedule: [
      { seq: 1, percent: "30", dueDate: new Date() },
      { seq: 2, percent: "40", dueDate: inDays(30) },
      { seq: 3, percent: "30", dueDate: inDays(60) },
    ],
  });
  await reviseBookingRequest({
    ...request,
    idempotencyKey: key(),
    bookingId: first.bookingId,
    schedule: SCHEDULE(),
    reason: "Second and third instalments corrected to 35% each, as agreed with Sanjay.",
  });
  await decideBookingRequest({
    ...accounts,
    idempotencyKey: key(),
    bookingId: first.bookingId,
    approve: false,
    rejectReason: "PAYMENT_NOT_RECEIVED",
    requestClaimedPayment: true,
    note: "Booking cheque returned unpaid by the bank.",
  });

  step("Sanjay: new Request from the same Hold, approved, 30% paid");
  const { bookingId } = await submitBookingRequest({ ...request, idempotencyKey: key(), schedule: SCHEDULE() });
  await approve(bookingId, "Payment received by RTGS; agreement signed by both buyers.");
  await pay(bookingId, "30");

  step("Sanjay: cancellation asked, then refused — the loan came through");
  await cancelBooking({ ...crm, idempotencyKey: key(), bookingId, reason: "Other", remark: "Home loan sanction delayed." });
  await decideCancellation({
    ...accounts,
    idempotencyKey: key(),
    bookingId,
    approve: false,
    note: "Rejected: the loan was sanctioned and Sanjay continues with the Booking.",
  });

  step("Sanjay: paid in full, final buyers, Registry, Delivered");
  await pay(bookingId, "35");
  await pay(bookingId, "35");
  await recordFinalBuyers({
    ...crm,
    idempotencyKey: key(),
    bookingId,
    buyers: [
      { personId: sanjay.id, sharePercent: "50", dateOfBirth: new Date("1982-04-14"), address: sanjay.addressLine! },
      { personId: rekha.id, sharePercent: "50", dateOfBirth: new Date("1985-09-02"), address: sanjay.addressLine! },
    ],
  });
  await recordCompletion({
    ...crm,
    idempotencyKey: key(),
    bookingId,
    completion: { route: "REGISTRY", advocateName: "Adv. Mahesh Bhargava", registryDate: new Date() },
  });

  const direct = await db.commissionRecord.findFirst({ where: { bookingId, type: "DIRECT", isCurrent: true } });
  if (direct?.eligibility === "READY") {
    step("Kailash: Direct commission paid");
    await markCommissionPaid({
      ...accounts,
      idempotencyKey: key(),
      recordId: direct.id,
      early: false,
      paidOn: new Date(),
      reference: ref("NEFT"),
      remarks: "",
    });
  } else {
    step(`Kailash: Direct commission is ${direct?.eligibility ?? "absent"}, left unpaid`);
  }

  step("Buyback: the company buys G-21 back from Sanjay, arranged by Kailash");
  const buyback = await createAcquisition({
    ...crm,
    idempotencyKey: key(),
    type: "BUYBACK",
    sourceBookingId: bookingId,
    sellerPersonId: sanjay.id,
    arrangedByType: "MEMBER",
    arrangedByPersonId: kailash.id,
    purchaseDate: new Date(),
    remark: "Moving to Pune for work; the company buys G-21 back.",
    schedule: [{ seq: 1, percent: "100", dueDate: new Date() }],
  });
  await confirmPaymentGiven({
    ...accounts,
    idempotencyKey: key(),
    acquisitionId: buyback.acquisitionId,
    percent: "100",
    paidOn: new Date(),
    reference: ref("NEFT"),
  });
  await decideAcquisition({
    ...accounts,
    idempotencyKey: key(),
    acquisitionId: buyback.acquisitionId,
    approve: true,
    note: "Registry papers and the payment to Sanjay verified.",
  });
  await recordBuyingCommission({
    ...crm,
    idempotencyKey: key(),
    acquisitionId: buyback.acquisitionId,
    beneficiaryPersonId: kailash.id,
    percent: "1",
  });

  step("Resale: Sanjay refers Neeraj, who books G-21 — Sold By Customer Sanjay");
  const sanjayCustomer = await db.customerProfile.findUniqueOrThrow({ where: { personId: sanjay.id } });
  const neerajEnquiry = await enquiry(neeraj.id, "BY_CUSTOMER", "Sanjay's colleague; wants a ready corner Plot.", {
    sourceCustomerId: sanjayCustomer.id,
  });
  const neerajHold = await createHold({
    ...crm,
    idempotencyKey: key(),
    plotId,
    personId: neeraj.id,
    enquiryId: neerajEnquiry,
    sourcedByType: "CUSTOMER",
    sourcedByPersonId: sanjay.id,
    remark: "Booking amount ready; papers on Monday.",
  });
  const resale = await submitBookingRequest({
    ...crm,
    idempotencyKey: key(),
    plotId,
    parties: [{ personId: neeraj.id, role: "PRIMARY", sharePercent: null }],
    soldByType: "CUSTOMER",
    soldByPersonId: sanjay.id,
    bookingDate: new Date(),
    enquiryId: neerajEnquiry,
    holdId: neerajHold.holdId,
    schedule: SCHEDULE(),
  });
  await approve(resale.bookingId, "Resale Booking verified against the first receipt.");
  await pay(resale.bookingId, "30");

  step("Neeraj: paid in full, Allotment with Patta — every Completion field filled");
  await pay(resale.bookingId, "35");
  await pay(resale.bookingId, "35");
  await recordFinalBuyers({
    ...crm,
    idempotencyKey: key(),
    bookingId: resale.bookingId,
    buyers: [{ personId: neeraj.id, sharePercent: null, dateOfBirth: new Date("1990-07-19"), address: neeraj.addressLine! }],
  });
  await recordCompletion({
    ...crm,
    idempotencyKey: key(),
    bookingId: resale.bookingId,
    completion: {
      route: "ALLOTMENT",
      allotmentGiven: true,
      allotmentDate: new Date(),
      allotmentNumber: "ALT/GV/2026/021",
      allotmentGivenTo: "Neeraj Gupta",
      pattaStatus: "YES",
      pattaDate: new Date(),
    },
  });

  const plot = await db.plot.findUniqueOrThrow({ where: { id: plotId } });
  console.log(`G-21's story is in: ${plot.status}${plot.isResale ? " (Resale)" : ""}.`);
}

/* -------------------------------------------------- One Booking, every step */
//
// One Booking Number that takes every correction and decision a Booking can,
// starting on G-22 and ending on G-23:
//
//   Amit & Sunita Jain, from Mahesh Kumawat's Enquiry → Hold → Request,
//   corrected → approved → Sold By corrected from Mahesh to Hemant Saini →
//   Hemant's Direct paid early on MD's approval → 35% entered, corrected to
//   30% by a second Accounts user → schedule pushed back a month → Change Plot
//   G-22 → G-23 → Primary Customer changed to Sunita → shares 50/50 → 60/40 →
//   cancellation asked and refused → 35% + 35% → final buyers → Allotment →
//   reopened by MD → Registry → Delivered.

async function bookingStory(projectId: string, fromPlotId: string, toPlotId: string) {
  const step = (what: string) => console.log(`- ${what}`);
  // Clear of the G-21 story's mobiles, Aadhaar and accounts.
  personSeq = 100;

  step("People: Members Mahesh and Hemant; buyers Amit and Sunita Jain");
  const mahesh = await member("Mahesh Kumawat", "RAJ/A/2026/1147");
  const hemant = await member("Hemant Saini", "RAJ/A/2026/1203");
  const amit = await person("Amit Jain", { verified: true, bank: true });
  const sunita = await person("Sunita Jain", { verified: true });
  const crmStaffId = (await db.staffAccount.findUniqueOrThrow({ where: { staffAccountId: CRM } })).id;

  step("Mahesh's Enquiry, booking discussion, Hold on G-22");
  const { enquiryId } = (await createEnquiry({
    ...crm,
    idempotencyKey: key(),
    personId: amit.id,
    projectId,
    plotId: fromPlotId,
    source: "BY_MEMBER",
    sourceMemberId: mahesh.memberProfileId,
    assignedStaffId: crmStaffId,
    assigneeRole: "CRM",
    nextFollowUpAt: inDays(2),
    remark: "Mahesh's neighbour; wants a 30 × 50 Plot near the gate.",
  })) as { enquiryId: string };
  await recordFollowUp({
    ...crm,
    idempotencyKey: key(),
    enquiryId,
    outcome: "BOOKING_DISCUSSION",
    remark: "Price agreed; booking jointly with his wife Sunita.",
    nextAt: inDays(1),
  });
  const { holdId } = await createHold({
    ...crm,
    idempotencyKey: key(),
    plotId: fromPlotId,
    personId: amit.id,
    enquiryId,
    sourcedByType: "MEMBER",
    sourcedByPersonId: mahesh.id,
    remark: "Token amount ready.",
  });

  step("Request, corrected before the decision, approved");
  const request = {
    ...crm,
    plotId: fromPlotId,
    parties: [
      { personId: amit.id, role: "PRIMARY" as const, sharePercent: "50" },
      { personId: sunita.id, role: "ADDITIONAL" as const, sharePercent: "50" },
    ],
    soldByType: "MEMBER" as const,
    soldByPersonId: mahesh.id,
    bookingDate: new Date(),
    enquiryId,
    holdId,
  };
  const { bookingId } = await submitBookingRequest({
    ...request,
    idempotencyKey: key(),
    schedule: SCHEDULE(),
    remark: "Joint booking, husband and wife.",
  });
  await reviseBookingRequest({
    ...request,
    idempotencyKey: key(),
    bookingId,
    schedule: SCHEDULE(),
    remark: "Joint booking, husband and wife; signed agreement attached.",
    reason: "The signed agreement was missing from the first request.",
  });
  await approve(bookingId, "Agreement signed by both buyers; first receipt checked.");

  step("Sold By corrected from Mahesh to Hemant");
  await requestSoldByCorrection({
    ...crm,
    idempotencyKey: key(),
    bookingId,
    toSoldByType: "MEMBER",
    toSoldByPersonId: hemant.id,
    reason: "Hemant closed the deal; Mahesh only introduced Amit.",
    supportingNote: "Site visit register, page 22.",
  });
  await decideSoldByCorrection({
    ...actor,
    idempotencyKey: key(),
    bookingId,
    approve: true,
    note: "The register confirms Hemant closed the sale.",
  });

  // Before the first payment: from 25% received the Direct is Ready, and a
  // Ready commission is paid normally, never early.
  step("Hemant's Direct paid early on MD's approval");
  const direct = await db.commissionRecord.findFirstOrThrow({ where: { bookingId, type: "DIRECT", isCurrent: true } });
  await requestCommissionPaidEarly({
    ...accounts,
    idempotencyKey: key(),
    recordId: direct.id,
    reason: "Hemant asked for an advance; the booking amount is on its way.",
  });
  await approveCommissionPaidEarly({ ...actor, idempotencyKey: key(), recordId: direct.id, note: "Hemant has a good record." });
  await markCommissionPaid({
    ...accounts,
    idempotencyKey: key(),
    recordId: direct.id,
    early: true,
    paidOn: new Date(),
    reference: ref("NEFT"),
    remarks: "Paid Early — approved by MD.",
  });

  step("35% entered, corrected to 30% by a second Accounts user");
  await pay(bookingId, "35");
  const entry = await db.paymentReceivedEntry.findFirstOrThrow({
    where: { bookingId, status: "CONFIRMED" },
    orderBy: { recordedAt: "desc" },
  });
  await correctPaymentReceived({
    actorRef: ACC2,
    actorRole: "ACCOUNTS",
    idempotencyKey: key(),
    entryId: entry.id,
    percent: "30",
    paidOn: new Date(),
    reference: ref("UTR"),
    reason: "35% entered by mistake; the bank credit is 30%.",
  });

  step("Schedule pushed back a month");
  const live = await db.paymentScheduleVersion.findFirstOrThrow({
    where: { bookingId, status: "ACTIVE" },
    include: { instalments: { orderBy: { seq: "asc" } } },
  });
  await reviseSchedule({
    ...crm,
    idempotencyKey: key(),
    bookingId,
    lines: live.instalments.map((i, n) => ({
      seq: i.seq,
      percent: i.scheduledPercent.toString(),
      dueDate: n === 0 ? i.dueDate : new Date(i.dueDate.getTime() + 30 * 86_400_000),
    })),
    reason: "Home loan disbursement moved by a month.",
  });
  await decideScheduleRevision({
    ...accounts,
    idempotencyKey: key(),
    bookingId,
    approve: true,
    note: "Matches the bank's disbursement letter.",
  });

  step("Change Plot G-22 → G-23");
  await submitChangePlot({
    ...crm,
    idempotencyKey: key(),
    bookingId,
    toPlotId,
    remark: "Amit wants the Plot with a road on both sides.",
  });
  await decideChangePlot({
    ...accounts,
    idempotencyKey: key(),
    bookingId,
    approve: true,
    note: "G-23 is Available and the price difference is agreed.",
    appliedPercent: "30",
    schedule: SCHEDULE(),
  });

  step("Primary Customer changed to Sunita; shares 50/50 → 60/40");
  await requestPrimaryCustomerChange({
    ...crm,
    idempotencyKey: key(),
    bookingId,
    toPersonId: sunita.id,
    reason: "The family wants the Booking in Sunita's name.",
  });
  await decidePrimaryCustomerChange({
    ...accounts,
    idempotencyKey: key(),
    bookingId,
    approve: true,
    note: "Amit's consent letter checked.",
  });
  await changeOwnershipShares({
    ...crm,
    idempotencyKey: key(),
    bookingId,
    parties: [
      { personId: sunita.id, role: "PRIMARY", sharePercent: "60" },
      { personId: amit.id, role: "ADDITIONAL", sharePercent: "40" },
    ],
    reason: "Shares changed to 60/40 as per the family settlement.",
  });

  step("Cancellation asked, then refused");
  await cancelBooking({ ...crm, idempotencyKey: key(), bookingId, reason: "Other", remark: "Amit's job transfer was expected." });
  await decideCancellation({
    ...accounts,
    idempotencyKey: key(),
    bookingId,
    approve: false,
    note: "Rejected: the transfer was called off and the family continues.",
  });

  step("Paid in full; Allotment, reopened by MD, then Registry");
  await pay(bookingId, "35");
  await pay(bookingId, "35");
  await recordFinalBuyers({
    ...crm,
    idempotencyKey: key(),
    bookingId,
    buyers: [
      { personId: sunita.id, sharePercent: "60", dateOfBirth: new Date("1987-11-21"), address: amit.addressLine! },
      { personId: amit.id, sharePercent: "40", dateOfBirth: new Date("1983-02-08"), address: amit.addressLine! },
    ],
  });
  await recordCompletion({
    ...crm,
    idempotencyKey: key(),
    bookingId,
    completion: {
      route: "ALLOTMENT",
      allotmentGiven: true,
      allotmentDate: new Date(),
      allotmentNumber: "ALT/GV/2026/023",
      allotmentGivenTo: "Sunita Jain",
      pattaStatus: "YES",
      pattaDate: new Date(),
    },
  });
  await reopenDelivered({
    ...actor,
    idempotencyKey: key(),
    bookingId,
    reason: "Allotment letter printed with the old Plot number G-22.",
  });
  await recordCompletion({
    ...crm,
    idempotencyKey: key(),
    bookingId,
    completion: { route: "REGISTRY", advocateName: "Adv. Ritu Mathur", registryDate: new Date() },
  });

  const done = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { plot: true } });
  console.log(`The every-step Booking is ${done.bookingNumber}: ${done.status} on ${done.plot.plotNumber}.`);
}

/* ------------------------------------------- One Land Inquiry, every field */
//
// Every field the New Land Inquiry form asks filled, received from Kailash.
// Then: three stages one by one → back a stage for a second visit → forward
// again → Edit details adds the late documents → Negotiation → Closed by CRM →
// reopened by MD → Approved for Acquisition.

const LAND = "GV-LAND-";

async function landStory() {
  const step = (what: string) => console.log(`- ${what}`);
  const kailash = await db.person.findFirstOrThrow({
    where: { fullName: "Kailash Chand Sharma", primaryMobile: { startsWith: "92" } },
  });

  // Only what the New Land Inquiry form asks (owner, 30 Oct 2026); every other
  // column keeps emptyInput()'s blank.
  const input: LandInquiryInput = {
    ...emptyInput(),
    receivedFrom: "MEMBER",
    sourcePersonId: kailash.id,

    district: "Jaipur",
    tehsil: "Sanganer",
    exactLocation: "Village Shivdaspura, Tonk Road, 2 km past Govind Vatika",
    latitude: "26.7612",
    longitude: "75.8443",

    areaBigha: "6",
    areaBiswa: "10",
    areaSourceUnit: "SQ_M",
    areaSourceValue: "10520",

    frontageValue: "220",
    frontageUnit: "FT",
    roadWidthValue: "18",
    roadWidthUnit: "MTR",

    currentLandUse: "Wheat and mustard farming",
    masterPlanZonalUse: "Residential (Jaipur Master Plan 2025)",

    developmentPotential: ["RESIDENTIAL", "COMMERCIAL", "WAREHOUSE", "AGRICULTURE", "INDUSTRIAL", "FARMHOUSE", "OTHER"],
    documentsReceived: ["JAMABANDI", "REGISTRY", "MUTATION", "OWNER_ID", "LOCATION_MAP"],

    owners: [
      { ownerName: "Ramesh Chand Meena", mobile: "9241000901", isPrimary: true },
      { ownerName: "Suresh Chand Meena", mobile: "9241000902", isPrimary: false },
      { ownerName: "Kamla Devi Meena", mobile: null, isPrimary: false },
    ],
    jamabandiEntries: [
      { murbbaNo: "12", patharNo: "3", khasraNo: "245/1" },
      { murbbaNo: "12", patharNo: "4", khasraNo: "246" },
    ],
  };

  step("Land Inquiry from Kailash, every field filled");
  const { id, inquiryNo } = await createLandInquiry({ ...crm, createRequestId: `${LAND}${key()}`, input });
  const version = async () => (await db.landInquiry.findUniqueOrThrow({ where: { id } })).version;
  const stage = async (to: LandInquiryStage, reason = "") =>
    changeLandInquiryStage({ ...crm, idempotencyKey: key(), id, version: await version(), stage: to, reason });

  step("Documents Pending → Site Visit → Under Verification, back for a second visit, forward again");
  await stage("DOCUMENTS_PENDING");
  await stage("SITE_VISIT");
  await stage("UNDER_VERIFICATION");
  await stage("SITE_VISIT", "Second site visit with the surveyor to mark the boundary.");
  await stage("UNDER_VERIFICATION");

  step("Edit details: the rest of the documents came in after the visit");
  await updateLandInquiry({
    ...crm,
    idempotencyKey: key(),
    id,
    version: await version(),
    input: {
      ...input,
      documentsReceived: [
        ...input.documentsReceived,
        "BHU_NAKSHA",
        "KHASRA_MAP",
        "CONVERSION_ORDER_90A",
        "PATTA",
        "SITE_PHOTOS",
      ],
    },
  });

  step("Negotiation → Closed by CRM → reopened by MD → Approved for Acquisition");
  await stage("NEGOTIATION");
  await setLandInquiryStatus({
    ...crm,
    idempotencyKey: key(),
    id,
    version: await version(),
    status: "CLOSED",
    reason: "Owners would not go below ₹80 lakh per bigha.",
  });
  await setLandInquiryStatus({
    ...actor,
    idempotencyKey: key(),
    id,
    version: await version(),
    status: "WORKING",
    reason: "Owners came down to ₹75 lakh per bigha.",
    restoredStage: "NEGOTIATION",
  });
  await stage("APPROVED_FOR_ACQUISITION");

  console.log(`The every-field Land Inquiry is ${inquiryNo}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
