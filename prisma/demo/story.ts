// The six-month story (spec §3). Each `on()` is one dated step; `tellStory`
// runs them in date order inside the story clock.
import { createHold, decideHoldRequest, requestHoldExtension, submitHoldRequest } from "@/lib/services/hold-service";
import {
  cancelBooking,
  decidePrimaryCustomerChange,
  decideSoldByCorrection,
  requestPrimaryCustomerChange,
  requestSoldByCorrection,
} from "@/lib/services/booking-service";
import { decideCancellation } from "@/lib/services/cancellation-service";
import { decideChangePlot, submitChangePlot } from "@/lib/services/change-plot-service";
import { recordCompletion, recordFinalBuyers } from "@/lib/services/completion-service";
import { setMemberStatus } from "@/lib/services/network-service";
import { enterBankDetails } from "@/lib/services/bank-service";
import { approveCommissionPaidEarly, markCommissionPaid, requestCommissionPaidEarly } from "@/lib/services/commission-service";
import { openRecovery } from "@/lib/services/recovery-service";
import { recordTokenRedemption } from "@/lib/services/royalty-service";
import { requestPersonMerge } from "@/lib/services/merge-service";
import { recordFollowUp, closeEnquiry } from "@/lib/services/enquiry-service";
import { changeLandInquiryStage, createLandInquiry } from "@/lib/services/land-inquiry-service";
import { emptyInput } from "@/lib/domain/land-inquiry";
import {
  confirmPaymentGiven,
  createAcquisition,
  decideAcquisition,
  recordBuybackDocumentsReturned,
  recordBuyingCommission,
} from "@/lib/services/acquisition-service";
import { ensureTask } from "@/lib/services/task-service";
import { istDay } from "@/lib/tasks";
import { at } from "./story-clock.ts";
import {
  ACC,
  ACC2,
  bankAccounts,
  cardProjects,
  CRM,
  MD,
  customer,
  db,
  directOf,
  enquiry,
  inDays,
  key,
  member,
  notes,
  pay,
  payReadyCommissions,
  people,
  plotId,
  project,
  projectIds,
  ref,
  sell,
  settings,
  type Who,
} from "./toolkit.ts";

type Step = { day: string; time: string; label: string; run: () => Promise<unknown> };
const steps: Step[] = [];
const on = (day: string, label: string, run: () => Promise<unknown>, time = "11:00") => steps.push({ day, time, label, run });

/** Booking ids by story key. */
export const B: Record<string, string> = {};
/** The Enquiry each sale came from, by sale key. */
const E: Record<string, string> = {};
const P = (k: string) => people[k];
const base = { loyaltyExceptionReason: null, effectiveFrom: null } as const;

/* ------------------------------------------------------------ the launches */

on("2026-04-02", "Shri Ram Enclave launches", async () => {
  const sre = await project("SRE");
  await settings(sre.id, { ...base, directEnabled: true, directPercent: "3", loyaltyEnabled: true, loyaltyPercent: "1", royaltyTokensPerAward: 10, reason: "Launch terms for Shri Ram Enclave" });
});
on("2026-06-01", "Aravali Heights launches with its Rewards programme", async () => {
  const ah = await project("AH");
  await settings(ah.id, {
    ...base,
    directEnabled: true,
    directPercent: "3",
    loyaltyEnabled: true,
    loyaltyPercent: "1.5",
    royaltyTokensPerAward: 15,
    reason: "Launch terms for Aravali Heights, with the Rewards programme (3 sales = 1 Reward)",
    trip: {
      tripEnabled: true,
      tripTotalTarget: 3,
      tripMinOwnCredits: 2,
      tripMaxReferenceCredits: 1,
      tripProgrammeCode: "TRIP-AH-26",
      tripProgrammeVersionRef: "TRIP-AH-26 v1",
      tripTermsVersionRef: "TRIP-AH-2026-1",
      tripCutOffAt: null,
      tripWindDownAt: null,
      excludedPlotIds: [],
      sharedPools: [],
    },
  });
});
on("2026-08-01", "Mansarovar Business Park launches", async () => {
  const mbp = await project("MBP");
  await settings(mbp.id, { ...base, directEnabled: true, directPercent: "2", loyaltyEnabled: true, loyaltyPercent: "1", royaltyTokensPerAward: 20, reason: "Launch terms for Mansarovar Business Park" });
});
on("2026-09-01", "Kishangarh Farm Estates launches", async () => {
  const kfe = await project("KFE");
  await settings(kfe.id, { ...base, directEnabled: true, directPercent: "2.5", loyaltyEnabled: true, loyaltyPercent: "1", royaltyTokensPerAward: 10, reason: "Launch terms for Kishangarh Farm Estates" });
});
on("2026-10-01", "Projects that show every way a Project card reads", cardProjects);
on("2026-08-16", "Shri Ram Enclave festive terms (settings version 2)", () =>
  settings(projectIds.SRE, { ...base, directEnabled: true, directPercent: "3.5", loyaltyEnabled: true, loyaltyPercent: "1", royaltyTokensPerAward: 15, reason: "Festive season: Direct 3.5% and 15 Royalty points from 16 Aug" })
);

