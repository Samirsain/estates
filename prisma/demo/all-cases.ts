// The all-cases story: one Project, "Test Nagar (All Cases)", told through two
// people. Vijay Rathore (Member) and Rajat Malpani (Customer) between them carry
// every rule the CRM enforces, so opening their two profiles shows all of it.
// States that cannot be true at once (RERA Expired and Registered, Active and
// Deactivated, a Recovery owed and repaid) happen one after another and show in
// their History. Everyone else is only there because their story needs them.
//
// Every step goes through the same services the screens call. Each `on()` is one
// dated step; `tellAllCases` runs them in date order inside the story clock.
// `CASES` is what the guide prints.
import { cancelHold, createHold, decideHoldExtension, decideHoldRequest, requestHoldExtension, submitHoldRequest, withdrawHoldRequest } from "@/lib/services/hold-service";
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
import { recordCompletion, recordFinalBuyers, reopenDelivered } from "@/lib/services/completion-service";
import { confirmPaymentReceived, correctPaymentReceived, decideScheduleRevision, reviseSchedule } from "@/lib/services/payment-service";
import { applyMemberCommissionHold, approveCommissionPaidEarly, markCommissionPaid, rejectCommissionPaidEarly, requestCommissionPaidEarly } from "@/lib/services/commission-service";
import { clearRecovery, closeAdjustmentWithoutRecovery, openRecovery, setOffRecovery } from "@/lib/services/recovery-service";
import { setMemberStatus, updateMemberRera } from "@/lib/services/network-service";
import { enterBankDetails } from "@/lib/services/bank-service";
import { correctTokenRedemption, recordTokenRedemption } from "@/lib/services/royalty-service";
import { bookTripReward, correctInviter, markTripTravelled, recordTripNominee } from "@/lib/services/trip-service";
import { requestPersonMerge } from "@/lib/services/merge-service";
import { closeEnquiry, recordFollowUp } from "@/lib/services/enquiry-service";
import { archiveLandInquiry, changeLandInquiryStage, createLandInquiry, reassignLandInquiry, setLandInquiryStatus } from "@/lib/services/land-inquiry-service";
import { setRestriction } from "@/lib/services/inventory-service";
import {
  cancelAcquisitionDeal,
  confirmPaymentGiven,
  createAcquisition,
  decideAcquisition,
  recordBuyingCommission,
} from "@/lib/services/acquisition-service";
import { ensureTask } from "@/lib/services/task-service";
import { CommandError } from "@/lib/services/command";
import { emptyInput } from "@/lib/domain/land-inquiry";
import { istDay } from "@/lib/tasks";
import { at } from "./story-clock.ts";
import { ACC, ACC2, CRM, MD, bankAccounts, closerReady, customer, db, enquiry, inDays, key, member, people, plotId, project, projectIds, settings } from "./toolkit.ts";
import { AC_LAND_PREFIX } from "./all-cases-world.ts";

type Step = { day: string; time: string; label: string; run: () => Promise<unknown> };
const steps: Step[] = [];
const on = (day: string, label: string, run: () => Promise<unknown>, time = "11:00") => steps.push({ day, time, label, run });

/** What the guide prints: one line per case. */
export const CASES: { area: string; plot: string; title: string; see: string }[] = [];
const kase = (area: string, plot: string, title: string, see: string) => CASES.push({ area, plot, title, see });
/** Notes per person, for the guide. */
export const NOTES: Record<string, string> = {};
const note = (k: string, text: string) => (NOTES[k] = NOTES[k] ? `${NOTES[k]} ${text}` : text);

const VIJAY = "Vijay Rathore (Member)";
const RAJAT = "Rajat Malpani (Customer)";
const OTHER = "Project, Plots and Dashboard";
const LANDS = "Land Inquiries";

const P = (k: string) => people[k];
const B: Record<string, string> = {};
const base = { loyaltyExceptionReason: null, effectiveFrom: null } as const;
const C = "ALLC";

let refSeq = 0;
const acRef = (kind: "TUTR" | "TNEFT" | "TRFD") => `${kind}${String(61000000 + ++refSeq * 37).padStart(8, "0")}`;

/* ------------------------------------------------------------------ helpers */

const SCHEDULES = {
  standard: () => [
    { seq: 1, percent: "30", dueDate: new Date() },
    { seq: 2, percent: "35", dueDate: inDays(60) },
    { seq: 3, percent: "35", dueDate: inDays(120) },
  ],
  full: () => [{ seq: 1, percent: "100", dueDate: new Date() }],
};

type SoldBy = { member?: string; customer?: string };
const soldByOf = (by: SoldBy) =>
  by.member
    ? { soldByType: "MEMBER" as const, soldByPersonId: P(by.member).id }
    : by.customer
      ? { soldByType: "CUSTOMER" as const, soldByPersonId: P(by.customer).id }
      : { soldByType: "THREE_PERCENT_CLUB" as const, soldByPersonId: null };

async function submit(plot: string, buyerKey: string, by: SoldBy = {}, opts: { schedule?: keyof typeof SCHEDULES; joint?: string; enquiryId?: string } = {}) {
  const buyer = await customer(buyerKey);
  const joint = opts.joint ? await customer(opts.joint) : null;
  const made = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plotId(plot),
    parties: joint
      ? [
          { personId: buyer.id, role: "PRIMARY" as const, sharePercent: "50" },
          { personId: joint.id, role: "ADDITIONAL" as const, sharePercent: "50" },
        ]
      : [{ personId: buyer.id, role: "PRIMARY" as const, sharePercent: null }],
    ...soldByOf(by),
    bookingDate: new Date(),
    customerType: "END_USER",
    schedule: SCHEDULES[opts.schedule ?? "standard"](),
    enquiryId: opts.enquiryId ?? null,
  });
  B[plot] = made.bookingId;
  return made.bookingId;
}

const approve = (plot: string, note = "Approved — details and schedule are correct") =>
  decideBookingRequest({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B[plot], approve: true, note });

const pay = (plot: string, percent: string) =>
  confirmPaymentReceived({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B[plot], percent, paidOn: new Date(), reference: acRef("TUTR") });

/** Submit, approve and take the first payment — the common start of a case. */
async function sale(plot: string, buyerKey: string, by: SoldBy, percent: string, schedule: keyof typeof SCHEDULES = "standard") {
  await submit(plot, buyerKey, by, { schedule });
  await approve(plot);
  if (percent !== "0") await pay(plot, percent);
}

const record = (plot: string, type: "DIRECT" | "LOYALTY") =>
  db.commissionRecord.findFirstOrThrow({ where: { bookingId: B[plot], type, isCurrent: true }, orderBy: { createdAt: "desc" } });

const payRecord = async (plot: string, type: "DIRECT" | "LOYALTY" = "DIRECT") =>
  markCommissionPaid({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: (await record(plot, type)).id, early: false, paidOn: new Date(), reference: acRef("TNEFT"), remarks: "Paid by bank transfer" });

