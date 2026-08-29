// Customers — DESIGN.md §12; main-PRD §6.
// The Customer ID is created at the first Booking Request (PRD §5.2), so this
// list is exactly the people who have reached that point.

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { maskMobile } from "@/lib/security/identity";
import CustomersClient, { type CustomerRowView } from "./customers-client";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const actor = await requireStaff();

  const customers = await db.customerProfile.findMany({
    include: {
      person: true,
      originalIntroducedByMember: { include: { person: true } },
    },
    orderBy: { customerId: "asc" },
    take: 300,
  });

  /*
   * How long each Customer has been one, counted from their first approved
   * Booking — the moment the relationship actually began. A Booking that was
   * later cancelled still counts: it happened.
   *
   * Read as one query over the listed people rather than one per row, and
   * through BookingParty so an Additional Customer counts as a buyer too, not
   * only the Primary Customer.
   */
  const parties = await db.bookingParty.findMany({
    where: {
      personId: { in: customers.map((c) => c.personId) },
      kind: "COMMERCIAL",
      booking: { bookingNumber: { not: null } },
    },
    select: {
      personId: true,
      booking: {
        select: {
          bookingDate: true,
          // Two Bookings can share a date, so the later submission breaks the
          // tie and the Project column names one deal, not whichever row the
          // database happened to return first.
          submittedAt: true,
          project: { select: { name: true } },
          plot: {
            select: { plotNumber: true, plotType: true },
          },
        },
      },
    },
  });

  // What they actually bought, newest first, and how much else there is.
  /** Their most recent deal — a Customer who bought in two Projects shows that one. */
  const latest = new Map<string, (typeof parties)[number]["booking"]>();
  const bookingCount = new Map<string, number>();
  for (const party of parties) {
    const newest = latest.get(party.personId);
    const isNewer =
      !newest ||
      party.booking.bookingDate > newest.bookingDate ||
      (party.booking.bookingDate.getTime() === newest.bookingDate.getTime() &&
        party.booking.submittedAt > newest.submittedAt);
    if (isNewer) latest.set(party.personId, party.booking);
    bookingCount.set(party.personId, (bookingCount.get(party.personId) ?? 0) + 1);
  }

  const rows: CustomerRowView[] = customers.map((c) => ({
    id: c.id,
    personId: c.personId,
    customerId: c.customerId,
    name: c.person.fullName,
    // The main list never shows full private details (main-PRD §6.1).
    mobileMasked: maskMobile(c.person.primaryMobile),
    city: c.person.city ?? "—",
    customerType: c.customerType,
    project: latest.get(c.personId)?.project.name ?? null,
    plotNumber: latest.get(c.personId)?.plot.plotNumber ?? null,
    plotType: latest.get(c.personId)?.plot.plotType.replaceAll("_", " ") ?? null,
    otherBookings: Math.max((bookingCount.get(c.personId) ?? 0) - 1, 0),
    // The Member ID is what the introduction is filed under; the name is on
    // the Customer's own page.
    introducedBy: c.originalIntroducedByMember?.memberId ?? null,
    introducedByMemberId: c.originalIntroducedByMemberId,
    loyaltySlotsConsumed: c.loyaltySlotsConsumed,
  }));

  return (
    <CustomersClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      rows={rows}
    />
  );
}
