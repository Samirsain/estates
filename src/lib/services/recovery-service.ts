// Recovery — SSOT §22, §91; Change Pack §54, §64 (T21, T22).
//
// A paid monetary benefit that became invalid raises T21 "Accounts Adjustment
// Required" (commission-service). Accounts answers it here: open a Recovery
// with the external Accounts Recovery Reference and the notice date — due 15
// calendar days later, followed up by T22 — or record why none is needed.
// While a Recovery is outstanding the Person's new cash payouts are held; it is
// cleared when repaid, or set off against a later benefit of the same Person.
// The amounts themselves stay outside the CRM.

import { notFutureDated } from "@/lib/domain/booking";
import { formatIst } from "@/lib/tasks";
import { blocked, lockKey, nextReference, runCommand, type Tx } from "./command";
import {
  ADJUSTMENT_PURPOSE,
  BEFORE_RECOVERY_PURPOSE,
  COMMISSION_PAYMENT_PURPOSE,
  createCommissionReference,
  reassessBenefitsOf,
  reassessCommission,
  RECOVERY_FOLLOW_UP_PURPOSE,
} from "./commission-service";
import { closeTasksFor, ensureTask } from "./task-service";

const RECOVERY_DAYS = 15;

type Actor = { idempotencyKey: string; actorRef: string; actorRole: string };

/** CP §77 — Accounts creates and handles Recovery. */
function accountsOnly(role: string) {
  if (role !== "ACCOUNTS") blocked("Only Accounts handles Recovery.");
}

/** Serialises every change to one Person's Recoveries. */
const lockPerson = (tx: Tx, personId: string) => lockKey(tx, `recovery:${personId}`);

/**
 * SSOT §91 — Accounts opens a Recovery Outstanding against a paid benefit that
 * became invalid, naming the external reference and the notice date. It answers
 * the T21 task and raises T22, due 15 calendar days after notice.
 */
export async function openRecovery(
  args: Actor & { recordId: string; noticeOn: Date; reference: string; reason: string }
) {
  accountsOnly(args.actorRole);
  if (!args.reference.trim()) blocked("Enter the Accounts Recovery Reference.");
  if (!args.reason.trim()) blocked("A compulsory reason is required for a Recovery.");
  const dated = notFutureDated("Notice date", args.noticeOn);
  if (!dated.ok) blocked(dated.reason);

  return runCommand<{ recoveryId: string; recoveryNo: string; dueOn: Date }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "RECOVERY_OPEN",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { recordId: args.recordId, reference: args.reference.trim() },
    },
    async (tx) => {
      const record = await tx.commissionRecord.findUniqueOrThrow({ where: { id: args.recordId } });
      await lockPerson(tx, record.beneficiaryPersonId);
      if (!["PAID", "PAID_EARLY", "ACCOUNTS_ADJUSTMENT_REQUIRED"].includes(record.payment)) {
        blocked("Only a benefit that was actually paid can be recovered.");
      }
      const open = await tx.recovery.findFirst({
        where: { commissionRecordId: record.id, status: "OUTSTANDING" },
      });
      if (open) blocked(`Recovery ${open.recoveryNo} is already outstanding on this benefit.`);

      const dueOn = new Date(args.noticeOn.getTime() + RECOVERY_DAYS * 86_400_000);
      const recoveryNo = await nextReference(tx, "REC", "Recovery");
      const recovery = await tx.recovery.create({
        data: {
          recoveryNo,
          personId: record.beneficiaryPersonId,
          commissionRecordId: record.id,
          noticeOn: args.noticeOn,
          dueOn,
          reference: args.reference.trim(),
          reason: args.reason.trim(),
          openedByRef: args.actorRef,
        },
      });
      await tx.commissionEvent.create({
        data: {
          recordId: record.id,
          actorRef: args.actorRef,
          action: "RECOVERY_OPENED",
          toState: recoveryNo,
          reason: args.reason.trim(),
        },
      });
      await closeTasksFor(tx, "Commission", record.id, args.actorRef, `Recovery ${recoveryNo} opened.`, ADJUSTMENT_PURPOSE);
      await ensureTask(tx, {
        recordKind: "Commission",
        recordId: record.id,
        recordName: recoveryNo,
        purpose: RECOVERY_FOLLOW_UP_PURPOSE,
        title: "Recovery Outstanding Follow-up",
        assigneeRole: "ACCOUNTS",
        dueAt: dueOn,
        latestResult:
          `${recoveryNo} · ${recovery.reference} · due ${formatIst(dueOn)}. New cash payouts to this Person ` +
          `are held until it is repaid or set off. Unresolved after the deadline, Membership may be ` +
          `deactivated (SSOT §91).`,
      });
      await reassessBenefitsOf(tx, record.beneficiaryPersonId, args.actorRef);

      return {
        result: { recoveryId: recovery.id, recoveryNo, dueOn },
        audit: {
          entity: "Recovery",
          entityId: recovery.id,
          action: "RECOVERY_OPENED",
          after: {
            recoveryNo,
            personId: record.beneficiaryPersonId,
            commissionRecordId: record.id,
            reference: recovery.reference,
            noticeOn: args.noticeOn.toISOString(),
            dueOn: dueOn.toISOString(),
          },
          reason: args.reason.trim(),
        },
      };
    }
  );
}

