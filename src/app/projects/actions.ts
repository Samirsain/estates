"use server";

// Project and PLC setup server actions — PRD.md §16.1, §16.3.

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError } from "@/lib/services/command";
import {
  createProject,
  publishPlcVersion,
  updateProject,
  revisePlcRules,
  savePlcDraft,
  setProjectStatus,
  type PlcComponentInput,
} from "@/lib/services/project-service";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  return { ok: false, error: error instanceof Error ? error.message : "Action failed." };
}

function refresh() {
  revalidatePath("/projects");
  revalidatePath("/plots");
  revalidatePath("/acquisitions");
}

export type ProjectFields = {
  name: string;
  type: "RESIDENTIAL" | "COMMERCIAL" | "AGRICULTURAL" | "MIXED";
  developer: string;
  location: string;
  locationUrl: string;
  driveUrl: string;
  city: string;
  amenities: string;
  reraNumber: string;
};

export async function createProjectAction(
  input: ProjectFields & {
    isExternalResaleGroup: boolean;
    components: PlcComponentInput[];
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PROJECT_SETUP");
  // The form does not offer Mixed. Refusing rather than quietly rewriting
  // keeps a surprising value from becoming a stored one.
  if (input.type === "MIXED") {
    return { ok: false, error: "Choose Residential, Commercial or Agricultural." };
  }
  try {
    const result = await createProject({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      name: input.name,
      type: input.type,
      developer: input.developer || null,
      location: input.location || null,
      locationUrl: input.locationUrl || null,
      driveUrl: input.driveUrl || null,
      city: input.city || null,
      amenities: input.amenities || null,
      reraNumber: input.reraNumber || null,
      isExternalResaleGroup: input.isExternalResaleGroup,
      components: input.components,
    });
    refresh();
    return {
      ok: true,
      message: `${input.name} created as Unreleased (code ${result.projectCode}). Prepare inventory, then make it Active before anything is sold.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function setProjectStatusAction(
  projectId: string,
  status: "SETUP_NOT_ACTIVE" | "ACTIVE" | "SOLD_OUT" | "COMPLETED",
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PROJECT_SETUP");
  try {
    const result = await setProjectStatus({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      projectId,
      status,
      reason,
    });
    refresh();

    // What the activation did to the inventory, said plainly. A Plot that did
    // not move is more interesting than one that did — it means something is
    // holding it, and the count is where anyone would notice.
    const kept = [
      result.heldBack > 0 ? `${result.heldBack} left on Hold or Booked` : null,
      result.restricted > 0 ? `${result.restricted} kept restricted` : null,
    ].filter(Boolean);

    const released =
      status !== "ACTIVE"
        ? ""
        : result.released > 0
          ? ` ${result.released} Plot(s) released.`
          : " No Plot was waiting to be released.";

    return {
      ok: true,
      message:
        `Project is now ${status.replaceAll("_", " ").toLowerCase()}.${released}` +
        (kept.length > 0 ? ` ${kept.join(", ")}.` : ""),
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function revisePlcRulesAction(
  projectId: string,
  components: PlcComponentInput[],
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PROJECT_SETUP");
  try {
    const result = await revisePlcRules({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      projectId,
      components,
      reason,
    });
    refresh();
    return {
      ok: true,
      message: `PLC version ${result.version} is now current. Existing Holds and Bookings keep the snapshot they froze.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

/** PLC spec §3.1 — save the next version as a Draft, changing nothing yet. */
export async function savePlcDraftAction(
  projectId: string,
  components: PlcComponentInput[],
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PROJECT_SETUP");
  try {
    const result = await savePlcDraft({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      projectId,
      components,
      reason,
    });
    refresh();
    return {
      ok: true,
      message: `Draft version ${result.version} saved. Inventory keeps using the published version until you publish it.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

/** PLC spec §3.5 — publish the Draft and supersede the version in force. */
export async function publishPlcVersionAction(
  plcRuleVersionId: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PROJECT_SETUP");
  try {
    const result = await publishPlcVersion({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      plcRuleVersionId,
    });
    refresh();
    return {
      ok: true,
      message:
        `PLC version ${result.version} is now current` +
        (result.supersededVersion ? `, superseding version ${result.supersededVersion}.` : ".") +
        " Existing Holds and Bookings keep the snapshot they froze.",
    };
  } catch (error) {
    return toResult(error);
  }
}

/** The edit path a Project has never had. Compulsory reason, like every other
 * Project-level command here. */
export async function updateProjectAction(
  projectId: string,
  input: ProjectFields,
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PROJECT_SETUP");
  try {
    await updateProject({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      projectId,
      name: input.name,
      type: input.type,
      developer: input.developer || null,
      location: input.location || null,
      locationUrl: input.locationUrl || null,
      driveUrl: input.driveUrl || null,
      city: input.city || null,
      amenities: input.amenities || null,
      reraNumber: input.reraNumber || null,
      reason,
    });
    refresh();
    return { ok: true, message: `${input.name} updated.` };
  } catch (error) {
    return toResult(error);
  }
}
