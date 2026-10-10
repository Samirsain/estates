"use server";

// Royalty Gift Programme Versions — SSOT §76, §101; Change Pack §7.4, §65 NT07.
// The service decides who may act (Admin prepares and sends, MD decides).

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError } from "@/lib/services/command";
import {
  decideRoyaltyProgramme,
  prepareRoyaltyProgramme,
  sendRoyaltyProgramme,
} from "@/lib/services/royalty-programme-service";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: "Something went wrong. Nothing was saved." };
}

function refresh() {
  revalidatePath("/administration");
  revalidatePath("/dashboard");
}

export async function prepareRoyaltyProgrammeAction(
  input: { programmeRef: string; catalogueVersion: string; termsVersion: string; reason: string; effectiveFrom: string | null },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const result = await prepareRoyaltyProgramme({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...input,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
    });
    refresh();
    return { ok: true, message: `Draft version ${result.version} saved. Send it to MD when it is ready.` };
  } catch (error) {
    return toResult(error);
  }
}

export async function sendRoyaltyProgrammeAction(versionId: string, key: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const result = await sendRoyaltyProgramme({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      versionId,
    });
    refresh();
    return { ok: true, message: `Version ${result.version} sent to MD.` };
  } catch (error) {
    return toResult(error);
  }
}

export async function decideRoyaltyProgrammeAction(
  input: { versionId: string; approve: boolean; note: string; economicsReviewed: boolean },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const result = await decideRoyaltyProgramme({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...input,
    });
    refresh();
    return {
      ok: true,
      message:
        result.status === "ACTIVE"
          ? `Version ${result.version} is now the live Royalty Gift Programme. New Booking Requests freeze it.`
          : result.status === "APPROVED"
            ? `Version ${result.version} approved. It goes live at its Effective from.`
            : `Version ${result.version} rejected.`,
    };
  } catch (error) {
    return toResult(error);
  }
}