/**
 * CP §64 T21 — Accounts answers the adjustment without a Recovery: the
 * milestone was restored (SSOT §99), a cheaper Change Plot did not overpay, or
 * the adjustment was settled another way. The reason is kept.
 */
export async function closeAdjustmentWithoutRecovery(args: Actor & { recordId: string; reason: string }) {
  accountsOnly(args.actorRole);
  if (!args.reason.trim()) blocked("A compulsory reason is required.");

  return runCommand<{ recordId: string }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "ADJUSTMENT_CLOSE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { recordId: args.recordId },
    },
    async (tx) => {
      const reason = args.reason.trim();
      const closed = await closeTasksFor(
        tx,
        "Commission",
        args.recordId,
        args.actorRef,
        `No recovery — ${reason}`,
        ADJUSTMENT_PURPOSE
      );
      if (closed === 0) blocked("No Accounts adjustment is waiting on this commission.");
      await tx.commissionEvent.create({
        data: { recordId: args.recordId, actorRef: args.actorRef, action: "ADJUSTMENT_CLOSED", reason },
      });
      await reassessSourceBooking(tx, args.recordId, args.actorRef);
      return {
        result: { recordId: args.recordId },
        audit: { entity: "CommissionRecord", entityId: args.recordId, action: "ADJUSTMENT_CLOSED", reason },
      };
    }
  );
}

async function clear(
  tx: Tx,
  recoveryId: string,
  actorRef: string,
  how: "REPAID" | "SET_OFF",
  note: string,
  setOffRecordId: string | null
) {
  const recovery = await tx.recovery.update({
    where: { id: recoveryId },
    data: {
      status: "CLEARED",
      clearedHow: how,
      clearedByRef: actorRef,
      clearedAt: new Date(),
      clearNote: note,
      setOffRecordId,
    },
  });
  await tx.commissionEvent.create({
    data: {
      recordId: recovery.commissionRecordId,
      actorRef,
      action: "RECOVERY_CLEARED",
      toState: how,
      reason: note,
    },
  });
  await closeTasksFor(
    tx,
    "Commission",
    recovery.commissionRecordId,
    actorRef,
    `${recovery.recoveryNo} cleared — ${how === "REPAID" ? "repaid" : "set off"}.`,
    RECOVERY_FOLLOW_UP_PURPOSE
  );
  // CP §76.4 — what the Recovery held is released if nothing else holds it.
  await reassessBenefitsOf(tx, recovery.personId, actorRef);
  await reassessSourceBooking(tx, recovery.commissionRecordId, actorRef);
  return recovery;
}

