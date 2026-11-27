// Confidential payment trial — fictional demo data, LOCAL DATABASE ONLY (revised brief §10).
//
// Project A / Plot 108: four instalments of 25%, verified 10% + 15% + 12% =
// 37%, and one payment claim waiting for MD. Plot 109: a custom
// 10/30/30/30 plan with 20% verified, for switching Bookings in the
// calculator. Plots 110–113 are the audit samples; 114 → 115 is a Change Plot
// that leaves a carried opening balance. Everything goes through the CRM's own services, as the screens
// do; no rupee figure exists anywhere in it. People are invented (mobiles 91…).
//
// Run (against the local trial database only): npm run trial:seed

import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";
import { ensureActiveCommissionVersion } from "./seed-commission.ts";
import { decideBookingRequest, submitBookingRequest } from "@/lib/services/booking-service";
import { decideChangePlot, submitChangePlot } from "@/lib/services/change-plot-service";
import { confirmPaymentReceived } from "@/lib/services/payment-service";
import { requestPaymentVerification } from "@/lib/services/payment-verification-service";
import { runPaymentReceivedReminder } from "@/lib/jobs";

assertCheckDatabase();
if (process.env.PERCENTAGE_PAYMENT_TRIAL_ENABLED !== "true") throw new Error("Set PERCENTAGE_PAYMENT_TRIAL_ENABLED=true: this seed is for the local trial only.");
const target = new URL(process.env.DATABASE_URL ?? "");
if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "5433" || target.pathname !== "/threepct_payment_trial") {
  throw new Error("The fictional fixtures belong to the local threepct_payment_trial database only.");
}

const db = new PrismaClient();
const MD = "MD";
const CRM = "CRM-RAHUL";
const ist = (day: string) => new Date(`${day}T00:00:00+05:30`);
let n = 0;
const key = () => `PAYMENT-TRIAL-${Date.now()}-${n++}`;

const plotOf = (projectId: string, plotNumber: string) =>
  db.plot.create({
    data: {
      projectId,
      plotType: "RESIDENTIAL",
      plotNumber,
      widthFt: "30",
      lengthFt: "45",
      areaSqFt: "1350",
      areaSqYd: "150",
      areaSqM: "125.419",
      status: "AVAILABLE",
      restriction: "NONE",
    },
  });

async function book(args: {
  projectId: string;
  plot: string;
  buyer: { fullName: string; mobile: string };
  memberPersonId: string;
  schedule: { percent: string; due: string }[];
  payments: { percent: string; on: string; ref: string }[];
}) {
  const plot = await plotOf(args.projectId, args.plot);
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plot.id,
    parties: [{ personId: "", role: "PRIMARY", fullName: args.buyer.fullName, mobile: args.buyer.mobile }],
    soldByType: "MEMBER",
    soldByPersonId: args.memberPersonId,
    bookingDate: ist("2026-08-15"),
    bookingDateReason: "Trial fixture: booked in August",
    schedule: args.schedule.map((s, i) => ({ seq: i + 1, percent: s.percent, dueDate: ist(s.due) })),
  });
  const decided = await decideBookingRequest({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    bookingId: submitted.bookingId,
    approve: true,
    note: "Trial fixture approved",
  });
  for (const p of args.payments) {
    await confirmPaymentReceived({
      idempotencyKey: key(),
      actorRef: MD,
      actorRole: "MD",
      bookingId: submitted.bookingId,
      percent: p.percent,
      paidOn: ist(p.on),
      reference: p.ref,
    });
  }
  return { bookingId: submitted.bookingId, bookingNumber: decided.bookingNumber };
}

const quarterly = (dues: string[]) => dues.map((due) => ({ percent: "25", due }));

