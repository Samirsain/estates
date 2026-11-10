// Which reports the From / To dates apply to — read by the report service and
// by the Reports screen, so the screen never offers a filter the report ignores
// and the export log never records one as applied. Every report takes Project.

import type { ReportName } from "@/lib/services/report-service";

export const REPORT_TAKES_DATES: Record<ReportName, boolean> = {
  BOOKINGS: true,
  PAYMENTS_RECEIVED: true,
  PAYMENTS_GIVEN: true,
  COMMISSION: true,
  LOYALTY: true,
  COMPLETIONS: true,
  // Standing positions, not events in a period.
  INVENTORY: false,
  ROYALTY: false,
  TRIP: false,
  REFERENCE: false,
};
