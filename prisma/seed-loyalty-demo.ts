// A demo Customer with three repeat-purchase Loyalty records, all earned.
//
// Written the long way on purpose: Loyalty is earned, not set. It goes through
// submitBookingRequest, decideBookingRequest and confirmPaymentReceived exactly
// as the office would.
//
// Four purchases, all Sold By 3% Club: the first earns nothing (v2.1 §23 — a
// first personal purchase is not a repeat), and the three after it each earn
// repeat-purchase Loyalty, which has no lifetime limit (v2.1 §21).
//
// Run: node --env-file=.env --import ./prisma/alias-loader.mjs prisma/seed-loyalty-demo.ts

import { PrismaClient } from "@prisma/client";
import { submitBookingRequest, decideBookingRequest } from "@/lib/services/booking-service";
import { confirmPaymentReceived } from "@/lib/services/payment-service";
import { encryptSensitive } from "@/lib/security/identity";

const db = new PrismaClient();

const CRM = "SEED-CRM";
const ACC = "SEED-ACC";
const BUYER_NAME = "Meenakshi Rathod";
const BUYER_MOBILE = "9811100731";
const PLOT_PREFIX = "LOY";

let seq = 0;
const key = () => `LOYALTY-DEMO-${Date.now()}-${seq++}`;
const today = new Date();
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);

/** Two instalments, so the payment path is the ordinary one. */
const SCHEDULE = [
  { seq: 1, percent: "40", dueDate: today },
  { seq: 2, percent: "60", dueDate: day(30) },
];

async function main() {
  const project = await db.project.findFirstOrThrow({ orderBy: { createdAt: "asc" } });

  // Aadhaar Available and a Verified bank, so the earned Loyalty reads Ready
  // rather than sitting on a beneficiary hold (PRD §14.4, §14.7).
  const existing = await db.person.findFirst({ where: { primaryMobile: BUYER_MOBILE } });
  if (existing) throw new Error(`${BUYER_MOBILE} already exists — this seed has already run.`);

  const person = await db.person.create({
    data: {
      fullName: BUYER_NAME,
      primaryMobile: BUYER_MOBILE,
      city: "Jaipur",
      aadhaarCipher: encryptSensitive("271811100731".slice(0, 12)),
      aadhaarLastFour: "0731",
      aadhaarStatus: "AVAILABLE",
    },
  });
  await db.bankDetail.create({
    data: {
      personId: person.id,
      accountHolder: BUYER_NAME,
      bankName: "Bank of Baroda",
      accountCipher: encryptSensitive("340118820047"),
      accountLastFour: "0047",
      ifsc: "BARB0JAIPUR",
      status: "VERIFIED",
      enteredByRef: CRM,
      verifiedByRef: ACC,
      verifiedAt: new Date(),
    },
  });
  console.log(`Person  ${person.fullName} (${person.id})`);

  // Four plots of its own, so nothing already on the board is taken.
  const taken = new Set(
    (await db.plot.findMany({ where: { projectId: project.id }, select: { plotNumber: true } }))
      .map((p) => p.plotNumber)
  );

  for (let i = 1; i <= 4; i++) {
    let plotNumber = `${PLOT_PREFIX}-${String(i).padStart(3, "0")}`;
    while (taken.has(plotNumber)) plotNumber = `${plotNumber}A`;
    taken.add(plotNumber);

    const plot = await db.plot.create({
      data: {
        projectId: project.id,
        plotType: "INFORMAL_SECTOR",
        plotNumber,
        areaSqFt: "1250",
        areaSqYd: "138.89",
        areaSqM: "116.13",
        status: "AVAILABLE",
        restriction: "NONE",
      },
    });

    const submitted = await submitBookingRequest({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      plotId: plot.id,
      parties: [{ personId: person.id, role: "PRIMARY" }],
      soldByType: "THREE_PERCENT_CLUB",
      soldByPersonId: null,
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

    // 100% is what earns it; paid the way the office pays it.
    for (const part of ["40", "60"]) {
      await confirmPaymentReceived({
        idempotencyKey: key(),
        actorRef: ACC,
        actorRole: "ACCOUNTS",
        bookingId: submitted.bookingId,
        percent: part,
        paidOn: today,
        reference: `LOY-${plotNumber}-${part}`,
      });
    }

    const booking = await db.booking.findUniqueOrThrow({ where: { id: submitted.bookingId } });
    console.log(
      `  ${i}. ${booking.bookingNumber} · ${plotNumber} · ${booking.paymentReceivedPercent}% received`
    );
  }

  const customer = await db.customerProfile.findFirstOrThrow({ where: { personId: person.id } });
  const earned = await db.commissionRecord.findMany({
    where: { beneficiaryPersonId: person.id, type: "LOYALTY", isCurrent: true, qualifiedAt: { not: null } },
    include: { booking: { select: { bookingNumber: true } } },
    orderBy: { qualifiedAt: "asc" },
  });

  console.log(`\n${customer.customerId} · ${BUYER_NAME}`);
  console.log(`Repeat-purchase Loyalty earned: ${earned.length}`);
  for (const r of earned) console.log(`  ${r.eligibility} — booking ${r.booking?.bookingNumber ?? "—"}`);
  console.log(`\nProfile: /customers/${customer.id}`);

  if (earned.length !== 3) {
    throw new Error(`Expected 3 earned Loyalty records, got ${earned.length}.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
