"use server";

// Trip fulfilment and inviter correction — SSOT §38, §65; Change Pack §22, §37,
// §65 (NT03, NT10). The service decides who may act.

import type { RewardRecipient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError } from "@/lib/services/command";
import {
  bookTripReward,
  correctInviter,
  decideTripNominee,
  markTripTravelled,
  recordTripNominee,
} from "@/lib/services/trip-service";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

async function act(run: (actor: { ref: string; role: string }) => Promise<unknown>, message: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await run({ ref: actor.staffAccountId, role: actor.role });
    revalidatePath("/members");
    revalidatePath("/dashboard");
    revalidatePath("/portal");
    return { ok: true, message };
  } catch (error) {
    if (error instanceof CommandError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Something went wrong. Nothing was saved." };
  }
}

export async function recordTripNomineeAction(
  input: { rewardId: string; recipient: RewardRecipient; recipientName: string },
  key: string
) {
  return act(
    (a) => recordTripNominee({ idempotencyKey: key, actorRef: a.ref, actorRole: a.role, ...input }),
    input.recipient === "NON_FAMILY" ? "Nominee recorded. MD must approve before booking." : "Traveller recorded."
  );
}

export async function decideTripNomineeAction(input: { rewardId: string; approve: boolean; note: string }, key: string) {
  return act(
    (a) => decideTripNominee({ idempotencyKey: key, actorRef: a.ref, actorRole: a.role, ...input }),
    input.approve ? "Nominee approved." : "Nominee rejected."
  );
}

export async function bookTripAction(input: { rewardId: string; bookingReference: string; bookedOn: string }, key: string) {
  return act(
    (a) =>
      bookTripReward({
        idempotencyKey: key,
        actorRef: a.ref,
        actorRole: a.role,
        rewardId: input.rewardId,
        bookingReference: input.bookingReference,
        bookedOn: new Date(input.bookedOn),
      }),
    "Trip booked."
  );
}

export async function travelledTripAction(input: { rewardId: string; travelledOn: string }, key: string) {
  return act(
    (a) =>
      markTripTravelled({
        idempotencyKey: key,
        actorRef: a.ref,
        actorRole: a.role,
        rewardId: input.rewardId,
        travelledOn: new Date(input.travelledOn),
      }),
    "Trip travelled. The credits it used stay consumed."
  );
}

/** SSOT §38 — the inviter is named by Member ID; blank removes it. */
export async function correctInviterAction(input: { memberProfileId: string; inviterMemberId: string; reason: string }, key: string) {
  const code = input.inviterMemberId.trim();
  const inviter = code ? await db.memberProfile.findUnique({ where: { memberId: code }, select: { id: true } }) : null;
  if (code && !inviter) return { ok: false, error: `No Member ${code}.` } as ActionResult;
  return act(
    (a) =>
      correctInviter({
        idempotencyKey: key,
        actorRef: a.ref,
        actorRole: a.role,
        memberProfileId: input.memberProfileId,
        invitedByMemberId: inviter?.id ?? null,
        reason: input.reason,
      }),
    "Inviter corrected."
  );
}
