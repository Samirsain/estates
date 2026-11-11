"use server";

// Acquisition and Payment Given server actions — prd-corrections.md §11; prd-complete §17.
// Every action re-checks permission on the server (DESIGN §1).

import { actionErrorText } from "@/lib/action-error";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError } from "@/lib/services/command";
import {
  cancelAcquisitionDeal,
  confirmPaymentGiven,
  correctPaymentGiven,
  createAcquisition,
  decideAcquisition,
  recordBuybackDocumentsReturned,
  recordBuyingCommission,
} from "@/lib/services/acquisition-service";
import { markCommissionPaid } from "@/lib/services/commission-service";
import { requestPaymentApproval, type PaymentStep } from "@/lib/services/payment-approval-service";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  return { ok: false, error: actionErrorText(error, "Action failed.") };
}

function refresh() {
  revalidatePath("/acquisitions");
  revalidatePath("/plots");
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
}

/**
 * Owner, 10 Nov 2026 — a payment step by anyone but MD waits for MD's approval
 * instead of running. Null for MD: the caller runs the step at once. Not
 * exported: a "use server" export is callable from the browser.
 */
async function holdForMd(
  actor: { staffAccountId: string; role: string },
  key: string,
  step: PaymentStep
): Promise<ActionResult | null> {
  if (actor.role === "MD") return null;
  const message = await requestPaymentApproval({ idempotencyKey: key, actorRef: actor.staffAccountId, actorRole: actor.role, step });
  refresh();
  return { ok: true, message };
}