/** Project A and its first six sample bookings (BKG0001–0006 on a fresh trial database). */
async function seedProjectA(memberPersonId: string) {

  // MD's Permissions screen would tick this; the seed ticks it for the demo staff.
  for (const account of await db.staffAccount.findMany({ where: { role: { in: ["CRM", "ACCOUNTS"] } } })) {
    if (!account.extraPermissions.includes("PAYMENT_VERIFICATION_REQUEST")) {
      await db.staffAccount.update({
        where: { id: account.id },
        data: { extraPermissions: [...account.extraPermissions, "PAYMENT_VERIFICATION_REQUEST"] },
      });
    }
  }

  const project = await db.project.create({
    data: { projectCode: "PROJA", name: "Project A", developer: "Trial Developer (fictional)", location: "Jaipur", type: "RESIDENTIAL", status: "ACTIVE" },
  });
  await ensureActiveCommissionVersion(db, project.id, MD);

  const a = await book({
    projectId: project.id,
    plot: "108",
    buyer: { fullName: "Aarav Trial Customer", mobile: "9100000108" },
    memberPersonId,
    schedule: [
      { percent: "25", due: "2026-09-01" },
      { percent: "25", due: "2026-10-01" },
      { percent: "25", due: "2026-12-01" },
      { percent: "25", due: "2027-01-01" },
    ],
    payments: [
      { percent: "10", on: "2026-08-20", ref: "TRIAL-UTR-108-01" },
      { percent: "15", on: "2026-09-10", ref: "TRIAL-UTR-108-02" },
      { percent: "12", on: "2026-10-05", ref: "TRIAL-UTR-108-03" },
    ],
  });
  await requestPaymentVerification({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: a.bookingId,
    claimedPaidOn: ist("2026-11-24"),
    mode: "UPI",
    reference: "TRIAL-UTR-108-04",
    note: "Customer shared a UPI screenshot on WhatsApp",
  });

  const b = await book({
    projectId: project.id,
    plot: "109",
    buyer: { fullName: "Diya Trial Customer", mobile: "9100000109" },
    memberPersonId,
    schedule: [
      { percent: "10", due: "2026-08-15" },
      { percent: "30", due: "2026-11-15" },
      { percent: "30", due: "2027-02-15" },
      { percent: "30", due: "2027-05-15" },
    ],
    payments: [
      { percent: "10", on: "2026-08-15", ref: "TRIAL-UTR-109-01" },
      { percent: "10", on: "2026-11-10", ref: "TRIAL-UTR-109-02" },
    ],
  });

  // Audit sample bookings (checklist): an advance payment, a fully paid one, a
  // single 30% entry MD can correct, and an unpaid one with a claim waiting.
  const c = await book({
    projectId: project.id,
    plot: "110",
    buyer: { fullName: "Kabir Trial Customer", mobile: "9100000110" },
    memberPersonId,
    schedule: quarterly(["2026-12-10", "2027-01-10", "2027-02-10", "2027-03-10"]),
    payments: [{ percent: "60", on: "2026-11-20", ref: "TRIAL-UTR-110-01" }],
  });
  const d = await book({
    projectId: project.id,
    plot: "111",
    buyer: { fullName: "Meera Trial Customer", mobile: "9100000111" },
    memberPersonId,
    schedule: quarterly(["2026-08-20", "2026-09-20", "2026-10-20", "2026-11-20"]),
    payments: [
      { percent: "50", on: "2026-08-20", ref: "TRIAL-UTR-111-01" },
      { percent: "50", on: "2026-11-20", ref: "TRIAL-UTR-111-02" },
    ],
  });
  const e = await book({
    projectId: project.id,
    plot: "112",
    buyer: { fullName: "Rohan Trial Customer", mobile: "9100000112" },
    memberPersonId,
    schedule: quarterly(["2026-09-01", "2026-12-01", "2027-03-01", "2027-06-01"]),
    payments: [{ percent: "30", on: "2026-09-01", ref: "TRIAL-UTR-112-01" }],
  });
  const f = await book({
    projectId: project.id,
    plot: "113",
    buyer: { fullName: "Sara Trial Customer", mobile: "9100000113" },
    memberPersonId,
    schedule: quarterly(["2026-11-25", "2027-02-25", "2027-05-25", "2027-08-25"]),
    payments: [],
  });
  await requestPaymentVerification({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: f.bookingId,
    claimedPaidOn: ist("2026-11-25"),
    mode: "NEFT",
    reference: "TRIAL-UTR-113-01",
    note: "Customer says the first instalment went by NEFT",
  });

  console.log(
    `Project A seeded: 108 → ${a.bookingNumber} (37%, claim waiting); 109 → ${b.bookingNumber} (20%); ` +
      `110 → ${c.bookingNumber} (60% advance); 111 → ${d.bookingNumber} (100%); 112 → ${e.bookingNumber} (30%, one entry); ` +
      `113 → ${f.bookingNumber} (0%, claim waiting).`
  );
  return project;
}

async function main() {
  const member = await db.memberProfile.findUniqueOrThrow({ where: { memberId: "MM0217" } });
  const memberPersonId = member.personId;
  const project = (await db.project.findUnique({ where: { projectCode: "PROJA" } })) ?? (await seedProjectA(memberPersonId));

  if (!(await db.plot.findFirst({ where: { projectId: project.id, plotNumber: "114" } }))) {
    // Owner review point 6 — an opening balance with no separate entries behind
    // it, made the way the CRM makes one: 30% paid on Plot 114, then Change Plot
    // to the bigger Plot 115, where Accounts applies 27.5% (same money, higher
    // price). No payment entry is invented for the 27.5%.
    const g = await book({
      projectId: project.id,
      plot: "114",
      buyer: { fullName: "Vivaan Trial Customer", mobile: "9100000114" },
      memberPersonId: member.personId,
      schedule: quarterly(["2026-08-25", "2026-10-25", "2027-01-25", "2027-04-25"]),
      payments: [
        { percent: "20", on: "2026-08-25", ref: "TRIAL-UTR-114-01" },
        { percent: "10", on: "2026-10-20", ref: "TRIAL-UTR-114-02" },
      ],
    });
    const corner = await plotOf(project.id, "115");
    await submitChangePlot({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: g.bookingId,
      toPlotId: corner.id,
      remark: "Customer moved to the corner plot 115",
    });
    await decideChangePlot({
      idempotencyKey: key(),
      actorRef: "ACCOUNTS-NEHA",
      actorRole: "ACCOUNTS",
      bookingId: g.bookingId,
      approve: true,
      note: "Paid money checked in the accounts: 27.5% of the new plot's price",
      appliedPercent: "27.5",
      schedule: [
        { seq: 1, percent: "30", dueDate: ist("2026-10-25") },
        { seq: 2, percent: "35", dueDate: ist("2027-01-25") },
        { seq: 3, percent: "35", dueDate: ist("2027-04-25") },
      ],
    });
    console.log(`114 → 115 → ${g.bookingNumber} (27.5% carried at Change Plot, 2.5% late).`);
  }

  // Stored follow-up lines follow today's rule (owner review: the oldest late
  // instalment first, with the whole late total) — re-derived by the CRM's own
  // daily reminder job, as production would.
  const sync = await runPaymentReceivedReminder();
  console.log(`Follow-ups re-derived: ${sync.processed} bookings checked, ${sync.changed} open.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