const cancelAndRefund = async (plot: string, reason: string) => {
  await cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B[plot], reason });
  await decideCancellation({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B[plot], approve: true, note: "Approved — refund as per the agreement", reference: acRef("TRFD"), actionDate: new Date() });
};

/** Final buyers as [person, share%]; a sole buyer needs no share. */
const finalBuyers = (plot: string, who: [string, string | null][]) =>
  recordFinalBuyers({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B[plot], buyers: who.map(([k, share]) => ({ personId: P(k).id, sharePercent: share, dateOfBirth: new Date("1984-06-02"), address: "12, Durgapura, Jaipur" })) });
let allotmentSeq = 0;
const complete = (plot: string, route: "ALLOTMENT" | "REGISTRY", who: string) =>
  recordCompletion({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: B[plot],
    completion:
      route === "REGISTRY"
        ? { route, advocateName: "S. K. Mathur", registryDate: new Date() }
        : { route, allotmentGiven: true, allotmentDate: new Date(), allotmentNumber: `ALT/TN/2026/${String(++allotmentSeq).padStart(3, "0")}`, allotmentGivenTo: P(who).name, pattaStatus: "DONT_KNOW", pattaDate: null },
  });

const sellerOf = async (plot: string) => {
  const b = await db.booking.findUniqueOrThrow({ where: { id: B[plot] } });
  return Object.values(people).find((p) => p.id === b.primaryPersonId)!.key;
};

/** A Buyback of the sale on `plot`, with `given`% Payment Given entered at once. */
async function buyback(plot: string, given: string, arrangedBy?: string) {
  const made = await createAcquisition({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    type: "BUYBACK",
    sourceBookingId: B[plot],
    sellerPersonId: P(await sellerOf(plot)).id,
    arrangedByType: arrangedBy ? "MEMBER" : "THREE_PERCENT_CLUB",
    ...(arrangedBy ? { arrangedByPersonId: P(arrangedBy).id } : {}),
    purchaseDate: new Date(),
    remark: "Customer wants to sell the Plot back to the company",
    schedule: [
      { seq: 1, percent: given, dueDate: new Date() },
      { seq: 2, percent: String(100 - Number(given)), dueDate: inDays(30) },
    ],
  });
  B[`BB:${plot}`] = made.acquisitionId;
  await confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: made.acquisitionId, percent: given, paidOn: new Date(), reference: acRef("TUTR") });
  return made.acquisitionId;
}
const approveBuyback = (plot: string) =>
  decideAcquisition({ idempotencyKey: key(), actorRef: ACC2, actorRole: "ACCOUNTS", acquisitionId: B[`BB:${plot}`], approve: true, note: "Approved — papers and seller details checked" });

/** The live schedule with every unpaid instalment after the first moved a month later. */
async function laterSchedule(plot: string) {
  const live = await db.paymentScheduleVersion.findFirstOrThrow({
    where: { bookingId: B[plot], status: "ACTIVE" },
    include: { instalments: { orderBy: { seq: "asc" } } },
  });
  return live.instalments.map((i, n) => ({
    seq: i.seq,
    percent: i.scheduledPercent.toString(),
    dueDate: n === 0 ? i.dueDate : new Date(i.dueDate.getTime() + 30 * 86_400_000),
  }));
}

let buyerSeq = 0;
/** The next buyer from the cast — the other side of Vijay's sales and Rajat's closings. */
const nextBuyer = () => `C${String(++buyerSeq).padStart(2, "0")}`;

