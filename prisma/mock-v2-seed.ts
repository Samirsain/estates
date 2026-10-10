// Business Model v2 — the UAT mock master data (docss/4 UAT plan §6), so every
// v2 feature can be tried on screen.
//
//   npm run seed:mock-v2
//
// Everything goes through the services the screens call: rows written directly
// would make a database the application could never have produced. Staff are
// the existing accounts (STF-0001 MD, STF-0002 Admin, STF-0003/0004 Accounts,
// STF-0005 CRM), so tasks and History read as real work.
//
// Re-runnable: it removes its own five Projects (codes UAT-PRJ-A … E), its own
// People (mobiles beginning 95), its own references (UATV2-) and the RGP-01
// Royalty Gift Programme, then rebuilds. Nothing else is touched.
//
// It writes the key to the dataset — who is who, and what to try with each —
// to docss/9. Business_Model_v2_Mock_Data_Key.md.

import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";
import { purgeScope } from "./check-cleanup.ts";
import { aadhaarLastFour, blindIndex, encryptSensitive, normaliseAadhaar } from "@/lib/security/identity";
import { makeAvailable, prepareInventory, setRestriction } from "@/lib/services/inventory-service";
import {
  decideCommissionVersion,
  prepareCommissionDraft,
  recordEconomicsReview,
  sendCommissionVersion,
  type CommissionVersionInput,
} from "@/lib/services/commission-settings-service";
import { decideRoyaltyProgramme, prepareRoyaltyProgramme, sendRoyaltyProgramme } from "@/lib/services/royalty-programme-service";
import { activateMember, setMemberStatus } from "@/lib/services/network-service";
import { enterBankDetails } from "@/lib/services/bank-service";
import { recordCustomerTermsAcceptance, verifyAadhaar } from "@/lib/services/customer-closer-service";
import { createEnquiry } from "@/lib/services/enquiry-service";
import { cancelBooking, decideBookingRequest, submitBookingRequest } from "@/lib/services/booking-service";
import { createHold } from "@/lib/services/hold-service";
import { decideCancellation } from "@/lib/services/cancellation-service";
import { confirmPaymentReceived } from "@/lib/services/payment-service";
import { markCommissionPaid, requestCommissionPaidEarly } from "@/lib/services/commission-service";
import { openRecovery } from "@/lib/services/recovery-service";
import { deliverRoyaltyGift, orderRoyaltyGift, selectRoyaltyGift } from "@/lib/services/royalty-service";
import { confirmPaymentGiven, createAcquisition, decideAcquisition, recordBuyingCommission } from "@/lib/services/acquisition-service";

assertCheckDatabase();
const db = new PrismaClient();

/* UAT §6.1 — the existing staff accounts stand in for USR-MD-01 … USR-CRM-01. */
const MD = "STF-0001";
const ADMIN = "STF-0002";
const ACC = "STF-0003";
const CRM = "STF-0005";
/** UAT §6.1 USR-STAFF-01 — a CRM staff Person who is also Member M-008 (CTL-10). */
const STAFF_ID = "STF-UAT-01";

const MOBILE = "95";
const REF = "UATV2";
const CODES = ["UAT-PRJ-A", "UAT-PRJ-B", "UAT-PRJ-C", "UAT-PRJ-D", "UAT-PRJ-E"];
const RGP = ["RGP-01", "RGP-02"];

