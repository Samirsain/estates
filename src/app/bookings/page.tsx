// Bookings — DESIGN.md §10, §11.

import { loadBookingsProps } from "./load";
import BookingsClient from "./bookings-client";

export const dynamic = "force-dynamic";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ plot?: string }>;
}) {
  // Plot Inventory's Book button links here for one Plot. Without this it would
  // land on the Bookings list and leave finding that Plot again to whoever
  // followed it.
  const { plot } = await searchParams;
  const props = await loadBookingsProps(plot ?? null);

  return <BookingsClient {...props} focusId={null} />;
}
