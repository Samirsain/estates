"use server";

// Project and PLC setup server actions — prd-corrections.md §16.1, §16.3.

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError } from "@/lib/services/command";
import {
  createProject,
  publishPlcVersion,
  updateProject,
  revisePlcRules,
  savePlcDraft,
  setProjectPublicPortal,
  setProjectStatus,
  type PlcComponentInput,
} from "@/lib/services/project-service";
import {
  createCommissionVersion,
  type CommissionVersionInput,
} from "@/lib/services/commission-settings-service";
import type { CommissionTermsInput } from "@/lib/domain/commission";

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
  renderUrl: string;
  city: string;
  amenities: string;
  reraNumber: string;
};

export async function createProjectAction(
  input: ProjectFields & {
    projectCode: string;
    isExternalResaleGroup: boolean;
    components: PlcComponentInput[];
    /** SSOT §12–§14; CP §8 — the Rewards settings, saved as version 1 and approved by the MD creating them. */
    commission?: CommissionDraftInput | null;
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
      projectCode: input.projectCode,
      name: input.name,
      type: input.type,
      developer: input.developer || null,
      location: input.location || null,
      locationUrl: input.locationUrl || null,
      driveUrl: input.driveUrl || null,
      renderUrl: input.renderUrl || null,
      city: input.city || null,
      amenities: input.amenities || null,
      reraNumber: input.reraNumber || null,
      isExternalResaleGroup: input.isExternalResaleGroup,
      components: input.components,
      commission: input.commission ? toVersionInput(input.commission) : null,
    });
    refresh();
    return {
      ok: true,
      message:
        `${input.name} created as Unreleased (code ${result.projectCode}). Prepare inventory, then make it Active before anything is sold.` +
        (input.commission
          ? " Its Rewards settings are saved and approved as version 1."
          : ""),
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

/** Public Project Portal on or off — MD, as every other Project setting. */
export async function setPublicPortalAction(projectId: string, on: boolean, key: string): Promise<ActionResult> {
  const actor = await requireStaff("PROJECT_SETUP");
  try {
    await setProjectPublicPortal({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      projectId,
      on,
    });
    revalidatePath(`/projects/${projectId}`);
    return {
      ok: true,
      message: on
        ? "Public Portal is on. This Project is listed again and its link opens."
        : "Public Portal is off. This Project is no longer listed and its link does not open.",
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
      renderUrl: input.renderUrl || null,
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

/* ------------------------------------------- commission settings (SSOT §14) */

// No Action argument on requireStaff: the service itself decides who may act —
// only MD creates a version.

function refreshProject(projectId: string) {
  refresh();
  revalidatePath(`/projects/${projectId}`);
}

export async function createCommissionVersionAction(projectId: string, input: CommissionDraftInput, key: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const result = await createCommissionVersion({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      projectId,
      ...toVersionInput(input),
    });
    refreshProject(projectId);
    return {
      ok: true,
      message:
        result.status === "ACTIVE"
          ? `Version ${result.version} is now Active. New Booking Requests freeze it; existing ones keep theirs.`
          : `Version ${result.version} saved. It becomes Active at its Effective from.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

/** CP §8 — a Rewards settings version as the browser sends it (dates as ISO strings). */
export type CommissionDraftInput = Omit<CommissionVersionInput, "effectiveFrom" | "trip"> & {
  effectiveFrom?: string | null;
  trip?: TripDraftInput | null;
};

function toVersionInput(input: CommissionDraftInput): CommissionVersionInput {
  const { trip, ...terms } = input;
  return {
    ...terms,
    effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
    trip: trip
      ? {
          ...trip,
          tripEnabled: true,
          tripCutOffAt: trip.tripCutOffAt ? new Date(trip.tripCutOffAt) : null,
          tripWindDownAt: trip.tripWindDownAt ? new Date(trip.tripWindDownAt) : null,
        }
      : undefined,
  };
}

/** CP §7.1 — the Trip part of a Draft as the browser sends it (dates as ISO strings). */
export type TripDraftInput = {
  tripTotalTarget: number;
  tripMinOwnCredits: number;
  tripMaxReferenceCredits: number;
  tripProgrammeCode: string;
  tripProgrammeVersionRef: string;
  tripTermsVersionRef: string;
  tripCutOffAt: string | null;
  tripWindDownAt: string | null;
  excludedPlotIds: string[];
  sharedPools: { plotId: string; parentPlotId: string }[];
};

