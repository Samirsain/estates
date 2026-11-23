// Delete Plot is refused while anything links to the Plot, and says what.
// Run: node --import ./prisma/alias-loader.mjs src/lib/services/plot-delete.check.ts
import assert from "node:assert/strict";
import type { Tx } from "./command.ts";
import { plotDeleteBlocker } from "./inventory-service.ts";

const none = { holds: 0, holdRequests: 0, bookings: 0, acquisitions: 0, changePlotFrom: 0, changePlotTo: 0, plcSnapshots: 0, enquiries: 0, tasks: 0 };
const client = (count: Partial<typeof none> | null) =>
  ({ plot: { findUnique: async () => (count ? { _count: { ...none, ...count } } : null) } }) as unknown as Tx;

assert.equal(await plotDeleteBlocker(client({}), "p"), null, "an unused Plot may go");
assert.equal(await plotDeleteBlocker(client(null), "p"), null, "a missing Plot is the caller's 404");
assert.equal(
  await plotDeleteBlocker(client({ bookings: 1, tasks: 2 }), "p"),
  "Cannot delete: this Plot has 1 Booking, 2 Tasks linked to it."
);
assert.match((await plotDeleteBlocker(client({ enquiries: 1 }), "p"))!, /1 Enquiry/);

console.log("plot-delete.check: ok");