/* ------------------------------------------------------------- the network */

for (const [day, keys] of [
  ["2026-04-03", ["M01", "M04", "M07", "M09", "M12"]],
  ["2026-04-10", ["M02", "M03", "M05"]],
  ["2026-05-05", ["M06", "M13", "M14"]],
  ["2026-06-02", ["M08", "M10", "M11"]],
] as const) {
  on(day, `Members activated: ${keys.join(", ")}`, async () => {
    for (const k of keys) await member(k);
  });
}

/* --------------------------------------------------------------- the sales */

type Sale = {
  key: string;
  day: string;
  plot: string;
  buyer: string;
  by?: { member?: string; customer?: string };
  joint?: string;
  schedule?: "standard" | "two" | "full";
  pays?: [string, string][];
  lead?: "SITE_VISIT" | "ONLINE" | "DIRECT" | "EXISTING_CUSTOMER" | null;
  submitOnly?: boolean;
  reject?: string;
  project: "SRE" | "AH" | "MBP";
};

const SALES: Sale[] = [
  { key: "S01", project: "SRE", day: "2026-04-12", plot: "SR-03", buyer: "vikas", pays: [["2026-04-12", "30"], ["2026-06-12", "35"], ["2026-08-12", "35"]] },
  { key: "S02", project: "SRE", day: "2026-04-15", plot: "SR-05", buyer: "neha", by: { member: "M04" }, pays: [["2026-04-15", "30"], ["2026-06-15", "35"], ["2026-08-14", "35"]] },
  { key: "S03", project: "SRE", day: "2026-04-18", plot: "SR-08", buyer: "ashok", by: { member: "M01" }, schedule: "two", pays: [["2026-04-18", "30"], ["2026-06-18", "70"]] },
  { key: "S04", project: "SRE", day: "2026-04-22", plot: "SR-12", buyer: "manoj", by: { member: "M02" }, pays: [["2026-04-22", "30"], ["2026-06-22", "35"], ["2026-08-21", "35"]] },
  { key: "S05", project: "SRE", day: "2026-04-25", plot: "SR-14", buyer: "suresh", joint: "meena", by: { member: "M01" }, pays: [["2026-04-25", "30"], ["2026-06-25", "35"], ["2026-08-25", "35"]] },
  { key: "S06", project: "SRE", day: "2026-04-28", plot: "SR-21", buyer: "rohit", by: { member: "M03" }, pays: [["2026-04-28", "30"], ["2026-06-29", "35"]] },
  { key: "S07", project: "SRE", day: "2026-05-03", plot: "SR-01", buyer: "dinesh", schedule: "full", pays: [["2026-05-03", "100"]] },
  { key: "S08", project: "SRE", day: "2026-05-08", plot: "SR-09", buyer: "kamla", by: { member: "M05" }, schedule: "two", pays: [["2026-05-08", "30"], ["2026-07-08", "70"]] },
  { key: "S09", project: "SRE", day: "2026-05-12", plot: "SR-15", buyer: "gaurav", reject: "First instalment cheque was returned unpaid by the bank." },
  { key: "S10", project: "SRE", day: "2026-05-15", plot: "SR-16", buyer: "anjali", by: { member: "M06" }, pays: [["2026-05-15", "30"], ["2026-07-15", "35"], ["2026-09-15", "35"]] },
  { key: "S11", project: "SRE", day: "2026-05-20", plot: "SR-22", buyer: "pradeep", by: { member: "M09" }, pays: [["2026-05-20", "30"]] },
  { key: "S12", project: "SRE", day: "2026-05-25", plot: "SR-23", buyer: "yogesh", pays: [["2026-05-25", "30"], ["2026-07-27", "35"]] },
  { key: "S13", project: "SRE", day: "2026-06-05", plot: "SR-24", buyer: "shalini", pays: [["2026-06-05", "30"], ["2026-08-05", "35"]] },
  { key: "S14", project: "SRE", day: "2026-06-10", plot: "SR-25", buyer: "bhavna", by: { member: "M12" }, pays: [["2026-06-10", "30"], ["2026-08-10", "35"]] },
  { key: "S15", project: "SRE", day: "2026-07-10", plot: "SR-26", buyer: "ashok", schedule: "two", lead: null, pays: [["2026-07-10", "30"], ["2026-09-08", "70"]] },
  { key: "S16", project: "SRE", day: "2026-09-05", plot: "SR-27", buyer: "neha", schedule: "full", lead: null, pays: [["2026-09-05", "100"]] },
  { key: "S17", project: "SRE", day: "2026-07-05", plot: "SR-28", buyer: "arvind", pays: [["2026-07-05", "30"]] },
  { key: "S18", project: "SRE", day: "2026-09-12", plot: "SR-29", buyer: "sunil", by: { customer: "vikas" }, pays: [["2026-09-12", "30"]] },
  { key: "S19", project: "SRE", day: "2026-08-20", plot: "SR-30", buyer: "kamal", schedule: "full", pays: [["2026-08-20", "100"]] },
  { key: "S20", project: "AH", day: "2026-06-08", plot: "AH-01", buyer: "lalit", by: { member: "M01" }, schedule: "full", pays: [["2026-06-08", "100"]] },
  { key: "S21", project: "AH", day: "2026-06-18", plot: "AH-02", buyer: "seema", by: { member: "M02" }, schedule: "two", pays: [["2026-06-18", "30"], ["2026-07-18", "70"]] },
  { key: "S22", project: "AH", day: "2026-07-02", plot: "AH-03", buyer: "hemant", by: { member: "M01" }, schedule: "two", pays: [["2026-07-02", "30"], ["2026-08-02", "70"]] },
  { key: "S23", project: "AH", day: "2026-07-12", plot: "AH-04", buyer: "nikhil", by: { member: "M05" }, pays: [["2026-07-12", "30"], ["2026-09-11", "35"]] },
  { key: "S24", project: "AH", day: "2026-07-20", plot: "AH-V1", buyer: "rajiv", pays: [["2026-07-20", "30"], ["2026-09-18", "35"]] },
  { key: "S25", project: "AH", day: "2026-08-08", plot: "AH-05", buyer: "sapna", by: { member: "M11" }, schedule: "full", pays: [["2026-08-08", "100"]] },
  { key: "S26", project: "AH", day: "2026-08-22", plot: "AH-06", buyer: "deepa", by: { member: "M07" }, pays: [["2026-08-22", "10"]] },
  { key: "S27", project: "AH", day: "2026-09-03", plot: "AH-07", buyer: "tarun", by: { member: "M13" }, pays: [["2026-09-03", "30"]] },
  { key: "S28", project: "AH", day: "2026-09-18", plot: "AH-V2", buyer: "vandana", by: { member: "M01" }, pays: [["2026-09-18", "30"]] },
  { key: "S29", project: "AH", day: "2026-10-06", plot: "AH-08", buyer: "mohit", by: { member: "M08" }, pays: [["2026-10-06", "30"]] },
  { key: "S30", project: "MBP", day: "2026-08-10", plot: "MB-S01", buyer: "harsh", pays: [["2026-08-10", "30"], ["2026-10-09", "35"]] },
  { key: "S31", project: "MBP", day: "2026-08-14", plot: "MB-S02", buyer: "ritika", by: { member: "M12" }, pays: [["2026-08-14", "30"]] },
  { key: "S32", project: "MBP", day: "2026-09-08", plot: "MB-S03", buyer: "anil", by: { member: "M04" }, pays: [["2026-09-08", "30"]] },
  { key: "S33", project: "MBP", day: "2026-10-01", plot: "MB-S05", buyer: "rekha", by: { customer: "kamal" }, pays: [["2026-10-01", "30"]] },
  { key: "S34", project: "MBP", day: "2026-10-09", plot: "MB-S06", buyer: "sanjay", by: { member: "M14" }, pays: [["2026-10-09", "30"]] },
  // Gaurav's May Enquiry is still open after the rejection; this request comes from it.
  { key: "S35", project: "SRE", day: "2026-10-13", plot: "SR-17", buyer: "gaurav", by: { member: "M02" }, submitOnly: true, lead: null },
  { key: "S36", project: "MBP", day: "2026-10-13", plot: "MB-S08", buyer: "payal", submitOnly: true },
];