/**
 * CP §64 T23 — a corrected beneficiary on the same Booking may have been
 * waiting for this adjustment; reassessing the Booking releases them.
 */
async function reassessSourceBooking(tx: Tx, recordId: string, actorRef: string) {
  const source = await tx.commissionRecord.findUniqueOrThrow({ where: { id: recordId }, select: { bookingId: true } });
  if (source.bookingId) await reassessCommission(tx, source.bookingId, actorRef);
}

/**
 * CP §64 T23, §77 — MD lets the corrected beneficiary be paid before the old
 * beneficiary's Recovery on the same Booking is resolved.
 */
export async function approveBeforeOldRecovery(args: Actor & { recordId: string; note: string }) {
  if (args.actorRole !== "MD") blocked("Only MD may approve paying a corrected beneficiary before the old Recovery.");
  if (!args.note.trim()) blocked("A compulsory note is required.");

  return runCommand<{ recordId: string }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "BEFORE_OLD_RECOVERY_APPROVE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { recordId: args.recordId },
    },
    async (tx) => {
      const record = await tx.commissionRecord.findUniqueOrThrow({ where: { id: args.recordId } });
      if (record.holdReason !== "OLD_RECOVERY_PENDING") {
        blocked("This commission is not waiting for an old beneficiary's Recovery.");
      }
      const note = args.note.trim();
      await tx.commissionRecord.update({
        where: { id: record.id },
        data: { beforeRecoveryApprovedByRef: args.actorRef, beforeRecoveryApprovedAt: new Date(), beforeRecoveryNote: note },
      });
      await tx.commissionEvent.create({
        data: { recordId: record.id, actorRef: args.actorRef, action: "BEFORE_OLD_RECOVERY_APPROVED", reason: note },
      });
      await closeTasksFor(tx, "Commission", record.id, args.actorRef, `Approved — ${note}`, BEFORE_RECOVERY_PURPOSE);
      if (record.bookingId) await reassessCommission(tx, record.bookingId, args.actorRef);
      return {
        result: { recordId: record.id },
        audit: {
          entity: "CommissionRecord",
          entityId: record.id,
          action: "BEFORE_OLD_RECOVERY_APPROVED",
          after: { beneficiaryPersonId: record.beneficiaryPersonId, bookingId: record.bookingId },
          reason: note,
        },
      };
    }
  );
}

async function lockedOutstanding(tx: Tx, recoveryId: string) {
  const found = await tx.recovery.findUnique({ where: { id: recoveryId }, select: { personId: true } });
  if (!found) blocked("That Recovery no longer exists.");
  await lockPerson(tx, found.personId);
  const recovery = await tx.recovery.findUniqueOrThrow({ where: { id: recoveryId } });
  if (recovery.status !== "OUTSTANDING") blocked(`Recovery ${recovery.recoveryNo} is already cleared.`);
  return recovery;
}

/** SSOT §91 — the Person repaid it outside the CRM; Accounts records that. */
export async function clearRecovery(args: Actor & { recoveryId: string; note: string }) {
  accountsOnly(args.actorRole);
  if (!args.note.trim()) blocked("A compulsory note is required to clear a Recovery.");

  return runCommand<{ recoveryId: string }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "RECOVERY_CLEAR",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { recoveryId: args.recoveryId },
    },
    async (tx) => {
      const recovery = await lockedOutstanding(tx, args.recoveryId);
      await clear(tx, recovery.id, args.actorRef, "REPAID", args.note.trim(), null);
      return {
        result: { recoveryId: recovery.id },
        audit: {
          entity: "Recovery",
          entityId: recovery.id,
          action: "RECOVERY_CLEARED",
          after: { recoveryNo: recovery.recoveryNo, clearedHow: "REPAID" },
          reason: args.note.trim(),
        },
      };
    }
  );
}

/**
 * SSOT §22, §91; CP §54 — a later monetary benefit of the same Person, once it
 * has reached its milestone, is settled against the Recovery instead of paid in
 * cash. It is marked Paid with the set-off reference. The CRM holds no amounts,
 * so Accounts says whether this clears the Recovery or leaves part of it open.
 */
