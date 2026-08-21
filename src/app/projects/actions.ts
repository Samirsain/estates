"use server";

// Project and PLC setup server actions — PRD.md §16.1, §16.3.

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError } from "@/lib/services/command";
import {
  createProject,
  revisePlcRules,
  setProjectLifecycle,
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

export async function createProjectAction(
  input: {
    projectCode: string;
    name: string;
    type: "RESIDENTIAL" | "COMMERCIAL" | "MIXED";
    developer: string;
    location: string;
    reraNumber: string;
    reraExpiryDate: string;
    isExternalResaleGroup: boolean;
    components: PlcComponentInput[];
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PROJECT_SETUP");
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
      reraNumber: input.reraNumber || null,
      reraExpiryDate: input.reraExpiryDate ? new Date(input.reraExpiryDate) : null,
      isExternalResaleGroup: input.isExternalResaleGroup,
      components: input.components.filter((c) => c.code.trim() !== ""),
    });
    refresh();
    return {
      ok: true,
      message: `${result.projectCode} created as Setup / Not Active. Prepare inventory, then make it Active before anything is sold.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function setProjectLifecycleAction(
  projectId: string,
  lifecycle: "SETUP_NOT_ACTIVE" | "ACTIVE" | "SOLD_OUT" | "COMPLETED",
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PROJECT_SETUP");
  try {
    await setProjectLifecycle({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      projectId,
      lifecycle,
      reason,
    });
    refresh();
    return { ok: true, message: `Project is now ${lifecycle.replaceAll("_", " ").toLowerCase()}.` };
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
      components: components.filter((c) => c.code.trim() !== ""),
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