const clubLeads = ["SITE_VISIT", "ONLINE", "DIRECT"] as const;
const minusDays = (day: string, n: number) => istDay(new Date(Date.parse(`${day}T11:00:00+05:30`) - n * 86_400_000));

SALES.forEach((s, i) => {
  const lead = s.lead === undefined ? (s.by?.member ? "BY_MEMBER" : s.by?.customer ? "BY_CUSTOMER" : clubLeads[i % 3]) : s.lead;
  if (lead) {
    on(minusDays(s.day, 6), `Enquiry for ${s.plot}`, async () => {
      const who = await customer(s.buyer);
      if (s.joint) await customer(s.joint);
      E[s.key] = await enquiry(who, s.project, lead, {
        member: s.by?.member ? P(s.by.member) : undefined,
        customer: s.by?.customer ? P(s.by.customer) : undefined,
        remark: `Asked about ${s.plot}; site visit fixed.`,
      });
    }, "10:00");
  }
  on(s.day, `Booking ${s.key} on ${s.plot}`, async () => {
    const buyer = await customer(s.buyer);
    const soldBy = { member: s.by?.member ? P(s.by.member) : undefined, customer: s.by?.customer ? P(s.by.customer) : undefined };
    B[s.key] = await sell(s.plot, buyer, soldBy, {
      joint: s.joint ? await customer(s.joint) : undefined,
      schedule: s.schedule,
      submitOnly: s.submitOnly,
      reject: s.reject,
      enquiryId: E[s.key] ?? (s.key === "S35" ? E.S09 : undefined),
    });
  }, "11:00");
  for (const [day, percent] of s.pays ?? []) {
    on(day, `Payment ${percent}% on ${s.plot}`, () =>
      s.key === "S20"
        ? pay(B[s.key], percent, { payerName: "Om Prakash Sharma (father)", payerReference: ref("UTR26") })
        : pay(B[s.key], percent),
      day === s.day ? "12:00" : "13:00");
  }
});

