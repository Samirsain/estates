"use server";

// Royalty Gift fulfilment — SSOT §75, §78, §81; Change Pack §45, §49, §65.
// The service decides who may act: CRM or Admin records the Gift, the order and
// the delivery; MD decides a non-family recipient.

import type { RewardRecipient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError } from "@/lib/services/command";
import {
  decideRoyaltyRecipient,
  deliverRoyaltyGift,
  orderRoyaltyGift,
  selectRoyaltyGift,
} from "@/lib/services/royalty-service";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: "Something went wrong. Nothing was saved." };
}

function refresh() {
  revalidatePath("/members");
  revalidatePath("/dashboard");
  revalidatePath("/portal");
}

async function act(run: (actor: { ref: string; role: string }) => Promise<unknown>, message: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await run({ ref: actor.staffAccountId, role: actor.role });
    refresh();
    return { ok: true, message };
  } catch (error) {
    return toResult(error);
  }
}

export async function selectRoyaltyGiftAction(
  input: { creditId: string; rewardRef: string; recipient: RewardRecipient; recipientName: string },
  key: string
) {
  return act(
    (a) => selectRoyaltyGift({ idempotencyKey: key, actorRef: a.ref, actorRole: a.role, ...input }),
    input.recipient === "NON_FAMILY"
      ? "Gift recorded. MD must approve the non-family recipient before it is ordered."
      : "Gift recorded."
  );
}

export async function decideRoyaltyRecipientAction(input: { creditId: string; approve: boolean; note: string }, key: string) {
  return act(
    (a) => decideRoyaltyRecipient({ idempotencyKey: key, actorRef: a.ref, actorRole: a.role, ...input }),
    input.approve ? "Recipient approved." : "Recipient rejected; the Gift is to be chosen again."
  );
}

export async function orderRoyaltyGiftAction(input: { creditId: string; orderReference: string; orderedOn: string }, key: string) {
  return act(
    (a) =>
      orderRoyaltyGift({
        idempotencyKey: key,
        actorRef: a.ref,
        actorRole: a.role,
        creditId: input.creditId,
        orderReference: input.orderReference,
        orderedOn: new Date(input.orderedOn),
      }),
    "Gift ordered."
  );
}

export async function deliverRoyaltyGiftAction(
  input: { creditId: string; deliveredOn: string; deliveryReference: string },
  key: string
) {
  return act(
    (a) =>
      deliverRoyaltyGift({
        idempotencyKey: key,
        actorRef: a.ref,
        actorRole: a.role,
        creditId: input.creditId,
        deliveredOn: new Date(input.deliveredOn),
        deliveryReference: input.deliveryReference,
      }),
    "Gift delivered. The Royalty opportunity stays consumed."
  );
}
