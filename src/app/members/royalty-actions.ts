"use server";

// Royalty Tokens — docss/11. The service decides who may act: CRM or Admin
// records spending arranged outside the CRM; MD decides a non-family
// recipient; Admin or MD corrects an erroneous entry.

import type { RewardRecipient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError } from "@/lib/services/command";
import {
  correctTokenRedemption,
  decideTokenRedemption,
  memberTokenView,
  recordTokenRedemption,
} from "@/lib/services/royalty-service";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: "Something went wrong. Nothing was saved." };
}

function refresh() {
  revalidatePath("/members");
  revalidatePath("/people");
  revalidatePath("/dashboard");
  revalidatePath("/rewards");
  revalidatePath("/portal");
}

async function act(
  run: (actor: { ref: string; role: string }) => Promise<unknown>,
  message: string | ((role: string) => string)
): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await run({ ref: actor.staffAccountId, role: actor.role });
    refresh();
    return { ok: true, message: typeof message === "function" ? message(actor.role) : message };
  } catch (error) {
    return toResult(error);
  }
}

export async function recordTokenRedemptionAction(
  input: {
    memberProfileId: string;
    tokens: number;
    redeemedOn: string;
    recipient: RewardRecipient;
    recipientName: string;
    reference: string;
  },
  key: string
) {
  return act(
    (a) => recordTokenRedemption({ idempotencyKey: key, actorRef: a.ref, actorRole: a.role, ...input }),
    (role) =>
      input.recipient === "NON_FAMILY" && role !== "MD"
        ? "Recorded. MD must approve the non-family recipient before the points count as spent."
        : `${input.tokens} points recorded as spent.`
  );
}

export async function decideTokenRedemptionAction(input: { redemptionId: string; approve: boolean; note: string }, key: string) {
  return act(
    (a) => decideTokenRedemption({ idempotencyKey: key, actorRef: a.ref, actorRole: a.role, ...input }),
    input.approve ? "Approved; the points are spent." : "Rejected; nothing was spent."
  );
}

export async function correctTokenRedemptionAction(input: { redemptionId: string; reason: string }, key: string) {
  return act(
    (a) => correctTokenRedemption({ idempotencyKey: key, actorRef: a.ref, actorRole: a.role, ...input }),
    "Corrected; its points are back in the balance."
  );
}

/**
 * docss/11 §1 — read before staff finalise the external redemption, so they
 * know what can be recorded. Recording rechecks it under the Member lock.
 */
export async function tokenAvailabilityAction(memberProfileId: string): Promise<{ canRecordUpTo: number; blockers: string[] }> {
  await requireStaff();
  const view = await memberTokenView(memberProfileId, "STAFF");
  return { canRecordUpTo: view.staff!.canRecordUpTo, blockers: view.staff!.blockers };
}
