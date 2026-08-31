"use server";

// Person details — the contact facts a Customer or Member profile prints.
//
// One action serves both profiles because there is one Person behind them: a
// Member who also bought is edited from either page and changes once. A record
// usually starts as a name and a mobile taken over the phone, so the rest of
// the fields are optional here and stay editable until somebody knows them.
//
// Aadhaar, PAN and bank details are deliberately absent: they are protected
// values with their own entry and reveal flow (PRD RD-05), and nothing here
// reads or writes them.

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError, blocked, runCommand } from "@/lib/services/command";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export type PersonDetails = {
  fullName: string;
  mobile: string;
  altMobile: string;
  email: string;
  city: string;
  addressLine: string;
  /** yyyy-mm-dd from a native date input; blank leaves it unrecorded. */
  dateOfBirth: string;
};

/** The columns the audit compares, so before and after read the same way. */
const snapshot = (p: {
  fullName: string;
  primaryMobile: string;
  altMobile: string | null;
  email: string | null;
  city: string | null;
  addressLine: string | null;
  dateOfBirth: Date | null;
}) => ({
  fullName: p.fullName,
  primaryMobile: p.primaryMobile,
  altMobile: p.altMobile,
  email: p.email,
  city: p.city,
  addressLine: p.addressLine,
  dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
});

export async function updatePersonDetailsAction(
  personId: string,
  input: PersonDetails,
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PERSON_DETAILS_EDIT");

  if (!reason.trim()) {
    return { ok: false, error: "A compulsory reason is required to change details." };
  }

  const fullName = input.fullName.trim();
  const primaryMobile = input.mobile.replace(/\s/g, "");
  if (!fullName || !primaryMobile) {
    return { ok: false, error: "Full name and mobile are both required." };
  }

  // A date of birth in the future is a typo every time, and one typed as
  // 20226 would otherwise be stored and printed as a fact.
  let dateOfBirth: Date | null = null;
  if (input.dateOfBirth.trim()) {
    dateOfBirth = new Date(`${input.dateOfBirth}T00:00:00.000Z`);
    if (Number.isNaN(dateOfBirth.getTime())) {
      return { ok: false, error: "That date of birth is not a real date." };
    }
    if (dateOfBirth > new Date()) {
      return { ok: false, error: "A date of birth cannot be in the future." };
    }
  }

  try {
    const result = await runCommand<{ fullName: string }>(
      {
        idempotencyKey: key,
        operation: "PERSON_DETAILS_UPDATE",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: { personId, reason, ...input },
      },
      async (tx) => {
        const before = await tx.person.findUniqueOrThrow({ where: { id: personId } });
        // A merged-away Person is history. Editing it would put a correction
        // on the record nothing reads and leave the surviving one wrong.
        if (before.mergeStatus === "MERGED_AWAY") {
          blocked("This identity was merged away. Edit the surviving Person instead.");
        }

        const person = await tx.person.update({
          where: { id: personId },
          data: {
            fullName,
            primaryMobile,
            altMobile: input.altMobile.replace(/\s/g, "") || null,
            email: input.email.trim() || null,
            city: input.city.trim() || null,
            addressLine: input.addressLine.trim() || null,
            dateOfBirth,
          },
        });

        return {
          result: { fullName: person.fullName },
          audit: {
            entity: "Person",
            entityId: person.id,
            action: "PERSON_DETAILS_UPDATED",
            reason,
            // Contact facts are business data. The Aadhaar and PAN columns are
            // untouched above and never enter the audit.
            before: snapshot(before),
            after: snapshot(person),
          },
        };
      }
    );

    revalidatePath("/customers");
    revalidatePath("/members");
    return { ok: true, message: `${result.fullName}'s details updated.` };
  } catch (error) {
    if (error instanceof CommandError) return { ok: false, error: error.message };
    return { ok: false, error: error instanceof Error ? error.message : "Action failed." };
  }
}
