"use server";

// Person details — the contact facts a Customer or Member profile prints.
//
// One action serves both profiles because there is one Person behind them: a
// Member who also bought is edited from either page and changes once. A record
// usually starts as a name and a mobile taken over the phone, so the rest of
// the fields are optional here and stay editable until somebody knows them.
//
// Bank details are deliberately absent: they have their own entry and Accounts
// verification (PRD RD-05). Aadhaar and PAN are accepted only while none is on
// file, through the same write-once recordAadhaar / recordPan a final buyer uses.

import { actionErrorText } from "@/lib/action-error";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { canViewField } from "@/lib/security/permissions";
import { CommandError, blocked, runCommand } from "@/lib/services/command";
import { cleanMemberBusiness, type MemberBusinessInput } from "@/lib/domain/member-business";
import { recordAadhaar, recordPan } from "@/lib/services/completion-service";
import { isValidEmail, isValidMobile, normaliseMobile } from "@/lib/domain/land-inquiry";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export type PersonDetails = {
  fullName: string;
  /** Member profile only; left out on a Customer's page, so it is untouched there. */
  nickname?: string;
  mobile: string;
  altMobile: string;
  email: string;
  city: string;
  addressLine: string;
  /** yyyy-mm-dd from a native date input; blank leaves it unrecorded. */
  dateOfBirth: string;
  /** Firm Name, Deals In, Experience — Member profile only, like nickname. */
  business?: MemberBusinessInput;
  /** Asked only while none is on file; written once (recordAadhaar). */
  aadhaar?: string;
  /** Asked only while none is on file; written once (recordPan). */
  pan?: string;
};

/** The columns the audit compares, so before and after read the same way. */
const snapshot = (p: {
  fullName: string;
  nickname: string | null;
  primaryMobile: string;
  altMobile: string | null;
  email: string | null;
  city: string | null;
  addressLine: string | null;
  dateOfBirth: Date | null;
  firmName: string | null;
  dealsIn: string[];
  businessExperience: string | null;
  aadhaarStatus: string;
  panStatus: string;
}) => ({
  fullName: p.fullName,
  nickname: p.nickname,
  primaryMobile: p.primaryMobile,
  altMobile: p.altMobile,
  email: p.email,
  city: p.city,
  addressLine: p.addressLine,
  dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
  firmName: p.firmName,
  dealsIn: p.dealsIn,
  businessExperience: p.businessExperience,
  // The status only — the number never enters the audit.
  aadhaarStatus: p.aadhaarStatus,
  panStatus: p.panStatus,
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
  // Stored as ten digits, as every other Person path stores them.
  const primaryMobile = input.mobile.trim() ? normaliseMobile(input.mobile) : "";
  const altMobile = input.altMobile.trim() ? normaliseMobile(input.altMobile) : "";
  const email = input.email.trim();
  // Roles that read mobiles masked are sent them blank, never in full; for
  // them a blank mobile keeps the number on file.
  const keepMobiles = !canViewField(actor.role, "MOBILE_FULL");
  if (!fullName || (!primaryMobile && !keepMobiles)) {
    return { ok: false, error: "Full name and mobile are both required." };
  }
  if (primaryMobile && !isValidMobile(primaryMobile)) {
    return { ok: false, error: "Enter a 10-digit mobile number." };
  }
  if (altMobile && !isValidMobile(altMobile)) {
    return { ok: false, error: "Enter a 10-digit alternate mobile number, or leave it blank." };
  }
  if (email && !isValidEmail(email)) {
    return { ok: false, error: "Enter a valid email address, e.g. name@example.com." };
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
    // Left out on a Customer's page, so those columns stay untouched there.
    const business = input.business ? cleanMemberBusiness(input.business) : {};

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
        await recordAadhaar(tx, personId, input.aadhaar);
        await recordPan(tx, personId, input.pan);

        const person = await tx.person.update({
          where: { id: personId },
          data: {
            fullName,
            nickname: input.nickname === undefined ? undefined : input.nickname.trim() || null,
            primaryMobile: primaryMobile || before.primaryMobile,
            altMobile: keepMobiles && !altMobile ? undefined : altMobile || null,
            email: email || null,
            city: input.city.trim() || null,
            addressLine: input.addressLine.trim() || null,
            dateOfBirth,
            ...business,
          },
        });

        return {
          result: { fullName: person.fullName },
          audit: {
            entity: "Person",
            entityId: person.id,
            action: "PERSON_DETAILS_UPDATED",
            reason,
            // Contact facts are business data. Of Aadhaar and PAN only the status
            // enters the audit; the numbers never do.
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
    return { ok: false, error: actionErrorText(error, "Action failed.") };
  }
}
