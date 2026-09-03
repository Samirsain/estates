// The UAT dataset from
// `system/3_Percent_Club_Complete_Mock_Data_and_Test_Plan.md` §1–§8.
//
//   npm run uat:seed
//
// Everything is built through the same services the screens call —
// prepareInventory, createEnquiry, createHold, submitBookingRequest,
// decideBookingRequest, confirmPaymentReceived, activateMember,
// recordFinalBuyers, recordCompletion, submitChangePlot, cancelBooking,
// createAcquisition. Writing the rows directly would be far shorter and would
// produce a database the application itself could never have produced: no PLC
// snapshot frozen against a Booking, no review version, no commission, no
// performance cycle, no audit trail. A UAT dataset that does not behave like
// real data tests nothing.
//
// GUARDED. This writes ~250 records and deletes its own on every run, so it
// refuses to run anywhere ALLOW_CHECK_WRITES is not "true" — a development or
// staging database, never production.
//
// Re-runnable: it wipes its own four Projects and its own People (mobile numbers
// beginning 97) and rebuilds. It touches nothing the Phase 1 seed or the demo
// Project created.
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
import { createEnquiry, recordFollowUp, closeEnquiry } from "@/lib/services/enquiry-service";
import { createHold, cancelHold } from "@/lib/services/hold-service";
import {
  cancelBooking,
  decideBookingRequest,
  submitBookingRequest,
} from "@/lib/services/booking-service";
import { decideCancellation } from "@/lib/services/cancellation-service";
import { decideChangePlot, submitChangePlot } from "@/lib/services/change-plot-service";
import { confirmPaymentReceived } from "@/lib/services/payment-service";
import { recordFinalBuyers, recordCompletion } from "@/lib/services/completion-service";
import { activateMember } from "@/lib/services/network-service";
import { enterBankDetails } from "@/lib/services/bank-service";
import {
  createAcquisition,
  confirmPaymentGiven,
  decideAcquisition,
} from "@/lib/services/acquisition-service";

const db = new PrismaClient();

/** Staff from the Phase 1 seed. CRM submits, Accounts decides — never both. */
const MD = "STF-0001";
const ADMIN = "STF-0002";
const ACC = "STF-0003";
const CRM = "STF-0005";

/** Every Person this script owns. The wipe finds them by it. */
const MOBILE = "97";
/** Every payment reference this script owns, so a re-run does not collide. */
const REF = "UAT";

