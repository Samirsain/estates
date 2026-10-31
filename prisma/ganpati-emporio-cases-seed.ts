// Every case on Ganpati Estate Emporio (owner, 31 Oct 2026), so the whole CRM
// can be tested on one Project. Three records carry every field the screens
// can set — open these first:
//
//   Plot 11B   park-facing on the 40 ft road (PLC 3%): site-measured area and
//              every boundary named; Enquiry by Member → four follow-ups → Hold
//              → extension → joint Booking Request corrected → approved → 30%
//              paid by her father → 40% entered wrongly, corrected to 35% →
//              schedule revised → shares 50/50 → 60/40 → cancellation refused
//              → 100% → final buyers with PAN → Allotment → reopened by MD →
//              Registry. Direct paid.
//   Member Gurpreet Singh Sidhu    every profile field; invited by Hemant;
//              invited Manpreet; sold 11B and 28, Manpreet's first sale is his
//              Reference Credit → Reward; Royalty points earned and spent;
//              Hemant's sale on 8A corrected to him.
//   Customer Simranjeet Kaur Brar  every profile field; 11B jointly with her
//              husband; repeat purchase 5A (Loyalty, Gurpreet's Royalty points);
//              closed 5B for a friend (Loyalty); introduced an Enquiry; a second
//              Enquiry of her own; a Hold on 4A.
//
// And one of each other case — restrictions, every Enquiry source and outcome,
// Holds expired / cancelled / extension refused, Booking Requests rejected,
// corrected, waiting over 7 days, payer-named payment, schedule revisions
// approved / rejected / waiting, cancellations refunded / refused / waiting,
// Change Plot approved / waiting, Sold By corrections approved / rejected /
// waiting, Primary Customer changes, Paid Early approved / rejected / waiting,
// two Recoveries (repaid, set off), a Member buying for himself, both resale
// Plots sold again, manual tasks, settings v2 (Rewards) and v3 (from 1 Nov).
//
//   node --env-file=.env --import ./prisma/alias-loader.mjs prisma/ganpati-emporio-cases-seed.ts
//
// Runs after ganpati-emporio-sales-seed.ts and buyback-seed.ts; seed:fresh runs
// it itself. Only what the screens can enter (mock-data rule, 30 Oct 2026).
// Not re-runnable on top of itself: it stops if Gurpreet already exists.
import { assertCheckDatabase } from "./check-guard.ts";
import { installStoryClock, at } from "./demo/story-clock.ts";

assertCheckDatabase();
installStoryClock();

const T = await import("./demo/toolkit.ts");
const { db, key, people, projectIds, MD, CRM, ACC, ACC2, inDays } = T;
const { aadhaarLastFour, blindIndex, encryptSensitive, normaliseAadhaar } = await import("@/lib/security/identity");
const { MEMBER_TERMS_VERSION } = await import("@/lib/terms");
const { activateMember } = await import("@/lib/services/network-service");
const { enterBankDetails } = await import("@/lib/services/bank-service");
const { verifyAadhaar } = await import("@/lib/services/customer-closer-service");
const { updateProject } = await import("@/lib/services/project-service");
const { setRestriction, updatePlotDetails } = await import("@/lib/services/inventory-service");
const { createEnquiry, recordFollowUp, closeEnquiry } = await import("@/lib/services/enquiry-service");
const { createHold, cancelHold, requestHoldExtension, decideHoldExtension } = await import("@/lib/services/hold-service");
const Bk = await import("@/lib/services/booking-service");
const { decideCancellation } = await import("@/lib/services/cancellation-service");
const { submitChangePlot, decideChangePlot } = await import("@/lib/services/change-plot-service");
const { confirmPaymentReceived, correctPaymentReceived, reviseSchedule, decideScheduleRevision } = await import("@/lib/services/payment-service");
const { recordFinalBuyers, recordCompletion, reopenDelivered } = await import("@/lib/services/completion-service");
const Cm = await import("@/lib/services/commission-service");
const { openRecovery, clearRecovery, setOffRecovery } = await import("@/lib/services/recovery-service");
const { recordTokenRedemption } = await import("@/lib/services/royalty-service");
const { ensureTask } = await import("@/lib/services/task-service");
const { istDay } = await import("@/lib/tasks");
const { runAllJobs } = await import("@/lib/jobs");

/* ------------------------------------------------------------------ people */

