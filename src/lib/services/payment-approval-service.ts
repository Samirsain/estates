// Owner, 10 Nov 2026 — every payment step needs MD's approval.
//
// When Accounts records a payment step it is not run. It is kept as the
// service's own arguments, MD gets one approval task on the Booking or Buyback,
// and nothing the step would change moves until MD approves. On approval the
// step runs exactly as it would have, as the person who entered it, so every
// existing rule (milestones, commission, tasks, references) applies unchanged.
// MD's own step runs at once: the approval is MD's.
//
// One step per kind and target waits at a time (one_pending_payment_approval in
// constraints.sql), so a second Payment Received on the same Booking waits for
// the first to be decided.

import { db } from "@/lib/db";
import { formatIstDate } from "@/lib/tasks";
import { blocked, lockKey, runCommand, type Tx } from "./command";
import { closeTasksFor, ensureTask } from "./task-service";
import { confirmPaymentReceived, correctPaymentReceived } from "./payment-service";
import { markCommissionPaid } from "./commission-service";
import { confirmPaymentGiven, correctPaymentGiven } from "./acquisition-service";
import { clearRecovery, setOffRecovery } from "./recovery-service";
import { decideCancellation } from "./cancellation-service";

export const PAYMENT_APPROVAL_PURPOSE = "PAYMENT_MD_APPROVAL";

type Ctx = { idempotencyKey: string; actorRef: string; actorRole: string };
type Args<F extends (a: never) => unknown> = Omit<Parameters<F>[0], keyof Ctx>;

/** A payment step, as its service takes it (less key and actor). */
export type PaymentStep =
  | { kind: "PAYMENT_RECEIVED"; args: Args<typeof confirmPaymentReceived> }
  | { kind: "PAYMENT_CORRECT"; args: Args<typeof correctPaymentReceived> }
  | { kind: "COMMISSION_PAID"; args: Args<typeof markCommissionPaid> }
  | { kind: "PAYMENT_GIVEN"; args: Args<typeof confirmPaymentGiven> }
  | { kind: "PAYMENT_GIVEN_CORRECT"; args: Args<typeof correctPaymentGiven> }
  | { kind: "RECOVERY_REPAID"; args: Args<typeof clearRecovery> }
  | { kind: "RECOVERY_SET_OFF"; args: Args<typeof setOffRecovery> }
  | { kind: "REFUND"; args: Args<typeof decideCancellation> };

/** The date fields each kind carries; JSON keeps them as text. */
const DATES: Record<PaymentStep["kind"], string[]> = {
  PAYMENT_RECEIVED: ["paidOn"],
  PAYMENT_CORRECT: ["paidOn"],
  COMMISSION_PAID: ["paidOn"],
  PAYMENT_GIVEN: ["paidOn"],
  PAYMENT_GIVEN_CORRECT: ["paidOn"],
  RECOVERY_REPAID: [],
  RECOVERY_SET_OFF: ["setOffOn"],
  REFUND: ["actionDate"],
};

function revive(kind: PaymentStep["kind"], payload: unknown): PaymentStep {
  const args = { ...(payload as Record<string, unknown>) };
  for (const field of DATES[kind]) {
    if (typeof args[field] === "string") args[field] = new Date(args[field] as string);
  }
  return { kind, args } as PaymentStep;
}

/** Runs the step through its own service. */
function runStep(step: PaymentStep, ctx: Ctx) {
  switch (step.kind) {
    case "PAYMENT_RECEIVED": return confirmPaymentReceived({ ...step.args, ...ctx });
    case "PAYMENT_CORRECT": return correctPaymentReceived({ ...step.args, ...ctx });
    case "COMMISSION_PAID": return markCommissionPaid({ ...step.args, ...ctx });
    case "PAYMENT_GIVEN": return confirmPaymentGiven({ ...step.args, ...ctx });
    case "PAYMENT_GIVEN_CORRECT": return correctPaymentGiven({ ...step.args, ...ctx });
    case "RECOVERY_REPAID": return clearRecovery({ ...step.args, ...ctx });
    case "RECOVERY_SET_OFF": return setOffRecovery({ ...step.args, ...ctx });
    case "REFUND": return decideCancellation({ ...step.args, ...ctx });
  }
}

type Place = { targetKey: string; bookingId: string | null; acquisitionId: string | null; label: string };

const on = (d: Date | null | undefined) => (d ? formatIstDate(d) : "");
const ref = (r: string | null | undefined) => (r?.trim() ? ` · ${r.trim()}` : "");

