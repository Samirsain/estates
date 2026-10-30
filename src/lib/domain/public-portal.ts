// Public Project Portal (owner, 29 Oct 2026) — what a visitor with the link may
// see. Pure: the page reads the database, this decides what it says.

/**
 * The link's last part, from the Project's name: "Govind Vatika" → "govind-vatika".
 * Worked out each time rather than stored, so renaming the Project renames the
 * link — the Project page always shows the current one.
 */
export function projectSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The three, and only three, things a visitor is told about a Plot. */
export type PublicPlotStatus = "AVAILABLE" | "HOLD" | "SOLD";

export const PUBLIC_STATUS_LABEL: Record<PublicPlotStatus, string> = {
  AVAILABLE: "Available",
  HOLD: "Hold",
  SOLD: "Sold / Booked",
};

/**
 * The CRM's eight Plot statuses folded into the portal's three. A Booking
 * Request waiting on Accounts still holds the Plot, so it reads Hold; a
 * cancelled Booking waiting on its refund has not given the Plot back yet, so
 * it reads Sold / Booked. null means the Plot is not on sale at all — Not
 * Available, Not Yet Released, Not for Sale, Pledge — and the portal leaves it
 * out rather than inventing a fourth colour for it.
 */
export function publicPlotStatus(status: string, restriction: string): PublicPlotStatus | null {
  if (status === "AVAILABLE") return restriction === "NONE" ? "AVAILABLE" : null;
  if (status === "HOLD" || status === "WAITING_FOR_BOOKING_APPROVAL") return "HOLD";
  if (status === "BOOKED" || status === "PAYMENT_COMPLETED" || status === "DELIVERED" || status === "REFUND_PENDING") {
    return "SOLD";
  }
  return null;
}
