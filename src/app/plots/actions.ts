"use server";

import type { SoldByType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError } from "@/lib/services/command";
import {
  cancelHold,
  createHold,
  decideHoldExtension,
  decideHoldRequest,
  requestHoldExtension,
} from "@/lib/services/hold-service";
import {
  makeAvailable,
  prepareInventory,
  setRestriction,
  updatePlotDetails,
  type BoundaryInput,
  type PlotRow,
} from "@/lib/services/inventory-service";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  return { ok: false, error: error instanceof Error ? error.message : "Action failed." };
}

export async function makeAvailableAction(
  plotId: string,
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PLOT_MAKE_AVAILABLE");
  try {
    await makeAvailable({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      plotId,
      reason,
    });
    revalidatePath("/plots");
    return { ok: true, message: "Plot is now Available." };
  } catch (error) {
    return toResult(error);
  }
}

export async function setRestrictionAction(
  plotId: string,
  restriction: "NONE" | "NOT_YET_RELEASED" | "NOT_FOR_SALE" | "PLEDGE",
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PLOT_RESTRICTION_MANAGE");
  try {
    const result = await setRestriction({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      plotId,
      restriction,
      reason,
    });
    revalidatePath("/plots");
    return { ok: true, message: result.message ?? "Restriction updated." };
  } catch (error) {
    return toResult(error);
  }
}

export async function createHoldAction(
  plotId: string,
  personId: string,
  key: string,
  /** Set instead of personId when the buyer is typed on the form. */
  newPerson?: { fullName: string; mobile: string } | null,
  /** Who is credited for the Hold. Defaults to the 3% Club, as a Booking does. */
  sourcedBy?: { type: SoldByType; personId: string | null }
): Promise<ActionResult> {
  const actor = await requireStaff("HOLD_CREATE");
  try {
    const result = await createHold({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      plotId,
      personId: personId || null,
      newPerson: personId ? null : newPerson,
      sourcedByType: sourcedBy?.type ?? "THREE_PERCENT_CLUB",
      sourcedByPersonId: sourcedBy?.personId ?? null,
      responsibleStaffId: actor.accountId,
    });
    revalidatePath("/plots");
    return { ok: true, message: `Hold created. Expires ${new Date(result.expiresAt).toISOString()}.` };
  } catch (error) {
    return toResult(error);
  }
}

export async function cancelHoldAction(
  holdId: string,
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("HOLD_CREATE");
  try {
    await cancelHold({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      holdId,
      reason,
    });
    revalidatePath("/plots");
    return { ok: true, message: "Hold cancelled. The Plot returned under its restriction rule." };
  } catch (error) {
    return toResult(error);
  }
}

export async function requestExtensionAction(
  holdId: string,
  reason: string,
  hours: number,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("HOLD_EXTEND_FIRST");
  try {
    const result = await requestHoldExtension({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      holdId,
      reason,
      requestedHours: hours,
    });
    revalidatePath("/plots");
    return {
      ok: true,
      message: result.requiresAdmin
        ? "Extension requested. A further extension requires Admin approval. The Hold timer keeps running."
        : "Extension requested. The Hold timer keeps running.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function decideHoldRequestAction(
  requestId: string,
  approve: boolean,
  note: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("HOLD_REQUEST_REVIEW");
  try {
    const result = await decideHoldRequest({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      requestId,
      approve,
      note,
    });
    revalidatePath("/plots");
    revalidatePath("/portal");
    return {
      ok: true,
      message:
        result.status === "APPROVED"
          ? "Request approved and a 72-hour Hold created for the named buyer."
          : "Request rejected. The remark is visible to the Member.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function prepareInventoryAction(
  projectId: string,
  rows: PlotRow[],
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PLOT_SETUP");
  try {
    const result = await prepareInventory({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      projectId,
      rows,
    });
    revalidatePath("/plots");
    return {
      ok: true,
      message: result.released
        ? `${result.count} Plot(s) prepared and Available — the Project is already Active.`
        : `${result.count} Plot(s) prepared as Not Available — Not Yet Released.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * PRD §8.4 Edit Plot Details, under the §8.7 correction rules. The reason is
 * compulsory and the old and new values go to History. Effective PLC follows
 * the corrected boundaries by itself; a frozen Hold or Booking snapshot does
 * not, so the caller is told when one has drifted and needs its own correction.
 */
export async function updatePlotDetailsAction(
  plotId: string,
  details: {
    widthFt?: string;
    lengthFt?: string;
    exactAreaSqFt?: string;
    exactAreaReason?: string;
    boundaries: BoundaryInput[];
  },
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PLOT_SETUP");
  try {
    const result = await updatePlotDetails({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      plotId,
      ...details,
      reason,
    });
    revalidatePath("/plots");
    return {
      ok: true,
      message: result.plcSnapshotNeedsCorrection
        ? "Plot details corrected. The frozen Location Charge snapshot no longer matches — correct it separately."
        : "Plot details corrected.",
    };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * PRD §8.5 — the first extension is CRM's; any further extension needs Admin.
 * The review never pauses the Hold expiry.
 */
export async function decideHoldExtensionAction(
  requestId: string,
  approve: boolean,
  note: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("HOLD_EXTEND_FURTHER");
  try {
    await decideHoldExtension({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      requestId,
      approve,
      note: note || undefined,
    });
    revalidatePath("/plots");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message: approve
        ? "Extension approved. The new expiry applies from the original expiry."
        : "Extension rejected. The Hold keeps its existing expiry.",
    };
  } catch (error) {
    return toResult(error);
  }
}
