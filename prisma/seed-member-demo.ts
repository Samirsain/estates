// A showcase Member whose profile has something in every block.
//
// Same principle as seed-loyalty-demo.ts: nothing is set, everything is earned.
// Every position, band, cycle, commission row and Royalty link below is written
// by the real services in the real order, because those are the only things
// that put them in the ledger the profile reads from. A hand-written row would
// show on the screen and fail reconcile.ts the moment it ran.
//
// The order matters more than the content:
//
//  1. The inviting Member exists first, or there is nobody to be invited by.
//  2. Vikram buys FOUR plots as an ordinary Customer, BEFORE activation. This
//     is the only way a Member can hold Loyalty slots — PRD §14.2 sends an
//     Active Member's own purchase down the self-purchase row, which earns
//     Direct and nothing else. AC-01 freezes the classification at approval, so
//     activating him afterwards leaves those four Bookings as Customer
//     business, exactly as the pack intends.
//  3. Only then is he activated, which is also what creates his portal account.
//  4. Everything after that is Member work: Members under him, sales he closed,
//     a sale his invited Member closed (which is what pays him Invite), and a
//     repeat purchase by one of his Customers (which is what pays him Royalty).
//
// Run: node --env-file=.env --import ./prisma/alias-loader.mjs prisma/seed-member-demo.ts

import { PrismaClient } from "@prisma/client";
import { submitBookingRequest, decideBookingRequest } from "@/lib/services/booking-service";
import { confirmPaymentReceived } from "@/lib/services/payment-service";
import { activateMember } from "@/lib/services/network-service";
import { submitHoldRequest } from "@/lib/services/hold-service";
import { createEnquiry } from "@/lib/services/enquiry-service";
import {
  blindIndex,
  encryptSensitive,
  maskPan,
  normalisePan,
} from "@/lib/security/identity";

const db = new PrismaClient();

const CRM = "SEED-CRM";
const ACC = "SEED-ACC";
const ADM = "SEED-ADM";

let seq = 0;
const key = () => `MEMBER-DEMO-${Date.now()}-${seq++}`;
const today = new Date();
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const SCHEDULE = [
  { seq: 1, percent: "40", dueDate: today },
  { seq: 2, percent: "60", dueDate: day(30) },
];

let mobileSeq = 0;
const nextMobile = () => `98222${String(10000 + mobileSeq++).slice(-5)}`;

let panSeq = 0;
let plotSeq = 0;
let projectId = "";

/** Aadhaar Available, PAN, and a Verified bank — so nothing sits on a hold. */
async function makePerson(fullName: string, extra: Record<string, unknown> = {}) {
  const mobile = nextMobile();
  const aadhaar = `2${mobile}0`.slice(0, 12);
  const pan = normalisePan(`ABCP${String.fromCharCode(65 + (panSeq % 26))}${String(1000 + panSeq++).slice(-4)}F`);
  const person = await db.person.create({
    data: {
      fullName,
      primaryMobile: mobile,
      // constraints.sql — a status other than Pending / Not Available means the
      // encrypted value is actually there, so all four columns are written.
      aadhaarCipher: encryptSensitive(aadhaar),
      aadhaarLastFour: aadhaar.slice(-4),
      aadhaarBlindIndex: blindIndex(aadhaar),
      aadhaarStatus: "AVAILABLE",
      panCipher: encryptSensitive(pan),
      panMasked: maskPan(pan),
      panBlindIndex: blindIndex(pan),
      panStatus: "AVAILABLE",
      ...extra,
    },
  });
  await db.bankDetail.create({
    data: {
      personId: person.id,
      accountHolder: fullName,
      bankName: "HDFC Bank",
      accountCipher: encryptSensitive("500100234567"),
      accountLastFour: mobile.slice(-4),
      ifsc: "HDFC0000123",
      branchName: "Ashok Marg",
      status: "VERIFIED",
      enteredByRef: CRM,
      verifiedByRef: ACC,
      verifiedAt: new Date(),
    },
  });
  return person;
}

async function makePlot(label: string) {
  return db.plot.create({
    data: {
      projectId,
      plotType: "INFORMAL_SECTOR",
      plotNumber: `VD-${String(++plotSeq).padStart(3, "0")}-${label}`,
      areaSqFt: "1500",
      areaSqYd: "166.67",
      areaSqM: "139.35",
      status: "AVAILABLE",
      restriction: "NONE",
    },
  });
}

