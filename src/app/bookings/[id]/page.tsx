// One Booking, full page — everything the row used to unfold underneath itself,
// and every action that used to sit in the row (DESIGN.md §10).

import { notFound } from "next/navigation";
import { loadBookingsProps } from "../load";
import BookingsClient from "../bookings-client";

export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const props = await loadBookingsProps(null);
  if (!props.rows.some((r) => r.id === id)) notFound();

  return <BookingsClient {...props} focusId={id} />;
}
