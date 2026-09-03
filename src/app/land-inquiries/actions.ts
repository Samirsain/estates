"use server";

// Land Inquiry server actions — Land Inquiry spec §26.
//
// The route is the UI; these are the whole mutation contract. There is no REST
// layer here and this feature does not add one (spec §26.1).
//
// Every one of these re-checks the permission on the server. A hidden button is
// presentation; this is the control (DESIGN §1, spec §27 "UI hiding is not
// authorization").

import type { LandInquiryStage, LandInquiryStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError } from "@/lib/services/command";
import {
  archiveLandInquiry,
  changeLandInquiryStage,
  createLandInquiry,
  reassignLandInquiry,
  setLandInquiryStatus,
  updateLandInquiry,
  type LandInquiryInput,
} from "@/lib/services/land-inquiry-service";

export type ActionResult =
  | { ok: true; message?: string; id?: string; inquiryNo?: string }
  | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  return { ok: false, error: error instanceof Error ? error.message : "Action failed." };
}

function refresh(id?: string) {
  revalidatePath("/land-inquiries");
  if (id) revalidatePath(`/land-inquiries/${id}`);
}

export async function createLandInquiryAction(
  input: LandInquiryInput,
  createRequestId: string
): Promise<ActionResult> {
  const actor = await requireStaff("LAND_INQUIRY_MANAGE");
  try {
    const result = await createLandInquiry({
      createRequestId,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      input,
    });
    refresh(result.id);
    return { ok: true, message: `Land Inquiry ${result.inquiryNo} created.`, ...result };
  } catch (error) {
    return toResult(error);
  }
}

export async function updateLandInquiryAction(
  args: { id: string; version: number; input: LandInquiryInput },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("LAND_INQUIRY_MANAGE");
  try {
    await updateLandInquiry({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...args,
    });
    refresh(args.id);
    return { ok: true, message: "Land Inquiry updated.", id: args.id };
  } catch (error) {
    return toResult(error);
  }
}

export async function changeLandInquiryStageAction(
  args: { id: string; version: number; stage: LandInquiryStage; reason: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("LAND_INQUIRY_MANAGE");
  try {
    await changeLandInquiryStage({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...args,
    });
    refresh(args.id);
    return { ok: true, message: "Inquiry Stage updated." };
  } catch (error) {
    return toResult(error);
  }
}

export async function changeLandInquiryStatusAction(
  args: {
    id: string;
    version: number;
    status: LandInquiryStatus;
    reason: string;
    restoredStage?: LandInquiryStage | null;
  },
  key: string
): Promise<ActionResult> {
  // Spec §21 — CRM may close an inquiry; only Admin or MD may reopen one.
  const actor = await requireStaff(
    args.status === "WORKING" ? "LAND_INQUIRY_REOPEN" : "LAND_INQUIRY_MANAGE"
  );
  try {
    await setLandInquiryStatus({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...args,
    });
    refresh(args.id);
    return { ok: true, message: args.status === "CLOSED" ? "Inquiry closed." : "Inquiry reopened." };
  } catch (error) {
    return toResult(error);
  }
}

export async function reassignLandInquiryAction(
  args: { id: string; version: number; assignedToId: string | null; reason: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("WORK_REASSIGN");
  try {
    await reassignLandInquiry({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...args,
    });
    refresh(args.id);
    return { ok: true, message: "Inquiry reassigned." };
  } catch (error) {
    return toResult(error);
  }
}

export async function archiveLandInquiryAction(
  args: { id: string; version: number; reason: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("LAND_INQUIRY_ARCHIVE");
  try {
    await archiveLandInquiry({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...args,
    });
    refresh(args.id);
    return { ok: true, message: "Inquiry archived." };
  } catch (error) {
    return toResult(error);
  }
}