/** Book, approve, and pay all the way to 100% — the milestone everything waits on. */
async function sell(args: {
  label: string;
  buyerPersonId: string;
  soldByType: "THREE_PERCENT_CLUB" | "MEMBER";
  soldByPersonId?: string | null;
  payToFull?: boolean;
}) {
  const plot = await makePlot(args.label);
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plot.id,
    parties: [{ personId: args.buyerPersonId, role: "PRIMARY" }],
    soldByType: args.soldByType,
    soldByPersonId: args.soldByPersonId ?? null,
    bookingDate: today,
    schedule: SCHEDULE,
  });
  await decideBookingRequest({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: submitted.bookingId,
    approve: true,
    note: "Verified.",
  });
  if (args.payToFull !== false) {
    for (const part of ["40", "60"]) {
      await confirmPaymentReceived({
        idempotencyKey: key(),
        actorRef: ACC,
        actorRole: "ACCOUNTS",
        bookingId: submitted.bookingId,
        percent: part,
        paidOn: today,
        reference: `VD-${plot.plotNumber}-${part}`,
      });
    }
  }
  return { bookingId: submitted.bookingId, plotId: plot.id, plotNumber: plot.plotNumber };
}

const activate = (personId: string, invitedByMemberId: string | null, rera: string) =>
  activateMember({
    idempotencyKey: key(),
    actorRef: ADM,
    actorRole: "ADMIN",
    personId,
    invitedByMemberId,
    reraStatus: "REGISTERED",
    reraNumber: rera,
    reraExpiryDate: day(400),
  });

async function main() {
  const project = await db.project.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  projectId = project.id;
  const staff = await db.staffAccount.findFirstOrThrow({ where: { role: "CRM" } });

  const already = await db.person.findFirst({ where: { fullName: "Vikram Deshpande" } });
  if (already) {
    console.log("Vikram Deshpande already exists — reporting what is on the profile.");
    await report(already.id);
    return;
  }

  /* 1 — the Member who will have invited him. */
  const sanjayPerson = await makePerson("Sanjay Kulkarni", { city: "Jaipur" });
  const sanjay = await activate(sanjayPerson.id, null, "RAJ/A/2026/2001");
  console.log(`Inviting Member  ${sanjay.memberId} · Sanjay Kulkarni`);

  /* 2 — Vikram, still an ordinary Customer. Full contact, so no row reads "—". */
  const vikramPerson = await makePerson("Vikram Deshpande", {
    email: "vikram.deshpande@example.in",
    dateOfBirth: new Date(Date.UTC(1984, 3, 11)),
    city: "Jaipur",
    addressLine: "14, Ashok Nagar, Jaipur 302001",
    altMobile: nextMobile(),
  });

  /* 3 — his first purchase, Sold By Sanjay. CR-002: this is what names his
         Royalty Linked Member, and paying it in full is what confirms it. */
  await sell({
    label: "OWN1",
    buyerPersonId: vikramPerson.id,
    soldByType: "MEMBER",
    soldByPersonId: sanjayPerson.id,
  });

  /* 4 — three repeat purchases, Sold By 3% Club. Each takes one of his three
         lifetime Loyalty slots (PRD §6.5), and the first also pays Sanjay his
         Royalty. This has to happen before activation. */
  for (const label of ["OWN2", "OWN3", "OWN4"]) {
    await sell({ label, buyerPersonId: vikramPerson.id, soldByType: "THREE_PERCENT_CLUB" });
  }

  /* 5 — now he becomes a Member. This is also what opens his portal account. */
  const vikram = await activate(vikramPerson.id, sanjay.memberProfileId, "RAJ/A/2026/2002");
  console.log(`Showcase Member  ${vikram.memberId} · Vikram Deshpande`);

  /* 6 — three Members under him, so his own Invite cycle has positions in it. */
  for (const [i, name] of ["Rupal Chandani", "Devendra Rathi", "Ayesha Qureshi"].entries()) {
    const p = await makePerson(name, { city: "Jaipur" });
    const m = await activate(p.id, vikram.memberProfileId, `RAJ/A/2026/21${i + 1}0`);
    console.log(`  invited        ${m.memberId} · ${name}`);
  }

  /* 7 — two sales he closed himself. Each pays him Direct, and each buyer's
         Royalty link lands on him and goes final at 100%. */
  const meera = await makePerson("Meera Bhandari", { city: "Ajmer" });
  const tejas = await makePerson("Tejas Chopra", { city: "Kota" });
  for (const [label, buyer] of [["SOLD1", meera], ["SOLD2", tejas]] as const) {
    await sell({
      label,
      buyerPersonId: buyer.id,
      soldByType: "MEMBER",
      soldByPersonId: vikramPerson.id,
    });
  }

  /* 8 — Meera buys again, Sold By 3% Club. A repeat purchase by a Customer he
         introduced is what pays him Royalty (prd-complete §14.5, §25). */
  await sell({ label: "ROY1", buyerPersonId: meera.id, soldByType: "THREE_PERCENT_CLUB" });

  /* 9 — a sale closed by one of the Members he invited. The Invite band belongs
         to the seller's inviting Member, so this is what pays him Invite. */
  const rupal = await db.memberProfile.findFirstOrThrow({
    where: { invitedByMemberId: vikram.memberProfileId, invitePosition: 1 },
    include: { person: true },
  });
  const nikita = await makePerson("Nikita Saraf", { city: "Jodhpur" });
  await sell({
    label: "INV1",
    buyerPersonId: nikita.id,
    soldByType: "MEMBER",
    soldByPersonId: rupal.personId,
  });

  /* 10 — a Member Hold Request and an Enquiry he sourced. */
  const holdPlot = await makePlot("HOLD");
  await submitHoldRequest({
    idempotencyKey: key(),
    actorRef: `MEMBER:${vikram.memberId}`,
    memberProfileId: vikram.memberProfileId,
    personId: tejas.id,
    plotId: holdPlot.id,
  });
  await createEnquiry({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    newPerson: { fullName: "Harsh Vardhan", mobile: nextMobile(), city: "Jaipur" },
    projectId,
    plotRequirement: "Corner plot, around 1500 sq ft",
    source: "BY_MEMBER",
    sourceMemberId: vikram.memberProfileId,
    assignedStaffId: staff.id,
    assigneeRole: "CRM",
    nextFollowUpAt: day(2),
    remark: "Asked for a corner plot in this Project.",
  });

  await report(vikramPerson.id);
}

