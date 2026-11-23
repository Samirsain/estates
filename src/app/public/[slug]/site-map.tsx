"use client";

// The Project's site plan with every Plot in its status colour, the way a
// cinema shows its seats (owner, 30 Oct 2026). Drawn from lib/project-layouts:
// each Plot is its real width × depth at the plan's scale. A Plot the portal
// does not show (Not Available, Not for Sale, Pledge) stays an empty outline,
// so the plan is whole without a fourth colour.
//
// On a phone the plan opens zoomed in and slides sideways inside its own frame;
// the page itself never scrolls sideways. The frame grows to the plan's height,
// so it never scrolls up and down inside the page, and on a touch screen it
// draws no scrollbar — the finger moves it (owner, 31 Oct 2026).

import React from "react";
import { Minus, Plus } from "lucide-react";
import type { SiteLayout } from "@/lib/project-layouts";
import { PUBLIC_STATUS_LABEL, type PublicPlotStatus } from "@/lib/domain/public-portal";
import type { PublicPlot } from "./portal-client";

/** The tiles' three colours, as SVG fills; the number in the same dark inks as the tiles. */
const FILL: Record<PublicPlotStatus, { shape: string; text: string }> = {
  AVAILABLE: { shape: "fill-emerald-500 stroke-emerald-700", text: "fill-emerald-950" },
  HOLD: { shape: "fill-amber-400 stroke-amber-600", text: "fill-amber-950" },
  SOLD: { shape: "fill-red-500 stroke-red-700", text: "fill-[#2a0505]" },
};

const ZOOMS = [1, 1.6, 2.2, 3, 4];
const PHONE_ZOOM = 3;

const points = (list: number[][]) => list.map((p) => p.join(",")).join(" ");