export async function setOffRecovery(
  args: Actor & {
    recoveryId: string;
    recordId: string;
    reference: string;
    setOffOn: Date;
    note: string;
    clearsRecovery: boolean;
  }
) {
  accountsOnly(args.actorRole);
  if (!args.reference.trim()) blocked("Enter the set-off reference.");
  if (!args.note.trim()) blocked("A compulsory note is required for a set-off.");
  const dated = notFutureDated("Set-off date", args.setOffOn);
  if (!dated.ok) blocked(dated.reason);

  return runCommand<{ recoveryId: string; recordId: string; cleared: boolean }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "RECOVERY_SET_OFF",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { recoveryId: args.recoveryId, recordId: args.recordId, reference: args.reference.trim() },
    },
    async (tx) => {
      const recovery = await lockedOutstanding(tx, args.recoveryId);
      const record = await tx.commissionRecord.findUniqueOrThrow({
        where: { id: args.recordId },
        include: { beneficiaryPerson: { select: { id: true, survivingPersonId: true } } },
      });
      const samePerson =
        record.beneficiaryPersonId === recovery.personId ||
        (await tx.person.count({ where: { id: recovery.personId, survivingPersonId: record.beneficiaryPersonId } })) > 0;
      if (!samePerson) blocked("A Recovery can only be set off against a benefit of the same Person.");
      if (record.id === recovery.commissionRecordId) blocked("A benefit cannot be set off against its own Recovery.");
      if (!record.isCurrent || record.payment !== "NOT_PAID") {
        blocked("Only a current, unpaid benefit can be set off.");
      }
      const reached =
        record.eligibility === "READY" ||
        (record.eligibility === "ON_HOLD" && record.holdReason === "RECOVERY_OUTSTANDING");
      if (!reached) blocked("This benefit has not reached its milestone, so there is nothing to set off yet.");

      const note = args.note.trim();
      const reference = await createCommissionReference(tx, args.reference, args.setOffOn, args.actorRef);
      await tx.commissionRecord.update({
        where: { id: record.id },
        data: {
          payment: "PAID",
          paidOn: args.setOffOn,
          paidByRef: args.actorRef,
          paymentRemarks: `Set off against Recovery ${recovery.recoveryNo} — ${note}`,
          externalReferenceId: reference.id,
          externalProcessingCompleted: true,
        },
      });
      await tx.commissionEvent.create({
        data: {
          recordId: record.id,
          actorRef: args.actorRef,
          action: "SET_OFF",
          fromState: record.payment,
          toState: "PAID",
          reason: `Against ${recovery.recoveryNo} — ${note}`,
        },
      });
      await closeTasksFor(tx, "Commission", record.id, args.actorRef, `Set off against ${recovery.recoveryNo}`, COMMISSION_PAYMENT_PURPOSE);

      if (args.clearsRecovery) {
        await clear(tx, recovery.id, args.actorRef, "SET_OFF", note, record.id);
      } else {
        await tx.recovery.update({ where: { id: recovery.id }, data: { setOffRecordId: record.id } });
        await tx.commissionEvent.create({
          data: {
            recordId: recovery.commissionRecordId,
            actorRef: args.actorRef,
            action: "RECOVERY_PART_SET_OFF",
            reason: `Part set off against a later benefit; ${recovery.recoveryNo} stays outstanding — ${note}`,
          },
        });
      }

      return {
        result: { recoveryId: recovery.id, recordId: record.id, cleared: args.clearsRecovery },
        audit: {
          entity: "Recovery",
          entityId: recovery.id,
          action: "RECOVERY_SET_OFF",
          after: {
            recoveryNo: recovery.recoveryNo,
            setOffRecordId: record.id,
            reference: reference.rawValue,
            clearsRecovery: args.clearsRecovery,
          },
          reason: note,
        },
      };
    }
  );
}
