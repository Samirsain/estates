"use server";

// Release-control decisions — Change Pack §55, §58, §65 NT08/NT09. The service
// decides who may act (MD for a staff conflict, Accounts/MD for circumvention).

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError } from "@/lib/services/command";
import { decideCircumvention, decideStaffConflict } from "@/lib/services/control-review-service";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: "Something went wrong. Nothing was saved." };
}

function refresh() {
  revalidatePath("/rewards");
  revalidatePath("/dashboard");
  revalidatePath("/bookings");
}

export async function decideStaffConflictAction(reviewId: string, approve: boolean, note: string, key: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await decideStaffConflict({ idempotencyKey: key, actorRef: actor.staffAccountId, actorRole: actor.role, reviewId, approve, note });
    refresh();
    return { ok: true, message: approve ? "Approved. The benefit is released if nothing else holds it." : "Rejected. The benefit stays held." };
  } catch (error) {
    return toResult(error);
  }
}

export async function decideCircumventionAction(reviewId: string, clear: boolean, reason: string, key: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await decideCircumvention({ idempotencyKey: key, actorRef: actor.staffAccountId, actorRole: actor.role, reviewId, clear, reason });
    refresh();
    return {
      ok: true,
      message: clear
        ? "Cleared. Held benefits are released if nothing else holds them."
        : "Restricted. Benefits stay held while the Recovery is outstanding.",
    };
  } catch (error) {
    return toResult(error);
  }
}
