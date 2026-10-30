// Fresh mock data (owner, 30 Oct 2026): the old datasets are gone and only the
// staff stay. Kishangarh Farm Estates and the three card Projects come back,
// and new Members, Customers and Investor Leads are made the way the screens
// make them — a Customer only through a Hold or a Booking on a Plot (PRD §5.2).
//
// Four records are filled to the last field the screens can set, so the whole
// system can be seen working on one of each: Kishangarh Farm Estates (every
// link, PLC band, both Plot types, a restricted Plot, two settings versions),
// Plot KF-01 (Enquiry → follow-up → Hold → extension → Booking Request →
// correction → approval → payer-named payment → cancellation refused → 100% →
// final buyers with PAN → Registry → commission paid), Member Hemant Kumar
// Saini (every profile field, network, Direct paid, Reward earned, Royalty
// points earned and spent) and Customer Deepika Sharma (every profile field,
// joint buyer, repeat purchase, closer for Sunita, Royalty-linked to Hemant).
//
//   npm run data:reset   # first: clears everything but the staff
//   npm run seed:fresh
//
// Fills only what a form can enter (mock-data rule, 30 Oct 2026). Writes
// docs/Mock_Data_Guide.md. Not re-runnable on top of itself: reset first.
import { writeFileSync } from "node:fs";
import { assertCheckDatabase } from "./check-guard.ts";
import { installStoryClock, at } from "./demo/story-clock.ts";

assertCheckDatabase();
installStoryClock();

const T = await import("./demo/toolkit.ts");
const { db, key, people, plotId, projectIds, MD, CRM, ACC } = T;
const { CUSTOMERS, MEMBERS } = await import("./demo/world.ts");
const { updateMemberRera } = await import("@/lib/services/network-service");
const { createHold, decideHoldExtension, requestHoldExtension } = await import("@/lib/services/hold-service");
const { decideBookingRequest, reviseBookingRequest, submitBookingRequest, cancelBooking } = await import("@/lib/services/booking-service");
const { decideCancellation } = await import("@/lib/services/cancellation-service");
const { recordFollowUp } = await import("@/lib/services/enquiry-service");
const { recordCompletion, recordFinalBuyers } = await import("@/lib/services/completion-service");
const { recordTokenRedemption } = await import("@/lib/services/royalty-service");
const { setRestriction } = await import("@/lib/services/inventory-service");
const { nextReference, runCommand } = await import("@/lib/services/command");
const { istDay } = await import("@/lib/tasks");
const { runAllJobs } = await import("@/lib/jobs");

// Their own mobiles (96…), so no other seed's wipe ever reaches them.
const mobile = (n: number) => `96100${String(n).padStart(5, "0")}`;

Object.assign(MEMBERS, {
  F01: { name: "Hemant Kumar Saini", inviter: null, kyc: "verified", mobile: mobile(1), address: "B-12, Shastri Nagar" },
  F02: { name: "Kiran Rathore", inviter: "F01", kyc: "verified", mobile: mobile(2) },
  F03: { name: "Mahendra Singh Tanwar", inviter: null, kyc: "verified", mobile: mobile(3), reraExpiry: "2026-11-12" },
  F04: { name: "Sonal Agarwal", inviter: "F01", kyc: "verified", mobile: mobile(4) },
  F05: { name: "Ravi Prakash Meena", inviter: null, kyc: "available", bank: false, mobile: mobile(5) },
});
Object.assign(CUSTOMERS, {
  deepika: { name: "Deepika Sharma", kyc: "verified", mobile: mobile(11), address: "14, Civil Lines" },
  amit: { name: "Amit Sharma", kyc: "verified", mobile: mobile(18), address: "14, Civil Lines" },
  manoj: { name: "Manoj Kumawat", kyc: "verified", mobile: mobile(12), address: "52, Sanganer" },
  pooja: { name: "Pooja Verma", kyc: "available", mobile: mobile(13), address: "7, Bapu Nagar" },
  arvind: { name: "Arvind Jangid", kyc: "verified", mobile: mobile(14), address: "201, Jhotwara" },
  sunita: { name: "Sunita Choudhary", kyc: "verified", mobile: mobile(15), address: "9, Durgapura" },
  naveen: { name: "Naveen Khandelwal", kyc: "verified", mobile: mobile(16), address: "33, C-Scheme" },
  ritu: { name: "Ritu Saxena", kyc: "available", mobile: mobile(17), address: "18, Adarsh Nagar" },
});

