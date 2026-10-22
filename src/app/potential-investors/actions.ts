"use server";

// Potential Investors — a name, a mobile and a city, taken down for later.

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError, blocked, nextReference, runCommand } from "@/lib/services/command";
import { isValidMobile, normaliseMobile } from "@/lib/domain/land-inquiry";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

type InvestorInput = { fullName: string; mobile: string; city: string };

/** The columns the audit keeps, so a deleted row can still be read back. */
const snapshot = (p: { fullName: string; mobile: string; city: string | null }) => ({
  fullName: p.fullName,
  mobile: p.mobile,
  city: p.city,
});

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  return { ok: false, error: error instanceof Error ? error.message : "Action failed." };
}

export async function addPotentialInvestorAction(input: InvestorInput, key: string): Promise<ActionResult> {
  const actor = await requireStaff();

  const fullName = input.fullName.trim();
  const mobile = normaliseMobile(input.mobile);
  if (!fullName) return { ok: false, error: "Enter the name." };
  if (!isValidMobile(mobile)) return { ok: false, error: "Enter a 10-digit mobile number." };

  try {
    const investorNo = await runCommand<string>(
      {
        idempotencyKey: key,
        operation: "POTENTIAL_INVESTOR_ADD",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: input,
      },
      async (tx) => {
        const row = await tx.potentialInvestor.create({
          data: {
            investorNo: await nextReference(tx, "PI", "PotentialInvestor"),
            fullName,
            mobile,
            city: input.city.trim() || null,
            createdByRef: actor.staffAccountId,
          },
        });
        return {
          result: row.investorNo,
          audit: {
            entity: "PotentialInvestor",
            entityId: row.id,
            action: "POTENTIAL_INVESTOR_ADDED",
            after: snapshot(row),
          },
        };
      }
    );
    revalidatePath("/potential-investors");
    return { ok: true, message: `Added as ${investorNo}.` };
  } catch (error) {
    return toResult(error);
  }
}

/** A blank mobile keeps the one on file — the list may only show it masked. */
export async function updatePotentialInvestorAction(
  id: string,
  input: InvestorInput,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff();

  const fullName = input.fullName.trim();
  const mobile = input.mobile.trim() ? normaliseMobile(input.mobile) : null;
  if (!fullName) return { ok: false, error: "Enter the name." };
  if (mobile !== null && !isValidMobile(mobile)) {
    return { ok: false, error: "Enter a 10-digit mobile number, or leave it blank to keep the current one." };
  }

  try {
    const investorNo = await runCommand<string>(
      {
        idempotencyKey: key,
        operation: "POTENTIAL_INVESTOR_UPDATE",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: { id, ...input },
      },
      async (tx) => {
        const before = await tx.potentialInvestor.findUnique({ where: { id } });
        if (!before) blocked("This Potential Investor no longer exists.");
        const row = await tx.potentialInvestor.update({
          where: { id },
          data: { fullName, mobile: mobile ?? undefined, city: input.city.trim() || null },
        });
        return {
          result: row.investorNo,
          audit: {
            entity: "PotentialInvestor",
            entityId: row.id,
            action: "POTENTIAL_INVESTOR_UPDATED",
            before: snapshot(before),
            after: snapshot(row),
          },
        };
      }
    );
    revalidatePath("/potential-investors");
    return { ok: true, message: `${investorNo} updated.` };
  } catch (error) {
    return toResult(error);
  }
}

/** Nothing else points at a Potential Investor, so the row goes; the audit keeps what it held. */
export async function deletePotentialInvestorAction(id: string, key: string): Promise<ActionResult> {
  const actor = await requireStaff();

  try {
    const investorNo = await runCommand<string>(
      {
        idempotencyKey: key,
        operation: "POTENTIAL_INVESTOR_DELETE",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: { id },
      },
      async (tx) => {
        const before = await tx.potentialInvestor.findUnique({ where: { id } });
        if (!before) blocked("This Potential Investor was already deleted.");
        await tx.potentialInvestor.delete({ where: { id } });
        return {
          result: before.investorNo,
          audit: {
            entity: "PotentialInvestor",
            entityId: id,
            action: "POTENTIAL_INVESTOR_DELETED",
            before: { investorNo: before.investorNo, ...snapshot(before) },
          },
        };
      }
    );
    revalidatePath("/potential-investors");
    return { ok: true, message: `${investorNo} deleted.` };
  } catch (error) {
    return toResult(error);
  }
}
