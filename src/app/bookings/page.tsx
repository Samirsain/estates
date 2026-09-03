// Bookings — DESIGN.md §10, §11.

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
  searchParams: Promise<{ booking?: string }>;
}) {
  const [props, { booking }] = await Promise.all([loadBookingsProps(), searchParams]);

  // Only a Booking this actor can already see is focused. An id that is not in
  // their rows falls back to the plain list rather than revealing that it exists.
  const focusId = booking && props.rows.some((r) => r.id === booking) ? booking : null;

  return <BookingsClient {...props} focusId={focusId} />;
}
