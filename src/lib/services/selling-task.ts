// "Selling Buyback/Resale Plot" — raised when Payment Given is corrected below
// 20% while a buyer's Hold or Booking is live on the Plot. The owner asked for
// it to close by itself once that Hold or Booking ends (14 Oct 2026), so every
// path that ends one calls `closeSellingTasksIfClear`. Its own module, because
// the Hold, Booking, cancellation and Change Plot services all need it and
// acquisition-service already imports most of them.

import type { Tx } from "./command";
import { closeTasksFor } from "./task-service";

export const SELLING_TASK_PURPOSE = "MANAGEMENT_ACTION_REQUIRED";

/** Whether a buyer still has a live Hold or Booking on the Plot. */
export async function hasBuyerProcess(tx: Tx, plotId: string | null): Promise<boolean> {
  if (!plotId) return false;
  const [holds, bookings] = await Promise.all([
    tx.hold.count({ where: { plotId, status: "ACTIVE" } }),
    tx.booking.count({
      where: {
        plotId,
        status: { in: ["REQUEST_PENDING", "BOOKED", "PAYMENT_COMPLETED", "REFUND_PENDING", "DELIVERED"] },
      },
    }),
  ]);
  return holds + bookings > 0;
}

/** Closes the Plot's selling tasks once no buyer process is left on it. */
export async function closeSellingTasksIfClear(tx: Tx, plotId: string | null, actorRef: string) {
  if (!plotId || (await hasBuyerProcess(tx, plotId))) return 0;
  const deals = await tx.acquisition.findMany({ where: { plotId }, select: { id: true } });
  let closed = 0;
  for (const deal of deals) {
    closed += await closeTasksFor(tx, "Acquisition", deal.id, actorRef, "The Hold or Booking on this Plot has ended.", SELLING_TASK_PURPOSE);
  }
  return closed;
}
