// Showcase dataset — one Project where every screen has something to show.
//
//   npm run seed:showcase
//
// Built for walking the CRM end to end. Each Customer and Member here sits in a
// named state, listed in `system/mock-data-showcase.md`, and every record goes
// through the services the screens call, for the reason `uat-seed.ts` gives:
// rows written directly produce a database the application could never have
// produced. Two states only the clock can make are placed by hand, and say so
// where it happens.
//
// GUARDED and re-runnable: it wipes its own Project (SHW) and its own People
// (mobiles beginning 94) and rebuilds. The v1 (97), v2 (96) and demo data stay.
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
import {
  cancelHold,
  createHold,
  requestHoldExtension,
  submitHoldRequest,
  decideHoldRequest,
} from "@/lib/services/hold-service";
import {
  cancelBooking,
  changeOwnershipShares,
  decideBookingRequest,
  decidePrimaryCustomerChange,
  decideSoldByCorrection,
  requestPrimaryCustomerChange,
  requestSoldByCorrection,
  submitBookingRequest,
} from "@/lib/services/booking-service";
import { decideCancellation } from "@/lib/services/cancellation-service";
import { decideChangePlot, submitChangePlot } from "@/lib/services/change-plot-service";
import { confirmPaymentReceived } from "@/lib/services/payment-service";
import { recordFinalBuyers, recordCompletion } from "@/lib/services/completion-service";
import { activateMember } from "@/lib/services/network-service";
import { enterBankDetails } from "@/lib/services/bank-service";
import { markCommissionPaid } from "@/lib/services/commission-service";
import { requestPersonMerge } from "@/lib/services/merge-service";
import {
  createAcquisition,
  confirmPaymentGiven,
  decideAcquisition,
} from "@/lib/services/acquisition-service";

const db = new PrismaClient();

/** Staff from the Phase 1 seed. Maker and checker are never the same account. */
const MD = "STF-0001";
const ADMIN = "STF-0002";
const ACC = "STF-0003";
const CRM = "STF-0005";

const CODE = "SHW";
/** Every Person this script owns. The wipe finds them by it. */
const MOBILE = "94";
/** Every payment reference this script owns, so a re-run does not collide. */
const REF = "SHW";

