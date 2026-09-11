// Bookings — design.md §10, §11.

import { loadBookingsProps } from "./load";
import BookingsClient from "./bookings-client";

export const dynamic = "force-dynamic";

/**
 * `?booking=<id>` opens that Booking straight away, so a link from the Plot it
 * belongs to lands on the Booking rather than on the top of the list. The
 * client already knew how to focus a row; nothing was ever passing it one.
 */
export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string; for?: string }>;
}) {
  const [props, { booking, for: startFor }] = await Promise.all([loadBookingsProps(), searchParams]);

  // Only a Booking this actor can already see is focused. An id that is not in
  // their rows falls back to the plain list rather than revealing that it exists.
  const focusId = booking && props.rows.some((r) => r.id === booking) ? booking : null;

  // ?for= comes from a Customer profile's Start Booking. Only a Person the form
  // can already offer is pre-chosen.
  const forId = startFor && props.people.some((p) => p.id === startFor) ? startFor : null;

  return <BookingsClient {...props} focusId={focusId} startFor={forId} />;
}