/* ------------------------------------------------------------- what landed */

async function report(personId: string) {
  const profile = await db.memberProfile.findUniqueOrThrow({
    where: { personId },
    include: { invitedByMember: true },
  });
  const vikramPerson = { id: personId };
  const customer = await db.customerProfile.findUniqueOrThrow({ where: { personId } });
  const [invited, royaltyLinked, cycles, sold, commissions, requests, enquiries, portal] =
    await Promise.all([
      db.memberProfile.count({ where: { invitedByMemberId: profile.id } }),
      db.customerProfile.count({ where: { royaltyLinkedMemberId: profile.id } }),
      db.performanceCycle.findMany({ where: { memberProfileId: profile.id } }),
      db.booking.count({ where: { soldByPersonId: vikramPerson.id } }),
      db.commissionRecord.groupBy({
        by: ["type"],
        where: { beneficiaryPersonId: vikramPerson.id, isCurrent: true },
        _count: { _all: true },
      }),
      db.holdRequest.count({ where: { memberId: profile.id } }),
      db.enquiry.count({ where: { sourceMemberId: profile.id } }),
      db.portalAccount.findUnique({ where: { memberProfileId: profile.id } }),
    ]);

  console.log(`\n${profile.memberId} · Vikram Deshpande`);
  console.log(`  Invited by             ${profile.invitedByMember?.memberId ?? "3% Club"}`);
  console.log(`  Invite position        ${profile.invitePosition} at ${profile.inviteRatePercent}%`);
  console.log(`  RERA                   ${profile.reraStatus} ${profile.reraNumber}`);
  console.log(`  Members invited        ${invited}`);
  console.log(`  Royalty linked         ${royaltyLinked}`);
  console.log(`  Cycles                 ${cycles.map((c) => `${c.kind} ${c.positionsComplete}/${c.positionsFilled}`).join(", ")}`);
  console.log(`  Bookings sold          ${sold}`);
  console.log(`  Commission             ${commissions.map((c) => `${c.type} ×${c._count._all}`).join(", ")}`);
  console.log(`  Hold requests          ${requests}`);
  console.log(`  Enquiries sourced      ${enquiries}`);
  console.log(`  Portal account         ${portal?.status ?? "none"}`);
  console.log(`  Also a Customer        ${customer.customerId} · Loyalty ${customer.loyaltySlotsConsumed} of 3 used`);
  console.log(`\nProfile: /members/${profile.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