let seq = 0;
const key = () => `SHW-${Date.now()}-${seq++}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const today = new Date();

const step = (what: string) => console.log(`- ${what}`);

/* ------------------------------------------------------------------- people */

type Made = { id: string; name: string; mobile: string };

let mobileSeq = 0;
const nextMobile = () => `${MOBILE}${String(++mobileSeq).padStart(8, "0")}`;

// Aadhaar, PAN and account numbers carry unique indexes across the whole
// database: v1 numbers from 2, v2 from 3 and the demo from 4, so this set is 5.
let identitySeq = 0;

async function person(name: string, opts: { aadhaar?: boolean } = {}): Promise<Made> {
  const mobile = nextMobile();
  const n = ++identitySeq;
  const withIdentity = opts.aadhaar !== false;
  const aadhaar = `5${String(n).padStart(11, "0")}`;
  const pan = `CCCPZ${String(1000 + n).slice(-4)}C`;

  const created = await db.person.create({
    data: {
      fullName: name,
      primaryMobile: mobile,
      city: "Jaipur",
      ...(withIdentity
        ? {
            aadhaarCipher: encryptSensitive(normaliseAadhaar(aadhaar)),
            aadhaarLastFour: aadhaarLastFour(aadhaar),
            aadhaarBlindIndex: blindIndex(normaliseAadhaar(aadhaar)),
            aadhaarStatus: "AVAILABLE" as const,
            panCipher: encryptSensitive(normalisePan(pan)),
            panMasked: maskPan(pan),
            panBlindIndex: blindIndex(normalisePan(pan)),
            panStatus: "AVAILABLE" as const,
          }
        : {}),
    },
  });
  return { id: created.id, name, mobile };
}

let accountSeq = 0;

async function withBank(p: Made) {
  await enterBankDetails({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: p.id,
    accountHolder: p.name,
    bankName: "HDFC Bank",
    branchName: "C Scheme",
    accountNumber: `8${String(++accountSeq).padStart(11, "0")}`,
    ifsc: "HDFC0000123",
  });
}

/* -------------------------------------------------------------------- wipe */

async function dropTasks(recordIds: string[]) {
  if (recordIds.length === 0) return;
  const ids = (
    await db.task.findMany({ where: { recordId: { in: recordIds } }, select: { id: true } })
  ).map((t) => t.id);
  if (ids.length === 0) return;
  await db.taskEvent.deleteMany({ where: { taskId: { in: ids } } });
  await db.task.deleteMany({ where: { id: { in: ids } } });
}

async function wipe() {
  const project = await db.project.findFirst({ where: { projectCode: CODE }, select: { id: true } });

  if (project) {
    const projectId = project.id;
    const bookingIds = (
      await db.booking.findMany({ where: { projectId }, select: { id: true } })
    ).map((b) => b.id);
    const plotIds = (
      await db.plot.findMany({ where: { projectId }, select: { id: true } })
    ).map((p) => p.id);

    // Only this Project's acquisitions — never another dataset's resale deals.
    const acqIds = (
      await db.acquisition.findMany({
        where: { OR: [{ plotId: { in: plotIds } }, { sourceBookingId: { in: bookingIds } }] },
        select: { id: true },
      })
    ).map((a) => a.id);
    if (acqIds.length) {
      await db.commissionEvent.deleteMany({ where: { record: { acquisitionId: { in: acqIds } } } });
      await db.commissionRecord.deleteMany({ where: { acquisitionId: { in: acqIds } } });
      await db.paymentGivenEntry.deleteMany({ where: { acquisitionId: { in: acqIds } } });
      await db.paymentScheduleVersion.deleteMany({ where: { acquisitionId: { in: acqIds } } });
      await db.acquisitionEvent.deleteMany({ where: { acquisitionId: { in: acqIds } } });
      await dropTasks(acqIds);
      await db.acquisition.deleteMany({ where: { id: { in: acqIds } } });
    }

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
      await dropTasks(bookingIds);
    }

    const enquiryIds = (
      await db.enquiry.findMany({ where: { projectId }, select: { id: true } })
    ).map((e) => e.id);
    await dropTasks(enquiryIds);
    await db.enquiryFollowUp.deleteMany({ where: { enquiryId: { in: enquiryIds } } });

    await db.customerProfile.updateMany({
      where: { royaltyLinkFirstBookingId: { in: bookingIds } },
      data: { royaltyLinkFirstBookingId: null },
    });
    await db.booking.deleteMany({ where: { projectId } });
    await db.enquiry.deleteMany({ where: { id: { in: enquiryIds } } });

    const holdIds = (
      await db.hold.findMany({ where: { plotId: { in: plotIds } }, select: { id: true } })
    ).map((h) => h.id);
    const requestIds = (
      await db.holdRequest.findMany({ where: { plotId: { in: plotIds } }, select: { id: true } })
    ).map((r) => r.id);
    await dropTasks([...holdIds, ...requestIds, ...plotIds]);
    await db.holdExtensionRequest.deleteMany({ where: { holdId: { in: holdIds } } });
    await db.hold.deleteMany({ where: { id: { in: holdIds } } });
    await db.holdRequest.deleteMany({ where: { id: { in: requestIds } } });
    await db.plotEvent.deleteMany({ where: { plotId: { in: plotIds } } });
    await db.plcSnapshot.deleteMany({ where: { plotId: { in: plotIds } } });
    await db.plotBoundary.deleteMany({ where: { plotId: { in: plotIds } } });
    await db.plot.deleteMany({ where: { projectId } });
    await db.plcComponent.deleteMany({ where: { ruleVersion: { projectId } } });
    await db.plcRuleVersion.deleteMany({ where: { projectId } });
    await db.project.delete({ where: { id: projectId } });
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
    await db.memberProfile.updateMany({ where: { id: { in: memberIds } }, data: { inviteCycleId: null } });
    await db.customerProfile.updateMany({
      where: { personId: { in: personIds } },
      data: { royaltyCycleId: null },
    });
    await db.performanceCycle.deleteMany({ where: { memberProfileId: { in: memberIds } } });
    await db.portalAccount.deleteMany({ where: { memberProfileId: { in: memberIds } } });
    await db.memberTermsAcceptance.deleteMany({ where: { memberProfileId: { in: memberIds } } });
    await db.personMergeRequest.deleteMany({
      where: { OR: [{ survivingPersonId: { in: personIds } }, { mergedPersonId: { in: personIds } }] },
    });
    await db.commissionOpportunity.deleteMany({ where: { subjectPersonId: { in: personIds } } });
    await db.bankDetail.deleteMany({ where: { personId: { in: personIds } } });
    await db.memberProfile.deleteMany({ where: { personId: { in: personIds } } });
    await db.customerProfile.deleteMany({ where: { personId: { in: personIds } } });
    await dropTasks(personIds);
    await db.person.updateMany({ where: { id: { in: personIds } }, data: { survivingPersonId: null } });
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
  holdId?: string | null;
  customerType?: "END_USER" | "INVESTOR";
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
    customerType: args.customerType ?? "END_USER",
    schedule: SCHEDULE,
  });
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
  return bookingId;
}

const bookApproved = async (args: BookArgs) => approve(await book(args));

async function pay(bookingId: string, ...percents: string[]) {
  for (const percent of percents) {
    await confirmPaymentReceived({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      bookingId,
      percent,
      paidOn: today,
      reference: reference(),
    });
  }
}

async function finalBuyer(bookingId: string, buyer: Made) {
  await recordFinalBuyers({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId,
    buyers: [{ personId: buyer.id, dateOfBirth: day(-13000), address: "21 Tonk Road, Jaipur" }],
  });
}

async function deliverByRegistry(bookingId: string, buyer: Made) {
  await finalBuyer(bookingId, buyer);
  await recordCompletion({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId,
    completion: { route: "REGISTRY", advocateName: "R. Bhargava", registryDate: today },
  });
}

/** Commission is paid only once it is Ready; anything else is left as it stands. */
async function payout(bookingId: string, type: "DIRECT" | "LOYALTY") {
  const record = await db.commissionRecord.findFirst({
    where: { bookingId, type, isCurrent: true },
  });
  if (record?.eligibility !== "READY") {
    console.log(`  (${type} on that Booking is ${record?.eligibility ?? "absent"}, left unpaid)`);
    return;
  }
  await markCommissionPaid({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    recordId: record.id,
    early: false,
    paidOn: today,
    reference: reference(),
    remarks: "Transferred to the verified account.",
  });
}

/* -------------------------------------------------------------------- main */

async function main() {
  step("wiping the previous showcase data");
  await wipe();

  /* ------------------------------------------------------ Project and Plots */

  step("Project SHW and 30 Plots");
  const project = await db.project.create({
    data: {
      projectCode: CODE,
      name: "SHOW Sunrise Showcase City",
      developer: "Thirty Milestones LLP",
      location: "Ajmer Road, Jaipur",
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
      reason: "Showcase configuration",
      components: {
        create: [
          { category: "ROAD_WIDTH", threshold: "60.00", percent: "5.0000" },
          { category: "ROAD_WIDTH", threshold: "30.00", percent: "2.0000" },
          { category: "OPEN_SIDES", threshold: "2.00", percent: "2.0000" },
          { category: "PARK_FACING", threshold: null, percent: "2.0000" },
        ],
      },
    },
  });

  const rows = [];
  for (let n = 1; n <= 30; n++) {
    const corner = n % 3 === 0;
    rows.push({
      plotNumber: `SHW-${String(n).padStart(3, "0")}`,
      plotType: "RESIDENTIAL" as const,
      widthFt: corner ? "40" : n % 2 === 0 ? "30" : "25",
      lengthFt: "50",
      boundaries: [
        { side: "NORTH" as const, kind: "ROAD" as const, roadWidthFt: corner ? "60" : "30" },
        corner
          ? { side: "EAST" as const, kind: "ROAD" as const, roadWidthFt: "30" }
          : n % 5 === 0
            ? { side: "EAST" as const, kind: "PARK" as const }
            : { side: "EAST" as const, kind: "PLOT" as const },
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

  const made = await db.plot.findMany({ where: { projectId: project.id } });
  const plots = Object.fromEntries(made.map((p) => [p.plotNumber, p]));
  const plot = (n: number) => plots[`SHW-${String(n).padStart(3, "0")}`].id;

  // SHW-029 stays Not Available; SHW-030 is released and then pledged.
  for (const p of made) {
    if (p.status !== "NOT_AVAILABLE" || p.plotNumber === "SHW-029") continue;
    await makeAvailable({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      plotId: p.id,
      reason: "Released for sale",
    });
  }
  await setRestriction({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    plotId: plot(30),
    restriction: "PLEDGE",
    reason: "Pledged against the development loan",
  });

  const crmAccount = await db.staffAccount.findFirstOrThrow({
    where: { staffAccountId: CRM },
    select: { id: true },
  });

  async function enquiry(
    who: Made,
    opts: {
      plotId?: string | null;
      plotRequirement?: string | null;
      source?: "ONLINE" | "SITE_VISIT" | "BY_MEMBER" | "DIRECT";
      sourceMemberId?: string | null;
    } = {}
  ) {
    const created = await createEnquiry({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      personId: who.id,
      projectId: project.id,
      plotId: opts.plotId ?? null,
      plotRequirement: opts.plotRequirement ?? null,
      source: opts.source ?? "DIRECT",
      sourceMemberId: opts.sourceMemberId ?? null,
      assignedStaffId: crmAccount.id,
      assigneeRole: "CRM",
      nextFollowUpAt: day(2),
      remark: "Showcase enquiry",
    });
    return created.enquiryId;
  }

  /**
   * PRD §5.2 — a Customer ID is issued at the first Hold, not at an Enquiry. A
   * short Hold, released straight away, gives someone a profile to open.
   */
  async function briefHold(who: Made, plotId: string, reason: string) {
    const hold = await createHold({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      plotId,
      personId: who.id,
      sourcedByType: "THREE_PERCENT_CLUB",
      remark: "Showcase hold",
    });
    await cancelHold({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      holdId: hold.holdId,
      reason,
    });
  }

  /* ------------------------------------------------------------- Members */

  step("Members: Aarti (root), Bhavesh and Chetna under her");
  const aarti = await person("Aarti Kulkarni");
  const bhavesh = await person("Bhavesh Trivedi");
  const chetna = await person("Chetna Rawat");
  for (const m of [aarti, bhavesh, chetna]) await withBank(m);

  const aartiProfile = (
    await activateMember({
      idempotencyKey: key(),
      actorRef: MD,
      actorRole: "MD",
      personId: aarti.id,
      invitedByMemberId: null,
      reraStatus: "REGISTERED",
      reraNumber: "RAJ/A/2026/7001",
      reraExpiryDate: day(400),
      reraNotApplicableReason: null,
    })
  ).memberProfileId;
  const bhaveshProfile = (
    await activateMember({
      idempotencyKey: key(),
      actorRef: MD,
      actorRole: "MD",
      personId: bhavesh.id,
      invitedByMemberId: aartiProfile,
      reraStatus: "NOT_APPLICABLE",
      reraNotApplicableReason: "Individual referrer",
    })
  ).memberProfileId;
  await activateMember({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    personId: chetna.id,
    invitedByMemberId: aartiProfile,
    reraStatus: "NOT_APPLICABLE",
    reraNotApplicableReason: "Individual referrer",
  });

  /* ----------------------------------------------------------- Customers */

  step("Customers");
  const kiran = await person("Kiran Deshmukh");
  const rohit = await person("Rohit Bhandari", { aadhaar: false }); // no Aadhaar, no bank
  const sonal = await person("Sonal Mathur");
  const neelam = await person("Neelam Chauhan");
  const farhan = await person("Farhan Siddiqui");
  const gita = await person("Gita Solanki");
  const harish = await person("Harish Menon");
  const isha = await person("Isha Kapoor");
  const jatin = await person("Jatin Arora");
  const kiranAgain = await person("Kiran Deshmukh"); // the duplicate, on a second mobile
  for (const c of [kiran, sonal, neelam, farhan, gita, harish, isha, jatin]) await withBank(c);

  /* ---------------------------------------- Kiran Deshmukh: the full profile */

  step("Kiran: first purchase sold by Bhavesh, paid in full, Delivered");
  const kiranEnquiry = await enquiry(kiran, {
    plotId: plot(1),
    source: "BY_MEMBER",
    sourceMemberId: bhaveshProfile,
  });
  await recordFollowUp({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    enquiryId: kiranEnquiry,
    outcome: "SITE_VISIT_PLANNED",
    remark: "Visiting with family on Sunday.",
    nextAt: day(1),
  });
  const k1 = await bookApproved({
    plotId: plot(1),
    buyer: kiran,
    soldByType: "MEMBER",
    soldByPersonId: bhavesh.id,
    enquiryId: kiranEnquiry,
  });
  await pay(k1, "30", "40", "30");
  await deliverByRegistry(k1, kiran);
  await payout(k1, "DIRECT");

  step("Kiran: repeat purchase through 3% Club — Loyalty slot 1, share change, details due");
  const k2 = await bookApproved({ plotId: plot(2), buyer: kiran, customerType: "INVESTOR" });
  await changeOwnershipShares({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: k2,
    parties: [
      { personId: kiran.id, role: "PRIMARY", sharePercent: "60" },
      { personId: farhan.id, role: "ADDITIONAL", sharePercent: "40" },
    ],
    reason: "Brother-in-law joins as co-buyer.",
  });
  await pay(k2, "30", "40", "30");
  await payout(k2, "LOYALTY");
  // Paid in full, final buyer details deliberately not recorded: the alert.

  step("Kiran closes a sale for Neelam — Loyalty slot 2; Primary Customer then changes to Farhan");
  const k3 = await bookApproved({
    plotId: plot(3),
    buyer: neelam,
    soldByType: "CUSTOMER",
    soldByPersonId: kiran.id,
  });
  await pay(k3, "30");
  await requestPrimaryCustomerChange({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: k3,
    toPersonId: farhan.id,
    reason: "Neelam transfers the allotment to Farhan.",
  });
  await decidePrimaryCustomerChange({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: k3,
    approve: true,
    note: "Transfer letter verified.",
  });

  step("Kiran: live Hold on SHW-004 with an extension request, expiring soon");
  const kiranHold = await createHold({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plot(4),
    personId: kiran.id,
    sourcedByType: "THREE_PERCENT_CLUB",
    remark: "Deciding between SHW-004 and SHW-006.",
  });
  await requestHoldExtension({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    holdId: kiranHold.holdId,
    reason: "Waiting for the home loan sanction letter.",
    requestedHours: 24,
  });
  // A Hold runs 72 hours from now; "expiring" needs the last day, which only
  // the clock produces. Moved by hand so the alert has something to show.
  await db.hold.update({
    where: { id: kiranHold.holdId },
    data: { expiresAt: new Date(Date.now() + 5 * 3_600_000) },
  });

  const lostEnquiry = await enquiry(kiran, { plotId: plot(15), source: "SITE_VISIT" });
  await closeEnquiry({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    enquiryId: lostEnquiry,
    closeReason: "Chose SHW-002 instead.",
  });

  /* ---------------------- Rohit Bhandari: Loyalty held for a missing Aadhaar */

  step("Rohit (no Aadhaar) closes a sale for Gita — Loyalty on hold; Gita Delivered");
  await enquiry(rohit, { plotRequirement: "Any 30 × 50 in a corner", source: "ONLINE" });
  await briefHold(rohit, plot(16), "Looked at it for a friend, not for himself.");
  const g1 = await bookApproved({
    plotId: plot(5),
    buyer: gita,
    soldByType: "CUSTOMER",
    soldByPersonId: rohit.id,
  });
  await pay(g1, "30", "40", "30");
  await deliverByRegistry(g1, gita);

  /* --------------------- Sonal Mathur: Sold By corrected, then made a Member */

  step("Sonal: 3% Club sale corrected to Chetna, then activated as a Member");
  const s1 = await bookApproved({ plotId: plot(6), buyer: sonal });
  await pay(s1, "30");
  await requestSoldByCorrection({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: s1,
    toSoldByType: "MEMBER",
    toSoldByPersonId: chetna.id,
    reason: "Chetna brought Sonal to the site; entered as walk-in by mistake.",
    supportingNote: "Site visit register, page 14.",
  });
  await decideSoldByCorrection({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    bookingId: s1,
    approve: true,
    note: "Register entry confirms it.",
  });
  await activateMember({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    personId: sonal.id,
    invitedByMemberId: aartiProfile,
    reraStatus: "NOT_APPLICABLE",
    reraNotApplicableReason: "Individual referrer",
  });

  /* --------------------- Harish Menon: Allotment route, then Buyback seller */

  step("Harish: sold by Chetna, Allotment, then bought back");
  const h1 = await bookApproved({
    plotId: plot(7),
    buyer: harish,
    soldByType: "MEMBER",
    soldByPersonId: chetna.id,
  });
  await pay(h1, "30", "40", "30");
  await finalBuyer(h1, harish);
  await recordCompletion({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: h1,
    completion: {
      route: "ALLOTMENT",
      allotmentGiven: true,
      allotmentDate: today,
      allotmentNumber: "ALT/SHW/007",
      allotmentGivenTo: "Harish Menon",
      pattaStatus: "DONT_KNOW",
      pattaDate: null,
    },
  });
  const buyback = await createAcquisition({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    type: "BUYBACK",
    sourceBookingId: h1,
    sellerPersonId: harish.id,
    arrangedByType: "MEMBER",
    arrangedByPersonId: aarti.id,
    purchaseDate: today,
    remark: "Relocating abroad; company buys the plot back.",
    schedule: [{ seq: 1, percent: "100", dueDate: today }],
  });
  await confirmPaymentGiven({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    acquisitionId: buyback.acquisitionId,
    percent: "100",
    paidOn: today,
    reference: reference(),
  });
  await decideAcquisition({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    acquisitionId: buyback.acquisitionId,
    approve: true,
    note: "Buyback verified.",
  });

  /* --------------------------- Isha Kapoor: a cancellation and a Change Plot */

  step("Isha: SHW-008 cancelled with refund; SHW-009 changed to SHW-010");
  const i1 = await bookApproved({
    plotId: plot(8),
    buyer: isha,
    soldByType: "MEMBER",
    soldByPersonId: bhavesh.id,
  });
  await pay(i1, "30");
  await cancelBooking({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: i1,
    reason: "Loan Denied",
  });
  await decideCancellation({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: i1,
    approve: true,
    note: "Refund processed outside the CRM.",
    reference: reference(),
    actionDate: today,
  });

  const i2 = await bookApproved({
    plotId: plot(9),
    buyer: isha,
    soldByType: "MEMBER",
    soldByPersonId: bhavesh.id,
  });
  await pay(i2, "30");
  await submitChangePlot({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: i2,
    toPlotId: plot(10),
    remark: "Wants the park-facing plot next door.",
  });
  await decideChangePlot({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: i2,
    approve: true,
    note: "Revised agreement signed.",
    appliedPercent: "30",
    schedule: [
      { seq: 1, percent: "30", dueDate: today },
      { seq: 2, percent: "70", dueDate: day(45) },
    ],
  });

  /* ------------------ Jatin Arora: requests rejected and waiting for decisions */

  step("Jatin: a rejected and a waiting Booking Request; Member Hold Requests");
  await enquiry(jatin, { plotId: plot(11), source: "BY_MEMBER", sourceMemberId: bhaveshProfile });
  const rejected = await book({
    plotId: plot(11),
    buyer: jatin,
    soldByType: "MEMBER",
    soldByPersonId: bhavesh.id,
  });
  await decideBookingRequest({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: rejected,
    approve: false,
    rejectReason: "INCOMPLETE_DETAILS",
    note: "Co-buyer address missing on the agreement.",
  });
  await book({ plotId: plot(12), buyer: jatin, soldByType: "MEMBER", soldByPersonId: bhavesh.id });

  const bhaveshMember = await db.memberProfile.findUniqueOrThrow({
    where: { id: bhaveshProfile },
    select: { memberId: true },
  });
  const declined = await submitHoldRequest({
    idempotencyKey: key(),
    actorRef: `MEMBER:${bhaveshMember.memberId}`,
    memberProfileId: bhaveshProfile,
    personId: jatin.id,
    plotId: plot(14),
  });
  await decideHoldRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    requestId: declined.holdRequestId,
    approve: false,
    note: "Jatin already has a request waiting on SHW-012.",
  });
  await submitHoldRequest({
    idempotencyKey: key(),
    actorRef: `MEMBER:${bhaveshMember.memberId}`,
    memberProfileId: bhaveshProfile,
    personId: jatin.id,
    plotId: plot(13),
  });

  /* ------------------------------------- the duplicate Kiran: a merge waiting */

  step("A duplicate Kiran Deshmukh, with a merge waiting for the MD");
  await enquiry(kiranAgain, { plotRequirement: "Second plot near SHW-001", source: "ONLINE" });
  await briefHold(kiranAgain, plot(17), "Duplicate record; the real Kiran already holds SHW-004.");
  await requestPersonMerge({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    survivingPersonId: kiran.id,
    mergedPersonId: kiranAgain.id,
    reason: "Same person — enquired again from a second mobile.",
  });

  /* ------------------------------------------------------- a walk-in caller */

  step("A walk-in Enquiry with no Plot yet");
  await createEnquiry({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    newPerson: { fullName: "Lalit Joshi", mobile: nextMobile(), city: "Ajmer" },
    projectId: project.id,
    plotRequirement: "40 × 60 corner, east facing",
    source: "ONLINE",
    assignedStaffId: crmAccount.id,
    assigneeRole: "CRM",
    nextFollowUpAt: day(1),
    remark: "Called from the website form.",
  });

  /* ------------------------------------------------------------- summary */

  const people = await db.person.findMany({
    where: { primaryMobile: { startsWith: MOBILE } },
    select: {
      fullName: true,
      primaryMobile: true,
      customerProfile: { select: { customerId: true } },
      memberProfile: { select: { memberId: true } },
    },
    orderBy: { primaryMobile: "asc" },
  });
  console.log("\nShowcase ready — Project SHW (SHOW Sunrise Showcase City).");
  for (const p of people) {
    const ids = [p.customerProfile?.customerId, p.memberProfile?.memberId].filter(Boolean).join(" · ");
    console.log(`  ${p.fullName.padEnd(18)} ${p.primaryMobile}  ${ids}`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
