// Who is credited for a close — the one rule, in one place.
//
// A Booking asks it as Sold By and a Hold asks it as Sourced By, and both get
// the same three answers: the 3% Club, a Member, or a Customer. The rule lives
// here rather than in booking-service because hold-service cannot import that
// one (booking-service already imports hold-service).

import type { SoldByType } from "@prisma/client";
import { CUSTOMER_CLOSING_LOYALTY_LIMIT } from "@/lib/domain/commission";
import { blocked, type Tx } from "./command";
import { consumedClosingEvents } from "./commission-service";

/**
 * PRD §6.7 — when a Person holds an Active Member capability the closing action
 * must use Member; the same action can never generate Customer Loyalty.
 */
export async function validateSoldBy(
  tx: Tx,
  soldByType: SoldByType,
  soldByPersonId: string | null,
  /** A sale's Sold By, rather than a Hold's Sourced By (SSOT §26). */
  options: { sale?: boolean } = {}
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

  // SSOT §26 — a Sold By Customer is a real existing Customer: their own
  // approved, uncancelled personal purchase must exist. Being related to the
  // buyer, or a co-buyer on this Booking, does not disqualify them (SSOT §31).
  if (options.sale) {
    const ownPurchase = await tx.booking.count({
      where: {
        primaryPersonId: soldByPersonId,
        bookingNumber: { not: null },
        status: { notIn: ["CANCELLED", "REQUEST_REJECTED", "REQUEST_CANCELLED"] },
      },
    });
    if (ownPurchase === 0) {
      blocked("A Sold By Customer must be an existing Customer with their own approved purchase.");
    }

    // CP §17, §56.2; SSOT §26, §93 — the stricter closer rule: verified KYC and
    // accepted Customer Terms before they can be selected at all (UAT LOY-02,
    // LOY-03), and fewer than three consumed closing events (SSOT §27). A
    // request already sent when the third event qualifies is not blocked here;
    // its Loyalty is cancelled at qualification instead (UAT LOY-08).
    if (person.aadhaarStatus !== "VERIFIED") {
      blocked("A Sold By Customer needs verified KYC. Verify their Aadhaar on their Customer page first.");
    }
    const terms = await tx.customerTermsAcceptance.count({
      where: { customerProfile: { personId: soldByPersonId } },
    });
    if (terms === 0) {
      blocked("A Sold By Customer must have accepted Customer Terms. Record the acceptance on their Customer page first.");
    }
    if ((await consumedClosingEvents(tx, soldByPersonId)) >= CUSTOMER_CLOSING_LOYALTY_LIMIT) {
      blocked(
        "This Customer has already earned three Customer-closing Loyalty events, the lifetime limit. " +
          "Membership is required to earn from further third-party sales."
      );
    }
  }
}