/* ----------------------------------------------------- Accounts' payout runs */

for (const day of ["2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30"]) {
  on(day, "Monthly commission payout", payReadyCommissions, "17:00");
}

/* ------------------------------------------------------ changes to bookings */

on("2026-07-08", "Sold By Correction requested on SR-23", () =>
  requestSoldByCorrection({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B.S12, toSoldByType: "MEMBER", toSoldByPersonId: P("M14").id, reason: "Priya Mathur brought Yogesh to the site; entered as a walk-in by mistake.", supportingNote: "Site visit register, 22 May, page 31." })
);
on("2026-07-09", "MD approves the Sold By Correction", () =>
  decideSoldByCorrection({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", bookingId: B.S12, approve: true, note: "Register entry confirmed." })
);
on("2026-07-14", "Primary Customer change requested on SR-12", async () => {
  const rakesh = await customer("rakesh");
  await requestPrimaryCustomerChange({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B.S04, toPersonId: rakesh.id, reason: "Manoj Saxena transfers the plot to his brother Rakesh." });
});
on("2026-07-15", "Accounts approves the transfer", () =>
  decidePrimaryCustomerChange({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B.S04, approve: true, note: "Transfer letter and ID proofs verified." })
);
on("2026-07-20", "Change Plot requested: SR-24 → SR-13", () =>
  submitChangePlot({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B.S13, toPlotId: plotId("SR-13"), remark: "Wants the park-facing plot." })
);
on("2026-07-21", "Accounts approves the Change Plot", () =>
  decideChangePlot({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: B.S13,
    approve: true,
    note: "Revised agreement signed; PLC difference explained.",
    appliedPercent: "30",
    schedule: [
      { seq: 1, percent: "30", dueDate: new Date() },
      { seq: 2, percent: "35", dueDate: new Date("2026-08-05T11:00:00+05:30") },
      { seq: 3, percent: "35", dueDate: new Date("2026-10-05T11:00:00+05:30") },
    ],
  })
);
on("2026-07-25", "SR-28 cancelled", () =>
  cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B.S17, reason: "Buyer relocating to Pune; requested cancellation." })
);
on("2026-07-28", "Refund approved for SR-28", () =>
  decideCancellation({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B.S17, approve: true, note: "Refund sent after deduction as per agreement.", reference: ref("RFD26"), actionDate: new Date() })
);

/* ------------------------------------------------- duplicate Customer merge */

on("2026-07-16", "Rohit Verma enquires again from a second number", async () => {
  const again = await customer("rohitAgain");
  await enquiry(again, "AH", "ONLINE", { remark: "Looking at villa plots." });
});
on("2026-07-18", "MD merges the duplicate", () =>
  requestPersonMerge({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", survivingPersonId: P("rohit").id, mergedPersonId: P("rohitAgain").id, reason: "Same person — enquired again from his office number." })
);

/* ------------------------------------------- Recovery and Check Recovery Link */

on("2026-08-03", "SR-22 cancelled after its Direct was paid", async () => {
  B.S11D = (await directOf(B.S11)).id; // the paid Direct, before cancellation supersedes it
  await cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B.S11, reason: "Buyer could not arrange the second instalment." });
});
on("2026-08-06", "Refund approved for SR-22", () =>
  decideCancellation({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B.S11, approve: true, note: "Refund sent.", reference: ref("RFD26"), actionDate: new Date() })
);
on("2026-08-10", "Recovery opened on Nitin Goyal", async () => {
  await openRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: B.S11D, noticeOn: new Date(), reference: "REC-2026-001", reason: "Direct paid on a sale later cancelled." });
  notes("M09", "Owes a Recovery for the Direct paid on SR-22, which was later cancelled.");
});
on("2026-09-01", "Kamal's shared mobile and address noted", async () => {
  notes("kamal", "Shares Nitin Goyal's mobile and address — his Loyalty waits for Check Recovery Link.");
});

/* ------------------------------------------------------------- Paid Early */

