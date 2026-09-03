// Final buyer details, the one-route Allotment/Registry completion and the
// Delivered state. PRD §4; main-PRD §18.
//
// Delivered is not a button: it is what a completed route means. There is no
// Confirm Delivery action anywhere in this file.

import { canTransition } from "@/lib/domain/booking";
import {
  canReopenDelivered,
  readyForCompletion,
  validateCompletion,
  validateFinalBuyers,
  type CompletionInput,
  type FinalBuyer,
} from "@/lib/domain/completion";
import {
  aadhaarLastFour,
  blindIndex,
  encryptSensitive,
  isValidAadhaarFormat,
  isValidPanFormat,
  maskPan,
  normaliseAadhaar,
  normalisePan,
} from "@/lib/security/identity";
import { blocked, lockBooking, runCommand, type Tx } from "./command";
import { closeTasksFor, ensureTask } from "./task-service";
import { onLegalCompletionChanged } from "./commission-service";

/* --------------------------------------------------------------- tasks */

const FINAL_BUYER_PURPOSE = "FINAL_BUYER_DETAILS";
const COMPLETION_PURPOSE = "ALLOTMENT_REGISTRY";

async function bookingLabel(tx: Tx, bookingId: string): Promise<string> {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { plot: true, project: true },
  });
  return `${booking.bookingNumber ?? booking.requestNo} · ${booking.project.name} ${booking.plot.plotNumber}`;
}

/**
 * main-PRD §18.1 — 100% Payment Received creates the final-buyer and
 * Allotment/Registry work once. `ensureTask` keys on Record + Purpose, so a
 * repeated payment confirmation or a job catch-up creates nothing twice.
 */
export async function ensureCompletionTasks(tx: Tx, bookingId: string) {
  const recordName = await bookingLabel(tx, bookingId);
  const dueAt = new Date();

  await ensureTask(tx, {
    recordKind: "Booking",
    recordId: bookingId,
    recordName,
    purpose: FINAL_BUYER_PURPOSE,
    title: "Complete Final Buyer Details",
    assigneeRole: "CRM",
    dueAt,
  });
  await ensureTask(tx, {
    recordKind: "Booking",
    recordId: bookingId,
    recordName,
    purpose: COMPLETION_PURPOSE,
    title: "Prepare Allotment / Registry",
    assigneeRole: "CRM",
    dueAt,
  });
}

/** A reversal below 100% withdraws the completion work (PRD §12.7). */
export async function closeCompletionTasks(tx: Tx, bookingId: string, actorRef: string, reason: string) {
  await closeTasksFor(tx, "Booking", bookingId, actorRef, reason, FINAL_BUYER_PURPOSE);
  await closeTasksFor(tx, "Booking", bookingId, actorRef, reason, COMPLETION_PURPOSE);
}

/* --------------------------------------------------- final buyer details */

export type FinalBuyerInput = {
  personId: string;
  /** Null only where this is the sole final buyer (treated as 100%). */
  sharePercent?: string | null;
  dateOfBirth: Date;
  address: string;
  /**
   * main-PRD §18.2 lists the Aadhaar Number among the final buyer details, and
   * a registry cannot be recorded without one. Blank where the Person already
   * has it on file — an Aadhaar already recorded is never overwritten here.
   */
  aadhaar?: string | null;
  /**
   * §18.2's PAN decision. Blank is the decision "not available", which is the
   * column default and a legitimate state — unlike the Aadhaar, a completion is
   * never blocked on it. Never overwrites a PAN already on file.
   */
  pan?: string | null;
};

/**
 * main-PRD §18.2 — Primary Customer, Additional Customer(s), Aadhaar, Date of
 * Birth, Address and the PAN decision. The final registration buyer may differ
 * from the commercial Booking Customer, so both stay distinguishable: this
 * writes FINAL_REGISTRATION parties and never touches the COMMERCIAL rows.
 */
