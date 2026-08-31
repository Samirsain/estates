// Who is credited for a close — the one rule, in one place.
//
// A Booking asks it as Sold By and a Hold asks it as Sourced By, and both get
// the same three answers: the 3% Club, a Member, or a Customer. The rule lives
// here rather than in booking-service because hold-service cannot import that
// one (booking-service already imports hold-service).

import type { SoldByType } from "@prisma/client";
import { blocked, type Tx } from "./command";

/**
 * PRD §6.7 — when a Person holds an Active Member capability the closing action
 * must use Member; the same action can never generate Customer Loyalty.
 */
export async function validateSoldBy(
  tx: Tx,
  soldByType: SoldByType,
  soldByPersonId: string | null
) {
  if (soldByType === "THREE_PERCENT_CLUB") {
    if (soldByPersonId) blocked("A 3% Club direct close names no Sold By Person.");
    return;
  }
  if (!soldByPersonId) blocked(`Select the ${soldByType === "MEMBER" ? "Member" : "Customer"} who closed the deal.`);

  const person = await tx.person.findUniqueOrThrow({
    where: { id: soldByPersonId },
    include: { memberProfile: true },
  });

  if (soldByType === "MEMBER") {
    if (!person.memberProfile) blocked("The selected Person has no Member profile.");
    if (person.memberProfile.status !== "ACTIVE") {
      blocked("A Member must be Active at Booking Request to be selected as the closer.");
    }
    if (!person.memberProfile.activationDate) blocked("This Member has not been activated yet.");
    return;
  }

  if (person.memberProfile?.status === "ACTIVE") {
    blocked(
      "This Person holds an Active Member capability, so the close must be recorded as Sold By " +
        "Member. An Active Member cannot close as a Customer."
    );
  }
}
