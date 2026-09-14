// One Booking, full page — everything the row used to unfold underneath itself,
// and every action that used to sit in the row (design.md §10).

import { notFound } from "next/navigation";
import { loadBookingsProps } from "../load";
import BookingsClient from "../bookings-client";

export const dynamic = "force-dynamic";

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** ?open=CANCEL | CHANGE_PLOT from the Plot's page starts that action here. */
  searchParams: Promise<{ open?: string }>;
}) {
  const [{ id }, { open }] = await Promise.all([params, searchParams]);
  const props = await loadBookingsProps();
  if (!props.rows.some((r) => r.id === id)) notFound();

  return <BookingsClient {...props} focusId={id} initialOpen={open ?? null} />;
}