/**
 * The Aadhaar behind a final buyer, stored the way every other sensitive value
 * here is: AES payload, last four for display, blind index for lookup, status
 * moved off Pending. Nothing is decrypted or returned.
 *
 * Write-once by design. An Aadhaar already on file is left exactly as it is —
 * correcting one is an identity change with its own audit, not a side effect of
 * recording who a Plot registers to.
 */
async function recordBuyerAadhaar(tx: Tx, buyer: FinalBuyerInput) {
  const raw = buyer.aadhaar?.trim();
  if (!raw) return;

  const person = await tx.person.findUniqueOrThrow({
    where: { id: buyer.personId },
    select: { aadhaarStatus: true },
  });
  if (person.aadhaarStatus !== "PENDING") return;

  if (!isValidAadhaarFormat(raw)) blocked("An Aadhaar Number is twelve digits.");
  const normalised = normaliseAadhaar(raw);
  const index = blindIndex(normalised);

  // The column is unique, so a duplicate would surface as a constraint error
  // with nothing in it for the person typing. Say whose problem it is instead.
  const clash = await tx.person.findFirst({
    where: { aadhaarBlindIndex: index, id: { not: buyer.personId } },
    select: { id: true },
  });
  if (clash) blocked("This Aadhaar Number is already recorded against another person.");

  await tx.person.update({
    where: { id: buyer.personId },
    data: {
      aadhaarCipher: encryptSensitive(normalised),
      aadhaarLastFour: aadhaarLastFour(normalised),
      aadhaarBlindIndex: index,
      aadhaarStatus: "AVAILABLE",
    },
  });
}

/**
 * The PAN behind a final buyer, stored the same way and with the same
 * write-once rule as the Aadhaar. The status column moves off Not Available
 * only together with the cipher: `pan_status_matches_value` in constraints.sql
 * refuses the two apart, so both are written in one update or neither is.
 */
async function recordBuyerPan(tx: Tx, buyer: FinalBuyerInput) {
  const raw = buyer.pan?.trim();
  if (!raw) return;

  const person = await tx.person.findUniqueOrThrow({
    where: { id: buyer.personId },
    select: { panStatus: true },
  });
  if (person.panStatus !== "NOT_AVAILABLE") return;

  if (!isValidPanFormat(raw)) blocked("A PAN is five letters, four digits and a letter.");
  const normalised = normalisePan(raw);
  const index = blindIndex(normalised);

  const clash = await tx.person.findFirst({
    where: { panBlindIndex: index, id: { not: buyer.personId } },
    select: { id: true },
  });
  if (clash) blocked("This PAN is already recorded against another person.");

  await tx.person.update({
    where: { id: buyer.personId },
    data: {
      panCipher: encryptSensitive(normalised),
      panMasked: maskPan(normalised),
      panBlindIndex: index,
      panStatus: "AVAILABLE",
    },
  });
}

export async function recordFinalBuyers(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  buyers: FinalBuyerInput[];
}) {
  if (args.buyers.length === 0) blocked("At least one final buyer is required.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "FINAL_BUYERS_RECORD",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, buyers: args.buyers },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: args.bookingId } });
      if (booking.status === "DELIVERED") {
        blocked("Final buyer details cannot be changed after Delivered. Reopen the Booking first.");
      }
      if (!["BOOKED", "PAYMENT_COMPLETED"].includes(booking.status)) {
        blocked("Final buyer details are recorded on an approved Booking.");
      }

      for (const buyer of args.buyers) {
        await tx.person.update({
          where: { id: buyer.personId },
          data: { dateOfBirth: buyer.dateOfBirth, addressLine: buyer.address },
        });
        await recordBuyerAadhaar(tx, buyer);
        await recordBuyerPan(tx, buyer);
      }

      // Effective-dated, never overwritten — the previous set stays in History.
      await tx.bookingParty.updateMany({
        where: { bookingId: args.bookingId, kind: "FINAL_REGISTRATION", effectiveTo: null },
        data: { effectiveTo: new Date(), changeReason: "Final buyer details revised." },
      });
      await tx.bookingParty.createMany({
        data: args.buyers.map((buyer, index) => ({
          bookingId: args.bookingId,
          personId: buyer.personId,
          role: index === 0 ? ("PRIMARY" as const) : ("ADDITIONAL" as const),
          kind: "FINAL_REGISTRATION" as const,
          sharePercent: buyer.sharePercent ?? null,
          actorRef: args.actorRef,
        })),
      });

      const buyers = await loadFinalBuyers(tx, args.bookingId);
      const complete = validateFinalBuyers(buyers);
      if (complete.ok) {
        await closeTasksFor(
          tx,
          "Booking",
          args.bookingId,
          args.actorRef,
          "Final buyer details complete.",
          FINAL_BUYER_PURPOSE
        );
      }

      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: "FINAL_BUYERS_RECORDED",
          fromStatus: booking.status,
          toStatus: booking.status,
          detail: { buyers: args.buyers.map((b) => b.personId), complete: complete.ok },
        },
      });

      return {
        result: { bookingId: args.bookingId, complete: complete.ok },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: "FINAL_BUYERS_RECORDED",
          after: { buyerCount: args.buyers.length, complete: complete.ok },
        },
      };
    }
  );
}

