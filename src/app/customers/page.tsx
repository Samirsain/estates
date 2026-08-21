// Customers — DESIGN.md §12; main-PRD §6.
// The Customer ID is created at the first Booking Request (PRD §5.2), so this
// list is exactly the people who have reached that point.

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can, canViewField } from "@/lib/security/permissions";
import { maskAadhaar, maskMobile } from "@/lib/security/identity";
import { experienceSince } from "@/lib/domain/commission";
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
    select: { personId: true, booking: { select: { bookingDate: true } } },
  });

  const firstBooking = new Map<string, Date>();
  for (const party of parties) {
    const current = firstBooking.get(party.personId);
    if (!current || party.booking.bookingDate < current) {
      firstBooking.set(party.personId, party.booking.bookingDate);
    }
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
    aadhaarEnding: maskAadhaar(c.person.aadhaarLastFour),
    aadhaarStatus: c.person.aadhaarStatus,
    // PRD §14.2 — the visible status is Available or Not Available, not the value.
    panStatus: c.person.panStatus === "NOT_AVAILABLE" ? "PAN Not Available" : "PAN Available",
    introducedBy: c.originalIntroducedByMember
      ? `${c.originalIntroducedByMember.memberId} · ${c.originalIntroducedByMember.person.fullName}`
      : null,
    loyaltySlotsConsumed: c.loyaltySlotsConsumed,
    // Derived on every read, never stored (see experienceSince).
    experience: experienceSince(firstBooking.get(c.personId) ?? null)?.label ?? null,
  }));

  return (
    <CustomersClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      rows={rows}
      permissions={{
        viewFullAadhaar: canViewField(actor.role, "AADHAAR_FULL"),
        manageEnquiry: can(actor.role, "ENQUIRY_MANAGE"),
      }}
    />
  );
}
