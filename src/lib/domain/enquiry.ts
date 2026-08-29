// Enquiry attribution — PRD.md §6.4, §7; DESIGN.md §8.

/** main-PRD §9.2 — the six ways an Enquiry arrives. */
export type EnquirySource =
  | "ONLINE"
  | "SITE_VISIT"
  | "BY_MEMBER"
  | "BY_CUSTOMER"
  | "EXISTING_CUSTOMER"
  | "DIRECT";

export type EnquiryClaim = {
  enquiryId: string;
  memberId: string;
  /** Submission instant of the Member-sourced Enquiry. */
  at: Date;
};

/**
 * PRD §6.4 — Original Introduced By Member freezes at the earliest valid
 * Member-sourced Enquiry for that Person. Later duplicate Enquiries never
 * overwrite it. Exact-timestamp ties go to the lower Enquiry ID unless
 * Admin/MD resolves a documented dispute.
 */
export function resolveOriginalIntroducer(
  existingMemberId: string | null,
  claims: readonly EnquiryClaim[]
): { memberId: string | null; frozen: boolean } {
  if (existingMemberId) return { memberId: existingMemberId, frozen: true };
  if (claims.length === 0) return { memberId: null, frozen: false };

  const winner = [...claims].sort(
    (a, b) => a.at.getTime() - b.at.getTime() || (a.enquiryId < b.enquiryId ? -1 : 1)
  )[0];
  return { memberId: winner.memberId, frozen: false };
}

/** A correction is an Admin/MD action with a compulsory reason (PRD §6.4). */
export function assertIntroducerCorrectionAllowed(role: string, reason: string): void {
  if (role !== "ADMIN" && role !== "MD") {
    throw new Error("Only Admin or MD may correct Original Introduced By Member.");
  }
  if (!reason.trim()) {
    throw new Error("A compulsory reason is required to correct Original Introduced By Member.");
  }
}

/** DESIGN §8.2 — Source Person is required for By Member and By Customer. */
export function validateSource(
  source: EnquirySource,
  sourceMemberId: string | null,
  sourceCustomerId: string | null
): string | null {
  if (source === "BY_MEMBER" && !sourceMemberId) return "Select the Member who sourced this Enquiry.";
  if (source === "BY_CUSTOMER" && !sourceCustomerId) return "Select the Customer who sourced this Enquiry.";
  if (source !== "BY_MEMBER" && sourceMemberId) return "Source Member applies only to a By Member Enquiry.";
  if (source !== "BY_CUSTOMER" && sourceCustomerId) return "Source Customer applies only to a By Customer Enquiry.";
  return null;
}

/**
 * PRD §7.1 — Plot-wise Enquiries stay separate records. Active duplicates are
 * one per Person + Project + Plot, and one general Enquiry per Person + Project.
 */
export function duplicateKey(personId: string, projectId: string, plotId: string | null): string {
  return `${personId}|${projectId}|${plotId ?? "GENERAL"}`;
}

/**
 * PRD §7.2 — an Enquiry must never remain Booked when its only approved
 * Booking is cancelled; it returns to Active unless CRM closed it separately.
 */
export function enquiryStatusAfterBookingCancelled(
  current: "ACTIVE" | "BOOKED" | "CLOSED"
): "ACTIVE" | "CLOSED" {
  return current === "CLOSED" ? "CLOSED" : "ACTIVE";
}