/**
 * The Edit details form (people/actions.ts updatePersonDetailsAction): the
 * contact facts beyond name and mobile. Same command, same audit.
 */
const DETAILS: Record<string, { nickname?: string; altMobile?: string; email?: string; dateOfBirth?: string }> = {
  F01: { nickname: "Saini ji", altMobile: mobile(41), email: "hemant.saini@example.in", dateOfBirth: "1979-08-15" },
  F02: { email: "kiran.rathore@example.in", dateOfBirth: "1990-01-26" },
  F03: { altMobile: mobile(43), dateOfBirth: "1975-11-03" },
  F04: { nickname: "Sonal di", email: "sonal.agarwal@example.in" },
  F05: { dateOfBirth: "1986-05-19" },
  deepika: { nickname: "Deepika ji", altMobile: mobile(51), email: "deepika.sharma@example.in", dateOfBirth: "1988-06-21" },
  amit: { email: "amit.sharma@example.in", dateOfBirth: "1985-02-11" },
  manoj: { altMobile: mobile(52), dateOfBirth: "1983-09-09" },
  naveen: { email: "naveen.k@example.in" },
  sunita: { dateOfBirth: "1991-12-01" },
};
const details = (k: string) =>
  runCommand(
    { idempotencyKey: key(), operation: "PERSON_DETAILS_UPDATE", actorRef: CRM, actorRole: "CRM", payload: { personId: people[k].id, ...DETAILS[k] } },
    async (tx) => {
      const d = DETAILS[k];
      const person = await tx.person.update({
        where: { id: people[k].id },
        data: {
          nickname: d.nickname ?? null,
          altMobile: d.altMobile ?? null,
          email: d.email ?? null,
          dateOfBirth: d.dateOfBirth ? new Date(`${d.dateOfBirth}T00:00:00.000Z`) : null,
        },
      });
      return { result: null, audit: { entity: "Person", entityId: person.id, action: "PERSON_DETAILS_UPDATED", reason: "Details taken at the first meeting", after: d } };
    }
  );

const P = (k: string) => people[k];
const B: Record<string, string> = {};
const E: Record<string, string> = {};
const steps: { day: string; time: string; label: string; run: () => Promise<unknown> }[] = [];
const on = (day: string, label: string, run: () => Promise<unknown>, time = "11:00") => steps.push({ day, time, label, run });
const base = { loyaltyExceptionReason: null, effectiveFrom: null } as const;
const trip = {
  tripEnabled: true,
  tripTotalTarget: 3,
  tripMinOwnCredits: 2,
  tripMaxReferenceCredits: 1,
  tripProgrammeCode: "TRIP-KFE-26",
  tripProgrammeVersionRef: "TRIP-KFE-26 v1",
  tripTermsVersionRef: "TRIP-KFE-2026-1",
  tripCutOffAt: null,
  tripWindDownAt: null,
  excludedPlotIds: [],
  sharedPools: [],
};

/* ---------------------------------------------------------------- Projects */

