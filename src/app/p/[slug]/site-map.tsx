"use client";

// The Project's site plan with every Plot in its status colour, the way a
// cinema shows its seats (owner, 30 Oct 2026). Drawn from lib/project-layouts:
// each Plot is its real width × depth at the plan's scale. A Plot the portal
// does not show (Not Available, Not for Sale, Pledge) stays an empty outline,
// so the plan is whole without a fourth colour.
//
// On a phone the plan opens zoomed in and scrolls inside its own frame; the
// page itself never scrolls sideways.

import React from "react";
import { Minus, Plus } from "lucide-react";
import type { SiteLayout } from "@/lib/project-layouts";
import { PUBLIC_STATUS_LABEL, type PublicPlotStatus } from "@/lib/domain/public-portal";
import type { PublicPlot } from "./portal-client";

/** The tiles' three colours, as SVG fills; the number is white on green and red, dark on amber. */
const FILL: Record<PublicPlotStatus, { shape: string; text: string }> = {
  AVAILABLE: { shape: "fill-emerald-500 stroke-emerald-700", text: "fill-white" },
  HOLD: { shape: "fill-amber-400 stroke-amber-600", text: "fill-amber-950" },
  SOLD: { shape: "fill-red-500 stroke-red-700", text: "fill-white" },
};

const ZOOMS = [1, 1.6, 2.2, 3, 4];
const PHONE_ZOOM = 3;

const points = (list: number[][]) => list.map((p) => p.join(",")).join(" ");

export default function SiteMap({
  layout,
  plots,
  isDimmed,
  ringedId,
  onSelect,
}: {
  layout: SiteLayout;
  plots: PublicPlot[];
  isDimmed: (plot: PublicPlot) => boolean;
  ringedId: string | null;
  onSelect: (id: string) => void;
}) {
  const byNumber = React.useMemo(() => new Map(plots.map((p) => [p.number, p])), [plots]);
  const frame = React.useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = React.useState(1);

  // A phone opens the plan large enough to read a number and tap a 15 ft shop,
  // scrolled to its middle, where most of the Plots are.
  const centre = React.useRef(false);
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
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
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

  const [vx, vy, vw, vh] = layout.viewBox;
  const bar = 50 * layout.scale;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">Tap a Plot for its details · drawn to scale</p>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <ZoomButton label="Zoom out" disabled={zoom <= ZOOMS[0]} onClick={() => step(-1)}>
            <Minus className="h-3.5 w-3.5" />
          </ZoomButton>
          <button
            type="button"
            onClick={() => zoomTo(1)}
            className="h-8 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Fit
          </button>
          <ZoomButton label="Zoom in" disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => step(1)}>
            <Plus className="h-3.5 w-3.5" />
          </ZoomButton>
        </div>
      </div>

      <div
        ref={frame}
        className="max-h-[70vh] overflow-auto overscroll-contain rounded-xl border border-border/70 bg-white"
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
                      className="pointer-events-none fill-stone-400 font-mono font-semibold"
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
                  className={`cursor-pointer outline-none transition-opacity hover:brightness-95 focus-visible:[&>polygon]:stroke-slate-900 focus-visible:[&>polygon]:[stroke-width:3.5] ${
                    isDimmed(plot) ? "opacity-20" : ""
                  }`}
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
                    className={`pointer-events-none font-mono font-bold ${FILL[plot.status].text}`}
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
    </div>
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
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  );
}