on("2026-08-24", "Accounts asks to pay Harish's Direct early", async () => {
  await requestCommissionPaidEarly({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: (await directOf(B.S26)).id, reason: "Member requested an advance before Diwali; buyer's loan disbursal is due." });
});
on("2026-08-25", "MD approves the early payment", async () => {
  await approveCommissionPaidEarly({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", recordId: (await directOf(B.S26)).id, note: "Approved; long-standing Member." });
});
on("2026-08-27", "Accounts pays it early", async () => {
  await markCommissionPaid({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: (await directOf(B.S26)).id, early: true, paidOn: new Date(), reference: ref("NEFT26"), remarks: "Paid early with MD approval of 25 Aug." });
});

/* --------------------------------------------------------- Allotment, Registry */

const finalBuyers = (k: string, who: string) =>
  recordFinalBuyers({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B[k], buyers: [{ personId: P(who).id, dateOfBirth: new Date("1982-03-14"), address: "Jaipur, Rajasthan" }] });
let allotmentSeq = 0;
const complete = (k: string, route: "ALLOTMENT" | "REGISTRY", who: string) =>
  recordCompletion({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: B[k],
    completion:
      route === "REGISTRY"
        ? { route, advocateName: "R. K. Bhargava", registryDate: new Date() }
        : {
            route,
            allotmentGiven: true,
            allotmentDate: new Date(),
            allotmentNumber: `ALT/SRE/2026/${String(++allotmentSeq).padStart(3, "0")}`,
            allotmentGivenTo: P(who).name,
            pattaStatus: "DONT_KNOW",
            pattaDate: null,
          },
  });

on("2026-05-20", "Final buyer details for SR-01", () => finalBuyers("S07", "dinesh"));
on("2026-06-05", "Allotment for SR-01", () => complete("S07", "ALLOTMENT", "dinesh"));
on("2026-06-28", "Final buyer details for SR-08", () => finalBuyers("S03", "ashok"));
on("2026-07-05", "Allotment for SR-08", () => complete("S03", "ALLOTMENT", "ashok"));
on("2026-07-20", "Final buyer details for SR-09", () => finalBuyers("S08", "kamla"), "15:00");
on("2026-08-20", "Final buyer details for SR-03", () => finalBuyers("S01", "vikas"), "15:00");
on("2026-08-25", "Final buyer details for SR-05", () => finalBuyers("S02", "neha"), "15:00");
on("2026-09-15", "Registry for SR-03", () => complete("S01", "REGISTRY", "vikas"), "15:00");
on("2026-09-25", "Registry for SR-05", () => complete("S02", "REGISTRY", "neha"), "15:00");

/* ---------------------------------------------------------------- Buybacks */

on("2026-08-05", "Buyback of SR-01 (seller exit)", async () => {
  const made = await createAcquisition({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    type: "BUYBACK",
    sourceBookingId: B.S07,
    sellerPersonId: P("dinesh").id,
    arrangedByType: "THREE_PERCENT_CLUB",
    purchaseDate: new Date(),
    remark: "Seller moving abroad; Club buys the plot back.",
    schedule: [
      { seq: 1, percent: "25", dueDate: new Date() },
      { seq: 2, percent: "75", dueDate: inDays(31) },
    ],
  });
  B.BB1 = made.acquisitionId;
  await confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: made.acquisitionId, percent: "25", paidOn: new Date(), reference: ref("UTR26") });
});
on("2026-08-06", "Buyback of SR-01 approved", () =>
  decideAcquisition({ idempotencyKey: key(), actorRef: ACC2, actorRole: "ACCOUNTS", acquisitionId: B.BB1, approve: true, note: "Agreement and first payment verified." })
);
on("2026-09-05", "Buyback of SR-01 paid in full", () =>
  confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: B.BB1, percent: "75", paidOn: new Date(), reference: ref("UTR26") })
, "15:00");
on("2026-09-12", "Allotment papers back for SR-01", () =>
  recordBuybackDocumentsReturned({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", acquisitionId: B.BB1, returnedOn: new Date() })
);

on("2026-09-10", "Buyback of AH-05 arranged by Sunita Bairwa", async () => {
  const made = await createAcquisition({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    type: "BUYBACK",
    sourceBookingId: B.S25,
    sellerPersonId: P("sapna").id,
    arrangedByType: "MEMBER",
    arrangedByPersonId: P("M11").id,
    purchaseDate: new Date(),
    remark: "Seller needs funds for her daughter's wedding; Sunita arranged the buyback.",
    schedule: [
      { seq: 1, percent: "25", dueDate: new Date() },
      { seq: 2, percent: "75", dueDate: inDays(25) },
    ],
  });
  B.BB2 = made.acquisitionId;
  await confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: made.acquisitionId, percent: "25", paidOn: new Date(), reference: ref("UTR26") });
});
on("2026-09-11", "Buyback of AH-05 approved, Buying Commission recorded", async () => {
  await decideAcquisition({ idempotencyKey: key(), actorRef: ACC2, actorRole: "ACCOUNTS", acquisitionId: B.BB2, approve: true, note: "Approved." });
  await recordBuyingCommission({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", acquisitionId: B.BB2, beneficiaryPersonId: P("M11").id, percent: "1" });
});
on("2026-10-05", "Buyback of AH-05 paid in full — Buying Commission Ready", () =>
  confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: B.BB2, percent: "75", paidOn: new Date(), reference: ref("UTR26") })
);