export default function SiteMap({
  layout,
  plots,
  isDimmed,
  ringedId,
  changed,
  onSelect,
}: {
  layout: SiteLayout;
  plots: PublicPlot[];
  isDimmed: (plot: PublicPlot) => boolean;
  ringedId: string | null;
  /** Plots whose status just changed on the live refresh; each turns over once. */
  changed: ReadonlySet<string>;
  onSelect: (id: string) => void;
}) {
  const byNumber = React.useMemo(() => new Map(plots.map((p) => [p.number, p])), [plots]);
  const frame = React.useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = React.useState(1);

  // A phone opens the plan large enough to read a number and tap a 15 ft shop,
  // scrolled to its middle, where most of the Plots are — or to the ringed
  // Plot, when the plan was opened by "Show on site plan" or a search.
  const centre = React.useRef(false);
  const ringed = React.useRef(ringedId);
  ringed.current = ringedId;
  React.useEffect(() => {
    if (!window.matchMedia("(max-width: 640px)").matches) return;
    centre.current = true;
    setZoom(PHONE_ZOOM);
  }, []);
  // After that zoom has been laid out, never before: the frame must be wide first.
  React.useLayoutEffect(() => {
    const el = frame.current;
    if (!centre.current || !el) return;
    centre.current = false;
    const target = ringed.current ? document.getElementById(`plan-${ringed.current}`) : null;
    if (target) target.scrollIntoView({ block: "center", inline: "center" });
    else el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [zoom]);

  /** Zooms about the middle of what is in view, so the Plot being looked at stays put. */
  const zoomTo = (next: number) => {
    const el = frame.current;
    if (!el) return setZoom(next);
    const cx = (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth;
    const cy = (el.scrollTop + el.clientHeight / 2) / el.scrollHeight;
    setZoom(next);
    requestAnimationFrame(() => {
      el.scrollLeft = cx * el.scrollWidth - el.clientWidth / 2;
      el.scrollTop = cy * el.scrollHeight - el.clientHeight / 2;
    });
  };
  const step = (dir: 1 | -1) => {
    const i = ZOOMS.findIndex((z) => z >= zoom);
    zoomTo(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i === -1 ? ZOOMS.length - 1 : i) + dir))]);
  };

  // No fade on the plan's edges (owner, 31 Oct 2026): the Plots cut off at
  // the frame's edge are the sign there is more plan to slide to.

  const [vx, vy, vw, vh] = layout.viewBox;
  const bar = 50 * layout.scale;

  return (
    <figure className="overflow-hidden rounded-2xl border border-border/70 bg-white">
      {/* The plan's own bar: what to do, and zoom. Above the plan rather than
          floating on it, so the controls never cover a Plot (at Fit nothing can
          be scrolled out from under them), and a phone sees them at once. */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-card py-1 pl-3.5 pr-1">
        <figcaption className="text-[11px] text-muted-foreground">Tap a Plot for its size and facing</figcaption>
        <div role="group" aria-label="Zoom" className="flex shrink-0 items-center gap-0.5">
          <ZoomButton label="Zoom out" disabled={zoom <= ZOOMS[0]} onClick={() => step(-1)}>
            <Minus className="h-4 w-4" />
          </ZoomButton>
          <button
            type="button"
            onClick={() => zoomTo(1)}
            className="h-9 rounded-full px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Fit
          </button>
          <ZoomButton label="Zoom in" disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => step(1)}>
            <Plus className="h-4 w-4" />
          </ZoomButton>
        </div>
      </div>
      <div
        ref={frame}
        className="overflow-x-auto overflow-y-hidden overscroll-x-contain [@media(pointer:coarse)]:[scrollbar-width:none] [@media(pointer:coarse)]:[&::-webkit-scrollbar]:hidden"
      >
        <div style={{ width: `${zoom * 100}%` }}>
          <svg
            viewBox={`${vx} ${vy} ${vw} ${vh}`}
            className="block h-auto w-full select-none"
            role="group"
            aria-label="Site plan, drawn to scale"
          >
            {layout.roads.map((road) => (
              <g key={`${road.label}-${road.x}-${road.y}`}>
                <polygon points={points(road.points)} className="fill-stone-300" />
                <text
                  x={road.x}
                  y={road.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={road.rotate ? `rotate(${road.rotate} ${road.x} ${road.y})` : undefined}
                  className="fill-white text-[13px] font-semibold tracking-wider"
                >
                  {road.label}
                </text>
              </g>
            ))}

            {layout.notes?.map((note) => (
              <text
                key={note.text}
                x={note.x}
                y={note.y}
                textAnchor="middle"
                dominantBaseline="central"
                transform={note.rotate ? `rotate(${note.rotate} ${note.x} ${note.y})` : undefined}
                className="fill-white text-[12px] font-medium tracking-wider"
              >
                {note.text}
              </text>
            ))}

            {layout.areas.map((area) => (
              <g key={area.label}>
                <rect
                  x={area.x}
                  y={area.y}
                  width={area.w}
                  height={area.h}
                  className={area.kind === "park" ? "fill-emerald-100 stroke-emerald-400" : "fill-stone-100 stroke-stone-300"}
                  strokeWidth={1.5}
                />
                <text
                  // A narrow strip reads its label sideways, centred; Path & Parking
                  // keeps its label clear of the kiosks on its right.
                  x={area.rotate || area.kind === "park" ? area.x + area.w / 2 : area.x + (area.w - 16 * layout.scale) / 2}
                  y={area.rotate || area.kind === "park" ? area.y + area.h / 2 : area.y + 22}
                  transform={area.rotate ? `rotate(${area.rotate} ${area.x + area.w / 2} ${area.y + area.h / 2})` : undefined}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={`${area.rotate ? "text-[11px]" : "text-[13px]"} font-semibold tracking-wide ${area.kind === "park" ? "fill-emerald-900" : "fill-stone-600"}`}
                >
                  {area.label}
                </text>
              </g>
            ))}

            {layout.plots.map((shape) => {
              const plot = byNumber.get(shape.number);
              const label = shape.small ? shape.number.replace("-", "") : shape.number;
              const size = shape.small ? 9 : 14;
              if (!plot) {
                // Not on sale, so not on the portal: the plan keeps its outline.
                return (
                  <g key={shape.number} aria-hidden="true">
                    <polygon points={points(shape.points)} className="fill-white stroke-stone-300" strokeWidth={1.2} />
                    <text
                      x={shape.x}
                      y={shape.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={size}
                      className="pointer-events-none fill-stone-400 font-semibold tabular-nums"
                    >
                      {label}
                    </text>
                  </g>
                );
              }
              const ringed = ringedId === plot.id;
              return (
                <g
                  key={shape.number}
                  id={`plan-${plot.id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Plot ${plot.number}, ${PUBLIC_STATUS_LABEL[plot.status]}`}
                  onClick={() => onSelect(plot.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(plot.id);
                    }
                  }}
                  className={`origin-center cursor-pointer outline-none transition-opacity [transform-box:fill-box] hover:brightness-95 focus-visible:[&>polygon]:stroke-slate-900 focus-visible:[&>polygon]:[stroke-width:3.5] ${
                    isDimmed(plot) ? "opacity-20" : ""
                  } ${changed.has(plot.id) ? "motion-safe:animate-plot-flip" : ""}`}
                >
                  <polygon
                    points={points(shape.points)}
                    className={`${FILL[plot.status].shape} transition-colors ${ringed ? "!stroke-slate-900" : ""}`}
                    strokeWidth={ringed ? 3.5 : 1.2}
                  />
                  <text
                    x={shape.x}
                    y={shape.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={size}
                    className={`pointer-events-none font-bold tabular-nums ${FILL[plot.status].text}`}
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {/* 50 ft at the plan's own scale, and which way is up. */}
            <g className="fill-stone-600 text-[11px]">
              <rect x={vx + 24} y={vy + vh - 26} width={bar} height={4} />
              <text x={vx + 24} y={vy + vh - 32}>0</text>
              <text x={vx + 24 + bar} y={vy + vh - 32} textAnchor="end">50 ft</text>
              <text x={vx + 24} y={vy + vh - 8}>North is up</text>
            </g>
          </svg>
        </div>
      </div>
    </figure>
  );
}

function ZoomButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
    >
      {children}
    </button>
  );
}