let seq = 0;
const key = () => `UAT-${Date.now()}-${seq++}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const today = new Date();

const counters: Record<string, number> = {};
const count = (what: string, by = 1) => {
  counters[what] = (counters[what] ?? 0) + by;
};

/* ------------------------------------------------------------- the dataset */

const PROJECTS = [
  { code: "RGE", name: "Royal Greens Estate", type: "RESIDENTIAL", city: "Jaipur", plotType: "RESIDENTIAL", prefix: "RGE-", from: 1, to: 30, pad: 3 },
  { code: "DPR", name: "Desert Pearl Residency", type: "RESIDENTIAL", city: "Jodhpur", plotType: "RESIDENTIAL", prefix: "DPR-", from: 1, to: 20, pad: 3 },
  { code: "ARH", name: "Aravali Heights", type: "RESIDENTIAL", city: "Jaipur", plotType: "RESIDENTIAL", prefix: "ARH-", from: 101, to: 116, pad: 3 },
  { code: "BHC", name: "Blue Horizon Commercial", type: "COMMERCIAL", city: "Jodhpur", plotType: "COMMERCIAL", prefix: "BHC-", from: 1, to: 12, pad: 2 },
] as const;

/** §3 — 17 Members. */
const MEMBERS = [
  "Aarav Mehta", "Rohan Sharma", "Neha Jain", "Vikram Singh", "Priya Kapoor",
  "Karan Choudhary", "Simran Rathore", "Mohit Bansal", "Anjali Gupta", "Deepak Joshi",
  "Pooja Soni", "Rahul Pareek", "Manish Agarwal", "Shikha Verma", "Sandeep Rathore",
  "Nitin Sharma", "Kavita Meena",
];

/**
 * §4 — 50+ Customers. The first 25 are the document's own list; §17 asks for
 * repeated family and mobile combinations, which the paired surnames give, and
 * two deliberate near-duplicates are added at the end.
 */
const CUSTOMERS = [
  "Rajesh Kumar", "Sunita Kumar", "Amit Jain", "Meena Jain", "Gaurav Sharma",
  "Nisha Sharma", "Rohit Mehta", "Pankaj Gupta", "Seema Gupta", "Arjun Singh",
  "Kavita Singh", "Manish Soni", "Deepa Soni", "Ashok Pareek", "Rekha Pareek",
  "Mahesh Choudhary", "Anita Choudhary", "Sameer Khan", "Farah Khan", "Vivek Agarwal",
  "Ritu Agarwal", "Yogesh Joshi", "Komal Joshi", "Tarun Bansal", "Shalini Bansal",
  "Naveen Rathi", "Sarita Rathi", "Dinesh Vyas", "Uma Vyas", "Prakash Sisodia",
  "Lata Sisodia", "Girish Purohit", "Madhu Purohit", "Sunil Tak", "Rachna Tak",
  "Alok Mathur", "Bhavna Mathur", "Devendra Saini", "Kiran Saini", "Hemant Ojha",
  "Sneha Ojha", "Jitendra Bohra", "Poonam Bohra", "Kailash Dadhich", "Suman Dadhich",
  "Lokesh Bhati", "Nirmala Bhati", "Om Prakash Yadav", "Rani Yadav", "Pradeep Charan",
  // §17 — same name, different mobile; and a shared family mobile.
  "Rajesh Kumar", "Amit Jain",
];

/* ------------------------------------------------------------------- people */

type Made = { id: string; name: string; mobile: string };

let mobileSeq = 0;
const nextMobile = () => `${MOBILE}${String(++mobileSeq).padStart(8, "0")}`;

/**
 * A Person with Aadhaar on record. Commission beneficiaries and final buyers
 * both need it, and a dataset whose people cannot be paid or registered would
 * stop every downstream test at the first hold.
 */
let identitySeq = 0;

async function person(name: string, opts: { pan?: boolean; mobile?: string } = {}): Promise<Made> {
  const mobile = opts.mobile ?? nextMobile();
  // Aadhaar and PAN carry unique blind indexes, so they come off a counter of
  // their own rather than off the mobile. §17 asks for a household that shares
  // a mobile number, and deriving the identity from the mobile would give those
  // two People the same Aadhaar — rejected by the index, and wrong anyway.
  const n = ++identitySeq;
  const aadhaar = `2${String(n).padStart(11, "0")}`;
  const pan = opts.pan === false ? null : `AAAPZ${String(1000 + n).slice(-4)}A`;

  const created = await db.person.create({
    data: {
      fullName: name,
      primaryMobile: mobile,
      city: "Jaipur",
      aadhaarCipher: encryptSensitive(normaliseAadhaar(aadhaar)),
      aadhaarLastFour: aadhaarLastFour(aadhaar),
      aadhaarBlindIndex: blindIndex(normaliseAadhaar(aadhaar)),
      aadhaarStatus: "AVAILABLE",
      ...(pan
        ? {
            panCipher: encryptSensitive(normalisePan(pan)),
            panMasked: maskPan(pan),
            panBlindIndex: blindIndex(normalisePan(pan)),
            panStatus: "AVAILABLE" as const,
          }
        : {}),
    },
  });
  count("persons");
  return { id: created.id, name, mobile };
}

let accountSeq = 0;

/**
 * A commission beneficiary also needs a Verified bank, or everything holds.
 *
 * The account number comes off a counter for the same reason the Aadhaar does:
 * two People with identical details are treated as the same bank record, and the
 * second verification is then refused because the first already verified it.
 */
async function withVerifiedBank(p: Made) {
  // enterBankDetails records the account as Verified on the spot — the separate
  // Accounts decision was removed from this flow, and calling decideBankDetails
  // after it is refused with "already verified".
  await enterBankDetails({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: p.id,
    accountHolder: p.name,
    bankName: "State Bank of India",
    branchName: "M I Road",
    accountNumber: `5${String(++accountSeq).padStart(11, "0")}`,
    ifsc: "SBIN0000451",
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
  const projects = await db.project.findMany({
    where: { projectCode: { in: PROJECTS.map((p) => p.code) } },
    select: { id: true },
  });
  const projectIds = projects.map((p) => p.id);

  if (projectIds.length) {
    const bookingIds = (
      await db.booking.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true },
      })
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
      await db.primaryCustomerChange.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await db.soldByCorrection.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await db.cancellationRequest.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await db.changePlotRequest.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await dropTasks("Booking", bookingIds);
      await dropTasks("Booking Request", bookingIds);
    }

    const plotIds = (
      await db.plot.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } })
    ).map((p) => p.id);

    const acqIds = (
      await db.acquisition.findMany({
        where: { OR: [{ plotId: { in: plotIds } }, { acquisitionNo: { startsWith: "ACQ" } }] },
        select: { id: true, sourceBookingId: true },
      })
    )
      .filter((a) => a.sourceBookingId === null || bookingIds.includes(a.sourceBookingId))
      .map((a) => a.id);
    if (acqIds.length) {
      await db.commissionEvent.deleteMany({ where: { record: { acquisitionId: { in: acqIds } } } });
      await db.commissionRecord.deleteMany({ where: { acquisitionId: { in: acqIds } } });
      await db.paymentGivenEntry.deleteMany({ where: { acquisitionId: { in: acqIds } } });
      await db.paymentScheduleVersion.deleteMany({ where: { acquisitionId: { in: acqIds } } });
      await db.acquisitionEvent.deleteMany({ where: { acquisitionId: { in: acqIds } } });
      await dropTasks("Acquisition", acqIds);
      await db.acquisition.deleteMany({ where: { id: { in: acqIds } } });
    }

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

  // People this script owns, and everything hanging off them.
  const personIds = (
    await db.person.findMany({
      where: { primaryMobile: { startsWith: MOBILE } },
      select: { id: true },
    })
  ).map((p) => p.id);

  if (personIds.length) {
    const memberIds = (
      await db.memberProfile.findMany({
        where: { personId: { in: personIds } },
        select: { id: true },
      })
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

  // References are unique system-wide and outlive their Booking.
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

type BookArgs = {
  plotId: string;
  buyer: Made;
  soldByType?: "THREE_PERCENT_CLUB" | "MEMBER" | "CUSTOMER";
  soldByPersonId?: string | null;
  enquiryId?: string | null;
  /** Converting a Hold: the Plot is on Hold, not Available, so it is named. */
  holdId?: string | null;
};

async function book(args: BookArgs) {
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: args.plotId,
    enquiryId: args.enquiryId ?? null,
    holdId: args.holdId ?? null,
    parties: [{ personId: args.buyer.id, role: "PRIMARY" }],
    soldByType: args.soldByType ?? "THREE_PERCENT_CLUB",
    soldByPersonId: args.soldByPersonId ?? null,
    bookingDate: today,
    customerType: "END_USER",
    schedule: SCHEDULE,
  });
  count("bookingRequests");
  return submitted.bookingId;
}

async function approve(bookingId: string) {
  await decideBookingRequest({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId,
    approve: true,
    note: "Verified against the agreement.",
  });
  count("approvedBookings");
  return bookingId;
}

const bookApproved = async (args: BookArgs) => approve(await book(args));

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

/** 100% received, final buyers recorded, Registry completed — legally done. */
async function deliver(bookingId: string, buyer: Made) {
  await recordFinalBuyers({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId,
    buyers: [{ personId: buyer.id, dateOfBirth: day(-13000), address: "12 Civil Lines, Jaipur" }],
  });
  await recordCompletion({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId,
    completion: { route: "REGISTRY", advocateName: "S. Menon", registryDate: today },
  });
  count("delivered");
}

/* -------------------------------------------------------------------- main */

async function main() {
  await wipe();

  /* ----------------------------------------------- §1, §2 Projects and units */

  const projects: Record<string, { id: string; plots: Record<string, { id: string }> }> = {};

  for (const spec of PROJECTS) {
    const project = await db.project.create({
      data: {
        projectCode: spec.code,
        name: spec.name,
        developer: "Thirty Milestones LLP",
        location: `${spec.city} Ring Road`,
        city: spec.city,
        type: spec.type,
        status: "ACTIVE",
      },
    });
    count("projects");

    await db.plcRuleVersion.create({
      data: {
        projectId: project.id,
        version: 1,
        status: "PUBLISHED",
        effectiveFrom: new Date(),
        publishedAt: new Date(),
        reason: "UAT configuration",
        components: {
          create: [
            { category: "ROAD_WIDTH", threshold: "60.00", percent: "5.0000" },
            { category: "ROAD_WIDTH", threshold: "40.00", percent: "3.0000" },
            { category: "ROAD_WIDTH", threshold: "30.00", percent: "2.0000" },
            { category: "OPEN_SIDES", threshold: "3.00", percent: "4.0000" },
            { category: "OPEN_SIDES", threshold: "2.00", percent: "2.0000" },
            { category: "PARK_FACING", threshold: null, percent: "2.0000" },
          ],
        },
      },
    });

    const rows = [];
    for (let n = spec.from; n <= spec.to; n++) {
      const number = `${spec.prefix}${String(n).padStart(spec.pad, "0")}`;
      // A spread of frontages so the PLC bands are actually exercised, and
      // every third Plot is a corner with two open sides.
      const width = n % 3 === 0 ? "40" : n % 2 === 0 ? "30" : "25";
      rows.push({
        plotNumber: number,
        plotType: spec.plotType,
        widthFt: width,
        lengthFt: "50",
        boundaries: [
          { side: "NORTH" as const, kind: "ROAD" as const, roadWidthFt: n % 3 === 0 ? "60" : "30" },
          ...(n % 3 === 0
            ? [{ side: "EAST" as const, kind: "ROAD" as const, roadWidthFt: "30" }]
            : [{ side: "EAST" as const, kind: "PLOT" as const }]),
        ],
      });
    }

    await prepareInventory({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      projectId: project.id,
      rows,
    });
    count("plots", rows.length);

    const made = await db.plot.findMany({ where: { projectId: project.id } });
    projects[spec.code] = {
      id: project.id,
      plots: Object.fromEntries(made.map((p) => [p.plotNumber, { id: p.id }])),
    };

    // prepareInventory lands a Plot Not Available on a Project that has not been
    // activated yet, and Available on one that has (PRD §16.1). These Projects
    // are created ACTIVE, so most arrive Available already — release only what
    // actually needs it, so the seed works either way.
    const releasable = made.slice(0, made.length - 2);
    let released = 0;
    for (const plot of releasable) {
      if (plot.status !== "NOT_AVAILABLE") continue;
      await makeAvailable({
        idempotencyKey: key(),
        actorRef: ADMIN,
        actorRole: "ADMIN",
        plotId: plot.id,
        reason: "Released for sale",
      });
      released++;
    }
    count("availablePlots", releasable.length);
    if (released) count("explicitlyReleased", released);

    await setRestriction({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      plotId: made[made.length - 1].id,
      restriction: "PLEDGE",
      reason: "Pledged against the development loan",
    });
  }

  // Enquiries and Holds reference the StaffAccount row, not the STF-#### the
  // staff log in with.
  const crmAccount = await db.staffAccount.findFirstOrThrow({
    where: { staffAccountId: CRM },
    select: { id: true },
  });

  const rge = projects.RGE;
  const dpr = projects.DPR;
  const arh = projects.ARH;
  const bhc = projects.BHC;
  const plot = (p: typeof rge, number: string) => p.plots[number].id;

  /* --------------------------------------------------------- §3 17 Members */

  const memberPeople: Made[] = [];
  for (const name of MEMBERS) memberPeople.push(await person(name));
  for (const p of memberPeople) await withVerifiedBank(p);

  /**
   * The first Member is the root. The next nine sit under them so the Invited
   * Member Counter spans all three bands — positions 1–3 at 1%, 4–6 at 0.5%,
   * 7–9 at 0.25% — and the tenth lands past 9, where the band is 0%. Without
   * that spread, RD-02's band table is never exercised by the dataset.
   */
  const profiles: string[] = [];
  for (const [index, p] of memberPeople.entries()) {
    const result = await activateMember({
      idempotencyKey: key(),
      actorRef: MD,
      actorRole: "MD",
      personId: p.id,
      invitedByMemberId: index === 0 ? null : profiles[0],
      reraStatus: index % 4 === 0 ? "REGISTERED" : "NOT_APPLICABLE",
      reraNumber: index % 4 === 0 ? `RAJ/A/2026/${String(1000 + index)}` : null,
      reraExpiryDate: index % 4 === 0 ? day(400) : null,
      reraNotApplicableReason: index % 4 === 0 ? null : "Individual referrer",
    });
    profiles.push(result.memberProfileId);
    count("members");
  }

  /* ------------------------------------------------------ §4 50+ Customers */

  const customers: Made[] = [];
  for (const [index, name] of CUSTOMERS.entries()) {
    // §17 — the last two repeat an earlier name on a different mobile, and one
    // couple shares a household mobile.
    const shared = name === "Sunita Kumar" ? customers[0]?.mobile : undefined;
    customers.push(await person(name, { pan: index % 7 !== 0, mobile: shared }));
  }

  /** §7's named subject for the critical historical-classification test. */
  const rajesh = customers[0];

  /* ------------------------------------------------------- §5 20 Enquiries */

  const enquiries: string[] = [];
  // BY_CUSTOMER is the one that carries a source Customer; EXISTING_CUSTOMER
  // does not, and passing one with it is refused.
  const SOURCES = ["ONLINE", "SITE_VISIT", "BY_MEMBER", "DIRECT", "BY_CUSTOMER"] as const;

  for (let i = 0; i < 20; i++) {
    let source: (typeof SOURCES)[number] = SOURCES[i % SOURCES.length];
    const buyer = customers[i];

    // A By Customer Enquiry names a CustomerProfile, not a Person, and a
    // profile only exists once that Person has been through an Enquiry or a
    // Booking. Early in the loop there is none yet, so it falls back.
    let sourceCustomerId: string | null = null;
    if (source === "BY_CUSTOMER") {
      sourceCustomerId =
        (
          await db.customerProfile.findFirst({
            where: { person: { primaryMobile: { startsWith: MOBILE } } },
            select: { id: true },
          })
        )?.id ?? null;
      if (!sourceCustomerId) source = "DIRECT";
    }
    const created = await createEnquiry({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      personId: buyer.id,
      projectId: i % 2 === 0 ? rge.id : dpr.id,
      source,
      // A Member-sourced Enquiry is what freezes Original Introduced By Member,
      // which is the whole basis of the Royalty tests in §9.
      sourceMemberId: source === "BY_MEMBER" ? profiles[i % 9] : null,
      sourceCustomerId,
      assignedStaffId: crmAccount.id,
      assigneeRole: "CRM",
      nextFollowUpAt: day(3),
      remark: "UAT dataset enquiry",
    });
    enquiries.push(created.enquiryId);
    count("enquiries");

    // §5 — the seven states the document lists, spread across the twenty.
    if (i % 5 === 1) {
      await recordFollowUp({
        idempotencyKey: key(),
        actorRef: CRM,
        actorRole: "CRM",
        enquiryId: created.enquiryId,
        outcome: "CONTACTED",
        remark: "Spoke to the customer.",
        nextAt: day(5),
      });
    }
    if (i % 5 === 2) {
      await recordFollowUp({
        idempotencyKey: key(),
        actorRef: CRM,
        actorRole: "CRM",
        enquiryId: created.enquiryId,
        outcome: "SITE_VISIT_PLANNED",
        remark: "Site visit requested for the weekend.",
        nextAt: day(4),
      });
    }
    if (i % 5 === 3) {
      await recordFollowUp({
        idempotencyKey: key(),
        actorRef: CRM,
        actorRole: "CRM",
        enquiryId: created.enquiryId,
        outcome: "BOOKING_DISCUSSION",
        remark: "Site visit completed; negotiating the rate.",
        nextAt: day(2),
      });
    }
    if (i % 7 === 6) {
      await closeEnquiry({
        idempotencyKey: key(),
        actorRef: CRM,
        actorRole: "CRM",
        enquiryId: created.enquiryId,
        closeReason: "Lost — bought elsewhere.",
      });
      count("closedEnquiries");
    }
  }

  /* ----------------------------------------------------------- §6 12 Holds */

  const holdPlots = Array.from({ length: 12 }, (_, i) => plot(arh, `ARH-${101 + i}`));
  const holds: string[] = [];
  for (const [i, plotId] of holdPlots.entries()) {
    const created = await createHold({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      plotId,
      personId: customers[25 + i].id,
      sourcedByType: i % 3 === 0 ? "MEMBER" : "THREE_PERCENT_CLUB",
      sourcedByPersonId: i % 3 === 0 ? memberPeople[i % MEMBERS.length].id : null,
      remark: "UAT hold",
    });
    holds.push(created.holdId);
    count("holds");
  }

  // Cancelled (released) holds.
  for (const holdId of holds.slice(0, 2)) {
    await cancelHold({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      holdId,
      reason: "Customer withdrew.",
    });
    count("cancelledHolds");
  }

  // Expired: the job would do this on the clock; the dataset needs one on hand.
  await db.hold.update({
    where: { id: holds[2] },
    data: { status: "EXPIRED", closedAt: new Date(), closeReason: "Expired without a Booking." },
  });
  count("expiredHolds");

  // Converted: a Hold that becomes a Booking, which §6 asks for explicitly.
  const convertedHoldBooking = await bookApproved({
    plotId: holdPlots[3],
    buyer: customers[25 + 3],
    holdId: holds[3],
    soldByType: "MEMBER",
    soldByPersonId: memberPeople[1].id,
  });
  await pay(convertedHoldBooking, "30");
  count("convertedHolds");

  /* ------------------------------------------------------- §7 60 Bookings */

  const bookings: string[] = [];
  const remember = (id: string) => {
    bookings.push(id);
    return id;
  };

  /* (a) The critical historical-classification test, §7 step by step.
     Rajesh Kumar buys as a Customer, is activated as a Member afterwards, and
     his original Booking must stay Customer business while the next one uses
     Member rules. */

  const rajeshCustomerBooking = remember(
    await bookApproved({
      plotId: plot(rge, "RGE-001"),
      buyer: rajesh,
      soldByType: "MEMBER",
      soldByPersonId: memberPeople[2].id,
    })
  );
  await pay(rajeshCustomerBooking, "30");
  await pay(rajeshCustomerBooking, "40");

  await withVerifiedBank(rajesh);
  const rajeshMember = await activateMember({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    personId: rajesh.id,
    invitedByMemberId: profiles[0],
    reraStatus: "NOT_APPLICABLE",
    reraNotApplicableReason: "Individual referrer",
  });
  count("members");
  count("customerToMemberConversions");

  // The new business, after activation, following Member rules: a Member's own
  // purchase is Sold By that same Member and settles at 100%.
  const rajeshMemberBooking = remember(
    await bookApproved({
      plotId: plot(rge, "RGE-002"),
      buyer: rajesh,
      soldByType: "MEMBER",
      soldByPersonId: rajesh.id,
    })
  );
  await pay(rajeshMemberBooking, "30");

  /* (b) A Royalty path, which §9 needs: a Customer introduced by a Member, a
     first direct purchase that earns nothing, then a repeat direct purchase
     that carries Royalty — taken all the way to legal completion so the
     performance cycle actually completes. */

  const introduced = customers[2];
  const royaltyFirst = remember(
    await bookApproved({ plotId: plot(dpr, "DPR-001"), buyer: introduced })
  );
  await pay(royaltyFirst, "30");
  await pay(royaltyFirst, "40");
  await pay(royaltyFirst, "30");
  await deliver(royaltyFirst, introduced);

  const royaltyRepeat = remember(
    await bookApproved({ plotId: plot(dpr, "DPR-002"), buyer: introduced })
  );
  await pay(royaltyRepeat, "30");
  await pay(royaltyRepeat, "40");
  await pay(royaltyRepeat, "30");
  // TC-ROY-002 lives here until the next line runs: 100% received, cycle still
  // pending, royalty not earned. TC-ROY-001 is the line itself.
  await deliver(royaltyRepeat, introduced);

  /* (c) A Member self-purchase and a Primary Customer self-purchase (§13). */

  const memberSelf = remember(
    await bookApproved({
      plotId: plot(rge, "RGE-003"),
      buyer: memberPeople[3],
      soldByType: "MEMBER",
      soldByPersonId: memberPeople[3].id,
    })
  );
  await pay(memberSelf, "30");
  await pay(memberSelf, "40");
  await pay(memberSelf, "30");

  const customerSelf = remember(
    await bookApproved({ plotId: plot(rge, "RGE-004"), buyer: customers[4] })
  );
  await pay(customerSelf, "30");

  /* (d) A Loyalty path: a Customer closing a sale for a different buyer. */

  const loyaltyClose = remember(
    await bookApproved({
      plotId: plot(rge, "RGE-005"),
      buyer: customers[5],
      soldByType: "CUSTOMER",
      soldByPersonId: customers[4].id,
    })
  );
  await pay(loyaltyClose, "30");
  await pay(loyaltyClose, "40");
  await pay(loyaltyClose, "30");

  /* (e) §16 Change Plot — RGE-005 is taken, so the document's RGE-005 → RGE-012
     is run on a Booking of its own from RGE-006. */

  const changePlotBooking = remember(
    await bookApproved({
      plotId: plot(rge, "RGE-006"),
      buyer: customers[6],
      soldByType: "MEMBER",
      soldByPersonId: memberPeople[4].id,
    })
  );
  await pay(changePlotBooking, "30");
  await submitChangePlot({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: changePlotBooking,
    toPlotId: plot(rge, "RGE-012"),
    remark: "Customer moved to the corner plot.",
  });
  await decideChangePlot({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: changePlotBooking,
    approve: true,
    note: "Verified against the revised agreement.",
    appliedPercent: "30",
    schedule: [
      { seq: 1, percent: "30", dueDate: today },
      { seq: 2, percent: "70", dueDate: day(45) },
    ],
  });
  count("changePlots");

  /* (f) §15 Recovery — cancellation, refund and the record staying auditable. */

  for (const [i, plotNumber] of ["RGE-007", "RGE-008", "RGE-009"].entries()) {
    const bookingId = remember(
      await bookApproved({
        plotId: plot(rge, plotNumber),
        buyer: customers[7 + i],
        soldByType: "MEMBER",
        soldByPersonId: memberPeople[5].id,
      })
    );
    await pay(bookingId, "30");
    if (i > 0) await pay(bookingId, "40"); // partial vs fuller recovery

    await cancelBooking({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId,
      reason: "Loan Denied",
    });
    await decideCancellation({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      bookingId,
      approve: true,
      note: "Refund processed outside the CRM.",
      reference: reference(),
      actionDate: today,
    });
    count("recoveries");
  }

  /* (g) §10 Buyback / unwind — both sides of legal completion, because
     main-PRD §14.12 treats them differently and only a dataset with both can
     show it. */

  async function buyback(plotNumber: string, buyer: Made, complete: boolean) {
    const bookingId = remember(
      await bookApproved({
        plotId: plot(rge, plotNumber),
        buyer,
        soldByType: "MEMBER",
        soldByPersonId: memberPeople[6].id,
      })
    );
    await pay(bookingId, "30");
    await pay(bookingId, "40");
    await pay(bookingId, "30");
    if (complete) await deliver(bookingId, buyer);

    const acquisition = await createAcquisition({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      type: "BUYBACK",
      sourceBookingId: bookingId,
      sellerPersonId: buyer.id,
      // The arranger is a Member other than the seller — PRD §11.7 refuses a
      // beneficiary who is arranging the return of their own property.
      arrangedByType: "MEMBER",
      arrangedByPersonId: memberPeople[7].id,
      purchaseDate: today,
      remark: "Buyback agreed with the customer.",
      schedule: [{ seq: 1, percent: "100", dueDate: today }],
    });
    await confirmPaymentGiven({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      acquisitionId: acquisition.acquisitionId,
      percent: "100",
      paidOn: today,
      reference: reference(),
    });
    await decideAcquisition({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      acquisitionId: acquisition.acquisitionId,
      approve: true,
      note: "Buyback verified.",
    });
    count("buybacks");
    return acquisition.acquisitionId;
  }

  const buybackAfterCompletion = await buyback("RGE-010", customers[10], true);
  await buyback("RGE-011", customers[11], false);

  /* §14 Buying Commission, inside the 5% cap. */
  await import("@/lib/services/acquisition-service").then((m) =>
    m.recordBuyingCommission({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      acquisitionId: buybackAfterCompletion,
      beneficiaryPersonId: memberPeople[7].id,
      percent: "2.5",
    })
  );
  count("buyingCommissions");

  /* (h) The bulk — ordinary Customer Bookings across the remaining inventory,
     with a spread of payment progress so the Dashboard has something to add up
     and §8's "multiple payments against one booking" is real. */

  const bulkPlots: string[] = [];
  for (let n = 13; n <= 28; n++) bulkPlots.push(plot(rge, `RGE-${String(n).padStart(3, "0")}`));
  for (let n = 3; n <= 18; n++) bulkPlots.push(plot(dpr, `DPR-${String(n).padStart(3, "0")}`));
  for (let n = 1; n <= 10; n++) bulkPlots.push(plot(bhc, `BHC-${String(n).padStart(2, "0")}`));
  // The four Holds that were neither cancelled, expired nor converted are still
  // free inventory as far as their own holder is concerned, and §7 wants sixty.
  for (let i = 4; i <= 9; i++) bulkPlots.push(holdPlots[i]);

  const heldBy = new Map(holdPlots.map((id, i) => [id, { buyer: customers[25 + i], holdId: holds[i] }]));

  for (const [i, plotId] of bulkPlots.entries()) {
    if (bookings.length >= 60) break;
    // A Plot still on Hold can only be booked by its own holder, naming the Hold.
    const held = heldBy.get(plotId);
    const buyer = held?.buyer ?? customers[(i % (CUSTOMERS.length - 12)) + 12];
    const member = memberPeople[i % MEMBERS.length];
    const bookingId = remember(
      await bookApproved({
        plotId,
        buyer,
        holdId: held?.holdId ?? null,
        soldByType: i % 3 === 0 ? "THREE_PERCENT_CLUB" : "MEMBER",
        soldByPersonId: i % 3 === 0 ? null : member.id,
      })
    );

    // A spread: some untouched, some part paid in stages, some complete, a few
    // taken all the way to Delivered.
    const stage = i % 4;
    if (stage >= 1) await pay(bookingId, "30");
    if (stage >= 2) await pay(bookingId, "40");
    if (stage === 3) {
      await pay(bookingId, "30");
      if (i % 8 === 3) await deliver(bookingId, buyer);
    }
  }

  /* A couple of Booking Requests left Pending, so the review queue is not
     empty and §19's "booking an unavailable unit" has something to sit beside. */
  for (const plotNumber of ["BHC-11"]) {
    await book({ plotId: plot(bhc, plotNumber), buyer: customers[30] });
  }

  /* ------------------------------------------------------------- the report */

  const created = {
    projects: await db.project.count({ where: { projectCode: { in: PROJECTS.map((p) => p.code) } } }),
    plots: await db.plot.count({ where: { project: { projectCode: { in: PROJECTS.map((p) => p.code) } } } }),
    members: await db.memberProfile.count({ where: { person: { primaryMobile: { startsWith: MOBILE } } } }),
    persons: await db.person.count({ where: { primaryMobile: { startsWith: MOBILE } } }),
    enquiries: await db.enquiry.count({ where: { project: { projectCode: { in: PROJECTS.map((p) => p.code) } } } }),
    holds: await db.hold.count({ where: { plot: { project: { projectCode: { in: PROJECTS.map((p) => p.code) } } } } }),
    bookingsAll: await db.booking.count({ where: { project: { projectCode: { in: PROJECTS.map((p) => p.code) } } } }),
    bookingsApproved: await db.booking.count({
      where: {
        project: { projectCode: { in: PROJECTS.map((p) => p.code) } },
        bookingNumber: { not: null },
      },
    }),
    payments: await db.paymentReceivedEntry.count({
      where: { booking: { project: { projectCode: { in: PROJECTS.map((p) => p.code) } } } },
    }),
    commissions: await db.commissionRecord.count({
      where: { booking: { project: { projectCode: { in: PROJECTS.map((p) => p.code) } } } },
    }),
    performanceCycles: await db.performanceCycle.count(),
    delivered: counters.delivered ?? 0,
    buybacks: counters.buybacks ?? 0,
    recoveries: counters.recoveries ?? 0,
    changePlots: counters.changePlots ?? 0,
    conversions: counters.customerToMemberConversions ?? 0,
  };

  const TARGETS: Record<string, number> = {
    projects: 4,
    plots: 78,
    members: 17,
    persons: 50,
    enquiries: 20,
    holds: 12,
    bookingsAll: 60,
    payments: 90,
  };

  const rule = "─".repeat(70);
  console.log(rule);
  console.log("UAT dataset — test plan §1–§8");
  console.log(rule);
  let short = 0;
  for (const [what, value] of Object.entries(created)) {
    const target = TARGETS[what];
    const verdict = target === undefined ? "" : value >= target ? `  ✓ (needs ${target})` : `  ✗ SHORT of ${target}`;
    if (target !== undefined && value < target) short++;
    console.log(`${what.padEnd(20)} ${String(value).padStart(5)}${verdict}`);
  }
  console.log(rule);
  console.log(
    short === 0
      ? "Every §1–§8 target met. Run the check suites next: npm run db:check"
      : `${short} target(s) short — see the ✗ rows above.`
  );

  if (short > 0) process.exitCode = 1;
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
