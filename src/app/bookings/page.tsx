// Bookings — DESIGN.md §10, §11.

import { loadBookingsProps } from "./load";
import BookingsClient from "./bookings-client";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const props = await loadBookingsProps();

  return <BookingsClient {...props} focusId={null} />;
}