type Spec = {
  name: string;
  kyc?: "none" | "available" | "verified";
  bank?: boolean;
  address?: string;
  nickname?: string;
  altMobile?: string;
  email?: string;
  dob?: string;
};
// Their own mobiles (97840…), so no other seed's wipe ever reaches them.
const mobile = (n: number) => `97840${String(n).padStart(5, "0")}`;
const CAST: Record<string, Spec> = {
  G1: { name: "Gurpreet Singh Sidhu", kyc: "verified", bank: true, address: "House 14, Sector 9, Hanumangarh Jn.", nickname: "Sidhu sahab", altMobile: mobile(81), email: "gurpreet.sidhu@example.in", dob: "1981-04-13" },
  G2: { name: "Manpreet Kaur Sandhu", kyc: "verified", bank: true, address: "52, Ward 7, Hanumangarh Town" },
  G3: { name: "Rakesh Kumar Godara", kyc: "verified", bank: true, address: "Godara Market, Sangaria Road" },
  H1: { name: "Simranjeet Kaur Brar", kyc: "verified", bank: true, address: "House 7, Sector 12, Hanumangarh Jn.", nickname: "Simran ji", altMobile: mobile(82), email: "simranjeet.brar@example.in", dob: "1987-09-22" },
  H2: { name: "Jaspreet Singh Brar", kyc: "verified", bank: true, address: "House 7, Sector 12, Hanumangarh Jn.", email: "jaspreet.brar@example.in", dob: "1984-02-05" },
  b1: { name: "Harvinder Singh Gill", kyc: "verified" },
  b2: { name: "Sunita Rani Kaswan", kyc: "verified" },
  b3: { name: "Ajay Kumar Swami", kyc: "available" },
  b4: { name: "Rajveer Singh Bhati", kyc: "available" },
  b5: { name: "Mohan Lal Meghwal", kyc: "none" },
  b6: { name: "Kuldeep Singh Dhaliwal", kyc: "none" },
  b7: { name: "Pankaj Agarwal", kyc: "none" },
  b8: { name: "Lakhvinder Kaur", kyc: "none" },
  b9: { name: "Vikram Choudhary", kyc: "none" },
  b10: { name: "Ravinder Kumar Jakhar", kyc: "available" },
  b11: { name: "Seema Godara", kyc: "available" },
  b12: { name: "Anoop Singh Rathore", kyc: "verified" },
  b13: { name: "Deepak Kumar Nain", kyc: "available" },
  b14: { name: "Sanjay Kumar Bishnoi", kyc: "verified" },
  b15: { name: "Mukesh Kumar Saharan", kyc: "available" },
  b16: { name: "Rajesh Kumar Poonia", kyc: "available" },
  b17: { name: "Naresh Kumar Beniwal", kyc: "verified" },
  b18: { name: "Sushil Kumar Sihag", kyc: "verified" },
  b19: { name: "Ramesh Bhadu", kyc: "verified" },
  b20: { name: "Jaswant Singh", kyc: "available" },
  b21: { name: "Kamal Kishore Garg", kyc: "available" },
};
const BANKS = [
  ["State Bank of India", "Hanumangarh Jn.", "SBIN0031225"],
  ["Punjab National Bank", "Hanumangarh Town", "PUNB0389200"],
  ["HDFC Bank", "Sector 5, Hanumangarh", "HDFC0001953"],
  ["ICICI Bank", "Sangaria", "ICIC0006306"],
] as const;