on("2026-09-22", "Purchase for Resale: Shree Nagar Residency SN-45", async () => {
  const group = await db.project.create({
    data: { projectCode: "RSL", name: "Jaipur Resale Properties", city: "Jaipur", location: "Jaipur, Rajasthan", type: "RESIDENTIAL", status: "ACTIVE", isExternalResaleGroup: true },
  });
  projectIds.RSL = group.id;
  const seller = await customer("mahendra");
  const made = await createAcquisition({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    type: "PURCHASE_FOR_RESALE",
    sellerPersonId: seller.id,
    arrangedByType: "THREE_PERCENT_CLUB",
    purchaseDate: new Date(),
    remark: "Corner plot in Shree Nagar Residency, Sanganer, bought for resale.",
    schedule: [
      { seq: 1, percent: "30", dueDate: new Date() },
      { seq: 2, percent: "70", dueDate: inDays(30) },
    ],
    property: { propertyName: "Shree Nagar Residency", location: "Sanganer, Jaipur", propertyNumber: "SN-45", projectType: "RESIDENTIAL", areaSqFt: "1800", resaleGroupId: group.id },
  });
  B.RS1 = made.acquisitionId;
  await confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: made.acquisitionId, percent: "30", paidOn: new Date(), reference: ref("UTR26") });
});
on("2026-09-23", "Purchase for Resale approved", () =>
  decideAcquisition({ idempotencyKey: key(), actorRef: ACC2, actorRole: "ACCOUNTS", acquisitionId: B.RS1, approve: true, note: "Title documents verified." })
);

/* ---------------------------------------------------------- Royalty points */

