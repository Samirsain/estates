// Takes CUS-003480 (Meenakshi Rathod) from "paid in full" all the way to the
// end of the line: every blank on her profile filled, every task she is holding
// closed, all four Plots Delivered, and her three Loyalty Bonuses actually Paid.
//
// seed-loyalty-demo.ts stopped at 100% Payment Received, which is where the
// Loyalty slots are taken. That left four "Complete Customer Details" alerts
// standing on her profile, an empty Completion column, and three commissions
// sitting Ready but Not Paid. This finishes the job, in the order the office
// would: the final buyer details first (prd-complete §18.2), the completion
// route on top of them (§18.4), and the payout last (§14).
//
// Written through the services for the same reason as the other two seeds: the
// Delivered status, the completion record, the closed tasks and the commission
// payment states are all derived, and a hand-written row would show on the
// screen while failing reconcile.
//
// Run: node --env-file=.env --import ./prisma/alias-loader.mjs prisma/seed-loyalty-demo-finish.ts

import { PrismaClient } from "@prisma/client";
import { recordFinalBuyers, recordCompletion } from "@/lib/services/completion-service";
import { markCommissionPaid } from "@/lib/services/commission-service";
import { encryptSensitive, blindIndex, maskPan, normalisePan } from "@/lib/security/identity";

const db = new PrismaClient();

const CRM = "SEED-CRM";
const ACC = "SEED-ACC";
const CUSTOMER_ID = "CUS-003480";

let seq = 0;
const key = () => `LOYALTY-FINISH-${Date.now()}-${seq++}`;
const today = new Date();
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);

const DOB = new Date(Date.UTC(1987, 7, 23));
const ADDRESS = "22, Civil Lines, Jaipur 302006";

async function main() {
  const customer = await db.customerProfile.findFirstOrThrow({
    where: { customerId: CUSTOMER_ID },
    include: { person: true },
  });
  const personId = customer.personId;

  /* 1 — the blanks on the Contact and Identity cards. A PAN needs all four of
         its columns together or constraints.sql rejects the row. */
  const pan = normalisePan("BNZPM4821K");
  await db.person.update({
    where: { id: personId },
    data: {
      email: "meenakshi.rathod@example.in",
      dateOfBirth: DOB,
      addressLine: ADDRESS,
      altMobile: "9811100732",
      ...(customer.person.panStatus === "AVAILABLE"
        ? {}
        : {
            panCipher: encryptSensitive(pan),
            panMasked: maskPan(pan),
            panBlindIndex: blindIndex(pan),
            panStatus: "AVAILABLE" as const,
          }),
    },
  });
  await db.bankDetail.updateMany({
    where: { personId, branchName: null },
    data: { branchName: "Civil Lines" },
  });
  console.log("Contact, PAN and bank branch filled.");

  /* 2 — the four Bookings, oldest first, so the numbering reads in order. */
  const bookings = await db.booking.findMany({
    where: { primaryPersonId: personId, bookingNumber: { not: null } },
    include: { plot: true },
    orderBy: { bookingNumber: "asc" },
  });

  for (const [i, booking] of bookings.entries()) {
    if (booking.status === "DELIVERED") {
      console.log(`  ${booking.bookingNumber} already Delivered.`);
      continue;
    }

    // prd-complete §18.2 — who the Plot actually registers to. She is the sole
    // final buyer, so the share is the whole of it.
    await recordFinalBuyers({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: booking.id,
      buyers: [{ personId, sharePercent: "100", dateOfBirth: DOB, address: ADDRESS }],
    });

    // §18.4, §18.5 — one route completes a Booking, and completing it is what
    // makes it Delivered. Two Allotment and two Registry, so both routes show.
    await recordCompletion({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: booking.id,
      completion:
        i % 2 === 0
          ? {
              route: "ALLOTMENT",
              allotmentGiven: true,
              allotmentDate: day(-2),
              allotmentNumber: `ALT-2026-${String(4100 + i)}`,
              allotmentGivenTo: "Meenakshi Rathod",
              pattaStatus: "YES",
              pattaDate: day(-1),
            }
          : {
              route: "REGISTRY",
              advocateName: "Adv. Pramod Choudhary",
              registryDate: day(-1),
            },
    });

    const after = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    console.log(`  ${booking.bookingNumber} · ${booking.plot.plotNumber} → ${after.status}`);
  }

  /* 3 — the payout. Ready and Not Paid is the state an Accounts clerk clears,
         so it is cleared the way they would, with a reference and a date. */
  const records = await db.commissionRecord.findMany({
    where: { beneficiaryPersonId: personId, isCurrent: true, payment: "NOT_PAID" },
    orderBy: { createdAt: "asc" },
  });
  for (const [i, record] of records.entries()) {
    if (record.eligibility !== "READY") {
      console.log(`  commission ${record.id.slice(0, 8)} is ${record.eligibility}, left alone.`);
      continue;
    }
    await markCommissionPaid({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      recordId: record.id,
      early: false,
      paidOn: today,
      reference: `NEFT-2026-${String(7710 + i)}`,
      remarks: "Loyalty Bonus paid.",
    });
  }
  console.log(`Commission marked paid: ${records.length}`);

  /* ---------------------------------------------------------- what it looks like */

  const [fresh, deals, paid, openTasks] = await Promise.all([
    db.customerProfile.findFirstOrThrow({
      where: { customerId: CUSTOMER_ID },
      include: { person: true },
    }),
    db.booking.groupBy({
      by: ["status"],
      where: { primaryPersonId: personId },
      _count: { _all: true },
    }),
    db.commissionRecord.groupBy({
      by: ["type", "payment"],
      where: { beneficiaryPersonId: personId, isCurrent: true },
      _count: { _all: true },
    }),
    db.task.count({ where: { recordKind: "Booking", status: "PENDING", recordId: { in: bookings.map((b) => b.id) } } }),
  ]);

  console.log(`\n${CUSTOMER_ID} · ${fresh.person.fullName}`);
  console.log(`  Email / DOB / Address  ${fresh.person.email} · ${fresh.person.dateOfBirth?.toISOString().slice(0, 10)} · ${fresh.person.addressLine}`);
  console.log(`  PAN                    ${fresh.person.panMasked} (${fresh.person.panStatus})`);
  console.log(`  Loyalty slots          ${fresh.loyaltySlotsConsumed} of 3 used`);
  console.log(`  Bookings               ${deals.map((d) => `${d.status} ×${d._count._all}`).join(", ")}`);
  console.log(`  Commission             ${paid.map((p) => `${p.type} ${p.payment} ×${p._count._all}`).join(", ")}`);
  console.log(`  Pending Booking tasks  ${openTasks}`);
  console.log(`\nProfile: /customers/${fresh.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