let n = 0;
async function person(k: string) {
  if (people[k]) return people[k];
  const spec = CAST[k];
  const i = ++n;
  const aadhaar = `6${String(52100000000 + i * 17).padStart(11, "0")}`;
  const created = await db.person.create({
    data: {
      fullName: spec.name,
      primaryMobile: mobile(i),
      city: "Hanumangarh",
      addressLine: spec.address ?? `${10 + i}, Ward ${(i % 12) + 1}, Hanumangarh Jn.`,
      nickname: spec.nickname ?? null,
      altMobile: spec.altMobile ?? null,
      email: spec.email ?? null,
      dateOfBirth: spec.dob ? new Date(`${spec.dob}T00:00:00.000Z`) : null,
      ...(spec.kyc === "none" || !spec.kyc
        ? {}
        : {
            aadhaarCipher: encryptSensitive(normaliseAadhaar(aadhaar)),
            aadhaarLastFour: aadhaarLastFour(aadhaar),
            aadhaarBlindIndex: blindIndex(normaliseAadhaar(aadhaar)),
            aadhaarStatus: "AVAILABLE",
          }),
    },
  });
  if (spec.kyc === "verified") await verifyAadhaar({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", personId: created.id });
  if (spec.bank) {
    const [bankName, branchName, ifsc] = BANKS[i % BANKS.length];
    await enterBankDetails({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", personId: created.id, accountHolder: spec.name, bankName, branchName, accountNumber: `6${String(40011000000 + i * 19).padStart(11, "0")}`, ifsc });
  }
  people[k] = { id: created.id, name: spec.name, mobile: mobile(i), key: k, note: "" };
  return people[k];
}

async function member(k: string, inviter: string | null, reraNo: string) {
  const who = await person(k);
  const made = await activateMember({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    personId: who.id,
    invitedByMemberId: inviter ? people[inviter].profileId! : null,
    reraStatus: "REGISTERED",
    reraNumber: reraNo,
    reraExpiryDate: new Date("2028-06-30T00:00:00+05:30"),
  });
  await db.memberTermsAcceptance.create({ data: { memberProfileId: made.memberProfileId, version: MEMBER_TERMS_VERSION } });
  who.profileId = made.memberProfileId;
}

/* --------------------------------------------------------------- helpers */

const P = (k: string) => people[k];
const plots = new Map<string, string>();
const pid = (plot: string) => plots.get(plot) ?? (() => { throw new Error(`GEE has no unit ${plot}`); })();
const B: Record<string, string> = {};
const E: Record<string, string> = {};
let refSeq = 0;
const ref = (kind: "GEEUTR" | "GEENEFT" | "GEERFD") => `${kind}${String(77100 + ++refSeq * 7).padStart(6, "0")}`;

/** The live Booking on one of the sales seed's Plots. */
async function live(plot: string) {
  if (B[plot]) return B[plot];
  const b = await db.booking.findFirstOrThrow({
    where: { plotId: pid(plot), status: { in: ["REQUEST_PENDING", "BOOKED", "PAYMENT_COMPLETED", "DELIVERED"] } },
  });
  return (B[plot] = b.id);
}

const SCHEDULES = {
  standard: () => [
    { seq: 1, percent: "30", dueDate: new Date() },
    { seq: 2, percent: "35", dueDate: inDays(30) },
    { seq: 3, percent: "35", dueDate: inDays(60) },
  ],
  two: () => [
    { seq: 1, percent: "30", dueDate: new Date() },
    { seq: 2, percent: "70", dueDate: inDays(45) },
  ],
  full: () => [{ seq: 1, percent: "100", dueDate: new Date() }],
};
type By = { member?: string; customer?: string };
const soldBy = (by: By) =>
  by.member
    ? { soldByType: "MEMBER" as const, soldByPersonId: P(by.member).id }
    : by.customer
      ? { soldByType: "CUSTOMER" as const, soldByPersonId: P(by.customer).id }
      : { soldByType: "THREE_PERCENT_CLUB" as const, soldByPersonId: null };

async function submit(plot: string, buyer: string, by: By = {}, schedule: keyof typeof SCHEDULES = "standard") {
  const made = await Bk.submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: pid(plot),
    parties: [{ personId: (await person(buyer)).id, role: "PRIMARY", sharePercent: null }],
    ...soldBy(by),
    bookingDate: new Date(),
    schedule: SCHEDULES[schedule](),
  });
  return (B[plot] = made.bookingId);
}
const approve = (plot: string, note = "Approved — details and schedule are correct") =>
  Bk.decideBookingRequest({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B[plot], approve: true, note });
const pay = async (plot: string, percent: string, payer?: { payerName: string; payerReference: string }) =>
  confirmPaymentReceived({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: await live(plot), percent, paidOn: new Date(), reference: ref("GEEUTR"), ...payer });
async function sale(plot: string, buyer: string, by: By, percent: string, schedule: keyof typeof SCHEDULES = "standard") {
  await submit(plot, buyer, by, schedule);
  await approve(plot);
  await pay(plot, percent);
}
const record = async (plot: string, type: "DIRECT" | "LOYALTY" = "DIRECT") =>
  db.commissionRecord.findFirstOrThrow({ where: { bookingId: await live(plot), type, isCurrent: true }, orderBy: { createdAt: "desc" } });
async function cancelAndRefund(plot: string, reason: string) {
  const bookingId = await live(plot);
  await Bk.cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId, reason });
  await decideCancellation({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId, approve: true, note: "Approved — refund as per the agreement", reference: ref("GEERFD"), actionDate: new Date() });
}
/** The live schedule with every instalment after the first a month later. */
async function laterSchedule(plot: string) {
  const v = await db.paymentScheduleVersion.findFirstOrThrow({
    where: { bookingId: await live(plot), status: "ACTIVE" },
    include: { instalments: { orderBy: { seq: "asc" } } },
  });
  return v.instalments.map((i, k) => ({ seq: i.seq, percent: i.scheduledPercent.toString(), dueDate: k === 0 ? i.dueDate : new Date(i.dueDate.getTime() + 30 * 86_400_000) }));
}
let crmStaffId = "";
async function enquiry(who: string, source: "ONLINE" | "SITE_VISIT" | "BY_MEMBER" | "BY_CUSTOMER" | "EXISTING_CUSTOMER" | "DIRECT", remark: string, opts: { member?: string; customer?: string; plot?: string; followUpInDays?: number } = {}) {
  crmStaffId ||= (await db.staffAccount.findFirstOrThrow({ where: { staffAccountId: CRM } })).id;
  const made = await createEnquiry({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: (await person(who)).id,
    projectId: projectIds.GEE,
    plotId: opts.plot ? pid(opts.plot) : undefined,
    source,
    sourceMemberId: opts.member ? P(opts.member).profileId! : null,
    sourceCustomerId: opts.customer ? (await db.customerProfile.findUniqueOrThrow({ where: { personId: P(opts.customer).id } })).id : null,
    assignedStaffId: crmStaffId,
    assigneeRole: "CRM",
    nextFollowUpAt: inDays(opts.followUpInDays ?? 2),
    remark,
  });
  return (made as { enquiryId: string }).enquiryId;
}
const followUp = (eq: string, outcome: "CONTACTED" | "NOT_ANSWERED" | "CALL_LATER" | "SITE_VISIT_PLANNED" | "BOOKING_DISCUSSION", remark: string, days: number) =>
  recordFollowUp({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", enquiryId: E[eq], outcome, remark, nextAt: inDays(days) });

const steps: { day: string; time: string; label: string; run: () => Promise<unknown> }[] = [];
const on = (day: string, label: string, run: () => Promise<unknown>, time = "13:00") => steps.push({ day, time, label, run });

const trip = {
  tripEnabled: true,
  tripTotalTarget: 3,
  tripMinOwnCredits: 2,
  tripMaxReferenceCredits: 1,
  tripProgrammeCode: "TRIP-GEE-26",
  tripProgrammeVersionRef: "TRIP-GEE-26 v1",
  tripTermsVersionRef: "TRIP-GEE-2026-1",
  tripCutOffAt: null,
  tripWindDownAt: null,
  excludedPlotIds: [],
  sharedPools: [],
};
const base = { loyaltyExceptionReason: null, effectiveFrom: null } as const;

/* -------------------------------------------------- the Project and Members */

on("2026-09-02", "GEE: every Project field, Rewards programme, restricted kiosks", async () => {
  const gee = await db.project.findUniqueOrThrow({ where: { id: projectIds.GEE } });
  await updateProject({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    projectId: gee.id,
    name: gee.name,
    type: gee.type,
    developer: "Ganpati Builders & Developers",
    location: gee.location,
    locationUrl: "https://maps.google.com/?q=29.5967,74.3307",
    driveUrl: "https://drive.google.com/drive/folders/1GEE-layout-and-plans",
    renderUrl: "https://drive.google.com/drive/folders/1GEE-3d-visuals",
    city: gee.city,
    amenities: gee.amenities,
    reraNumber: "RAJ/P/2026/2981",
    reason: "Project RERA number added",
  });
  await T.settings(gee.id, { ...base, directEnabled: true, directPercent: "3", loyaltyEnabled: true, loyaltyPercent: "1", royaltyTokensPerAward: 10, reason: "Reward added / removed", trip });
  for (const [plot, restriction, reason] of [
    ["K-5", "NOT_YET_RELEASED", "Issue on the Plot"],
    ["K-6", "PLEDGE", "Pledged to the Nagarpalika"],
    ["K-7", "NOT_FOR_SALE", "Not for sale"],
  ] as const) {
    await setRestriction({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", plotId: pid(plot), restriction, reason });
  }
}, "10:00");

on("2026-09-02", "Gurpreet (invited by Hemant), Manpreet (invited by Gurpreet) and Rakesh join", async () => {
  const hemant = await db.memberProfile.findFirstOrThrow({ where: { memberId: "MEM-000001" }, include: { person: true } });
  people.F01 = { id: hemant.personId, name: hemant.person.fullName, mobile: hemant.person.primaryMobile, key: "F01", note: "", profileId: hemant.id };
  await member("G1", "F01", "RAJ/A/2026/HMH0141");
  await member("G2", "G1", "RAJ/A/2026/HMH0152");
  await member("G3", null, "RAJ/A/2026/HMH0163");
}, "11:00");

/* ------------------------------------------------ 11B, every field there is */

on("2026-09-04", "11B: area measured on site, every boundary named", () =>
  updatePlotDetails({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    plotId: pid("11B"),
    widthFt: "14.5",
    lengthFt: "69.5",
    exactAreaSqFt: "1012",
    exactAreaReason: "As per the site survey",
    boundaries: [
      { side: "NORTH", kind: "ROAD", roadWidthFt: "40", reference: "40 ft internal road" },
      { side: "SOUTH", kind: "PARK", reference: "Park & Public Utility" },
      { side: "WEST", kind: "PLOT", reference: "Plot 11A" },
      { side: "EAST", kind: "PLOT", reference: "Plot 10A" },
    ],
    reason: "Correction after site measurement",
  })
);
let hold11B = "";
on("2026-09-05", "11B: Gurpreet brings Simranjeet and her husband", async () => {
  await person("H2");
  E.H1 = await enquiry("H1", "BY_MEMBER", "Looking for a specific size or facing", { member: "G1", plot: "11B", followUpInDays: 1 });
}, "10:00");
on("2026-09-06", "11B: phone not answered", () => followUp("H1", "NOT_ANSWERED", "Will discuss with family and call back", 1));
on("2026-09-07", "11B: price list sent", () => followUp("H1", "CONTACTED", "Price list and brochure sent on WhatsApp", 2));
on("2026-09-08", "11B: site visit fixed", () => followUp("H1", "SITE_VISIT_PLANNED", "Will visit the site this weekend", 2));
on("2026-09-10", "11B: ready to book after the visit; Hold", async () => {
  await followUp("H1", "BOOKING_DISCUSSION", "Ready to book, waiting for the token amount", 2);
  hold11B = (await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: pid("11B"), personId: P("H1").id, enquiryId: E.H1, sourcedByType: "MEMBER", sourcedByPersonId: P("G1").id, remark: "Customer is arranging the booking amount" })).holdId;
});
on("2026-09-11", "11B: Hold extended for the bank loan", async () => {
  const { extensionRequestId } = await requestHoldExtension({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", holdId: hold11B, reason: "Waiting for bank loan approval", requestedHours: 48 });
  await decideHoldExtension({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", requestId: extensionRequestId, approve: true, note: "Approved — genuine reason given" });
});
on("2026-09-12", "11B: joint Booking Request, corrected and sent again", async () => {
  const request = {
    actorRef: CRM,
    actorRole: "CRM",
    parties: [
      { personId: P("H1").id, role: "PRIMARY" as const, sharePercent: "50" },
      { personId: P("H2").id, role: "ADDITIONAL" as const, sharePercent: "50" },
    ],
    ...soldBy({ member: "G1" }),
    bookingDate: new Date(),
  };
  B["11B"] = (
    await Bk.submitBookingRequest({
      ...request,
      idempotencyKey: key(),
      plotId: pid("11B"),
      enquiryId: E.H1,
      holdId: hold11B,
      schedule: [
        { seq: 1, percent: "30", dueDate: new Date() },
        { seq: 2, percent: "40", dueDate: inDays(15) },
        { seq: 3, percent: "30", dueDate: inDays(25) },
      ],
    })
  ).bookingId;
  await Bk.reviseBookingRequest({ ...request, idempotencyKey: key(), bookingId: B["11B"], schedule: SCHEDULES.standard(), reason: "Payment schedule corrected as Accounts asked" });
});
on("2026-09-13", "11B: approved; 30% paid by her father", async () => {
  await approve("11B", "Approved — payment checked in the bank statement");
  await pay("11B", "30", { payerName: "Harbhajan Singh Dhillon (father)", payerReference: ref("GEEUTR") });
});
on("2026-09-20", "11B: 40% entered, a second Accounts login corrects it to 35%", async () => {
  await pay("11B", "40");
  const entry = await db.paymentReceivedEntry.findFirstOrThrow({ where: { bookingId: B["11B"], status: "CONFIRMED" }, orderBy: { recordedAt: "desc" } });
  await correctPaymentReceived({ idempotencyKey: key(), actorRef: ACC2, actorRole: "ACCOUNTS", entryId: entry.id, percent: "35", paidOn: new Date(), reference: ref("GEEUTR"), reason: "Wrong amount entered" });
});
on("2026-09-24", "11B: last instalment moved for the bank loan", async () => {
  await reviseSchedule({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["11B"], lines: await laterSchedule("11B"), reason: "Bank loan disbursement delayed" });
  await decideScheduleRevision({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B["11B"], approve: true, note: "Approved — matches the customer's written request" });
});
on("2026-09-26", "11B: shares 50/50 → 60/40", () =>
  Bk.changeOwnershipShares({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["11B"], parties: [
    { personId: P("H1").id, role: "PRIMARY", sharePercent: "60" },
    { personId: P("H2").id, role: "ADDITIONAL", sharePercent: "40" },
  ], reason: "Family settlement between the buyers" })
);
on("2026-09-28", "11B: cancellation asked", () =>
  Bk.cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["11B"], reason: "Family emergency or money problem" })
);
on("2026-09-29", "11B: cancellation refused — the loan came through", () =>
  decideCancellation({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B["11B"], approve: false, note: "Rejected — customer withdrew the cancellation" })
);
on("2026-10-08", "11B: last 35% — paid in full", () => pay("11B", "35"), "12:00");
const buyers11B = () =>
  recordFinalBuyers({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["11B"], buyers: [
    { personId: P("H1").id, sharePercent: "60", dateOfBirth: new Date("1987-09-22"), address: "House 7, Sector 12, Hanumangarh Jn.", pan: "AHBPB4821K" },
    { personId: P("H2").id, sharePercent: "40", dateOfBirth: new Date("1984-02-05"), address: "House 7, Sector 12, Hanumangarh Jn.", pan: "CJRPB7364L" },
  ] });
on("2026-10-10", "11B: final buyers with PAN", buyers11B);
on("2026-10-12", "11B: Allotment — Delivered", () =>
  recordCompletion({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["11B"], completion: { route: "ALLOTMENT", allotmentGiven: true, allotmentDate: new Date(), allotmentNumber: "ALT/GEE/2026/011B", allotmentGivenTo: "Simranjeet Kaur Brar", pattaStatus: "YES", pattaDate: new Date() } })
);
on("2026-10-14", "11B: MD reopens", () =>
  reopenDelivered({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", bookingId: B["11B"], reason: "Allotment letter issued with a mistake" })
);
on("2026-10-16", "11B: Registry — Delivered", async () => {
  await buyers11B();
  await recordCompletion({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["11B"], completion: { route: "REGISTRY", advocateName: "Adv. Harjinder Singh Gill", registryDate: new Date() } });
});

/* -------------------------------------- Gurpreet's Reward, Simranjeet's Loyalty */

on("2026-09-15", "28: Gurpreet's second sale, paid in full", () => sale("28", "b1", { member: "G1" }, "100", "full"));
on("2026-09-18", "6A: Manpreet's first sale — Gurpreet's Reference Credit", () => sale("6A", "b2", { member: "G2" }, "100", "full"));
on("2026-10-18", "5A: Simranjeet buys again from the Club", () => sale("5A", "H1", {}, "100", "full"));
on("2026-10-20", "5B: Simranjeet closes a sale for Ajay Kumar Swami", () => sale("5B", "b3", { customer: "H1" }, "100", "full"));
const spend = (tokens: number, what: string) =>
  recordTokenRedemption({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", memberProfileId: P("G1").profileId!, tokens, redeemedOn: istDay(new Date()), recipient: "SELF", recipientName: "", reference: what });
on("2026-10-24", "Gurpreet spends Royalty points", async () => {
  await spend(6, "Gift voucher");
  await spend(2, "Gift item from the catalogue");
}, "15:00");
on("2026-10-24", "Simranjeet introduces Kuldeep", async () => {
  E.b6 = await enquiry("b6", "BY_CUSTOMER", "Asked for the price list and brochure", { customer: "H1" });
});
on("2026-10-26", "Kuldeep's Enquiry closed", () => closeEnquiry({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", enquiryId: E.b6, closeReason: "Budget does not match" }));
on("2026-10-28", "Simranjeet asks about a shop", async () => {
  E.H1b = await enquiry("H1", "EXISTING_CUSTOMER", "Looking for a specific size or facing", { plot: "S-26", followUpInDays: 1 });
  await followUp("H1b", "CALL_LATER", "Will discuss with family and call back", 5);
});
on("2026-10-30", "Hold on 4A for Simranjeet", () =>
  createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: pid("4A"), personId: P("H1").id, remark: "Customer wants a site visit first" })
);

/* --------------------------------------------------- Enquiries, every source */

on("2026-09-21", "Online Enquiry", async () => {
  E.b7 = await enquiry("b7", "ONLINE", "Call from an advertisement", { followUpInDays: 45 });
});
on("2026-10-03", "Walk-in at the site; not answered, then call later", async () => {
  E.b8 = await enquiry("b8", "SITE_VISIT", "Walk-in at the site", { followUpInDays: 1 });
  await followUp("b8", "NOT_ANSWERED", "Will discuss with family and call back", 1);
});
on("2026-10-05", "Lakhvinder will call back", () => followUp("b8", "CALL_LATER", "Will discuss with family and call back", 20));
on("2026-10-05", "Direct Enquiry — its follow-up is now overdue", async () => {
  E.b9 = await enquiry("b9", "DIRECT", "Looking for a specific size or facing", { plot: "17", followUpInDays: 2 });
});

/* --------------------------------------------------------- Holds */

on("2026-10-20", "Hold on S-10 — left to expire", async () =>
  createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: pid("S-10"), personId: (await person("b10")).id, remark: "Customer is arranging the booking amount" })
);
on("2026-10-22", "Hold on S-11", async () => {
  B.holdS11 = (await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: pid("S-11"), personId: (await person("b11")).id, remark: "Customer wants a site visit first" })).holdId;
});
on("2026-10-23", "Hold on S-11 cancelled", () => cancelHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", holdId: B.holdS11, reason: "Customer not reachable" }));
on("2026-10-30", "Extension on 9A refused", async () => {
  const hold = await db.hold.findFirstOrThrow({ where: { plotId: pid("9A"), status: "ACTIVE" } });
  const { extensionRequestId } = await requestHoldExtension({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", holdId: hold.id, reason: "Customer is asking for discount", requestedHours: 24 });
  await decideHoldExtension({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", requestId: extensionRequestId, approve: false, note: "Rejected — another buyer is waiting for this Plot" });
}, "16:00");

/* ------------------------------------------------------- Booking Requests */

on("2026-10-06", "6B: Booking Request rejected", async () => {
  await submit("6B", "b4");
  await Bk.decideBookingRequest({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B["6B"], approve: false, rejectReason: "PAYMENT_SCHEDULE_INCORRECT", requestClaimedPayment: false, note: "Rejected — schedule does not match the agreement" });
});
on("2026-10-20", "K-1: Rakesh's Booking Request — waiting over 7 days", () => submit("K-1", "b5", { member: "G3" }));
on("2026-10-30", "S-19: Booking Request corrected and sent again", async () => {
  const bookingId = await live("S-19");
  const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  await Bk.reviseBookingRequest({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId, parties: [{ personId: b.primaryPersonId, role: "PRIMARY", sharePercent: null }], soldByType: "THREE_PERCENT_CLUB", soldByPersonId: null, bookingDate: b.bookingDate, bookingDateReason: "Booking amount received earlier, entry made late", schedule: SCHEDULES.two(), reason: "Payment schedule corrected as Accounts asked" });
}, "15:00");

/* ------------------------------------------- payments and schedules */

on("2026-10-12", "15: 35% paid by the buyer's brother", async () => pay("15", "35", { payerName: "Rajesh Kaswan (brother)", payerReference: ref("GEEUTR") }));
on("2026-10-14", "25: schedule revision approved; 26: rejected; 21: waiting", async () => {
  for (const [plot, reason] of [["25", "Customer asked for more time"], ["26", "Bank loan disbursement delayed"], ["21", "Instalments rearranged as agreed with the customer"]] as const) {
    await reviseSchedule({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: await live(plot), lines: await laterSchedule(plot), reason });
  }
  await decideScheduleRevision({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: await live("25"), approve: true, note: "Approved — management approval" });
  await decideScheduleRevision({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: await live("26"), approve: false, note: "Rejected — delay is too long" });
});

/* ---------------------------------------------------------- after-sale changes */

on("2026-10-05", "1A: final buyers and Allotment", async () => {
  const bookingId = await live("1A");
  const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { primaryPerson: true } });
  await recordFinalBuyers({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId, buyers: [{ personId: b.primaryPersonId, dateOfBirth: new Date("1968-03-14"), address: b.primaryPerson.addressLine ?? "Hanumangarh Jn.", aadhaar: "563120004417" }] });
  await recordCompletion({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId, completion: { route: "ALLOTMENT", allotmentGiven: true, allotmentDate: new Date(), allotmentNumber: "ALT/GEE/2026/001A", allotmentGivenTo: b.primaryPerson.fullName, pattaStatus: "DONT_KNOW", pattaDate: null } });
});
on("2026-10-16", "Cancellations: S-06 refunded, S-08 refused, S-09 waiting", async () => {
  await cancelAndRefund("S-06", "Customer bought somewhere else");
  await Bk.cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: await live("S-08"), reason: "Customer changed plans" });
  await decideCancellation({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: await live("S-08"), approve: false, note: "Rejected — cancellation letter not received" });
  await Bk.cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: await live("S-09"), reason: "Family emergency or money problem" });
});
on("2026-10-17", "Change Plot: S-15 → S-21 approved, S-16 → S-24 waiting", async () => {
  await submitChangePlot({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: await live("S-15"), toPlotId: pid("S-21"), remark: "Customer wants a better location in the Project" });
  await decideChangePlot({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: await live("S-15"), approve: true, note: "Approved — new Plot is Available and the price is checked", appliedPercent: "30", schedule: SCHEDULES.standard() });
  await submitChangePlot({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: await live("S-16"), toPlotId: pid("S-24"), remark: "Customer wants a bigger Plot" });
});
on("2026-10-19", "Sold By: 8A corrected to Gurpreet, 8B refused, 10A waiting", async () => {
  await Bk.requestSoldByCorrection({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: await live("8A"), toSoldByType: "MEMBER", toSoldByPersonId: P("G1").id, reason: "Wrong Member selected earlier", supportingNote: "Site visit register shows Gurpreet brought the buyer" });
  await Bk.decideSoldByCorrection({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", bookingId: await live("8A"), approve: true, note: "Approved — customer confirmed who sold" });
  await Bk.requestSoldByCorrection({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: await live("8B"), toSoldByType: "THREE_PERCENT_CLUB", toSoldByPersonId: null, reason: "Sale was by 3% Club, not a Member", supportingNote: "Buyer walked in at the site office" });
  await Bk.decideSoldByCorrection({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", bookingId: await live("8B"), approve: false, note: "Rejected — the original Sold By is correct" });
  await Bk.requestSoldByCorrection({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: await live("10A"), toSoldByType: "MEMBER", toSoldByPersonId: P("G2").id, reason: "Wrong Member selected earlier", supportingNote: "Manpreet's WhatsApp with the buyer before the booking" });
});
on("2026-10-21", "Primary Customer: 7B approved, 20 rejected", async () => {
  await Bk.requestPrimaryCustomerChange({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: await live("7B"), toPersonId: (await person("b19")).id, reason: "Booking transferred to a family member" });
  await Bk.decidePrimaryCustomerChange({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: await live("7B"), approve: true, note: "Approved — documents checked" });
  await Bk.requestPrimaryCustomerChange({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: await live("20"), toPersonId: (await person("b20")).id, reason: "Name corrected to the actual buyer" });
  await Bk.decidePrimaryCustomerChange({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: await live("20"), approve: false, note: "Rejected — documents incomplete" });
});

/* ------------------------------------------- Rakesh: Paid Early and Recoveries */

on("2026-09-20", "Rakesh sells S-13 and S-12, paid in full", async () => {
  await sale("S-13", "b17", { member: "G3" }, "100", "full");
  await sale("S-12", "b18", { member: "G3" }, "100", "full");
});
on("2026-09-22", "Rakesh sells S-03 and S-25 at 10%", async () => {
  await sale("S-03", "b14", { member: "G3" }, "10");
  await sale("S-25", "b15", { member: "G3" }, "10");
});
on("2026-09-23", "Paid Early asked on S-03 and S-25", async () => {
  for (const plot of ["S-03", "S-25"]) await Cm.requestCommissionPaidEarly({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: (await record(plot)).id, reason: "Member asked for an advance" });
});
on("2026-09-24", "MD approves S-03 (paid early) and rejects S-25", async () => {
  await Cm.approveCommissionPaidEarly({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", recordId: (await record("S-03")).id, note: "Member has a good record" });
  await Cm.markCommissionPaid({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: (await record("S-03")).id, early: true, paidOn: new Date(), reference: ref("GEENEFT"), remarks: "Paid Early — approved by MD" });
  await Cm.rejectCommissionPaidEarly({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", recordId: (await record("S-25")).id, note: "Customer payments are delayed" });
});
for (const day of ["2026-09-30", "2026-10-27"]) on(day, "Monthly commission payout", T.payReadyCommissions, "17:00");
on("2026-10-05", "S-13 cancelled after Rakesh's Direct was paid", async () => {
  B["rec:S-13"] = (await record("S-13")).id;
  await cancelAndRefund("S-13", "Customer changed plans");
});
on("2026-10-06", "Recovery 1 opened on Rakesh", async () => {
  B.rec1 = ((await openRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: B["rec:S-13"], noticeOn: new Date(), reference: "GEEREC-26-01", reason: "Commission paid on a cancelled Booking" })) as { recoveryId: string }).recoveryId;
});
on("2026-10-07", "S-12 cancelled after Rakesh's Direct was paid", async () => {
  B["rec:S-12"] = (await record("S-12")).id;
  await cancelAndRefund("S-12", "Family emergency or money problem");
});
on("2026-10-08", "Recovery 2 opened on Rakesh", async () => {
  B.rec2 = ((await openRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: B["rec:S-12"], noticeOn: new Date(), reference: "GEEREC-26-02", reason: "Commission paid on a cancelled Booking" })) as { recoveryId: string }).recoveryId;
});
on("2026-10-09", "Rakesh sells S-07 — Direct held for the Recovery", () => sale("S-07", "b21", { member: "G3" }, "30"));
on("2026-10-10", "Rakesh buys K-4 for himself", async () => {
  people.b22 = { ...P("G3"), key: "b22" };
  await sale("K-4", "b22", { member: "G3" }, "30");
});
on("2026-10-12", "Recovery 2 set off against the S-07 Direct", async () =>
  setOffRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recoveryId: B.rec2, recordId: (await record("S-07")).id, reference: ref("GEENEFT"), setOffOn: new Date(), note: "Adjusted against the next commission payout", clearsRecovery: true })
);
on("2026-10-15", "Recovery 1 repaid", () => clearRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recoveryId: B.rec1, note: "Repaid by bank transfer" }));
on("2026-10-20", "Rakesh sells K-2 at 10%", () => sale("K-2", "b16", { member: "G3" }, "10"));
on("2026-10-21", "Paid Early asked on K-2 — waiting for MD", async () =>
  Cm.requestCommissionPaidEarly({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: (await record("K-2")).id, reason: "Customer payment confirmed, entry pending" })
);

/* ------------------------------------------------ resale Plots sold again */

on("2026-10-22", "19 sold again while its Buyback is unpaid", () => sale("19", "b13", { member: "G2" }, "30"));
on("2026-10-29", "12 sold again after its Stable Buyback", () => sale("12", "b12", {}, "30"));

/* ------------------------------------------------- settings v3 and tasks */

on("2026-10-28", "Settings v3 from 1 Nov; manual tasks", async () => {
  await T.settings(projectIds.GEE, { ...base, effectiveFrom: new Date("2026-11-01T00:00:00+05:30"), directEnabled: true, directPercent: "3.5", loyaltyEnabled: true, loyaltyPercent: "1", royaltyTokensPerAward: 12, reason: "Offer for a limited time", trip });
  const acc = await db.staffAccount.findFirstOrThrow({ where: { staffAccountId: ACC } });
  await db.$transaction(async (tx) => {
    await ensureTask(tx, { recordKind: "Project", recordId: projectIds.GEE, recordName: "Ganpati Estate Emporio", purpose: "MANUAL:GEE WEEKLY SITE REVIEW", title: "Weekly site review — Ganpati Estate Emporio", assigneeRole: "MD", dueAt: new Date("2026-11-02T11:00:00+05:30"), recurrence: "WEEKLY", origin: "MANUAL" });
    await ensureTask(tx, { recordKind: "Project", recordId: projectIds.GEE, recordName: "Ganpati Estate Emporio", purpose: "MANUAL:GEE BANK STATEMENT", title: "Match the bank statement for Ganpati Estate Emporio", assigneeRole: "ACCOUNTS", assigneeStaffId: acc.id, dueAt: new Date("2026-10-29T11:00:00+05:30"), origin: "MANUAL", latestResult: "Follow up on pending payment" });
  });
});

/* ------------------------------------------------------------ the runner */

try {
  if (await db.person.findFirst({ where: { primaryMobile: mobile(1) } })) {
    throw new Error("The GEE cases already exist (Gurpreet Singh Sidhu is on file). Run npm run data:reset and seed:fresh first.");
  }
  const gee = await db.project.findUniqueOrThrow({ where: { projectCode: "GEE" } });
  projectIds.GEE = gee.id;
  for (const p of await db.plot.findMany({ where: { projectId: gee.id }, select: { id: true, plotNumber: true } })) plots.set(p.plotNumber, p.id);

  const ordered = steps.map((s, i) => ({ ...s, i })).sort((a, b) => `${a.day} ${a.time}`.localeCompare(`${b.day} ${b.time}`) || a.i - b.i);
  for (const step of ordered) {
    console.log(`${step.day} ${step.time}  ${step.label}`);
    await at(db, step.day, step.run, step.time);
  }
  await runAllJobs(new Date()); // real time: the S-10 Hold expires, overdue turns urgent
  const counts = await db.plot.groupBy({ by: ["status"], where: { projectId: gee.id }, _count: { _all: true } });
  console.log("GEE cases done:", counts.map((c) => `${c._count._all} ${c.status}`).join(", "));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
