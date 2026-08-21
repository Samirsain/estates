"use server";

// Acquisition and Payment Given server actions — PRD.md §11; main-PRD §17.
// Every action re-checks permission on the server (DESIGN §1).

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError } from "@/lib/services/command";
import {
  cancelAcquisitionDeal,
  confirmPaymentGiven,
  correctPaymentGiven,
  createAcquisition,
  decideAcquisition,
  recordBuyingCommission,
} from "@/lib/services/acquisition-service";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  return { ok: false, error: error instanceof Error ? error.message : "Action failed." };
}

function refresh() {
  revalidatePath("/acquisitions");
  revalidatePath("/plots");
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
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
    const result = await createAcquisition({
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
        `${result.acquisitionNo} created. Accounts approves it once at least 20% Payment Given is ` +
        `confirmed.`,
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
    const result = await confirmPaymentGiven({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      acquisitionId: input.acquisitionId,
      percent: input.percent,
      paidOn: new Date(input.paidOn),
      reference: input.reference,
      remark: input.remark || undefined,
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
    const result = await correctPaymentGiven({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      entryId: input.entryId,
      percent: input.percent,
      paidOn: new Date(input.paidOn),
      reference: input.reference,
      reason: input.reason,
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
