// Customers — design.md §12; prd-complete §6.
// The Customer ID is created at the first Hold, or at the first Booking Request
// when no Hold came before it (PRD §5.2), so this list is exactly the people
// who have reached that point.

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { maskMobile } from "@/lib/security/identity";
import { canViewField } from "@/lib/security/permissions";
import { closingLoyaltyUsed } from "@/lib/services/commission-service";
import CustomersClient, { type CustomerRowView } from "./customers-client";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const actor = await requireStaff();

  const customers = await db.customerProfile.findMany({
    include: {
      person: true,
      royaltyLinkedMember: { include: { person: true } },
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
   * only the Primary Customer. It and the Loyalty count need only the
   * listed people, so the two load together.
   */
  const personIds = customers.map((c) => c.personId);
  const [parties, closing] = await Promise.all([
    db.bookingParty.findMany({
      where: {
        personId: { in: personIds },
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
              select: { id: true, plotNumber: true, plotType: true },
            },
          },
        },
      },
    }),
    // v2.1 §21 — Customer-closing Loyalty used, of the lifetime three.
    closingLoyaltyUsed(personIds),
  ]);

  // What they actually bought, newest first, and how much else there is.
  /** Their most recent deal — a Customer who bought in two Projects shows that one. */
  const latest = new Map<string, (typeof parties)[number]["booking"]>();
  const allDeals = new Map<string, (typeof parties)[number]["booking"][]>();
  for (const party of parties) {
    const newest = latest.get(party.personId);
    const isNewer =
      !newest ||
      party.booking.bookingDate > newest.bookingDate ||
      (party.booking.bookingDate.getTime() === newest.bookingDate.getTime() &&
        party.booking.submittedAt > newest.submittedAt);
    if (isNewer) latest.set(party.personId, party.booking);
    allDeals.set(party.personId, [...(allDeals.get(party.personId) ?? []), party.booking]);
  }

  const rows: CustomerRowView[] = customers.map((c) => ({
    id: c.id,
    personId: c.personId,
    customerId: c.customerId,
    name: c.person.fullName,
    // The list is masked for everyone whose work does not need the number;
    // MD and Admin read it whole (prd-complete §6.1).
    mobileMasked: canViewField(actor.role, "MOBILE_FULL")
      ? c.person.primaryMobile
      : maskMobile(c.person.primaryMobile),
    city: c.person.city ?? "—",
    project: latest.get(c.personId)?.project.name ?? null,
    plotNumber: latest.get(c.personId)?.plot.plotNumber ?? null,
    plotType: latest.get(c.personId)?.plot.plotType.replaceAll("_", " ") ?? null,
    plotId: latest.get(c.personId)?.plot.id ?? null,
    // Every deal but the one the row shows, read on hover over "+N more booked".
    otherBookings: (allDeals.get(c.personId) ?? [])
      .filter((b) => b !== latest.get(c.personId))
      .map((b) => `${b.project.name} · Plot ${b.plot.plotNumber}`),
    closingLoyaltyUsed: closing.get(c.personId) ?? 0,
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
