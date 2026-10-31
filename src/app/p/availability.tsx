// The portal's three colours and its one signature: the availability bar, a
// strip split green / amber / red in proportion to a Project's Plots. Small
// under each Project in the strip, full width over the counts on its page.
// No hooks, so the server pages and the client half both render it.

import { PUBLIC_STATUS_LABEL, type PublicPlotStatus } from "@/lib/domain/public-portal";

export const STATUSES: PublicPlotStatus[] = ["AVAILABLE", "HOLD", "SOLD"];

/**
 * Green, amber, red, and nothing else. A Plot's number is printed in dark ink
 * on every fill: white measured 2.5:1 on the green and 3.8:1 on the red, under
 * the 4.5:1 a 14px number needs; the dark inks clear it on all three.
 */
export const TONE: Record<
  PublicPlotStatus,
  { dot: string; bar: string; tile: string; pressed: string; badge: "success" | "warning" | "destructive" }
> = {
  AVAILABLE: {
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    tile: "border-emerald-600 bg-emerald-500 text-emerald-950",
    pressed: "bg-emerald-50 shadow-[inset_0_-3px_0_0_#059669]",
    badge: "success",
  },
  HOLD: {
    dot: "bg-amber-400",
    bar: "bg-amber-400",
    tile: "border-amber-500 bg-amber-400 text-amber-950",
    pressed: "bg-amber-50 shadow-[inset_0_-3px_0_0_#f59e0b]",
    badge: "warning",
  },
  SOLD: {
    dot: "bg-red-500",
    bar: "bg-red-500",
    // red-950 reaches only 4.3:1 on red-500; this deeper red reaches 5.0:1.
    tile: "border-red-600 bg-red-500 text-[#2a0505]",
    pressed: "bg-red-50 shadow-[inset_0_-3px_0_0_#dc2626]",
    badge: "destructive",
  },
};

export const plotTotal = (tally: Record<PublicPlotStatus, number>) => tally.AVAILABLE + tally.HOLD + tally.SOLD;

/**
 * What a Project with no Plot on the portal says, worded once for the list,
 * the strip and its own page. It promises nothing: a Sold Out Project says so.
 */
export const noPlotsLine = (projectStatus: string) =>
  projectStatus === "SOLD_OUT" ? "Sold Out" : "No Plots on the portal";

export function AvailabilityBar({
  tally,
  focus = null,
  className = "h-1.5",
}: {
  tally: Record<PublicPlotStatus, number>;
  /** One status picked out; the other two fade. */
  focus?: PublicPlotStatus | null;
  className?: string;
}) {
  const total = plotTotal(tally);
  return (
    <div
      role="img"
      aria-label={
        total === 0
          ? "No Plots on sale"
          : STATUSES.map((s) => `${tally[s]} ${PUBLIC_STATUS_LABEL[s]}`).join(", ")
      }
      className={`flex w-full gap-0.5 overflow-hidden rounded-full ${total === 0 ? "bg-secondary" : ""} ${className}`}
    >
      {STATUSES.map((status) =>
        tally[status] > 0 ? (
          <span
            key={status}
            className={`h-full rounded-full transition-opacity duration-300 ${TONE[status].bar} ${
              focus && focus !== status ? "opacity-20" : ""
            }`}
            style={{ flexGrow: tally[status], flexBasis: 0 }}
          />
        ) : null
      )}
    </div>
  );
}