async function loadFinalBuyers(tx: Tx, bookingId: string): Promise<FinalBuyer[]> {
  const parties = await tx.bookingParty.findMany({
    where: { bookingId, kind: "FINAL_REGISTRATION", effectiveTo: null },
    include: { person: true },
    orderBy: { role: "asc" },
  });
  return parties.map((party) => ({
    personId: party.personId,
    sharePercent: party.sharePercent ? party.sharePercent.toString() : null,
    aadhaarRecorded: party.person.aadhaarStatus !== "PENDING",
    dateOfBirth: party.person.dateOfBirth,
    address: party.person.addressLine,
  }));
}

/* ----------------------------------------------------- completion route */

/**
 * PRD §4 — one route, recorded once, and the Booking and Plot become Delivered
 * with Papers Legally Transferred set automatically. The database refuses a
 * second live completion for the same Booking.
 */
export async function recordCompletion(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  completion: CompletionInput;
}) {
  const shape = validateCompletion(args.completion);
  if (!shape.ok) blocked(shape.reason);

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "COMPLETION_RECORD",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, completion: args.completion },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: args.bookingId },
        include: { plot: true },
      });

      const live = await tx.bookingCompletion.findFirst({
        where: { bookingId: args.bookingId, reopenedAt: null },
      });

      const ready = readyForCompletion({
        status: booking.status,
        activeProcess: booking.activeProcess,
        paymentReceivedPercent: booking.paymentReceivedPercent.toString(),
        finalBuyers: await loadFinalBuyers(tx, args.bookingId),
        alreadyCompleted: !!live,
      });
      if (!ready.ok) blocked(ready.reason);

      const move = canTransition(booking.status, "DELIVERED");
      if (!move.ok) blocked(move.reason);

      const input = args.completion;
      const completion = await tx.bookingCompletion.create({
        data: {
          bookingId: args.bookingId,
          route: input.route,
          allotmentDate: input.route === "ALLOTMENT" ? input.allotmentDate : null,
          allotmentNumber: input.route === "ALLOTMENT" ? input.allotmentNumber?.trim() : null,
          allotmentGivenTo: input.route === "ALLOTMENT" ? input.allotmentGivenTo?.trim() : null,
          pattaStatus: input.route === "ALLOTMENT" ? input.pattaStatus : null,
          pattaDate: input.route === "ALLOTMENT" ? input.pattaDate : null,
          advocateName: input.route === "REGISTRY" ? input.advocateName?.trim() : null,
          registryDate: input.route === "REGISTRY" ? input.registryDate : null,
          completedByRef: args.actorRef,
        },
      });

      await tx.booking.update({
        where: { id: args.bookingId },
        data: { status: "DELIVERED", closedAt: new Date() },
      });
      await tx.plot.update({
        where: { id: booking.plotId },
        data: { status: "DELIVERED" },
      });
      await tx.plotEvent.create({
        data: {
          plotId: booking.plotId,
          actorRef: args.actorRef,
          action: "DELIVERED",
          fromStatus: booking.plot.status,
          toStatus: "DELIVERED",
          reason: `${input.route === "ALLOTMENT" ? "Allotment" : "Registry"} completed.`,
        },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: "DELIVERED",
          fromStatus: booking.status,
          toStatus: "DELIVERED",
          detail: { route: input.route, completionId: completion.id },
        },
      });
      await closeCompletionTasks(
        tx,
        args.bookingId,
        args.actorRef,
        `${input.route === "ALLOTMENT" ? "Allotment" : "Registry"} completed — Delivered.`
      );

      // AC-02 — legal completion is what completes a Royalty's qualifying
      // activity (PRD §6.3). Nothing else changes on the Booking after the final
      // payment, so without this call the Royalty would stay held on
      // Performance Cycle Incomplete for the life of the sale.
      await onLegalCompletionChanged(tx, args.bookingId, args.actorRef, {
        completed: true,
        reason: `${input.route === "ALLOTMENT" ? "Allotment" : "Registry"} completed — Delivered.`,
      });

      return {
        result: { bookingId: args.bookingId, completionId: completion.id, status: "DELIVERED" },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: "DELIVERED",
          before: { status: booking.status },
          after: { status: "DELIVERED", route: input.route, papersLegallyTransferred: true },
        },
      };
    }
  );
}