// Rewards are not trips (owner, 22 Oct 2026): a Reward is earned and nothing
// more is recorded on it — no traveller, no booking, no "travelled".
const spend = (memberKey: string, tokens: number, recipient: "SELF" | "NON_FAMILY", recipientName: string, what: string) =>
  recordTokenRedemption({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", memberProfileId: P(memberKey).profileId!, tokens, redeemedOn: istDay(new Date()), recipient, recipientName, reference: what });
// Used For is a Gift or a Voucher, for the Member (owner, 27 Oct 2026).
on("2026-09-20", "Pooja spends Royalty points", () => spend("M04", 10, "SELF", "", "Voucher"));
on("2026-10-02", "Pooja spends points on a gift", () => spend("M04", 3, "SELF", "", "Gift"));

/* ---------------------------------------------------- Holds and Hold Requests */

on("2026-05-18", "Hold on SR-19 (lapses)", async () => {
  const kirti = await customer("kirti");
  await enquiry(kirti, "SRE", "SITE_VISIT", { remark: "Liked SR-19; arranging funds." });
  await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: plotId("SR-19"), personId: kirti.id, remark: "Holding while she arranges the token amount." });
});
on("2026-06-20", "Sandeep requests a Hold on AH-10", async () => {
  const kiran = await customer("kiranPal");
  const req = await submitHoldRequest({ idempotencyKey: key(), actorRef: `MEMBER:${P("M05").key}`, memberProfileId: P("M05").profileId!, personId: kiran.id, plotId: plotId("AH-10") });
  B.HR1 = req.holdRequestId;
});
on("2026-06-20", "CRM approves the Hold Request", () =>
  decideHoldRequest({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", requestId: B.HR1, approve: true, note: "Approved for 72 hours." })
, "15:00");
on("2026-06-25", "Kavita requests a Hold on AH-11", async () => {
  const sumit = await customer("sumit");
  const req = await submitHoldRequest({ idempotencyKey: key(), actorRef: `MEMBER:${P("M06").key}`, memberProfileId: P("M06").profileId!, personId: sumit.id, plotId: plotId("AH-11") });
  B.HR2 = req.holdRequestId;
});
on("2026-06-25", "CRM declines it", () =>
  decideHoldRequest({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", requestId: B.HR2, approve: false, note: "Plot already offered to a walk-in buyer." })
, "15:00"); // a Member Hold Request lapses at 23:59 on its working day
// Today, so the request is still waiting when the demo is shown (it lapses at 23:59).
on("2026-10-14", "Ramesh requests a Hold on AH-12", async () => {
  const naveen = await customer("naveen");
  await submitHoldRequest({ idempotencyKey: key(), actorRef: `MEMBER:${P("M10").key}`, memberProfileId: P("M10").profileId!, personId: naveen.id, plotId: plotId("AH-12") });
}, "08:30");
on("2026-10-14", "Ramesh Kumawat deactivated", () =>
  setMemberStatus({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", memberProfileId: P("M10").profileId!, active: false, reason: "Membership on hold while his RERA renewal is pending." })
, "09:00");
on("2026-10-12", "Hold on SR-18 for Pooja Rawat", async () => {
  const pooja = await customer("poojaRawat");
  await enquiry(pooja, "SRE", "BY_MEMBER", { member: P("M03"), remark: "Wants SR-18; family visiting Sunday." });
  await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: plotId("SR-18"), personId: pooja.id, sourcedByType: "MEMBER", sourcedByPersonId: P("M03").id, remark: "Token cheque expected Monday." });
}, "15:00");
on("2026-10-13", "Hold on AH-09 for Vivek Sood", async () => {
  const vivek = await customer("vivek");
  await enquiry(vivek, "AH", "SITE_VISIT", { remark: "Visited with his wife." });
  await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: plotId("AH-09"), personId: vivek.id, remark: "Loan sanction awaited." });
});
on("2026-10-13", "Hold on MB-S10 for Aman Kalra", async () => {
  const aman = await customer("aman");
  await enquiry(aman, "MBP", "ONLINE", { remark: "Wants a shop for his pharmacy." });
  const hold = await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: plotId("MB-S10"), personId: aman.id, remark: "Partner to confirm." });
  B.H3 = hold.holdId;
}, "12:00");
on("2026-10-14", "Extension requested on MB-S10", () =>
  requestHoldExtension({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", holdId: B.H3, reason: "Partner travelling; back Friday.", requestedHours: 24 })
, "09:30");

/* ---------------------------------------------------- open Enquiries */

for (const [day, who, proj, source, inDaysNext, remark] of [
  ["2026-09-28", "ishaan", "MBP", "ONLINE", 15, "Comparing shop sizes."],
  ["2026-10-02", "irfan", "AH", "SITE_VISIT", 8, "Wants a villa plot; will bring his brother."],
  ["2026-10-08", "sneha", "SRE", "ONLINE", 6, "Asked for the price list."],
  ["2026-10-09", "rakeshMeena", "SRE", "DIRECT", 5, "Walk-in; budget up to 40 lakh."],
] as const) {
  on(day, `Enquiry from ${who}`, async () => {
    await enquiry(await customer(who), proj, source, { followUpInDays: inDaysNext, remark });
  });
}
on("2026-10-10", "Enquiry from Pallavi via Ajay", async () => {
  await enquiry(await customer("pallavi"), "MBP", "BY_MEMBER", { member: P("M12"), followUpInDays: 6, remark: "Clinic space; needs ground floor." });
});
on("2026-07-01", "Enquiry from Gopal", async () => {
  B.EQ_GOPAL = await enquiry(await customer("gopal"), "AH", "ONLINE", { remark: "Asked about EMI options." });
});
on("2026-07-04", "Follow-up with Gopal", () =>
  recordFollowUp({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", enquiryId: B.EQ_GOPAL, outcome: "CALL_LATER", remark: "Will decide after Diwali bonus.", nextAt: inDays(14) })
);
on("2026-07-20", "Gopal's Enquiry closed", () =>
  closeEnquiry({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", enquiryId: B.EQ_GOPAL, closeReason: "Budget did not match; bought a flat instead." })
);

/* ---------------------------------------------------------- bank details */

on("2026-10-08", "Joint bank account entered for Meena Agarwal", () =>
  enterBankDetails({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: P("meena").id,
    accountHolder: "Suresh & Meena Agarwal",
    // Suresh's own account (stored encrypted, so kept in memory). The bank's
    // IFSC is part of the account's identity, so it has to match too.
    ...bankAccounts.suresh,
    jointAccountProof: "Passbook first page names Suresh Agarwal and Meena Agarwal as joint holders",
  })
);

/* --------------------------------------------------------- Land Inquiries */

const LAND = [
  { day: "2026-04-20", district: "Jaipur", tehsil: "Chomu", location: "Near Chomu bypass, Khasra 211", bigha: "4", stages: [["2026-05-10", "DOCUMENTS_PENDING"], ["2026-06-02", "SITE_VISIT"], ["2026-07-15", "UNDER_VERIFICATION"], ["2026-08-20", "NEGOTIATION"], ["2026-09-25", "APPROVED_FOR_ACQUISITION"]] },
  { day: "2026-05-22", district: "Jaipur", tehsil: "Bassi", location: "Bassi–Dausa road, Khasra 87", bigha: "6", stages: [["2026-06-15", "SITE_VISIT"], ["2026-07-30", "REJECTED_CLOSED"]] },
  { day: "2026-06-12", district: "Jaipur", tehsil: "Sanganer", location: "Behind Sanganer airport road, Khasra 402", bigha: "2", stages: [["2026-07-02", "DOCUMENTS_PENDING"], ["2026-08-12", "UNDER_VERIFICATION"]] },
  { day: "2026-07-08", district: "Ajmer", tehsil: "Kishangarh", location: "NH-48 frontage, Khasra 15", bigha: "8", stages: [["2026-08-01", "SITE_VISIT"], ["2026-09-10", "NEGOTIATION"]] },
  { day: "2026-08-05", district: "Jaipur", tehsil: "Phagi", location: "Phagi road, Khasra 330", bigha: "5", stages: [["2026-09-02", "DOCUMENTS_PENDING"]] },
  { day: "2026-08-28", district: "Jaipur", tehsil: "Chaksu", location: "Chaksu town, Khasra 58", bigha: "3", stages: [["2026-09-20", "SITE_VISIT"]] },
  { day: "2026-09-14", district: "Jaipur", tehsil: "Amer", location: "Kunda village, Khasra 141", bigha: "1", stages: [] },
  { day: "2026-09-30", district: "Tonk", tehsil: "Malpura", location: "Malpura road, Khasra 77", bigha: "10", stages: [["2026-10-09", "DOCUMENTS_PENDING"]] },
  { day: "2026-10-07", district: "Jaipur", tehsil: "Sanganer", location: "Goner road, Khasra 512", bigha: "2", stages: [] },
  { day: "2026-10-11", district: "Jaipur", tehsil: "Jamwa Ramgarh", location: "Near Ramgarh lake road, Khasra 19", bigha: "7", stages: [] },
] as const;

LAND.forEach((land, i) => {
  on(land.day, `Land Inquiry ${land.tehsil}`, async () => {
    const source = i % 3 === 0 ? P("M01") : i % 3 === 1 ? P("M12") : null;
    const made = await createLandInquiry({
      createRequestId: key(),
      actorRef: CRM,
      actorRole: "CRM",
      input: {
        ...emptyInput(),
        receivedFrom: source ? "MEMBER" : "THREE_PERCENT_CLUB",
        sourcePersonId: source?.id ?? null,
        district: land.district,
        tehsil: land.tehsil,
        exactLocation: land.location,
        areaBigha: land.bigha,
        areaBiswa: String(4 + ((i * 7) % 16)),
      },
    });
    B[`LI${i}`] = made.id;
  }, "16:00");
  for (const [day, stage] of land.stages) {
    on(day, `Land Inquiry ${land.tehsil} → ${stage}`, async () => {
      const row = await db.landInquiry.findUniqueOrThrow({ where: { id: B[`LI${i}`] } });
      await changeLandInquiryStage({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", id: row.id, version: row.version, stage, reason: "Updated after the site team's report." });
    }, "16:30");
  }
});

/* ------------------------------------------------------------ manual tasks */

on("2026-10-10", "MD's weekly review and a CRM task", async () => {
  const anita = await db.staffAccount.findFirst({ where: { role: "CRM", status: "ACTIVE", person: { fullName: { contains: "Anita" } } } });
  await db.$transaction(async (tx) => {
    await ensureTask(tx, { recordKind: "Project", recordId: projectIds.SRE, recordName: "Shri Ram Enclave", purpose: "MANUAL:WEEKLY SALES REVIEW", title: "Weekly sales review with the CRM team", assigneeRole: "MD", dueAt: new Date("2026-10-17T11:00:00+05:30"), recurrence: "WEEKLY", origin: "MANUAL" });
    await ensureTask(tx, { recordKind: "Customer", recordId: (await tx.customerProfile.findUniqueOrThrow({ where: { personId: P("neha").id } })).id, recordName: "Neha Joshi", purpose: "MANUAL:COLLECT REGISTRY COPY", title: "Collect the registry copy from Neha Joshi", assigneeRole: "CRM", assigneeStaffId: anita?.id ?? null, dueAt: new Date("2026-10-15T11:00:00+05:30"), origin: "MANUAL" });
  });
});

/* ------------------------------------------------------------- the runner */

export async function tellStory() {
  const ordered = steps.map((s, i) => ({ ...s, i })).sort((a, b) => `${a.day} ${a.time}`.localeCompare(`${b.day} ${b.time}`) || a.i - b.i);
  for (const step of ordered) {
    console.log(`${step.day} ${step.time}  ${step.label}`);
    await at(db, step.day, step.run, step.time);
  }
  // What the guide says about each person (spec §6).
  notes("M01", "Top seller; invited Anita, Mukesh and Ramesh. Earned his Aravali Heights Reward.");
  notes("M04", "Neha Joshi's Royalty Linked Member; earned 15 points on SR-27, spent 13.");
  notes("M07", "Direct on AH-06 paid early with MD approval.");
  notes("M08", "RERA registration expires 19 Oct — reminder on the Dashboard.");
  notes("M10", "Deactivated 14 Oct with a Hold Request still waiting (task for CRM).");
  notes("M11", "Arranged the AH-05 Buyback; her 1% Buying Commission is Ready.");
  notes("M13", "No bank details — his Direct on AH-07 is On Hold.");
  notes("M14", "Aadhaar not available — her Directs are On Hold; corrected Sold By on SR-23.");
  notes("vikas", "SR-03: enquiry → Booking → 100% → Registry; now a Customer closer (sold SR-29).");
  notes("neha", "SR-05 via Pooja, then bought SR-27 direct — Pooja's Royalty points.");
  notes("ashok", "Two own purchases — repeat-purchase Loyalty.");
  notes("rohit", "SR-21 instalment overdue; his duplicate record was merged in July.");
  notes("shalini", "Changed plot SR-24 → SR-13 (park-facing) in July.");
  notes("rakesh", "Became Primary Customer of SR-12 by transfer from his brother Manoj.");
  notes("dinesh", "SR-01 bought back by the Club in August.");
  notes("sapna", "AH-05 bought back; arranged by Sunita Bairwa.");
  notes("gaurav", "Booking rejected in May (cheque returned); new request on SR-17 waiting for Accounts.");
  notes("meena", "Joint bank account with Suresh — approval waiting for Accounts.");
}