let seq = 0;
const key = () => `${REF}-${Date.now()}-${seq++}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const today = new Date();
let refSeq = 0;
const reference = (what: string) => `${REF}-${what}-${String(++refSeq).padStart(4, "0")}`;

/* ------------------------------------------------------------------ wipe */

async function wipe() {
  const projectIds = (await db.project.findMany({ where: { projectCode: { in: CODES } }, select: { id: true } })).map((p) => p.id);
  const bookingIds = (await db.booking.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } })).map((b) => b.id);
  await db.staffAccount.deleteMany({ where: { staffAccountId: STAFF_ID } });
  await purgeScope(db, {
    tag: null,
    bookings: { projectId: { in: projectIds } },
    persons: { primaryMobile: { startsWith: MOBILE } },
    plots: { projectId: { in: projectIds } },
    projects: { id: { in: projectIds } },
    acquisitions: { sourceBookingId: { in: bookingIds } },
    references: { normalisedKey: { startsWith: REF } },
  });
  const programmes = (await db.royaltyProgrammeVersion.findMany({ where: { programmeRef: { in: RGP } }, select: { id: true } })).map((p) => p.id);
  if (programmes.length) {
    const tasks = (await db.task.findMany({ where: { recordId: { in: programmes } }, select: { id: true } })).map((t) => t.id);
    await db.taskEvent.deleteMany({ where: { taskId: { in: tasks } } });
    await db.task.deleteMany({ where: { id: { in: tasks } } });
    await db.booking.updateMany({ where: { royaltyProgrammeVersionId: { in: programmes } }, data: { royaltyProgrammeVersionId: null } });
    await db.royaltyProgrammeVersion.deleteMany({ where: { id: { in: programmes } } });
  }
}

/* -------------------------------------------------------------- projects */

const PROJECTS = [
  { code: "UAT-PRJ-A", name: "Aravali Greens", city: "Jaipur", prefix: "A", units: 20 },
  { code: "UAT-PRJ-B", name: "Blue Ridge", city: "Jaipur", prefix: "B", units: 10 },
  { code: "UAT-PRJ-C", name: "Cedar Estate", city: "Ajmer", prefix: "C", units: 10 },
  { code: "UAT-PRJ-D", name: "Desert Square", city: "Jodhpur", prefix: "D", units: 10 },
  { code: "UAT-PRJ-E", name: "Everest Park", city: "Udaipur", prefix: "E", units: 10 },
] as const;

type Project = { id: string; name: string; plots: Record<string, string> };

async function project(spec: (typeof PROJECTS)[number]): Promise<Project> {
  const created = await db.project.create({
    data: {
      projectCode: spec.code,
      name: spec.name,
      developer: "Thirty Milestones LLP",
      location: `${spec.city}, Rajasthan`,
      city: spec.city,
      type: "RESIDENTIAL",
      status: "ACTIVE",
    },
  });
  await db.plcRuleVersion.create({
    data: {
      projectId: created.id,
      version: 1,
      status: "PUBLISHED",
      effectiveFrom: new Date("2026-01-01"),
      publishedAt: new Date("2026-01-01"),
      reason: "UAT mock PLC",
      components: { create: [{ category: "ROAD_WIDTH", threshold: "60.00", percent: "4.0000" }] },
    },
  });
  const numbers = Array.from({ length: spec.units }, (_, i) => `${spec.prefix}-${String(i + 1).padStart(2, "0")}`);
  // UAT §6.3 — A-10 is the parent split into A-10A and A-10B.
  if (spec.prefix === "A") numbers.push("A-10A", "A-10B");
  await prepareInventory({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    projectId: created.id,
    rows: numbers.map((plotNumber) => ({
      plotNumber,
      plotType: "RESIDENTIAL" as const,
      widthFt: "30",
      lengthFt: "50",
      boundaries: [
        { side: "NORTH" as const, kind: "ROAD" as const, roadWidthFt: plotNumber.endsWith("1") ? "60" : "30" },
        { side: "EAST" as const, kind: "PLOT" as const },
      ],
    })),
  });
  const made = await db.plot.findMany({ where: { projectId: created.id } });
  for (const p of made) {
    if (p.status === "NOT_AVAILABLE") {
      await makeAvailable({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", plotId: p.id, reason: "Released for sale" });
    }
  }
  return { id: created.id, name: spec.name, plots: Object.fromEntries(made.map((p) => [p.plotNumber, p.id])) };
}

const trip = (
  code: string,
  target: number,
  minOwn: number,
  maxRef: number,
  terms: string,
  inventory: { excludedPlotIds?: string[]; sharedPools?: { plotId: string; parentPlotId: string }[] } = {}
): CommissionVersionInput["trip"] => ({
  tripEnabled: true,
  tripTotalTarget: target,
  tripMinOwnCredits: minOwn,
  tripMaxReferenceCredits: maxRef,
  tripProgrammeCode: code,
  tripProgrammeVersionRef: `${code} v${terms.slice(-1)}`,
  tripTermsVersionRef: terms,
  tripCutOffAt: null,
  tripWindDownAt: null,
  excludedPlotIds: inventory.excludedPlotIds ?? [],
  sharedPools: inventory.sharedPools ?? [],
});

/** UAT §6.2 — prepared by Admin, economics reviewed and approved by MD. */
async function settings(projectId: string, input: CommissionVersionInput) {
  const draft = await prepareCommissionDraft({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", projectId, ...input });
  await sendCommissionVersion({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", versionId: draft.versionId });
  if (input.trip?.tripEnabled) {
    await recordEconomicsReview({
      idempotencyKey: key(),
      actorRef: MD,
      actorRole: "MD",
      versionId: draft.versionId,
      note: "Trip cost and Own + Reference exposure reviewed against margin outside the CRM.",
    });
  }
  await decideCommissionVersion({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", versionId: draft.versionId, approve: true, note: "Approved for UAT." });
  return draft.versionId;
}

/* ---------------------------------------------------------------- people */

type Made = { id: string; name: string; mobile: string; label: string; note: string };
const people: Made[] = [];
let mobileSeq = 0;
let aadhaarSeq = 0;
let accountSeq = 0;

async function person(
  label: string,
  name: string,
  note: string,
  opts: { kyc?: "none" | "available" | "verified"; mobile?: string; address?: string; bank?: boolean } = {}
): Promise<Made> {
  const mobile = opts.mobile ?? `${MOBILE}${String(++mobileSeq).padStart(8, "0")}`;
  const aadhaar = `58${String(++aadhaarSeq).padStart(10, "0")}`;
  const kyc = opts.kyc ?? "available";
  const created = await db.person.create({
    data: {
      fullName: name,
      primaryMobile: mobile,
      city: "Jaipur",
      addressLine: opts.address ?? null,
      ...(kyc === "none"
        ? {}
        : {
            aadhaarCipher: encryptSensitive(normaliseAadhaar(aadhaar)),
            aadhaarLastFour: aadhaarLastFour(aadhaar),
            aadhaarBlindIndex: blindIndex(normaliseAadhaar(aadhaar)),
            aadhaarStatus: "AVAILABLE",
          }),
    },
  });
  if (kyc === "verified") await verifyAadhaar({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", personId: created.id });
  if (opts.bank !== false) {
    await enterBankDetails({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      personId: created.id,
      accountHolder: name,
      bankName: "State Bank of India",
      branchName: "MI Road, Jaipur",
      accountNumber: `95${String(++accountSeq).padStart(10, "0")}`,
      ifsc: "SBIN0001234",
    });
  }
  const made = { id: created.id, name, mobile, label, note };
  people.push(made);
  return made;
}

const members: Record<string, { profileId: string; person: Made }> = {};

async function member(label: string, name: string, note: string, inviter: string | null, opts: Parameters<typeof person>[3] = {}) {
  const p = await person(label, name, note, opts);
  const activated = await activateMember({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    personId: p.id,
    invitedByMemberId: inviter ? members[inviter].profileId : null,
    reraStatus: "REGISTERED",
    reraNumber: `RAJ/A/${label}/2026`,
    reraExpiryDate: day(400),
  });
  // UAT §6.7 — Member Terms MT-2026-10.
  await db.memberTermsAcceptance.create({ data: { memberProfileId: activated.memberProfileId, version: "MT-2026-10" } });
  members[label] = { profileId: activated.memberProfileId, person: p };
  return p;
}

/* -------------------------------------------------------------- bookings */

const SCHEDULE = [
  { seq: 1, percent: "30", dueDate: today },
  { seq: 2, percent: "70", dueDate: day(45) },
];

async function sell(
  plotId: string,
  buyer: Made,
  soldBy: { member?: Made; customer?: Made } = {},
  additional: Made[] = []
) {
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId,
    // Joint buyers split ownership equally; a sole buyer carries no share.
    parties: [
      { personId: buyer.id, role: "PRIMARY" as const, sharePercent: additional.length ? String(100 / (additional.length + 1)) : null },
      ...additional.map((a) => ({ personId: a.id, role: "ADDITIONAL" as const, sharePercent: String(100 / (additional.length + 1)) })),
    ],
    soldByType: soldBy.member ? "MEMBER" : soldBy.customer ? "CUSTOMER" : "THREE_PERCENT_CLUB",
    soldByPersonId: soldBy.member?.id ?? soldBy.customer?.id ?? null,
    bookingDate: today,
    customerType: "END_USER",
    schedule: SCHEDULE,
  });
  await decideBookingRequest({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: submitted.bookingId, approve: true, note: "Verified against the agreement." });
  return submitted.bookingId;
}

const pay = (bookingId: string, percent: string, payer?: { payerName: string; payerReference: string }) =>
  confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId,
    percent,
    paidOn: today,
    reference: reference("PAY"),
    ...payer,
  });

const directOf = (bookingId: string) => db.commissionRecord.findFirstOrThrow({ where: { bookingId, type: "DIRECT", isCurrent: true } });

/** CP §17 — a Customer closer: verified KYC and accepted Customer Terms CT-2026-10. */
async function closerReady(p: Made) {
  const profile = await db.customerProfile.findUniqueOrThrow({ where: { personId: p.id } });
  await recordCustomerTermsAcceptance({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    customerProfileId: profile.id,
    termsVersion: "CT-2026-10",
    acceptedOn: today,
  });
}

let crmAccountId = "";
async function enquiryOnly(p: Made, projectId: string) {
  await createEnquiry({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: p.id,
    projectId,
    source: "DIRECT",
    assignedStaffId: crmAccountId,
    assigneeRole: "CRM",
    nextFollowUpAt: day(3),
    remark: `${p.label} — enquiry only, no purchase`,
  });
}

/* ------------------------------------------------------------------ main */

async function main() {
  await wipe();
  crmAccountId = (await db.staffAccount.findFirstOrThrow({ where: { staffAccountId: CRM }, select: { id: true } })).id;

  /* UAT §6.2, §6.3 — five Projects and their settings versions. */
  const P: Record<string, Project> = {};
  for (const spec of PROJECTS) P[spec.prefix] = await project(spec);

  await setRestriction({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    plotId: P.A.plots["A-10"],
    restriction: "NOT_FOR_SALE",
    reason: "Subdivided into A-10A and A-10B",
  });

  const base = { loyaltyExceptionReason: null, effectiveFrom: null } as const;
  await settings(P.A.id, {
    ...base,
    directEnabled: true,
    directPercent: "3",
    loyaltyEnabled: true,
    loyaltyPercent: "1",
    reason: "PSV-A1 — initial active settings",
    trip: trip("TRIP-A", 5, 3, 2, "TRIP-A-1", {
      excludedPlotIds: [P.A.plots["A-09"]],
      sharedPools: [
        { plotId: P.A.plots["A-10A"], parentPlotId: P.A.plots["A-10"] },
        { plotId: P.A.plots["A-10B"], parentPlotId: P.A.plots["A-10"] },
      ],
    }),
  });
  await settings(P.B.id, { ...base, directEnabled: true, directPercent: "5", loyaltyEnabled: true, loyaltyPercent: "2", reason: "PSV-B1 — maximum Direct, no Trip" });
  await settings(P.C.id, {
    ...base,
    directEnabled: false,
    directPercent: null,
    loyaltyEnabled: true,
    loyaltyPercent: "2",
    loyaltyExceptionReason: "Customer-referral launch: no Member sales channel on Cedar Estate.",
    reason: "PSV-C1 — Direct Disabled, MD commercial exception",
    trip: trip("TRIP-C", 4, 4, 0, "TRIP-C-1"),
  });
  await settings(P.D.id, {
    ...base,
    directEnabled: true,
    directPercent: "2",
    loyaltyEnabled: true,
    loyaltyPercent: "2",
    loyaltyExceptionReason: "Loyalty equal to Direct to clear the last Desert Square units.",
    reason: "PSV-D1 — Loyalty = Direct, MD commercial exception",
    trip: trip("TRIP-D", 3, 2, 1, "TRIP-D-1"),
  });
  await settings(P.E.id, {
    ...base,
    directEnabled: true,
    directPercent: "3",
    loyaltyEnabled: false,
    loyaltyPercent: null,
    reason: "PSV-E1 — Loyalty Disabled",
    trip: trip("TRIP-E", 4, 3, 1, "TRIP-E-1"),
  });

  /* UAT §6.7 — RGP-01 live before any purchase, so Bookings freeze it. */
  const live = await db.royaltyProgrammeVersion.findFirst({ where: { status: "ACTIVE" } });
  if (!live) {
    const rgp = await prepareRoyaltyProgramme({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      programmeRef: "RGP-01",
      catalogueVersion: "RGP-01-CAT (silver coin / smart watch / dinner set)",
      termsVersion: "RGT-2026-10",
      reason: "UAT Royalty Gift Programme",
    });
    await sendRoyaltyProgramme({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", versionId: rgp.versionId });
    await decideRoyaltyProgramme({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", versionId: rgp.versionId, approve: true, note: "Gift costs reviewed.", economicsReviewed: true });
  }

  /* UAT §6.4 — Members. */
  const M1 = await member("M-001", "Arjun Mehta", "Active, no inviter. Primary seller and inviter; holds the Desert Square Trip (TRIP-SEED-D).", null);
  const M2 = await member("M-002", "Neha Agarwal", "Active, invited by M-001. Her first sale earned M-001 the Desert Square Reference Credit.", "M-001");
  const M3 = await member("M-003", "Vikram Rathore", "Active, invited by M-001. Sold A-09 (excluded from Trip) and A-10A (shared A-10 pool).", "M-001");
  const M4 = await member("M-004", "Sunil Kothari", "Deactivated. Owes REC-001 (paid Direct on a cancelled sale).", "M-001", {
    mobile: `${MOBILE}99000004`,
    address: "14, Shanti Nagar",
  });
  const M5 = await member("M-005", "Pooja Bhandari", "Active, no inviter. Royalty Linked Member of C-009 and the RR-002 Customer; Buying Commission arranger.", null);
  const M6 = await member("M-006", "Karan Joshi", "Active, invited by M-002. His first sale earned M-002 (not M-001) a Reference Credit — no multi-level.", "M-002");
  const M7 = await member("M-007", "Ritu Saxena", "Active, no inviter. Has a Paid Early request waiting for MD (T20).", null);
  const M8 = await member("M-008", "Manoj Tiwari", "Active, no inviter. Also staff STF-UAT-01 (CRM): his Direct waits for MD (NT09).", null);
  await db.staffAccount.create({ data: { staffAccountId: STAFF_ID, personId: M8.id, role: "CRM", passwordHash: "!no-login-mock-staff" } });

  const buyer = (n: number) => person(`B-${String(n).padStart(2, "0")}`, `Buyer ${["Anil", "Sneha", "Rakesh", "Divya", "Mahesh", "Kavita", "Suresh", "Geeta", "Harish", "Lata", "Naresh", "Usha"][n - 1]} Sharma`, "Filler buyer.");

  /* TRIP-SEED-D — M-001 Own credits at T1 and T3, Reference at T2 (M-002's first sale). Target 3. */
  await pay(await sell(P.D.plots["D-01"], await buyer(1), { member: M1 }), "100");
  await pay(await sell(P.D.plots["D-02"], await buyer(2), { member: M2 }), "100");
  await pay(await sell(P.D.plots["D-03"], await buyer(3), { member: M1 }), "100");

  /* Aravali Greens Trip progress. */
  await pay(await sell(P.A.plots["A-01"], await buyer(4), { member: M1 }), "100");
  await pay(await sell(P.A.plots["A-02"], await buyer(5), { member: M6 }), "100");
  await pay(await sell(P.A.plots["A-09"], await buyer(6), { member: M3 }), "100");
  await pay(await sell(P.A.plots["A-10A"], await buyer(7), { member: M3 }), "40");

  /* UAT §6.5, §6.6 — Royalty. */
  const C9 = await person("C-009", "Rohan Malhotra", "RR-001 — final Royalty relationship to M-005, opportunity UNUSED. A Club-direct purchase paid to 100% earns M-005 a Gift.", { kyc: "verified" });
  await pay(await sell(P.A.plots["A-03"], C9, { member: M5 }), "100");

  const RR2 = await person("RR-002", "Anjali Kapoor", "RR-002 — Royalty relationship to M-005 with a Delivered Gift; opportunity CONSUMED.", { kyc: "verified" });
  await pay(await sell(P.A.plots["A-04"], RR2, { member: M5 }), "100");
  await pay(await sell(P.A.plots["A-05"], RR2), "100");
  const credit = await db.royaltyCredit.findFirstOrThrow({ where: { customerProfile: { personId: RR2.id }, state: "ELIGIBLE" } });
  await selectRoyaltyGift({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", creditId: credit.id, rewardRef: "RGP-01 / G-02 Smart watch", recipient: "SELF", recipientName: "" });
  await orderRoyaltyGift({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", creditId: credit.id, orderReference: reference("ORD"), orderedOn: today });
  await deliverRoyaltyGift({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", creditId: credit.id, deliveredOn: today, deliveryReference: reference("DLV") });

  const C10 = await person("C-010", "Farhan Qureshi", "First purchase Sold By 3% Club — no Royalty relationship, even after a Member sells to him later. His first sale was bought back (Buying Commission to M-005).");
  const c10First = await sell(P.B.plots["B-01"], C10);
  await pay(c10First, "100");
  await sell(P.B.plots["B-02"], C10, { member: M5 });

  const C11 = await person("C-011", "Sanjay Gupta", "Joint purchase with C-011B, Sold By M-005: only the Primary Customer forms a Royalty relationship. Shares a joint bank account with C-011B (exception waiting for Accounts).", { bank: false });
  const C11B = await person("C-011B", "Meena Gupta", "Additional Customer on C-011's Booking — no Royalty relationship of her own.", { bank: false });
  await pay(await sell(P.A.plots["A-06"], C11, { member: M5 }, [C11B]), "25");
  const joint = { accountHolder: "Sanjay & Meena Gupta", bankName: "HDFC Bank", branchName: "C-Scheme, Jaipur", accountNumber: "501002003004", ifsc: "HDFC0000123" };
  await enterBankDetails({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", personId: C11.id, ...joint });
  await enterBankDetails({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: C11B.id,
    ...joint,
    jointAccountProof: "Passbook first page names Sanjay Gupta and Meena Gupta as joint holders",
  });

  /* UAT §6.5 — Customer closers on Blue Ridge (Loyalty 2%). */
  const C1 = await person("C-001", "Deepika Rao", "Customer closer: own purchase, KYC verified, Customer Terms accepted, no closings yet.", { kyc: "verified" });
  await pay(await sell(P.B.plots["B-03"], C1), "100");
  await closerReady(C1);

  const C2 = await person("C-002", "Gaurav Singhal", "Customer closer with 2 valid Customer-closing events — the next one is the third.", { kyc: "verified" });
  await pay(await sell(P.B.plots["B-04"], C2), "100");
  await closerReady(C2);
  await pay(await sell(P.B.plots["B-05"], await buyer(8), { customer: C2 }), "100");
  await pay(await sell(P.B.plots["B-06"], await buyer(9), { customer: C2 }), "100");

  const C3 = await person("C-003", "Priyanka Jain", "3 valid Customer-closing events — blocked as a closer (T43 raised); Membership needed.", { kyc: "verified" });
  await pay(await sell(P.B.plots["B-07"], C3), "100");
  await closerReady(C3);
  for (const unit of ["B-08", "B-09", "B-10"]) await pay(await sell(P.B.plots[unit], await buyer(10 + ["B-08", "B-09", "B-10"].indexOf(unit)), { customer: C3 }), "100");

  const C4 = await person("C-004", "Amit Chauhan", "One prior approved purchase (paid by his father — third-party payer recorded). His next purchase is a repeat-purchase Loyalty test.", { kyc: "verified" });
  await pay(await sell(P.C.plots["C-01"], C4), "100", { payerName: "Ramesh Chauhan (father)", payerReference: "UTR 2026101000123" });

  const C5 = await person("C-005", "Nisha Verma", "No prior purchase — first-purchase control.");
  await enquiryOnly(C5, P.A.id);
  const C6 = await person("C-006", "Yogesh Pandey", "Own purchase, KYC missing — cannot be selected as Sold By Customer.", { kyc: "none" });
  await pay(await sell(P.C.plots["C-02"], C6), "25");
  const C7 = await person("C-007", "Shalini Mishra", "Own purchase, KYC verified, Customer Terms NOT accepted — closer Terms blocker.", { kyc: "verified" });
  await pay(await sell(P.C.plots["C-03"], C7), "25");
  const C8 = await person("C-008", "Tarun Bhatt", "No own approved purchase — random-person closer blocker.");
  await enquiryOnly(C8, P.A.id);

  /* REC-001 — M-004 is paid a Direct, the sale is cancelled, Accounts opens the Recovery, then M-004 is deactivated. */
  const recSale = await sell(P.E.plots["E-01"], await person("B-15", "Buyer Pradeep Sharma", "Filler buyer."), { member: M4 });
  await pay(recSale, "40");
  const recDirect = await directOf(recSale);
  await markCommissionPaid({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: recDirect.id, early: false, paidOn: today, reference: reference("COM"), remarks: "" });
  await cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: recSale, reason: "Buyer withdrew after the Direct was paid." });
  await decideCancellation({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: recSale, approve: true, note: "Refund processed.", reference: reference("RFD"), actionDate: today });
  await openRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: recDirect.id, noticeOn: today, reference: `${REF}-REC-001`, reason: "Direct paid on a sale later cancelled." });
  await setMemberStatus({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", memberProfileId: members["M-004"].profileId, active: false, reason: "Recovery unresolved — deactivation test (UAT §6.4)." });

  /* C-012 — shares M-004's mobile and address; closes a sale, so the Loyalty waits for NT08. */
  const C12 = await person("C-012", "Kamal Kothari", "Shares mobile and address with M-004 (owes REC-001): his Customer-closing Loyalty waits for the Recovery Circumvention Review (NT08).", {
    kyc: "verified",
    mobile: M4.mobile,
    address: "14 Shanti Nagar",
  });
  await pay(await sell(P.C.plots["C-04"], C12), "100");
  await closerReady(C12);
  await pay(await sell(P.C.plots["C-05"], await person("B-16", "Buyer Sarita Sharma", "Filler buyer."), { customer: C12 }), "100");

  /* CTL-10 — M-008 is staff: his own Direct waits for MD. */
  await pay(await sell(P.E.plots["E-02"], await person("B-13", "Buyer Rekha Sharma", "Filler buyer."), { member: M8 }), "40");

  /* T20 — a Paid Early request waiting for MD. */
  const earlySale = await sell(P.A.plots["A-07"], await person("B-14", "Buyer Vinod Sharma", "Filler buyer."), { member: M7 });
  await pay(earlySale, "10");
  await requestCommissionPaidEarly({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: (await directOf(earlySale)).id, reason: "Member requested an advance; milestone not yet reached." });

  /* Buying Commission — C-010's first purchase bought back, arranged by M-005. */
  const buyback = await createAcquisition({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    type: "BUYBACK",
    sourceBookingId: c10First,
    sellerPersonId: C10.id,
    arrangedByType: "MEMBER",
    arrangedByPersonId: M5.id,
    purchaseDate: today,
    remark: "UAT Buyback of B-01.",
    schedule: [
      { seq: 1, percent: "25", dueDate: today },
      { seq: 2, percent: "75", dueDate: day(30) },
    ],
  });
  await confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: buyback.acquisitionId, percent: "25", paidOn: today, reference: reference("GIV") });
  await decideAcquisition({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: buyback.acquisitionId, approve: true, note: "Buyback approved." });
  await recordBuyingCommission({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", acquisitionId: buyback.acquisitionId, beneficiaryPersonId: M5.id, percent: "1" });

  /* Repeat-purchase Loyalty — C-014's second own purchase, Club-direct, paid in full. */
  const C14 = await person("C-014", "Rahul Bajaj", "Repeat-purchase Loyalty earned on his second own purchase (Cedar Estate C-07) — Ready for Accounts.", { kyc: "verified" });
  await pay(await sell(P.C.plots["C-06"], C14), "100");
  await pay(await sell(P.C.plots["C-07"], C14), "100");

  /* Pre-sales — Enquiries from each source, Holds, and a Booking Request waiting for Accounts. */
  for (const [who, projectId, source, member] of [
    [C5, P.D.id, "BY_MEMBER", "M-001"],
    [C8, P.E.id, "SITE_VISIT", null],
    [C1, P.D.id, "EXISTING_CUSTOMER", null],
    [C14, P.E.id, "ONLINE", null],
  ] as const) {
    await createEnquiry({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      personId: who.id,
      projectId,
      source,
      sourceMemberId: member ? members[member].profileId : null,
      assignedStaffId: crmAccountId,
      assigneeRole: "CRM",
      nextFollowUpAt: day(2),
      remark: `${who.label} — follow up on site visit and pricing`,
    });
  }
  await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: P.A.plots["A-11"], personId: C5.id, sourcedByType: "MEMBER", sourcedByPersonId: M1.id, remark: "Holding for C-005 while finance is arranged." });
  await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: P.E.plots["E-05"], personId: C8.id, remark: "Site visit next week." });
  await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: P.A.plots["A-12"],
    parties: [{ personId: C5.id, role: "PRIMARY" }],
    soldByType: "MEMBER",
    soldByPersonId: M1.id,
    bookingDate: today,
    customerType: "END_USER",
    schedule: SCHEDULE,
  });

  /* PSV-A2 — the later approved version, effective in 30 days. */
  await settings(P.A.id, {
    ...base,
    effectiveFrom: day(30),
    directEnabled: true,
    directPercent: "2.5",
    loyaltyEnabled: true,
    loyaltyPercent: "1.5",
    reason: "PSV-A2 — later approved version",
    trip: trip("TRIP-A", 6, 4, 2, "TRIP-A-2", { excludedPlotIds: [P.A.plots["A-09"]] }),
  });

  await writeKey();
  await db.$disconnect();
}

/* ------------------------------------------------------------- the key */

async function writeKey() {
  const ids = await db.person.findMany({
    where: { id: { in: people.map((p) => p.id) } },
    select: { id: true, customerProfile: { select: { customerId: true } }, memberProfile: { select: { memberId: true, status: true } } },
  });
  const byId = new Map(ids.map((p) => [p.id, p]));
  const row = (p: Made) => {
    const found = byId.get(p.id);
    const crmId = [found?.memberProfile?.memberId, found?.customerProfile?.customerId].filter(Boolean).join(" / ") || "—";
    return `| ${p.label} | ${p.name} | ${crmId} | ${p.mobile} | ${p.note} |`;
  };
  const counts = await Promise.all([
    db.tripReward.count({ where: { memberProfile: { personId: { in: people.map((p) => p.id) } } } }),
    db.recovery.count({ where: { personId: { in: people.map((p) => p.id) }, status: "OUTSTANDING" } }),
    db.circumventionReview.count({ where: { subjectPersonId: { in: people.map((p) => p.id) } } }),
    db.staffConflictReview.count({ where: { personId: { in: people.map((p) => p.id) } } }),
  ]);
  const lines = [
    "# Business Model v2 — Mock Data Key",
    "",
    `Generated by \`npm run seed:mock-v2\` on ${new Date().toISOString().slice(0, 10)} from UAT plan §6. Re-running the seed rebuilds all of it.`,
    "",
    "Staff: STF-0001 MD · STF-0002 Admin · STF-0003 / STF-0004 Accounts · STF-0005 CRM · STF-UAT-01 is Member M-008 (mock staff, cannot log in).",
    "",
    "## Projects and settings (UAT §6.2, §6.3)",
    "",
    "| Project | Settings | Trip |",
    "|---|---|---|",
    "| Aravali Greens (A-01…A-20, A-10A, A-10B) | PSV-A1 Direct 3% / Loyalty 1% · PSV-A2 2.5% / 1.5% approved, effective in 30 days | TRIP-A 5 / min Own 3 / max Ref 2 · A-09 excluded · A-10A, A-10B share the A-10 pool |",
    "| Blue Ridge (B-01…B-10) | PSV-B1 Direct 5% / Loyalty 2% | Disabled |",
    "| Cedar Estate (C-01…C-10) | PSV-C1 Direct Disabled / Loyalty 2% (MD exception) | TRIP-C 4 / 4 / 0 |",
    "| Desert Square (D-01…D-10) | PSV-D1 Direct 2% = Loyalty 2% (MD exception) | TRIP-D 3 / 2 / 1 |",
    "| Everest Park (E-01…E-10) | PSV-E1 Direct 3% / Loyalty Disabled | TRIP-E 4 / 3 / 1 |",
    "",
    "Royalty Gift Programme RGP-01 is live. Terms: Customer CT-2026-10, Member MT-2026-10.",
    "",
    "## People",
    "",
    "| UAT ID | Name | CRM ID | Mobile | What it is for |",
    "|---|---|---|---|---|",
    ...people.filter((p) => !p.label.startsWith("B-")).map(row),
    "",
    "Filler buyers (Buyer … Sharma) carry mobiles 95… and exist only to buy.",
    "",
    "## Where to look",
    "",
    `- Trip Rewards earned: ${counts[0]} — M-001 on Desert Square (Members → M-001 → Trip). Record the traveller, book, mark travelled.`,
    `- Recovery Outstanding: ${counts[1]} — REC-001 on M-004 (Rewards → Recovery).`,
    `- Circumvention reviews: ${counts[2]} — C-012 (Rewards → Reviews, Accounts or MD clears/restricts).`,
    `- Staff-conflict reviews: ${counts[3]} — M-008's Direct (Rewards → Reviews, MD approves).`,
    "- Joint bank account exception: C-011B (task for Accounts; verify from the Member/Customer bank tab).",
    "- Paid Early request: M-007's Direct on A-07 (Bookings → Commission; MD approves).",
    "- Buyback + Buying Commission: B-01, arranged by M-005 (Acquisitions; Reward Review — Approved Buyback task).",
    "- Customer closers: C-001 ready · C-002 has 2 closings · C-003 has 3 (blocked) · C-006 no KYC · C-007 no Terms · C-008 no purchase.",
    "- Project settings: Aravali Greens shows PSV-A2 Approved, waiting for its effective time.",
    "- Repeat-purchase Loyalty: C-014 (Bookings → C-07 → Commission).",
    "- Pre-sales: 4 Enquiries (Member, site visit, existing Customer, online), Holds on A-11 and E-05, and C-005's Booking Request on A-12 waiting for Accounts.",
    "- Member Portal: sign in with any Member ID above and the initial portal password set at activation (INITIAL_PORTAL_PASSWORD in src/lib/security/auth.ts).",
    "",
  ];
  writeFileSync("docss/9. Business_Model_v2_Mock_Data_Key.md", lines.join("\n"), "utf-8");
  console.log(lines.join("\n"));
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