/** What the step acts on, where it is shown, and what MD reads. */
async function place(tx: Tx, step: PaymentStep): Promise<Place> {
  const commission = async (recordId: string) =>
    tx.commissionRecord.findUniqueOrThrow({
      where: { id: recordId },
      select: { type: true, percent: true, bookingId: true, acquisitionId: true, beneficiaryPerson: { select: { fullName: true } } },
    });
  switch (step.kind) {
    case "PAYMENT_RECEIVED": {
      const a = step.args;
      return { targetKey: a.bookingId, bookingId: a.bookingId, acquisitionId: null, label: `Payment Received ${a.percent}%${ref(a.reference)} · paid ${on(a.paidOn)}` };
    }
    case "PAYMENT_CORRECT": {
      const a = step.args;
      const entry = await tx.paymentReceivedEntry.findUniqueOrThrow({ where: { id: a.entryId }, select: { bookingId: true } });
      return { targetKey: a.entryId, bookingId: entry.bookingId, acquisitionId: null, label: `Correct Payment Received to ${a.percent}%${ref(a.reference)} · paid ${on(a.paidOn)} · ${a.reason}` };
    }
    case "COMMISSION_PAID": {
      const a = step.args;
      const r = await commission(a.recordId);
      return {
        targetKey: a.recordId,
        bookingId: r.bookingId,
        acquisitionId: r.acquisitionId,
        label: `${a.early ? "Paid Early" : "Mark Paid"} — ${r.type} ${r.percent.toFixed(2)}% to ${r.beneficiaryPerson.fullName}${ref(a.reference)} · paid ${on(a.paidOn)}`,
      };
    }
    case "PAYMENT_GIVEN": {
      const a = step.args;
      return { targetKey: a.acquisitionId, bookingId: null, acquisitionId: a.acquisitionId, label: `Payment Given ${a.percent}%${ref(a.reference)} · paid ${on(a.paidOn)}` };
    }
    case "PAYMENT_GIVEN_CORRECT": {
      const a = step.args;
      const entry = await tx.paymentGivenEntry.findUniqueOrThrow({ where: { id: a.entryId }, select: { acquisitionId: true } });
      return { targetKey: a.entryId, bookingId: null, acquisitionId: entry.acquisitionId, label: `Correct Payment Given to ${a.percent}%${ref(a.reference)} · paid ${on(a.paidOn)} · ${a.reason}` };
    }
    case "RECOVERY_REPAID": {
      const a = step.args;
      const rec = await tx.recovery.findUniqueOrThrow({
        where: { id: a.recoveryId },
        select: { recoveryNo: true, person: { select: { fullName: true } }, commissionRecord: { select: { bookingId: true, acquisitionId: true } } },
      });
      return {
        targetKey: a.recoveryId,
        bookingId: rec.commissionRecord.bookingId,
        acquisitionId: rec.commissionRecord.acquisitionId,
        label: `Recovery repaid — ${rec.recoveryNo} from ${rec.person.fullName} · ${a.note}`,
      };
    }
    case "RECOVERY_SET_OFF": {
      const a = step.args;
      const [r, rec] = await Promise.all([
        commission(a.recordId),
        tx.recovery.findUniqueOrThrow({ where: { id: a.recoveryId }, select: { recoveryNo: true } }),
      ]);
      return {
        targetKey: a.recordId,
        bookingId: r.bookingId,
        acquisitionId: r.acquisitionId,
        label: `Set Off — ${r.type} ${r.percent.toFixed(2)}% to ${r.beneficiaryPerson.fullName} against ${rec.recoveryNo}${ref(a.reference)} · ${on(a.setOffOn)}`,
      };
    }
    case "REFUND": {
      const a = step.args;
      return { targetKey: a.bookingId, bookingId: a.bookingId, acquisitionId: null, label: `Cancellation approved with refund${ref(a.reference)} · ${on(a.actionDate)} · ${a.note}` };
    }
  }
}

/** The record the MD task sits on, and its display name. */
async function taskRecord(tx: Tx, p: Place) {
  if (p.bookingId) {
    const b = await tx.booking.findUniqueOrThrow({
      where: { id: p.bookingId },
      select: { bookingNumber: true, requestNo: true, project: { select: { name: true } }, plot: { select: { plotNumber: true } } },
    });
    return { recordKind: "Booking", recordId: p.bookingId, recordName: `${b.bookingNumber ?? b.requestNo} · ${b.project.name} ${b.plot.plotNumber}` };
  }
  const a = await tx.acquisition.findUniqueOrThrow({ where: { id: p.acquisitionId! }, select: { acquisitionNo: true } });
  return { recordKind: "Acquisition", recordId: p.acquisitionId!, recordName: a.acquisitionNo };
}

/**
 * Accounts' payment step, kept for MD. Returns the message for the screen. MD
 * never calls this: the caller runs MD's step at once.
 */
