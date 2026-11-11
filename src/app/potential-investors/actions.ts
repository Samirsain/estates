"use server";

// Investor Leads (the PotentialInvestor table) — a name, a mobile (and maybe a second one) and a city, taken down for later.

import { actionErrorText } from "@/lib/action-error";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError, blocked, nextReference, runCommand, type Tx } from "@/lib/services/command";
import { isValidMobile, normaliseMobile } from "@/lib/domain/land-inquiry";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

type InvestorInput = {
  fullName: string;
  mobile: string;
  altMobile: string;
  city: string;
  /** Edit only: blank keeps the alternate mobile, so removing it is asked for. */
  removeAltMobile?: boolean;
};

/** The columns the audit keeps, so a deleted row can still be read back. */
const snapshot = (p: { fullName: string; mobile: string; altMobile: string | null; city: string | null }) => ({
  fullName: p.fullName,
  mobile: p.mobile,
  altMobile: p.altMobile,
  city: p.city,
});

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  return { ok: false, error: actionErrorText(error, "Action failed.") };
}

/**
 * Owner, 11 Nov 2026 — an Investor Lead is someone not yet on file. A mobile
 * or alternate mobile already on any Customer's or Member's profile, as
 * their mobile or their alternate, is refused and says who holds it. Older
 * Persons may hold a number as it was typed, so the typed form is matched too.
 */
async function refuseNumberOnFile(tx: Tx, typed: string[]) {
  const numbers = [
    ...new Set(typed.flatMap((t) => (t.trim() ? [normaliseMobile(t), t.replace(/\s/g, "")] : []))),
  ];
  if (numbers.length === 0) return;
  const holder = await tx.person.findFirst({
    where: {
      mergeStatus: { not: "MERGED_AWAY" },
      OR: [{ primaryMobile: { in: numbers } }, { altMobile: { in: numbers } }],
      AND: [{ OR: [{ customerProfile: { isNot: null } }, { memberProfile: { isNot: null } }] }],
    },
    select: {
      fullName: true,
      customerProfile: { select: { customerId: true } },
      memberProfile: { select: { memberId: true } },
    },
  });
  if (!holder) return;
  const who = holder.memberProfile
    ? `Member ${holder.memberProfile.memberId}`
    : `Customer ${holder.customerProfile!.customerId}`;
  blocked(
    `Already in the system: this number is on ${who} · ${holder.fullName}. ` +
      `An Investor Lead is only for someone who is not yet a Customer or Member.`
  );
}

export async function addPotentialInvestorAction(input: InvestorInput, key: string): Promise<ActionResult> {
  // A sales lead list: read by every role, changed only by those who work leads.
  const actor = await requireStaff("ENQUIRY_MANAGE");

  const fullName = input.fullName.trim();
  const mobile = normaliseMobile(input.mobile);
  const altMobile = input.altMobile.trim() ? normaliseMobile(input.altMobile) : null;
  if (!fullName) return { ok: false, error: "Enter the name." };
  if (!isValidMobile(mobile)) return { ok: false, error: "Enter a 10-digit mobile number." };
  if (altMobile !== null && !isValidMobile(altMobile)) {
    return { ok: false, error: "Enter a 10-digit alternate mobile number, or leave it blank." };
  }

  try {
    await runCommand<string>(
      {
        idempotencyKey: key,
        operation: "POTENTIAL_INVESTOR_ADD",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: input,
      },
      async (tx) => {
        await refuseNumberOnFile(tx, [input.mobile, input.altMobile]);
        const row = await tx.potentialInvestor.create({
          data: {
            investorNo: await nextReference(tx, "PI", "PotentialInvestor"),
            fullName,
            mobile,
            altMobile,
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
    return { ok: true, message: "Investor Lead added." };
  } catch (error) {
    return toResult(error);
  }
}

/** A blank mobile or alternate mobile keeps the one on file — the list may only show it masked. */
export async function updatePotentialInvestorAction(
  id: string,
  input: InvestorInput,
  key: string
): Promise<ActionResult> {
  // A sales lead list: read by every role, changed only by those who work leads.
  const actor = await requireStaff("ENQUIRY_MANAGE");

  const fullName = input.fullName.trim();
  const mobile = input.mobile.trim() ? normaliseMobile(input.mobile) : null;
  const altMobile = input.altMobile.trim() ? normaliseMobile(input.altMobile) : null;
  if (!fullName) return { ok: false, error: "Enter the name." };
  if (mobile !== null && !isValidMobile(mobile)) {
    return { ok: false, error: "Enter a 10-digit mobile number, or leave it blank to keep the current one." };
  }
  if (altMobile !== null && !isValidMobile(altMobile)) {
    return {
      ok: false,
      error: "Enter a 10-digit alternate mobile number, or leave it blank to keep the current one.",
    };
  }

  try {
    await runCommand<string>(
      {
        idempotencyKey: key,
        operation: "POTENTIAL_INVESTOR_UPDATE",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: { id, ...input },
      },
      async (tx) => {
        const before = await tx.potentialInvestor.findUnique({ where: { id } });
        if (!before) blocked("This Investor Lead no longer exists.");
        // Only a number being changed is checked: a blank field keeps the one on file.
        await refuseNumberOnFile(tx, [input.mobile, input.altMobile]);
        const row = await tx.potentialInvestor.update({
          where: { id },
          data: {
            fullName,
            mobile: mobile ?? undefined,
            altMobile: input.removeAltMobile ? null : (altMobile ?? undefined),
            city: input.city.trim() || null,
          },
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
    return { ok: true, message: "Investor Lead updated." };
  } catch (error) {
    return toResult(error);
  }
}

/** Nothing else points at an Investor Lead, so the row goes; the audit keeps what it held. */
export async function deletePotentialInvestorAction(id: string, key: string): Promise<ActionResult> {
  // A sales lead list: read by every role, changed only by those who work leads.
  const actor = await requireStaff("ENQUIRY_MANAGE");

  try {
    await runCommand<string>(
      {
        idempotencyKey: key,
        operation: "POTENTIAL_INVESTOR_DELETE",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: { id },
      },
      async (tx) => {
        const before = await tx.potentialInvestor.findUnique({ where: { id } });
        if (!before) blocked("This Investor Lead was already deleted.");
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
    return { ok: true, message: "Investor Lead deleted." };
  } catch (error) {
    return toResult(error);
  }
}
