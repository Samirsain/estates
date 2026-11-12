// Popup cases (user, 10 Nov 2026): three Booking popups had no record in the
// state that shows them, because every Recovery in the data was already
// cleared. One real flow, run through the services the screens call, leaves
// each of them open:
//
//   1. Mahendra (MM0003) sells GEE Plot S-11 to Ritu Saxena; 30% received,
//      so his Direct on it reaches its 25% milestone and is Ready.
//   2. BKG0023 (GEE Plot 20), his paid sale, gets a Sold By Correction to
//      Sonal Agarwal (MM0004): CRM raises it, MD approves it.
//   3. Accounts opens a Recovery against Mahendra's paid Direct on BKG0023.
//
// After it:
//   BKG0023  Recovery repaid (Mark Repaid, Accounts) — the Outstanding Recovery
//   BKG0023  Pay before the old Recovery (MD) — Sonal's Direct is held
//               OLD_RECOVERY_PENDING
//   S-11        Set off against Recovery (Set Off, Accounts) — Mahendra's Ready
//               Direct is held RECOVERY_OUTSTANDING while he owes
//
// Additive, run once on the existing data:
//   node --env-file=.env --import ./prisma/alias-loader.mjs prisma/popup-cases-seed.ts
// Fills only what the forms can enter (mock-data rule, 30 Oct 2026).

import { PrismaClient } from "@prisma/client";
import { submitBookingRequest, decideBookingRequest, requestSoldByCorrection, decideSoldByCorrection } from "@/lib/services/booking-service";
import { confirmPaymentReceived } from "@/lib/services/payment-service";
import { openRecovery } from "@/lib/services/recovery-service";

const db = new PrismaClient();
const MD = "MD";
const ACC = "ACCOUNTS-PRIYA";
const CRM = "CRM-RAHUL";
const RUN = Date.now().toString(36);
let seq = 0;
const key = () => `POPUP-${RUN}-${seq++}`;
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);
const step = async <T>(label: string, run: () => Promise<T>) => {
  const t0 = Date.now();
  const out = await run();
  console.log(`✓ ${label} (${Date.now() - t0} ms)`);
  return out;
};

try {
  const person = async (where: object) => (await db.person.findFirstOrThrow({ where, select: { id: true } })).id;
  const mahendra = await person({ memberProfile: { memberId: "MM0003" } });
  const sonal = await person({ memberProfile: { memberId: "MM0004" } });
  const ritu = await person({ customerProfile: { customerId: "CU0006" } });
  const gee = await db.project.findFirstOrThrow({ where: { projectCode: "GEE" }, select: { id: true } });
  const plot = await db.plot.findFirstOrThrow({ where: { projectId: gee.id, plotNumber: "S-11", status: "AVAILABLE" }, select: { id: true } });
  const x = await db.booking.findUniqueOrThrow({ where: { bookingNumber: "BKG0023" }, select: { id: true } });

  // 1 — the Ready Direct that Set Off needs.
  const { bookingId } = await step("S-11 Booking Request (CRM)", () =>
    submitBookingRequest({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      plotId: plot.id,
      parties: [{ personId: ritu, role: "PRIMARY" as const, sharePercent: null }],
      soldByType: "MEMBER",
      soldByPersonId: mahendra,
      bookingDate: new Date(),
      schedule: [
        { seq: 1, percent: "30", dueDate: new Date() },
        { seq: 2, percent: "35", dueDate: inDays(60) },
        { seq: 3, percent: "35", dueDate: inDays(120) },
      ],
      enquiryId: null,
    })
  );
  await step("S-11 approved (Accounts)", () =>
    decideBookingRequest({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId, approve: true, note: "Verified against the signed agreement and the first receipt." })
  );
  await step("S-11 30% received (Accounts)", () =>
    confirmPaymentReceived({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId, percent: "30", paidOn: new Date(), reference: `UTR26${RUN.toUpperCase()}1` })
  );

  // 2 — the paid Direct on BKG0023 turns into an adjustment.
  await step("BKG0023 Sold By Correction raised (CRM)", () =>
    requestSoldByCorrection({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: x.id,
      toSoldByType: "MEMBER",
      toSoldByPersonId: sonal,
      reason: "Wrong Member selected earlier",
      supportingNote: "Site visit register shows Sonal brought the buyer",
    })
  );
  await step("BKG0023 Sold By Correction approved (MD)", () =>
    decideSoldByCorrection({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", bookingId: x.id, approve: true, note: "Approved — buyer confirmed Sonal brought them" })
  );

  // 3 — the Recovery that the three popups act on.
  const old = await db.commissionRecord.findFirstOrThrow({
    where: { bookingId: x.id, beneficiaryPersonId: mahendra, isCurrent: false, payment: "ACCOUNTS_ADJUSTMENT_REQUIRED" },
    select: { id: true },
  });
  await step("Recovery opened against Mahendra (Accounts)", () =>
    openRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: old.id, noticeOn: new Date(), reference: "POPREC-26-01", reason: "Commission paid to the wrong Sold By Member" })
  );

  const s11 = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { bookingNumber: true } });
  console.log(`Done. New Booking ${s11.bookingNumber} (GEE S-11); BKG0023 carries the Recovery.`);
} finally {
  await db.$disconnect();
}