export async function requestPaymentApproval(args: Ctx & { step: PaymentStep }): Promise<string> {
  if (args.actorRole === "MD") blocked("MD's own payment step runs at once.");
  return runCommand<string>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PAYMENT_APPROVAL_REQUEST",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: args.step,
    },
    async (tx) => {
      const p = await place(tx, args.step);
      await lockKey(tx, `payment-approval:${args.step.kind}:${p.targetKey}`);
      const waiting = await tx.paymentApproval.findFirst({
        where: { kind: args.step.kind, targetKey: p.targetKey, status: "PENDING" },
        select: { label: true },
      });
      if (waiting) blocked(`This is already waiting for MD approval: ${waiting.label}`);

      const approval = await tx.paymentApproval.create({
        data: {
          kind: args.step.kind,
          targetKey: p.targetKey,
          payload: args.step.args as object,
          label: p.label,
          bookingId: p.bookingId,
          acquisitionId: p.acquisitionId,
          requestedByRef: args.actorRef,
          requestedByRole: args.actorRole,
        },
      });
      const record = await taskRecord(tx, p);
      await ensureTask(tx, {
        ...record,
        purpose: PAYMENT_APPROVAL_PURPOSE,
        title: "Payment — MD Approval",
        assigneeRole: "MD",
        dueAt: new Date(),
        decision: true,
        latestResult: p.label,
      });
      return {
        result: "Sent to MD for approval. Nothing changes until MD approves it.",
        audit: { entity: "PaymentApproval", entityId: approval.id, action: "PAYMENT_APPROVAL_REQUESTED", after: { kind: args.step.kind, label: p.label } },
      };
    }
  );
}

/**
 * MD approves (the step runs, as the person who entered it) or rejects (with a
 * compulsory reason; nothing runs). A step its service now refuses — the
 * Booking moved on meanwhile — stays waiting with the refusal shown to MD.
 */
export async function decidePaymentApproval(args: Ctx & { approvalId: string; approve: boolean; note: string }): Promise<string> {
  if (args.actorRole !== "MD") blocked("Only MD approves a payment step.");
  if (!args.approve && !args.note.trim()) blocked("A compulsory reason is required to reject.");

  const approval = await db.paymentApproval.findUniqueOrThrow({ where: { id: args.approvalId } });
  if (approval.status !== "PENDING") blocked(`This was already ${approval.status === "APPROVED" ? "approved" : "rejected"}.`);

  if (args.approve) {
    // A fixed key: approving twice, or again after the record below failed to
    // save, replays the step's first result instead of paying twice.
    await runStep(revive(approval.kind as PaymentStep["kind"], approval.payload), {
      idempotencyKey: `PAYAPPR-${approval.id}`,
      actorRef: approval.requestedByRef,
      actorRole: approval.requestedByRole,
    });
  }

  return runCommand<string>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PAYMENT_APPROVAL_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { approvalId: approval.id, approve: args.approve },
    },
    async (tx) => {
      const decided = await tx.paymentApproval.update({
        where: { id: approval.id },
        data: {
          status: args.approve ? "APPROVED" : "REJECTED",
          decidedByRef: args.actorRef,
          decidedAt: new Date(),
          decisionNote: args.note.trim() || null,
        },
      });
      // The task goes once nothing else on the record waits for MD.
      const p = { targetKey: decided.targetKey, bookingId: decided.bookingId, acquisitionId: decided.acquisitionId, label: decided.label };
      const record = await taskRecord(tx, p);
      const left = await tx.paymentApproval.count({
        where: { status: "PENDING", ...(p.bookingId ? { bookingId: p.bookingId } : { acquisitionId: p.acquisitionId }) },
      });
      if (left === 0) {
        await closeTasksFor(tx, record.recordKind, record.recordId, args.actorRef, "Every payment step here is decided.", PAYMENT_APPROVAL_PURPOSE);
      }
      return {
        result: args.approve ? `Approved: ${decided.label}` : `Rejected: ${decided.label}`,
        audit: {
          entity: "PaymentApproval",
          entityId: decided.id,
          action: args.approve ? "PAYMENT_APPROVAL_APPROVED" : "PAYMENT_APPROVAL_REJECTED",
          reason: args.note.trim() || undefined,
          after: { kind: decided.kind, label: decided.label },
        },
      };
    }
  );
}

/** The steps waiting for MD on a Booking or a Buyback, oldest first. */
export function pendingPaymentApprovals(where: { bookingId: string } | { acquisitionId: string }) {
  return db.paymentApproval.findMany({
    where: { ...where, status: "PENDING" },
    orderBy: { requestedAt: "asc" },
    select: { id: true, kind: true, label: true, requestedByRef: true, requestedAt: true },
  });
}