const VIJAY_ID = () => P("TM01").profileId!;
const rewardsOfVijay = () => db.tripReward.findMany({ where: { memberProfileId: VIJAY_ID() }, orderBy: { earnedAt: "asc" } });
const spend = (tokens: number, recipient: "SELF" | "NON_FAMILY", name: string, what: string) =>
  recordTokenRedemption({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", memberProfileId: VIJAY_ID(), tokens, redeemedOn: istDay(new Date()), recipient, recipientName: name, reference: what });

/* ------------------------------------------------------------- the launch */

const trip = (cutOff: Date | null, windDown: Date | null) => ({
  tripEnabled: true,
  tripTotalTarget: 3,
  tripMinOwnCredits: 2,
  tripMaxReferenceCredits: 1,
  tripProgrammeCode: "TRIP-TN-26",
  tripProgrammeVersionRef: cutOff ? "TRIP-TN-26 v2" : "TRIP-TN-26 v1",
  tripTermsVersionRef: "TRIP-TN-2026-1",
  tripCutOffAt: cutOff,
  tripWindDownAt: windDown,
  excludedPlotIds: [],
  sharedPools: [],
});

on("2026-04-01", "Test Nagar launches", async () => {
  const p = await project(C);
  await settings(p.id, { ...base, directEnabled: true, directPercent: "3", loyaltyEnabled: true, loyaltyPercent: "1", royaltyTokensPerAward: 10, reason: "New rates for the launch", trip: trip(null, null) });
  for (const [plot, restriction, why] of [
    ["TN-77", "NOT_YET_RELEASED", "Not yet released for sale"],
    ["TN-78", "NOT_FOR_SALE", "Not for sale"],
    ["TN-79", "PLEDGE", "Pledged to the Nagarpalika"],
  ] as const) {
    await setRestriction({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", plotId: plotId(plot), restriction, reason: why });
    kase(OTHER, plot, `Restriction: ${restriction.replaceAll("_", " ").toLowerCase()}`, "Plot shows Not Available with its restriction.");
  }
});

on("2026-04-02", "Members activated", async () => {
  // Inviters first: Vijay under Anita (by mistake), his invitees under him.
  for (const k of ["TM02", "TM03", "TM01", "TM04", "TM05", "TM06", "TM07"]) await member(k);
});

on("2026-04-03", "MD corrects Vijay's inviter", async () => {
  await correctInviter({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", memberProfileId: VIJAY_ID(), invitedByMemberId: P("TM02").profileId!, reason: "Inviter confirmed by both Members" });
  kase(VIJAY, "—", "Inviter corrected from Anita Choudhary to Sunil Bhati", "Header: Invited by; History.");
  note("TM02", "Vijay Rathore's inviter (after MD's correction).");
  note("TM03", "Was entered as Vijay Rathore's inviter by mistake.");
});

/* ------------------------------------------------------- Trip 1: travelled */

on("2026-04-05", "Vijay sells TN-01 and TN-02 (100%)", async () => {
  for (const plot of ["TN-01", "TN-02"]) await sale(plot, nextBuyer(), { member: "TM01" }, "100", "full");
});
on("2026-04-06", "Rohit Jain (invited by Vijay) sells TN-03 — Vijay's Reference Credit", async () => {
  await sale("TN-03", nextBuyer(), { member: "TM04" }, "100", "full");
  kase(VIJAY, "TN-01, TN-02, TN-03", "Trip 1: two own sales + Rohit Jain's first sale (Reference) → earned → traveller → booked → travelled", "Rewards section; Members invited.");
  note("TM04", "Invited by Vijay Rathore; his first sale TN-03 gave Vijay a Reference Credit.");
});

/* ---------------------------------------- Rajat's first Plot, through Vijay */

on("2026-04-08", "Rajat buys TN-20 through Vijay, jointly with Neha (30%)", async () => {
  const rajat = await customer("HC");
  const eq = await enquiry(rajat, C, "BY_MEMBER", { member: P("TM01"), remark: "Customer is ready to book soon" });
  await submit("TN-20", "HC", { member: "TM01" }, { joint: "spouse", enquiryId: eq });
  await approve("TN-20");
  await pay("TN-20", "30");
  await closerReady(rajat); // Customer Terms accepted, so he can close sales for others later
  kase(RAJAT, "TN-20", "First Plot: Enquiry by Member → Booking, joint with Neha 50/50, Sold By Vijay (Royalty link to Vijay, provisional until 100%)", "Properties; History.");
  kase(VIJAY, "TN-20", "Enquiry turned into a sale; Rajat Malpani becomes his Royalty linked Customer", "Requests and enquiries; Royalty linked Customers.");
  note("spouse", "Joint buyer with Rajat on TN-20; becomes Primary Customer of TN-28.");
});

on("2026-04-30", "April payout", async () => {
  for (const plot of ["TN-01", "TN-02", "TN-20"]) await payRecord(plot);
}, "17:00");

/* -------------------------------------- Trip 2: booked, then a sale is lost */

on("2026-05-05", "Vijay sells TN-04, TN-05; Kavita Rao sells TN-06 (100%)", async () => {
  for (const plot of ["TN-04", "TN-05"]) await sale(plot, nextBuyer(), { member: "TM01" }, "100", "full");
  await sale("TN-06", nextBuyer(), { member: "TM05" }, "100", "full");
  note("TM05", "Invited by Vijay Rathore; her first sale TN-06 gave Vijay his second Reference Credit.");
});

on("2026-05-08", "Rajat pays 35% on TN-20; a second Accounts user corrects it to 30%", async () => {
  await pay("TN-20", "35");
  const entry = await db.paymentReceivedEntry.findFirstOrThrow({ where: { bookingId: B["TN-20"], status: "CONFIRMED" }, orderBy: { recordedAt: "desc" } });
  await correctPaymentReceived({ idempotencyKey: key(), actorRef: ACC2, actorRole: "ACCOUNTS", entryId: entry.id, percent: "30", paidOn: new Date(), reference: acRef("TUTR"), reason: "Wrong amount entered" });
  kase(RAJAT, "TN-20", "Payment entry corrected (35% → 30%) by a different Accounts user", "Booking → Payments (Superseded entry).");
});

on("2026-05-10", "Rajat buys TN-27 (100%) and TN-24 (30%) direct", async () => {
  await sale("TN-27", "HC", {}, "100", "full");
  await sale("TN-24", "HC", {}, "30");
  kase(RAJAT, "TN-27", "Repeat purchase: Loyalty Points to Rajat himself", "Loyalty Points & commission.");
});

on("2026-05-20", "Trip 1 traveller and booking; TN-27 Registry", async () => {
  const [first] = await rewardsOfVijay();
  await recordTripNominee({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", rewardId: first.id, recipient: "SPOUSE", recipientName: "Sunita Rathore" });
  await bookTripReward({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", rewardId: first.id, bookingReference: "MMT-TN-1001 · Udaipur 3N/4D", bookedOn: new Date() });
  await finalBuyers("TN-27", [["HC", null]]);
  await complete("TN-27", "REGISTRY", "HC");
});

on("2026-05-31", "May payout", async () => {
  for (const plot of ["TN-04", "TN-05"]) await payRecord(plot);
}, "17:00");

/* ------------------------------------------- RERA: Expired, then renewed */

on("2026-06-01", "Vijay's RERA expires; Rajat closes TN-40; other June sales", async () => {
  await updateMemberRera({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", memberProfileId: VIJAY_ID(), status: "EXPIRED", reraNumber: "RAJ/A/2026/TM01-01", expiryDate: new Date("2026-05-31T00:00:00+05:30") });
  await sale("TN-40", nextBuyer(), { customer: "HC" }, "100", "full");
  await sale("TN-25", "HC", {}, "30");
  await sale("TN-50", nextBuyer(), { member: "TM07" }, "30");
  await sale("TN-30", nextBuyer(), { member: "TM06" }, "30");
  kase(RAJAT, "TN-40", "Closes a sale for another buyer (Sold By Customer): Loyalty Points as the closer", "Loyalty Points & commission.");
});
on("2026-06-05", "Vijay sells TN-61 while his RERA is expired", async () => {
  await sale("TN-61", nextBuyer(), { member: "TM01" }, "30");
  kase(VIJAY, "TN-61", "Direct On Hold · rera expired, released when RERA is renewed", "Commission (Show all); History.");
});
on("2026-06-10", "Vijay's RERA renewed (expires 20 Oct); Rajat's TN-24 cancelled", async () => {
  await updateMemberRera({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", memberProfileId: VIJAY_ID(), status: "REGISTERED", reraNumber: "RAJ/A/2026/TM01-02", expiryDate: new Date("2026-10-20T00:00:00+05:30") });
  await cancelAndRefund("TN-24", "Customer changed plans");
  kase(VIJAY, "—", "RERA: Registered → Expired → Registered again; expires 20 Oct (task RERA Registration Expiring)", "Identity → RERA; History; Dashboard.");
  kase(RAJAT, "TN-24", "Booking cancelled and refunded", "Properties; Booking History.");
});

on("2026-06-12", "Vijay sells TN-08 (30%)", () => sale("TN-08", nextBuyer(), { member: "TM01" }, "30"));
on("2026-06-15", "Rajat closes TN-41; buys TN-28, TN-29", async () => {
  await sale("TN-41", nextBuyer(), { customer: "HC" }, "100", "full");
  await sale("TN-28", "HC", {}, "30");
  await sale("TN-29", "HC", {}, "30");
});
on("2026-06-20", "Trip 1 travelled; Trip 2 traveller and booking; TN-20 shares 50/50 → 60/40", async () => {
  const [first, second] = await rewardsOfVijay();
  await markTripTravelled({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", rewardId: first.id, travelledOn: new Date() });
  await recordTripNominee({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", rewardId: second.id, recipient: "SELF", recipientName: "" });
  await bookTripReward({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", rewardId: second.id, bookingReference: "MMT-TN-2002 · Goa 4N/5D", bookedOn: new Date() });
  const b = await db.booking.findUniqueOrThrow({ where: { id: B["TN-20"] }, include: { parties: { where: { kind: "COMMERCIAL" } } } });
  const [primary, extra] = [b.parties.find((p) => p.role === "PRIMARY")!, b.parties.find((p) => p.role === "ADDITIONAL")!];
  await changeOwnershipShares({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["TN-20"], parties: [
    { personId: primary.personId, role: "PRIMARY", sharePercent: "60" },
    { personId: extra.personId, role: "ADDITIONAL", sharePercent: "40" },
  ], reason: "Shares changed as per the agreement" });
  kase(RAJAT, "TN-20", "Ownership shares changed 50/50 → 60/40", "Booking → Customers.");
});

on("2026-06-30", "June payout", async () => {
  for (const plot of ["TN-08", "TN-61", "TN-30", "TN-50"]) await payRecord(plot);
  for (const plot of ["TN-40", "TN-41"]) await payRecord(plot, "LOYALTY");
}, "17:00");

/* ---------------------------------------------------- Primary Customer */

on("2026-07-02", "Primary Customer changes: TN-28 approved, TN-29 rejected", async () => {
  await requestPrimaryCustomerChange({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["TN-28"], toPersonId: P("spouse").id, reason: "Booking transferred to a family member" });
  await decidePrimaryCustomerChange({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B["TN-28"], approve: true, note: "Approved — documents checked" });
  const to = await customer(nextBuyer());
  await requestPrimaryCustomerChange({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["TN-29"], toPersonId: to.id, reason: "Name corrected to the actual buyer" });
  await decidePrimaryCustomerChange({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B["TN-29"], approve: false, note: "Rejected — documents incomplete" });
  kase(RAJAT, "TN-28, TN-29", "Primary Customer change approved (TN-28 → Neha) and rejected (TN-29)", "Properties; Booking History.");
});

/* ------------------------------- cancellations, Change Plot, Recoveries */

on("2026-07-10", "TN-05 and TN-50 cancelled after their Directs were paid; two Change Plots requested", async () => {
  // The paid lines are read before the cancellation moves them.
  B["rec:TN-05"] = (await record("TN-05", "DIRECT")).id;
  B["rec:TN-50"] = (await record("TN-50", "DIRECT")).id;
  await cancelAndRefund("TN-05", "Payment Not Received");
  await cancelAndRefund("TN-50", "Loan Denied");
  await submitChangePlot({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["TN-61"], toPlotId: plotId("TN-55"), remark: "Customer wants a smaller Plot because of budget" });
  await submitChangePlot({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["TN-25"], toPlotId: plotId("TN-26"), remark: "Customer wants a better location in the Project" });
  kase(VIJAY, "TN-04, TN-05, TN-06", "Trip 2: earned → booked → TN-05 cancelled, so a booked Trip lost a sale (task Reward Sale Cancelled)", "Rewards section; Dashboard.");
});
on("2026-07-11", "Change Plots approved", async () => {
  const schedule = SCHEDULES.standard();
  await decideChangePlot({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B["TN-61"], approve: true, note: "Approved — price difference agreed with the customer", appliedPercent: "30", schedule });
  await decideChangePlot({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B["TN-25"], approve: true, note: "Approved — new Plot is Available and the price is checked", appliedPercent: "30", schedule: SCHEDULES.standard() });
  B["TN-55"] = B["TN-61"];
  B["TN-26"] = B["TN-25"];
  kase(RAJAT, "TN-25 → TN-26", "Change Plot approved", "Properties; Booking History.");
});
on("2026-07-12", "Recoveries opened on Vijay (TN-05) and Prakash Goyal (TN-50)", async () => {
  const opened = await openRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: B["rec:TN-05"], noticeOn: new Date(), reference: "TREC-26-V01", reason: "Commission paid on a cancelled Booking" });
  B["recovery:V1"] = (opened as { recoveryId: string }).recoveryId;
  await openRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: B["rec:TN-50"], noticeOn: new Date(), reference: "TREC-26-P01", reason: "Commission paid on a cancelled Booking" });
  note("TM07", "Owes a Recovery on TN-50, past its deadline. Rajat Malpani shares his mobile and address.");
});
on("2026-07-15", "Rajat buys TN-21 direct (100%); adjustment on TN-55 closed; duplicate Rajat merged", async () => {
  await sale("TN-21", "HC", {}, "100", "full");
  await closeAdjustmentWithoutRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: (await record("TN-55", "DIRECT")).id, reason: "Paid amount is correct for the new Plot" });
  const dupe = await customer("dup");
  await enquiry(dupe, C, "ONLINE", { followUpInDays: 60, remark: "Looking for a specific size or facing" });
  await requestPersonMerge({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", survivingPersonId: P("HC").id, mergedPersonId: dupe.id, reason: "Name spelled differently, same person" });
  kase(VIJAY, "TN-61 → TN-55", "Change Plot to a cheaper Plot after his Direct was paid → adjustment closed without Recovery", "Commission (Show all).");
  kase(RAJAT, "TN-21", "Second repeat purchase; he shares Prakash Goyal's mobile and address, who owes a Recovery → his Loyalty is held (task Check Recovery Link)", "Loyalty Points & commission; Rewards → Reviews.");
  kase(RAJAT, "—", "Duplicate record \"Rajat Kumar Malpani\" merged into him by MD", "History.");
});

/* ------------------------------ Rajat's first Plot paid in full, delivered */

on("2026-07-20", "Rajat pays the last 40% on TN-20 — Royalty link final, Vijay's award held", async () => {
  await pay("TN-20", "40");
  kase(VIJAY, "TN-20, TN-27", "Royalty Points: Rajat's link becomes final; his Club-direct purchase gives Vijay 10 points — held while Vijay owes a Recovery, released when repaid", "Royalty Points; History.");
});
on("2026-07-22", "TN-20 final buyers and Allotment", async () => {
  await finalBuyers("TN-20", [["HC", "60"], ["spouse", "40"]]);
  await complete("TN-20", "ALLOTMENT", "HC");
});
on("2026-07-24", "MD reopens TN-20", () =>
  reopenDelivered({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", bookingId: B["TN-20"], reason: "Allotment letter issued with a mistake" })
);
on("2026-07-25", "Vijay repays his Recovery; TN-20 Registry", async () => {
  await clearRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recoveryId: B["recovery:V1"], note: "Repaid by bank transfer" });
  await finalBuyers("TN-20", [["HC", "60"], ["spouse", "40"]]);
  await complete("TN-20", "REGISTRY", "HC");
  kase(VIJAY, "TN-05", "Recovery 1: paid Direct on a cancelled sale → Recovery opened → repaid", "Header: Recovery; History.");
  kase(RAJAT, "TN-20", "Delivered by Allotment → reopened by MD → Delivered by Registry", "Properties; Booking History.");
});

/* -------------------------------------- 1 August: the big month of sales */

const LAND = [
  { tehsil: "Sanganer", stages: [] as string[] },
  { tehsil: "Bagru", stages: ["DOCUMENTS_PENDING"] },
  { tehsil: "Chaksu", stages: ["SITE_VISIT"] },
  { tehsil: "Phagi", stages: ["DOCUMENTS_PENDING", "SITE_VISIT", "UNDER_VERIFICATION"] },
  { tehsil: "Bassi", stages: ["SITE_VISIT", "NEGOTIATION"] },
  { tehsil: "Chomu", stages: ["DOCUMENTS_PENDING", "SITE_VISIT", "UNDER_VERIFICATION", "NEGOTIATION", "APPROVED_FOR_ACQUISITION"] },
  { tehsil: "Amer", stages: ["SITE_VISIT", "REJECTED_CLOSED"] },
  { tehsil: "Shahpura", stages: [] as string[] },
  { tehsil: "Kotputli", stages: [] as string[] },
  { tehsil: "Dudu", stages: [] as string[] },
];

on("2026-08-01", "Points spent; Rajat's 3rd and 4th closings; Vijay's August sales; Land Inquiries", async () => {
  await spend(6, "SELF", "", "Gift voucher");
  await spend(2, "NON_FAMILY", "Ramesh Vyas (friend)", "Gift item from the catalogue");
  const wrong = (await spend(1, "SELF", "", "Gift item from the catalogue")) as { redemptionId?: string } | undefined;
  const wrongId = wrong?.redemptionId ?? (await db.tokenRedemption.findFirstOrThrow({ where: { memberProfileId: VIJAY_ID() }, orderBy: { recordedAt: "desc" } })).id;
  await correctTokenRedemption({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", redemptionId: wrongId, reason: "Entered twice" });
  kase(VIJAY, "—", "Royalty Points spent: 6 for himself, 2 for a friend; one wrong entry corrected by MD", "Royalty Points.");

  // Both sent while only two closings are consumed (sold-by.ts refuses a fourth
  // request once three are), so the third reaches the limit and the fourth's
  // Loyalty is cancelled when it qualifies.
  await submit("TN-42", nextBuyer(), { customer: "HC" }, { schedule: "full" });
  await submit("TN-43", nextBuyer(), { customer: "HC" }, { schedule: "full" });
  for (const plot of ["TN-42", "TN-43"]) {
    await approve(plot);
    await pay(plot, "100");
  }
  kase(RAJAT, "TN-40…TN-43", "Closer limit: 2 closings paid, 3rd reaches the limit (task Membership — Upgrade Customer), 4th Loyalty cancelled", "Loyalty Points & commission; Dashboard.");

  for (const plot of ["TN-11", "TN-12", "TN-14", "TN-15", "TN-31", "TN-32"]) await sale(plot, nextBuyer(), { member: "TM01" }, "30");
  for (const plot of ["TN-16", "TN-17"]) await sale(plot, nextBuyer(), { member: "TM01" }, "10");
  await submit("TN-49", "TM01", { member: "TM01" });
  await approve("TN-49");
  await pay("TN-49", "30");
  kase(VIJAY, "TN-49", "Buys a Plot for himself: his Direct waits for 100%, so Payment Pending at 30%", "Commission; he is also a Customer.");
  await sale("TN-44", "HC", {}, "30");

  for (const [i, land] of LAND.entries()) {
    const made = await createLandInquiry({
      createRequestId: `${AC_LAND_PREFIX}${key()}`,
      actorRef: CRM,
      actorRole: "CRM",
      input: { ...emptyInput(), receivedFrom: i % 2 ? "MEMBER" : "THREE_PERCENT_CLUB", sourcePersonId: i % 2 ? P("TM01").id : null, district: "Jaipur", tehsil: land.tehsil, exactLocation: `${land.tehsil} road, Khasra ${100 + i * 7}`, areaBigha: String(2 + i), areaBiswa: "5" },
    });
    B[`land:${i}`] = made.id;
    for (const stage of land.stages) {
      const row = await db.landInquiry.findUniqueOrThrow({ where: { id: made.id } });
      await changeLandInquiryStage({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", id: row.id, version: row.version, stage: stage as never, reason: stage === "REJECTED_CLOSED" ? "Rejected — land not suitable" : "Site visit done, moving ahead" });
    }
  }
  kase(LANDS, "—", "Land Inquiries at every stage; half of them received from Vijay Rathore", "Land Inquiries page.");
});

/* ----------------------------------------------- Recovery 2: set off */

on("2026-08-02", "TN-08 cancelled after its Direct was paid", async () => {
  B["rec:TN-08"] = (await record("TN-08", "DIRECT")).id;
  await cancelAndRefund("TN-08", "Other");
});
on("2026-08-03", "Recovery 2 opened on Vijay (TN-08)", async () => {
  const opened = await openRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: B["rec:TN-08"], noticeOn: new Date(), reference: "TREC-26-V02", reason: "Commission paid on a cancelled Booking" });
  B["recovery:V2"] = (opened as { recoveryId: string }).recoveryId;
});
on("2026-08-05", "Vijay sells TN-09 — Direct held for the Recovery", () => sale("TN-09", nextBuyer(), { member: "TM01" }, "30"));
on("2026-08-10", "Recovery 2 set off against the TN-09 Direct", async () => {
  await setOffRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recoveryId: B["recovery:V2"], recordId: (await record("TN-09", "DIRECT")).id, reference: acRef("TNEFT"), setOffOn: new Date(), note: "Adjusted against the next commission payout", clearsRecovery: true });
  kase(VIJAY, "TN-08, TN-09", "Recovery 2: opened → his next Direct held → set off against it", "Header: Recovery; Commission; History.");
});

/* --------------------------------------------------------- Buybacks */

on("2026-08-15", "Buybacks of TN-15 and TN-44; Sold By Correction on TN-31 rejected", async () => {
  await buyback("TN-15", "25");
  await buyback("TN-44", "25");
  await requestSoldByCorrection({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["TN-31"], toSoldByType: "THREE_PERCENT_CLUB", toSoldByPersonId: null, reason: "Sale was by 3% Club, not a Member", supportingNote: "Approved by the sales manager" });
  await decideSoldByCorrection({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", bookingId: B["TN-31"], approve: false, note: "Rejected — the original Sold By is correct" });
  kase(VIJAY, "TN-31", "Sold By Correction away from him, rejected by MD", "Sales; Booking History.");
});
on("2026-08-16", "Buybacks approved", async () => {
  await approveBuyback("TN-15");
  await approveBuyback("TN-44");
  kase(OTHER, "TN-15", "Approved Buyback, 25% reward gate met (task Reward Review — Approved Buyback); Payment Given follow-up", "Buyback / Resale; Dashboard.");
});
on("2026-08-20", "Schedule revision on Rajat's TN-26 approved", async () => {
  await reviseSchedule({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["TN-26"], lines: await laterSchedule("TN-26"), reason: "Bank loan disbursement delayed" });
  await decideScheduleRevision({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B["TN-26"], approve: true, note: "Approved — matches the customer's written request" });
  kase(RAJAT, "TN-26", "Payment schedule revision approved", "Booking → Payment Schedule history.");
});

/* -------------------------------------------------------- September */

on("2026-09-01", "Sold By on TN-30 corrected to Vijay; Rajat's TN-22 request rejected; TN-27 Buyback arranged by Vijay; Land Inquiry changes", async () => {
  await requestSoldByCorrection({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["TN-30"], toSoldByType: "MEMBER", toSoldByPersonId: P("TM01").id, reason: "Wrong Member selected earlier", supportingNote: "Customer confirmed who sold" });
  await submit("TN-22", "HC");
  await decideBookingRequest({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B["TN-22"], approve: false, rejectReason: "PAYMENT_SCHEDULE_INCORRECT", requestClaimedPayment: false, note: "Rejected — schedule does not match the agreement" });
  await buyback("TN-27", "25", "TM01");
  const hold = await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: plotId("TN-C10"), personId: P("HC").id, remark: "Customer wants a site visit first" });
  await cancelHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", holdId: hold.holdId, reason: "Customer is no longer interested" });
  kase(RAJAT, "TN-22", "Booking Request rejected (Payment Schedule Incorrect)", "Properties.");
  kase(RAJAT, "TN-C10", "Hold cancelled", "Plot History.");

  const row = (i: number) => db.landInquiry.findUniqueOrThrow({ where: { id: B[`land:${i}`] } });
  let r = await row(7);
  await setLandInquiryStatus({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", id: r.id, version: r.version, status: "CLOSED", reason: "Owner not interested now" });
  r = await row(8);
  await setLandInquiryStatus({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", id: r.id, version: r.version, status: "CLOSED", reason: "Price too high" });
  r = await row(8);
  await setLandInquiryStatus({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", id: r.id, version: r.version, status: "WORKING", reason: "Price is now acceptable", restoredStage: "NEGOTIATION" });
  const crm = await db.staffAccount.findFirstOrThrow({ where: { staffAccountId: CRM } });
  r = await row(1);
  await reassignLandInquiry({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", id: r.id, version: r.version, assignedToId: crm.id, reason: "Area handled by another person" });
  r = await row(9);
  await archiveLandInquiry({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", id: r.id, version: r.version, reason: "Duplicate inquiry" });
  kase(LANDS, "—", "Land Inquiries closed, reopened, reassigned and archived", "Land Inquiries page (Include archived).");
});
on("2026-09-02", "MD approves the TN-30 correction; TN-27 Buyback approved, Buying Commission for Vijay", async () => {
  await decideSoldByCorrection({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", bookingId: B["TN-30"], approve: true, note: "Approved — customer confirmed who sold" });
  await approveBuyback("TN-27");
  await recordBuyingCommission({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", acquisitionId: B["BB:TN-27"], beneficiaryPersonId: P("TM01").id, percent: "1" });
  kase(VIJAY, "TN-30", "Sold By corrected to him after Mohan Lal Saini was paid: his Direct On Hold · old recovery pending (task Double Commission — MD Approval)", "Commission; Dashboard (MD).");
  kase(RAJAT, "TN-27", "Sells TN-27 back to the company after Registry (task Complete Registry for the papers)", "Properties → deals; Dashboard (CRM).");
  note("TM06", "Was paid on TN-30, then Sold By moved to Vijay Rathore (task Paid Commission Conflict).");
});

on("2026-09-05", "Paid Early requested on TN-16, TN-17; Vijay sells TN-07 from an Enquiry", async () => {
  for (const plot of ["TN-16", "TN-17"]) {
    await requestCommissionPaidEarly({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: (await record(plot, "DIRECT")).id, reason: "Member asked for an advance" });
  }
  const buyer = nextBuyer();
  const eq = await enquiry(await customer(buyer), C, "BY_MEMBER", { member: P("TM01"), remark: "Customer wants a corner Plot" });
  await submit("TN-07", buyer, { member: "TM01" }, { enquiryId: eq });
  await approve("TN-07");
  await pay("TN-07", "30");
  kase(VIJAY, "TN-07", "Enquiry by Member → Booking; Direct Ready, not paid (task Verify — Commission Paid)", "Commission; Dashboard (Accounts).");
});
on("2026-09-06", "MD approves TN-16 and rejects TN-17; TN-16 paid early", async () => {
  await approveCommissionPaidEarly({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", recordId: (await record("TN-16", "DIRECT")).id, note: "Member has a good record" });
  await rejectCommissionPaidEarly({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", recordId: (await record("TN-17", "DIRECT")).id, note: "Customer payments are delayed" });
  await markCommissionPaid({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: (await record("TN-16", "DIRECT")).id, early: true, paidOn: new Date(), reference: acRef("TNEFT"), remarks: "Paid Early — approved by MD" });
  kase(VIJAY, "TN-16, TN-17", "Paid Early: requested → MD approved → paid (TN-16); rejected by MD (TN-17)", "Commission (Show all).");
});

on("2026-09-10", "Rajat's TN-44 Buyback cancelled; enquiries", async () => {
  await cancelAcquisitionDeal({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: B["BB:TN-44"], reason: "Seller changed their mind" });
  await enquiry(await customer("e1"), C, "BY_MEMBER", { member: P("TM01"), followUpInDays: 3, remark: "Customer wants a site visit" });
  B["eq:HC"] = await enquiry(P("HC"), C, "EXISTING_CUSTOMER", { followUpInDays: 50, remark: "Looking for a specific size or facing" });
  B["eq:e2"] = await enquiry(await customer("e2"), C, "BY_CUSTOMER", { customer: P("HC"), followUpInDays: 50, remark: "Asked for the price list and brochure" });
  kase(RAJAT, "TN-44", "Approved Buyback cancelled (task Reward Review — Buyback Unwind)", "Properties → deals; Dashboard.");
});
on("2026-09-15", "TN-15 resold while the Buyback is unpaid; Rajat's enquiries followed up and closed", async () => {
  await submit("TN-15", nextBuyer(), { member: "TM01" });
  await approve("TN-15");
  await pay("TN-15", "30");
  await recordFollowUp({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", enquiryId: B["eq:HC"], outcome: "CALL_LATER", remark: "Will discuss with family and call back", nextAt: inDays(45) });
  await closeEnquiry({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", enquiryId: B["eq:e2"], closeReason: "Budget does not match" });
  kase(VIJAY, "TN-15", "Resells a bought-back Plot: his new Direct On Hold · payment pending (company has not paid the seller in full)", "Commission.");
  kase(RAJAT, "—", "Enquiries: his own (follow-up recorded) and one he introduced (closed)", "Enquiries page.");
});

/* ----------------------------------- Deactivated, reactivated, held */

on("2026-09-19", "Vijay sells TN-18 (10%) and asks for a Hold for Sonal Daga", async () => {
  await sale("TN-18", nextBuyer(), { member: "TM01" }, "10");
  const vijay = await db.memberProfile.findUniqueOrThrow({ where: { id: VIJAY_ID() } });
  const made = await submitHoldRequest({ idempotencyKey: key(), actorRef: `MEMBER:${vijay.memberId}`, memberProfileId: vijay.id, personId: (await customer("e6")).id, plotId: plotId("TN-80") });
  B["hr:e6"] = made.holdRequestId;
}, "10:00");
// Same day: a Member Hold Request expires at the end of its working day.
on("2026-09-19", "Vijay deactivated with a Hold Request waiting", async () => {
  await setMemberStatus({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", memberProfileId: VIJAY_ID(), active: false, reason: "Deactivated — broke company policy" });
}, "11:00");
on("2026-09-19", "CRM rejects the request; MD reactivates Vijay", async () => {
  await decideHoldRequest({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", requestId: B["hr:e6"], approve: false, note: "Rejected — buyer details incomplete" });
  await setMemberStatus({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", memberProfileId: VIJAY_ID(), active: true, reason: "Reactivated — issue resolved, Member is back" });
  kase(VIJAY, "TN-80", "Deactivated with a Hold Request waiting (task Plot Hold by Deactivated Member) → reactivated; his unpaid lines held, then rechecked", "Header status; History; Dashboard (Completed).");
}, "12:00");
on("2026-09-25", "Commission Hold on Vijay; Rajat sells an outside property for resale", async () => {
  await applyMemberCommissionHold({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", memberProfileId: VIJAY_ID(), hold: true, reason: "Hold — KYC, RERA or bank documents pending" });
  const group = await db.project.create({ data: { projectCode: "ALLR", name: "Test Resale Properties", city: "Jaipur", location: "Jaipur, Rajasthan", type: "RESIDENTIAL", status: "ACTIVE", isExternalResaleGroup: true } });
  projectIds.ALLR = group.id;
  const made = await createAcquisition({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    type: "PURCHASE_FOR_RESALE",
    sellerPersonId: P("HC").id,
    arrangedByType: "THREE_PERCENT_CLUB",
    purchaseDate: new Date(),
    remark: "Customer needs money urgently",
    schedule: [
      { seq: 1, percent: "30", dueDate: new Date() },
      { seq: 2, percent: "70", dueDate: inDays(20) },
    ],
    property: { propertyName: "Gopal Vihar Colony", location: "Tonk Road, Jaipur", propertyNumber: "GV-12", projectType: "RESIDENTIAL", areaSqFt: "1500", resaleGroupId: group.id },
  });
  B["RS"] = made.acquisitionId;
  await confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: made.acquisitionId, percent: "30", paidOn: new Date(), reference: acRef("TUTR") });
});
on("2026-09-28", "Commission Hold removed; resale deal approved", async () => {
  await applyMemberCommissionHold({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", memberProfileId: VIJAY_ID(), hold: false, reason: "Removed — documents received" });
  await decideAcquisition({ idempotencyKey: key(), actorRef: ACC2, actorRole: "ACCOUNTS", acquisitionId: B["RS"], approve: true, note: "Approved — papers and seller details checked" });
  kase(VIJAY, "—", "Commission Hold applied, then removed", "History; Commission.");
  kase(RAJAT, "GV-12", "Sells an outside property for resale; next instalment overdue (task Payment Given Follow-Up)", "Properties → deals.");
});

/* ---------------------------------------------------------- October */

on("2026-10-01", "TN-27 Buyback paid in full — Vijay's Buying Commission Ready; Rajat's Hold on TN-C09; Vijay sells TN-10 (10%)", async () => {
  await confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: B["BB:TN-27"], percent: "75", paidOn: new Date(), reference: acRef("TUTR") });
  await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: plotId("TN-C09"), personId: P("HC").id, remark: "Customer is arranging the booking amount" });
  await sale("TN-10", nextBuyer(), { member: "TM01" }, "10");
  kase(VIJAY, "TN-27", "Arranged Rajat's Buyback: 1% Buying Commission Ready (task Verify — Buying Commission)", "Commission; Buyback / Resale deal page.");
  kase(VIJAY, "TN-10", "Direct Payment Pending (only 10% paid)", "Commission.");
  kase(RAJAT, "TN-C09", "Hold expired after 72 hours", "Plot History.");
});
on("2026-10-03", "Vijay's Booking Request on TN-C02 waits more than 7 days", async () => {
  await submit("TN-C02", nextBuyer(), { member: "TM01" });
  kase(VIJAY, "TN-C02", "Booking Request waiting over 7 days (task Verify — Booking Payment turns urgent)", "Sales; Dashboard (Accounts).");
});
on("2026-10-05", "Buyback of TN-14 started, only 10% given", async () => {
  await buyback("TN-14", "10");
  kase(VIJAY, "TN-14", "Direct On Hold · buyback pending (Buyback waiting for 20% Payment Given, task Verify — Buyback/Resale)", "Commission; Buyback / Resale.");
});
on("2026-10-08", "Rajat enters a joint bank account with Neha", async () => {
  await enterBankDetails({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", personId: P("HC").id, accountHolder: "Rajat & Neha Malpani", ...bankAccounts.spouse, jointAccountProof: "Passbook page naming both holders" });
  kase(RAJAT, "—", "Joint bank account with Neha waiting for Accounts (task Check Joint Bank Account — Approval)", "Bank; History; Dashboard (Accounts).");
});
on("2026-10-10", "Trip programme closes (settings version 2); Rajat's TN-23 request", async () => {
  await settings(projectIds[C], { ...base, directEnabled: true, directPercent: "3", loyaltyEnabled: true, loyaltyPercent: "1", royaltyTokensPerAward: 10, reason: "Trip added / removed", trip: trip(new Date("2026-10-12T00:00:00+05:30"), new Date("2026-12-31T23:59:00+05:30")) });
  await submit("TN-23", "HC");
  kase(VIJAY, "TN-20, TN-15", "Trip 3: open with 2 credits when the programme closed (task Reward Expiry)", "Rewards section; Dashboard.");
});
on("2026-10-11", "Rajat's TN-23 request corrected and sent again", async () => {
  await reviseBookingRequest({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["TN-23"], parties: [{ personId: P("HC").id, role: "PRIMARY", sharePercent: null }], soldByType: "THREE_PERCENT_CLUB", soldByPersonId: null, bookingDate: new Date(), customerType: "INVESTOR", schedule: SCHEDULES.standard(), reason: "Payment schedule corrected as Accounts asked" });
  kase(RAJAT, "TN-23", "Booking Request corrected and sent again (version 2), waiting for Accounts", "Properties; Dashboard: \"Corrected and sent again to Accounts\".");
});
on("2026-10-12", "Cancellation of TN-11 and Change Plot TN-12 → TN-13 waiting; Rajat's TN-29 schedule and TN-21 cancellation", async () => {
  await cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["TN-11"], reason: "Payment Not Received" });
  await submitChangePlot({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["TN-12"], toPlotId: plotId("TN-13"), remark: "Customer wants a corner or park-facing Plot" });
  await reviseSchedule({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["TN-29"], lines: await laterSchedule("TN-29"), reason: "Customer asked for more time" });
  await cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["TN-21"], reason: "Other", remark: "Customer changed plans" });
  await decideCancellation({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B["TN-21"], approve: false, note: "Rejected — customer withdrew the cancellation" });
  kase(VIJAY, "TN-11", "Direct On Hold · refund pending (task Verify — Refund)", "Commission; Dashboard.");
  kase(VIJAY, "TN-12 → TN-13", "Direct On Hold · change plot pending (task Verify — Change Plot)", "Commission; Dashboard.");
  kase(RAJAT, "TN-29", "Schedule revision waiting (task Verify — Payment Schedule)", "Dashboard (Accounts).");
  kase(RAJAT, "TN-21", "Cancellation requested and rejected — Booking continues", "Booking History.");
});
on("2026-10-13", "Sold By Correction on TN-32 waiting; Paid Early on TN-18 waiting; Rajat's Hold extended; manual tasks", async () => {
  await requestSoldByCorrection({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["TN-32"], toSoldByType: "MEMBER", toSoldByPersonId: P("TM02").id, reason: "Two Members claimed the sale; MD decided", supportingNote: "Site visit register shows Sunil Bhati" });
  await requestCommissionPaidEarly({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: (await record("TN-18", "DIRECT")).id, reason: "Customer payment confirmed, entry pending" });
  const hold = await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: plotId("TN-C12"), personId: P("HC").id, sourcedByType: "MEMBER", sourcedByPersonId: P("TM01").id, remark: "Waiting for bank loan approval" });
  const ext = await requestHoldExtension({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", holdId: hold.holdId, reason: "Waiting for bank loan approval", requestedHours: 24 });
  await decideHoldExtension({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", requestId: ext.extensionRequestId, approve: true, note: "Approved — genuine reason given" });
  kase(VIJAY, "TN-32", "Sold By Correction to Sunil Bhati waiting (task Sold By Correction — MD Approval)", "Dashboard (MD).");
  kase(VIJAY, "TN-18", "Paid Early waiting for MD (task Early Commission — Pay After Approval)", "Dashboard (MD).");
  kase(RAJAT, "TN-C12", "Active Hold sourced by Vijay, extension approved by MD", "Plot page → Hold history.");

  const vijay = await db.memberProfile.findUniqueOrThrow({ where: { id: VIJAY_ID() } });
  const acc = await db.staffAccount.findFirstOrThrow({ where: { staffAccountId: ACC } });
  await db.$transaction(async (tx) => {
    await ensureTask(tx, { recordKind: "Member", recordId: vijay.id, recordName: `${vijay.memberId} · Vijay Rathore`, purpose: "MANUAL:COLLECT RERA RENEWAL COPY", title: "Collect Vijay Rathore's RERA renewal copy", assigneeRole: "CRM", dueAt: new Date("2026-10-18T11:00:00+05:30"), origin: "MANUAL", latestResult: "Collect pending documents" });
    await ensureTask(tx, { recordKind: "Project", recordId: projectIds[C], recordName: "Test Nagar (All Cases)", purpose: "MANUAL:TN DAILY COLLECTION CHECK", title: "Daily collection check — Test Nagar", assigneeRole: "ACCOUNTS", dueAt: new Date("2026-10-15T17:00:00+05:30"), recurrence: "DAILY", origin: "MANUAL" });
    await ensureTask(tx, { recordKind: "Project", recordId: projectIds[C], recordName: "Test Nagar (All Cases)", purpose: "MANUAL:TN BANK STATEMENT", title: "Match the bank statement for Test Nagar", assigneeRole: "ACCOUNTS", assigneeStaffId: acc.id, dueAt: new Date("2026-10-14T11:00:00+05:30"), origin: "MANUAL", latestResult: "Follow up on pending payment" });
  });
  kase(OTHER, "—", "Manual tasks: one on Vijay's page, a daily one for Accounts, one for a named person (overdue)", "Dashboard; Vijay's page → Add Task.");
});
on("2026-10-14", "Settings version 3 for 1 Nov; Vijay's own request with a commission conflict", async () => {
  await settings(projectIds[C], { ...base, effectiveFrom: new Date("2026-11-01T00:00:00+05:30"), directEnabled: true, directPercent: "3.5", loyaltyEnabled: true, loyaltyPercent: "1", royaltyTokensPerAward: 12, reason: "Offer for a limited time" });
  kase(OTHER, "—", "Settings: v1 launch, v2 programme close, v3 scheduled for 1 Nov", "Project page → Commission settings history.");

  await submit("TN-C06", "TM01");
  try {
    await approve("TN-C06");
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
  }
  kase(VIJAY, "TN-C06", "Buys as an active Member with Sold By 3% Club → approval refused (task Commission Conflict — Correct Sold By)", "Dashboard (Accounts).");

  // The database refuses an approved deal below 20% Payment Given
  // (acquisition_approval_threshold), so this task cannot arise from the screens today.
  kase(OTHER, "TN-15", "Selling Buyback/Resale Plot (task 14) cannot happen today: an approved deal can never fall below 20% Payment Given", "—");
}, "12:00");
on("2026-10-15", "Vijay's portal Hold Requests", async () => {
  const vijay = await db.memberProfile.findUniqueOrThrow({ where: { id: VIJAY_ID() } });
  const req = async (plot: string, who: string) =>
    submitHoldRequest({ idempotencyKey: key(), actorRef: `MEMBER:${vijay.memberId}`, memberProfileId: vijay.id, personId: (await customer(who)).id, plotId: plotId(plot) });
  const approved = await req("TN-59", "h8");
  await decideHoldRequest({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", requestId: approved.holdRequestId, approve: true, note: "Approved — Plot is Available and Member is active" });
  const rejected = await req("TN-C13", "h7");
  await decideHoldRequest({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", requestId: rejected.holdRequestId, approve: false, note: "Rejected — duplicate request" });
  const withdrawn = await req("TN-C14", "e7");
  await withdrawHoldRequest({ idempotencyKey: key(), actorRef: `MEMBER:${vijay.memberId}`, memberProfileId: vijay.id, requestId: withdrawn.holdRequestId });
  await req("TN-60", "h7");
  kase(VIJAY, "TN-59, TN-C13, TN-C14, TN-60", "Portal Hold Requests: approved → Hold, rejected, withdrawn by him, one waiting for CRM", "Requests and enquiries; Plots → Hold Requests.");
}, "08:30");

note("TM01", "THE MEMBER TO OPEN: every Member rule is on his page.");
note("HC", "THE CUSTOMER TO OPEN: every Customer rule is on his page.");

/* ------------------------------------------------------------- the runner */

export async function tellAllCases() {
  const ordered = steps.map((s, i) => ({ ...s, i })).sort((a, b) => `${a.day} ${a.time}`.localeCompare(`${b.day} ${b.time}`) || a.i - b.i);
  for (const step of ordered) {
    console.log(`${step.day} ${step.time}  ${step.label}`);
    await at(db, step.day, step.run, step.time);
  }
}