on("2026-09-01", "Kishangarh Farm Estates launches with its Rewards programme", async () => {
  const kfe = await T.project("KFE");
  await T.settings(kfe.id, { ...base, directEnabled: true, directPercent: "2.5", loyaltyEnabled: true, loyaltyPercent: "1", royaltyTokensPerAward: 10, reason: "Launch terms for Kishangarh Farm Estates, with the Rewards programme (3 sales = 1 Reward)", trip });
  await setRestriction({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", plotId: plotId("KF-10"), restriction: "NOT_FOR_SALE", reason: "Kept for the site office until phase 2." });
});
on("2026-09-01", "Projects that show every way a Project card reads", T.cardProjects, "12:00");
on("2026-10-01", "Kishangarh festive terms (settings version 2)", () =>
  T.settings(projectIds.KFE, { ...base, directEnabled: true, directPercent: "3", loyaltyEnabled: true, loyaltyPercent: "1", royaltyTokensPerAward: 15, reason: "Festive season: Direct 3% and 15 Royalty points from 1 Oct", trip })
);

/* ----------------------------------------------------------------- Members */

on("2026-09-02", "Five Members join", async () => {
  for (const k of ["F01", "F02", "F03", "F04", "F05"]) {
    await T.member(k);
    await details(k);
  }
  const rera = (k: string, status: "PENDING" | "NOT_APPLICABLE", notApplicableReason?: string) =>
    updateMemberRera({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", memberProfileId: P(k).profileId!, status, reraNumber: null, expiryDate: null, notApplicableReason });
  await rera("F02", "PENDING");
  await rera("F04", "NOT_APPLICABLE", "Refers buyers only; does not deal in Plots herself");
});

/* ------------------------------------------------ KF-01, a Plot's whole life */

const SCHEDULE = () => [
  { seq: 1, percent: "30", dueDate: new Date() },
  { seq: 2, percent: "35", dueDate: T.inDays(15) },
  { seq: 3, percent: "35", dueDate: T.inDays(25) },
];
let hold = "";

on("2026-09-03", "KF-01: Hemant brings Deepika and Amit", async () => {
  await T.customer("amit");
  E.deepika = await T.enquiry(await T.customer("deepika"), "KFE", "BY_MEMBER", { member: P("F01"), plot: "KF-01", remark: "Hemant's client; wants the corner farm Plot facing the orchard park." });
  for (const k of ["deepika", "amit"]) await details(k);
}, "10:00");
on("2026-09-04", "KF-01: site visit planned", () =>
  recordFollowUp({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", enquiryId: E.deepika, outcome: "SITE_VISIT_PLANNED", remark: "Site visit on Sunday with her husband Amit.", nextAt: T.inDays(2) })
);
on("2026-09-06", "KF-01: Hold after the site visit", async () => {
  hold = (await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: plotId("KF-01"), personId: P("deepika").id, enquiryId: E.deepika, sourcedByType: "MEMBER", sourcedByPersonId: P("F01").id, remark: "Liked KF-01 at the site visit; booking this week." })).holdId;
});
on("2026-09-07", "KF-01: Hold extended while the cheque clears", async () => {
  const { extensionRequestId } = await requestHoldExtension({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", holdId: hold, reason: "Booking cheque deposited; waiting for it to clear.", requestedHours: 48 });
  await decideHoldExtension({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", requestId: extensionRequestId, approve: true, note: "Approved — the cheque is in." });
});
on("2026-09-09", "KF-01: Booking Request, corrected and sent again", async () => {
  const request = {
    actorRef: CRM,
    actorRole: "CRM",
    parties: [
      { personId: P("deepika").id, role: "PRIMARY" as const, sharePercent: "50" },
      { personId: P("amit").id, role: "ADDITIONAL" as const, sharePercent: "50" },
    ],
    soldByType: "MEMBER" as const,
    soldByPersonId: P("F01").id,
    bookingDate: new Date(),
  };
  B["KF-01"] = (
    await submitBookingRequest({
      ...request,
      idempotencyKey: key(),
      plotId: plotId("KF-01"),
      enquiryId: E.deepika,
      holdId: hold,
      schedule: [
        { seq: 1, percent: "30", dueDate: new Date() },
        { seq: 2, percent: "40", dueDate: T.inDays(15) },
        { seq: 3, percent: "30", dueDate: T.inDays(25) },
      ],
    })
  ).bookingId;
  await reviseBookingRequest({ ...request, idempotencyKey: key(), bookingId: B["KF-01"], schedule: SCHEDULE(), reason: "Second and third instalments corrected to 35% each, as agreed." });
});
on("2026-09-10", "KF-01: Accounts approves; 30% paid by her father", async () => {
  await decideBookingRequest({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B["KF-01"], approve: true, note: "RTGS received; agreement signed by both buyers." });
  await T.pay(B["KF-01"], "30", { payerName: "Ramesh Chand Sharma (father)", payerReference: T.ref("UTR26") });
});
on("2026-09-25", "KF-01: 35% paid", () => T.pay(B["KF-01"], "35"), "12:00");
on("2026-09-28", "KF-01: cancellation asked", () =>
  cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["KF-01"], reason: "Other", remark: "Home loan sanction delayed." })
);
on("2026-09-29", "KF-01: cancellation refused — the loan came through", () =>
  decideCancellation({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B["KF-01"], approve: false, note: "Rejected: the loan was sanctioned and the buyers continue." })
);
on("2026-10-05", "KF-01: last 35% — paid in full", () => T.pay(B["KF-01"], "35"), "12:00");
on("2026-10-08", "KF-01: final buyer details with PAN", () =>
  recordFinalBuyers({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: B["KF-01"],
    buyers: [
      { personId: P("deepika").id, sharePercent: "50", dateOfBirth: new Date("1988-06-21"), address: "14, Civil Lines, Jaipur", pan: "BQKPS4821L" },
      { personId: P("amit").id, sharePercent: "50", dateOfBirth: new Date("1985-02-11"), address: "14, Civil Lines, Jaipur", pan: "CMRPS7364K" },
    ],
  })
);
on("2026-10-15", "KF-01: Registry — Delivered", () =>
  recordCompletion({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B["KF-01"], completion: { route: "REGISTRY", advocateName: "Adv. R. K. Bhargava", registryDate: new Date() } })
);

/* --------------------------------------------------------- the other sales */

const lead = (day: string, buyer: string, plot: string, src: "BY_MEMBER" | "BY_CUSTOMER" | "SITE_VISIT" | "DIRECT", by?: string) =>
  on(day, `Enquiry for ${plot}`, async () => {
    const isNew = !people[buyer];
    const who = await T.customer(buyer);
    if (isNew && DETAILS[buyer]) await details(buyer);
    E[plot] = await T.enquiry(who, "KFE", src, {
      member: src === "BY_MEMBER" ? P(by!) : undefined,
      customer: src === "BY_CUSTOMER" ? P(by!) : undefined,
      plot,
      remark: `Asked about ${plot}; site visit fixed.`,
    });
  }, "10:00");

const booking = (day: string, plot: string, buyer: string, by: { member?: string; customer?: string }, opts: { schedule?: "standard" | "two" | "full"; submitOnly?: boolean } = {}) =>
  on(day, `Booking on ${plot}`, async () => {
    B[plot] = await T.sell(plot, await T.customer(buyer), { member: by.member ? P(by.member) : undefined, customer: by.customer ? P(by.customer) : undefined }, { ...opts, enquiryId: E[plot] });
  });

const payment = (day: string, plot: string, percent: string) => on(day, `Payment ${percent}% on ${plot}`, () => T.pay(B[plot], percent), "12:00");

// KF-02: Kiran's first sale; paid in full, it becomes Hemant's Reference Credit
// (a Rewards credit qualifies only at 100% Payment Received, SSOT §46).
lead("2026-09-12", "manoj", "KF-02", "BY_MEMBER", "F02");
booking("2026-09-18", "KF-02", "manoj", { member: "F02" }, { schedule: "two" });
payment("2026-09-18", "KF-02", "30");
payment("2026-10-18", "KF-02", "70");

// KF-06: Hemant's second own sale; paid in full, his third credit earns the Reward.
lead("2026-09-22", "naveen", "KF-06", "BY_MEMBER", "F01");
booking("2026-09-26", "KF-06", "naveen", { member: "F01" }, { schedule: "two" });
payment("2026-09-26", "KF-06", "30");
payment("2026-10-23", "KF-06", "70");

// KF-09: Deepika buys again, straight from the Club — her repeat-purchase
// Loyalty, and Hemant's Royalty points (her Royalty Linked Member).
lead("2026-10-10", "deepika", "KF-09", "DIRECT");
booking("2026-10-12", "KF-09", "deepika", {}, { schedule: "full" });
payment("2026-10-12", "KF-09", "100");

// KF-05: Deepika refers Sunita after her Registry — Sold By Customer; paid in
// full, so Deepika's closing Loyalty is Ready.
lead("2026-10-17", "sunita", "KF-05", "BY_CUSTOMER", "deepika");
booking("2026-10-19", "KF-05", "sunita", { customer: "deepika" }, { schedule: "two" });
payment("2026-10-19", "KF-05", "30");
payment("2026-10-24", "KF-05", "70");

// KF-07: Ravi's sale — his Direct waits for bank details and KYC.
lead("2026-10-20", "ritu", "KF-07", "BY_MEMBER", "F05");
booking("2026-10-24", "KF-07", "ritu", { member: "F05" });
payment("2026-10-24", "KF-07", "30");

// KF-04: Mahendra's Booking Request, waiting for Accounts.
lead("2026-10-22", "arvind", "KF-04", "BY_MEMBER", "F03");
booking("2026-10-28", "KF-04", "arvind", { member: "F03" }, { submitOnly: true });

// KF-03: a walk-in, held by CRM while she arranges the token amount.
lead("2026-10-26", "pooja", "KF-03", "SITE_VISIT");
on("2026-10-29", "Hold on KF-03 for Pooja Verma", async () => {
  await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: plotId("KF-03"), personId: P("pooja").id, enquiryId: E["KF-03"], remark: "Holding while she arranges the token amount." });
});

for (const day of ["2026-09-30", "2026-10-27"]) on(day, "Monthly commission payout", T.payReadyCommissions, "17:00");

// Hemant spends part of his Royalty points: a Voucher, then a Gift.
const spend = (tokens: number, what: string) =>
  recordTokenRedemption({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", memberProfileId: P("F01").profileId!, tokens, redeemedOn: istDay(new Date()), recipient: "SELF", recipientName: "", reference: what });
on("2026-10-20", "Hemant spends Royalty points on a Voucher", () => spend(6, "Voucher"), "15:00");
on("2026-10-26", "Hemant spends Royalty points on a Gift", () => spend(4, "Gift"), "15:00");

/* ------------------------------------------------------------ Investor Leads */

const INVESTORS = [
  { fullName: "Rajesh Agrawal", mobile: mobile(21), altMobile: mobile(31), city: "Jaipur" },
  { fullName: "Meenakshi Jain", mobile: mobile(22), altMobile: null, city: "Ajmer" },
  { fullName: "Vikram Singh Rathore", mobile: mobile(23), altMobile: null, city: "Jodhpur" },
  { fullName: "Anjali Mathur", mobile: mobile(24), altMobile: mobile(34), city: "Jaipur" },
  { fullName: "Suresh Bhatia", mobile: mobile(25), altMobile: null, city: null },
];
const investorNos: string[] = [];
on("2026-10-12", "Investor Leads noted", async () => {
  for (const inv of INVESTORS) {
    investorNos.push(
      await runCommand<string>(
        { idempotencyKey: key(), operation: "POTENTIAL_INVESTOR_ADD", actorRef: CRM, actorRole: "CRM", payload: inv },
        async (tx) => {
          const row = await tx.potentialInvestor.create({
            data: { investorNo: await nextReference(tx, "PI", "PotentialInvestor"), ...inv, createdByRef: CRM },
          });
          return { result: row.investorNo, audit: { entity: "PotentialInvestor", entityId: row.id, action: "POTENTIAL_INVESTOR_ADDED", after: inv } };
        }
      )
    );
  }
});

/* ------------------------------------------------------------------ guide */

const MEMBER_NOTES: Record<string, string> = {
  F01: "THE MEMBER TO OPEN — every field filled. Sold KF-01 (Registry) and KF-06; invited Kiran and Sonal; Kiran's first sale is his Reference Credit, so 3 sales earn the Kishangarh Reward. Direct paid on both sales. Royalty points from Deepika's repeat purchase, part spent on a Voucher and a Gift.",
  F02: "Invited by Hemant. RERA Pending, so her Direct on KF-02 is On Hold (RERA Pending). KF-02 is paid in full — her first sale is Hemant's Reference Credit.",
  F03: "RERA expires 12 Nov; the RERA reminder task appears 7 days before (5 Nov). His Booking Request on KF-04 waits for Accounts.",
  F04: "Invited by Hemant. RERA Not Applicable (refers buyers only). No sales yet.",
  F05: "No bank details and Aadhaar not verified — his Direct on KF-07 is On Hold.",
};
const CUSTOMER_NOTES: Record<string, string> = {
  deepika: "THE CUSTOMER TO OPEN — every field filled. KF-01 jointly with Amit, Sold By Hemant: Enquiry → follow-up → Hold → extension → Booking Request corrected → approved → 30% paid by her father → cancellation refused → 100% → final buyers with PAN → Registry. Royalty Linked to Hemant. Bought KF-09 again from the Club (repeat purchase). Referred Sunita (KF-05) — her closing Loyalty.",
  amit: "Deepika's husband; joint buyer of KF-01 (50%), PAN on file.",
  manoj: "KF-02 by Kiran (her first sale): Booking, 30% then 70% — Payment Completed.",
  naveen: "KF-06 by Hemant: Booking, 30% then 70% — Hemant's third Rewards credit, Reward earned.",
  sunita: "KF-05, Sold By Customer Deepika Sharma: 30% then 70% — Payment Completed.",
  ritu: "KF-07 by Ravi (no bank details): 30% paid; Ravi's Direct On Hold. Aadhaar not verified.",
  arvind: "KF-04 by Mahendra: Booking Request waiting for Accounts.",
  pooja: "KF-03 walk-in: Hold by CRM — Customer ID issued by the Hold. Aadhaar not verified.",
};

async function writeGuide() {
  const rows = await db.person.findMany({
    where: { id: { in: Object.values(people).map((p) => p.id) } },
    select: { id: true, customerProfile: { select: { customerId: true } }, memberProfile: { select: { memberId: true } } },
  });
  const ids = new Map(rows.map((r) => [r.id, [r.memberProfile?.memberId, r.customerProfile?.customerId].filter(Boolean).join(" / ") || "—"]));
  const plots = await db.plot.findMany({ where: { projectId: projectIds.KFE }, select: { plotNumber: true, status: true, restriction: true }, orderBy: { plotNumber: "asc" } });
  const lines = [
    "# Mock Data Guide",
    "",
    `Generated by \`npm run seed:fresh\` on ${new Date().toISOString().slice(0, 10)}, after \`npm run data:reset\`. Only the staff accounts survived the reset; everything below is new and was made through the same services the screens use.`,
    "",
    "Sign in as MD (STF-0001), Accounts (STF-0003 / STF-0004) or CRM (STF-0005).",
    "",
    "**Open these four first — every field the screens can set is filled:** Kishangarh Farm Estates, Plot KF-01, Member Hemant Kumar Saini, Customer Deepika Sharma.",
    "",
    "## Projects",
    "",
    "| Project | Status | What it shows |",
    "|---|---|---|",
    `| Kishangarh Farm Estates | Active | Every field and link; PLC Road Width 30/40/60, Open Sides 2/3, Park Facing; Residential and Commercial Plots; settings v1 (launch) and v2 (festive, 1 Oct); Rewards 3 sales = 1 Reward. Plots: ${plots.map((p) => `${p.plotNumber} ${p.status.replaceAll("_", " ").toLowerCase()}${p.restriction !== "NONE" ? ` (${p.restriction.replaceAll("_", " ").toLowerCase()})` : ""}`).join(", ")} |`,
    "| Vaishali Residency Phase 2 | Unreleased | Card: no RERA, no amenities, no links; not on the Public Portal |",
    "| Malviya Nagar Plaza | Sold Out | Card: no developer |",
    "| Shree Balaji Royal Greens Township Phase 1 Extension | Completed | Card: long name and address, 12 amenities, all links; off the Public Portal |",
    "",
    "## Members",
    "",
    "| Name | Member ID | Story |",
    "|---|---|---|",
    ...Object.entries(MEMBER_NOTES).map(([k, note]) => `| ${P(k).name} | ${ids.get(P(k).id)} | ${note} |`),
    "",
    "## Customers",
    "",
    "| Name | Customer ID | Story |",
    "|---|---|---|",
    ...Object.entries(CUSTOMER_NOTES).map(([k, note]) => `| ${P(k).name} | ${ids.get(P(k).id)} | ${note} |`),
    "",
    "## Investor Leads",
    "",
    "| Name | Mobile | Alternate | City |",
    "|---|---|---|---|",
    ...INVESTORS.map((l) => `| ${l.fullName} | ${l.mobile} | ${l.altMobile ?? "—"} | ${l.city ?? "—"} |`),
    "",
    "Do not run the `*:check` scripts on this database: they add test records.",
    "",
  ];
  writeFileSync("docs/Mock_Data_Guide.md", lines.join("\n"), "utf-8");
}

try {
  if (await db.project.findUnique({ where: { projectCode: "KFE" } })) {
    throw new Error("Kishangarh Farm Estates already exists. Run npm run data:reset first.");
  }
  const ordered = steps.map((s, i) => ({ ...s, i })).sort((a, b) => `${a.day} ${a.time}`.localeCompare(`${b.day} ${b.time}`) || a.i - b.i);
  for (const step of ordered) {
    console.log(`${step.day} ${step.time}  ${step.label}`);
    await at(db, step.day, step.run, step.time);
  }
  await runAllJobs(new Date()); // real time: overdue turns urgent, RERA reminders
  await writeGuide();
  console.log(`seed:fresh done — ${investorNos.length} Investor Leads; see docs/Mock_Data_Guide.md`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
