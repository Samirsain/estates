// Enquiry attribution — PRD.md §6.4, §7; DESIGN.md §8.

/** main-PRD §9.2 — the six ways an Enquiry arrives. */
export type EnquirySource =
  | "ONLINE"
  | "SITE_VISIT"
  | "BY_MEMBER"
  | "BY_CUSTOMER"
  | "EXISTING_CUSTOMER"
  | "DIRECT";

/**
 * CR-001 — Enquiry Source is history and follow-up only. It decides no Direct,
 * Invite, Royalty or Loyalty, so there is no claim to resolve and no
 * Original Introduced By Member to freeze. Royalty ownership now comes from the
 * Sold By Member of the Customer's first qualifying purchase
 * (`syncRoyaltyLink`).
 */

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