/**
 * PRD §4.4 — an incorrect Delivered is reopened only by MD/Admin with a
 * compulsory reason. The completion row is kept and marked reopened, so the
 * full history survives and the partial unique index frees the Booking for a
 * corrected completion.
 */
export async function reopenDelivered(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  reason: string;
}) {
  const allowed = canReopenDelivered(args.actorRole, args.reason);
  if (!allowed.ok) blocked(allowed.reason);

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "DELIVERY_REOPEN",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, reason: args.reason },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: args.bookingId } });
      if (booking.status !== "DELIVERED") blocked("This Booking is not Delivered.");

      const live = await tx.bookingCompletion.findFirst({
        where: { bookingId: args.bookingId, reopenedAt: null },
      });
      if (!live) blocked("This Booking has no live completion record to reopen.");

      await tx.bookingCompletion.update({
        where: { id: live.id },
        data: { reopenedAt: new Date(), reopenedByRef: args.actorRef, reopenReason: args.reason },
      });

      // The prior state is Payment Completed by construction: Delivered is only
      // reachable from it, and Payment Received is still 100%.
      await tx.booking.update({
        where: { id: args.bookingId },
        data: { status: "PAYMENT_COMPLETED", closedAt: null },
      });
      await tx.plot.update({
        where: { id: booking.plotId },
        data: { status: "PAYMENT_COMPLETED" },
      });
      await tx.plotEvent.create({
        data: {
          plotId: booking.plotId,
          actorRef: args.actorRef,
          action: "DELIVERY_REOPENED",
          fromStatus: "DELIVERED",
          toStatus: "PAYMENT_COMPLETED",
          reason: args.reason,
        },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: "DELIVERY_REOPENED",
          fromStatus: "DELIVERED",
          toStatus: "PAYMENT_COMPLETED",
          reason: args.reason,
        },
      });
      // The completion work returns to the queue exactly as it stood before.
      await ensureCompletionTasks(tx, args.bookingId);

      // AC-02 — a delivery recorded in error and reopened takes the qualifying
      // activity's completion back with it. This is the one path that may
      // un-complete a cycle: a Buyback deliberately does not (PRD §6.3, §6.5,
      // main-PRD §14.12), because there the sale really did legally complete.
      await onLegalCompletionChanged(tx, args.bookingId, args.actorRef, {
        completed: false,
        reason: `Delivery reopened — ${args.reason}`,
      });

      return {
        result: { bookingId: args.bookingId, status: "PAYMENT_COMPLETED" },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: "DELIVERY_REOPENED",
          before: { status: "DELIVERED" },
          after: { status: "PAYMENT_COMPLETED" },
          reason: args.reason,
        },
      };
    }
  );
}