/** R1 — Accounts records a Buying Commission as Paid (or Paid Early, once MD approved it) on its deal. */
export async function markBuyingCommissionPaidAction(
  input: { recordId: string; early: boolean; paidOn: string; reference: string; remarks: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("COMMISSION_PROCESS");
  try {
    const args = {
      recordId: input.recordId,
      early: input.early,
      paidOn: new Date(input.paidOn),
      reference: input.reference,
      remarks: input.remarks,
    };
    const held = await holdForMd(actor, key, { kind: "COMMISSION_PAID", args });
    if (held) return held;
    const result = await markCommissionPaid({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...args,
    });
    refresh();
    return { ok: true, message: result.payment === "PAID_EARLY" ? "Buying Commission recorded as Paid Early." : "Buying Commission recorded as Paid." };
  } catch (error) {
    return toResult(error);
  }
}

export type ScheduleRowInput = { seq: number; percent: string; dueDate: string };

export type AcquisitionInput = {
  type: "BUYBACK" | "PURCHASE_FOR_RESALE";
  sourceBookingId?: string;
  sellerPersonId: string;
  arrangedByType: "THREE_PERCENT_CLUB" | "MEMBER" | "CUSTOMER";
  arrangedByPersonId?: string;
  purchaseDate: string;
  remark: string;
  schedule: ScheduleRowInput[];
  propertyName?: string;
  location?: string;
  propertyNumber?: string;
  areaSqFt?: string;
  plcPercent?: string;
  resaleGroupId?: string;
  acknowledgeDuplicate?: boolean;
};

export async function createAcquisitionAction(
  input: AcquisitionInput,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("ACQUISITION_CREATE");
  try {
    await createAcquisition({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      type: input.type,
      sourceBookingId: input.sourceBookingId || null,
      sellerPersonId: input.sellerPersonId,
      arrangedByType: input.arrangedByType,
      arrangedByPersonId: input.arrangedByPersonId || null,
      purchaseDate: new Date(input.purchaseDate),
      remark: input.remark,
      schedule: input.schedule.map((row) => ({
        seq: row.seq,
        percent: row.percent.trim(),
        dueDate: new Date(row.dueDate),
      })),
      property:
        input.type === "PURCHASE_FOR_RESALE"
          ? {
              propertyName: input.propertyName ?? "",
              location: input.location ?? "",
              propertyNumber: input.propertyNumber ?? "",
              areaSqFt: input.areaSqFt || null,
              plcPercent: input.plcPercent || null,
              resaleGroupId: input.resaleGroupId || null,
            }
          : null,
      acknowledgeDuplicate: input.acknowledgeDuplicate,
    });
    refresh();
    return {
      ok: true,
      message:
        "Created. Accounts approves it once at least 20% Payment Given is confirmed.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function confirmPaymentGivenAction(
  input: { acquisitionId: string; percent: string; paidOn: string; reference: string; remark: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PAYMENT_GIVEN_CONFIRM");
  try {
    const args = {
      acquisitionId: input.acquisitionId,
      percent: input.percent,
      paidOn: new Date(input.paidOn),
      reference: input.reference,
      remark: input.remark || undefined,
    };
    const held = await holdForMd(actor, key, { kind: "PAYMENT_GIVEN", args });
    if (held) return held;
    const result = await confirmPaymentGiven({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...args,
    });
    refresh();
    return {
      ok: true,
      message: `Payment Given confirmed. Progress is now ${result.progressPercent}%.${
        result.approvalThresholdMet ? " The 20% approval threshold is met." : ""
      }`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function correctPaymentGivenAction(
  input: { entryId: string; percent: string; paidOn: string; reference: string; reason: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PAYMENT_CORRECT");
  try {
    const args = {
      entryId: input.entryId,
      percent: input.percent,
      paidOn: new Date(input.paidOn),
      reference: input.reference,
      reason: input.reason,
    };
    const held = await holdForMd(actor, key, { kind: "PAYMENT_GIVEN_CORRECT", args });
    if (held) return held;
    const result = await correctPaymentGiven({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...args,
    });
    refresh();
    return { ok: true, message: result.note };
  } catch (error) {
    return toResult(error);
  }
}

export async function decideAcquisitionAction(
  acquisitionId: string,
  approve: boolean,
  note: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("ACQUISITION_DECIDE");
  try {
    const result = await decideAcquisition({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      acquisitionId,
      approve,
      note,
    });
    refresh();
    return {
      ok: true,
      message:
        result.status === "APPROVED"
          ? `Approved. The property is in inventory as Available + RESALE${
              result.plotMessage ? ` — ${result.plotMessage}` : ""
            }.`
          : "Rejected. The prior state is restored.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function cancelAcquisitionAction(
  acquisitionId: string,
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("ACQUISITION_CANCEL");
  try {
    await cancelAcquisitionDeal({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      acquisitionId,
      reason,
    });
    refresh();
    return { ok: true, message: "Deal cancelled. The property is Not Available — Deal Cancelled." };
  } catch (error) {
    return toResult(error);
  }
}

export async function recordBuyingCommissionAction(
  input: { acquisitionId: string; beneficiaryPersonId: string; percent: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("BUYING_COMMISSION_RECORD");
  try {
    const result = await recordBuyingCommission({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      acquisitionId: input.acquisitionId,
      beneficiaryPersonId: input.beneficiaryPersonId,
      percent: input.percent,
    });
    refresh();
    return {
      ok: true,
      message:
        result.eligibility === "READY"
          ? "Buying Commission recorded and Ready — Payment Given is already 100%."
          : "Buying Commission recorded. It becomes payable at 100% Payment Given.",
    };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * SSOT §61 — the old sale's Allotment papers collected back, or the Registry
 * back completed. The service decides who may record it (CRM, Admin, MD).
 */
export async function recordDocumentsReturnedAction(acquisitionId: string, returnedOn: string, key: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const result = await recordBuybackDocumentsReturned({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      acquisitionId,
      returnedOn: new Date(returnedOn),
    });
    revalidatePath("/acquisitions");
    revalidatePath(`/acquisitions/${acquisitionId}`);
    return {
      ok: true,
      message: result.stable
        ? "Papers recorded back. The Buyback is now a Stable Buyback Completion."
        : "Papers recorded back. Stable Buyback Completion still needs 100% Payment Given.",
    };
  } catch (error) {
    return toResult(error);
  }
}
