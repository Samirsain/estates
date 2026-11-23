"use client";

// The Public Project Portal's working half (owner, 29 Oct 2026; laid out for a
// phone 31 Oct 2026): the availability bar over three counts that are also the
// filter, Search Plot, every Plot in its status
// colour, and the picked Plot's details in a sheet from the bottom edge.
//
// A Project with a traced site plan (lib/project-layouts) opens on that plan;
// List shows the tiles, and a tile's details can jump to its place on the plan.
// Without one the tiles are all there is: plot-number order, a section per
// Plot type. The CRM stores no price or description for a Plot, so the details
// are what it does hold: size, area and facing.
//
// The page refreshes itself every two seconds; a Plot whose status changed on
// a refresh turns over once, so the change is seen rather than missed.

import React from "react";
import { ExternalLink, MapPinned, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PlotShape, type PlotSides } from "@/components/plot-shape";
import { PUBLIC_STATUS_LABEL, type PublicPlotStatus } from "@/lib/domain/public-portal";
import type { SiteLayout } from "@/lib/project-layouts";
import type { ProjectLayoutDocument } from "@/lib/project-documents";
import { AvailabilityBar, STATUSES, TONE } from "../availability";
import SiteMap from "./site-map";
import LayoutDocumentPreview from "./layout-document-preview";

export type PublicPlot = {
  id: string;
  number: string;
  type: string;
  status: PublicPlotStatus;
  size: string | null;
  area: string[];
  facing: string[];
  /** Sides and what each abuts, for the drawing; null for an irregular Plot. */
  shape: { widthFt: string; lengthFt: string; sides: PlotSides } | null;
};

const TYPE_ORDER = ["Residential", "Commercial", "Informal Sector"];
const typeRank = (type: string) => (TYPE_ORDER.includes(type) ? TYPE_ORDER.indexOf(type) : TYPE_ORDER.length);

/** "p 105", "P-105" and "p105" are the same Plot to someone typing on a phone. */
const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

export default function PublicPortalClient({
  projectName,
  plots,
  layout,
  layoutUrl,
  layoutDocument,
  noPlots,
}: {
  projectName: string;
  plots: PublicPlot[];
  layout: SiteLayout | null;
  /** The Project's own Layout link, offered under the tiles when no plan is traced. */
  layoutUrl: string | null;
  layoutDocument?: ProjectLayoutDocument | null;
  /** What to say when no Plot of this Project is on the portal. */
  noPlots: string;
}) {
  const [filter, setFilter] = React.useState<PublicPlotStatus | null>(null);
  const [query, setQuery] = React.useState("");
  // Held by id, not by value: when the page refreshes itself the open Plot
  // shows its new status rather than the one it had when it was opened.
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = plots.find((p) => p.id === selectedId) ?? null;
  // A Plot sent to the plan from its details, ringed there like a search hit.
  const [pinnedId, setPinnedId] = React.useState<string | null>(null);

  const tally = { AVAILABLE: 0, HOLD: 0, SOLD: 0 };
  for (const plot of plots) tally[plot.status] += 1;

  const wanted = plain(query);
  const matches = (plot: PublicPlot) => !wanted || plain(plot.number).includes(wanted);
  // An exact number is the Plot being asked for: it is ringed and brought into view.
  const exact = wanted ? plots.find((p) => plain(p.number) === wanted) ?? null : null;
  const ringedId = exact?.id ?? pinnedId;

  // The list is on top and the plan under it (owner, 23 Nov 2026: no toggle).
  // A number typed finds its tile; "Show on plan" goes down to it on the plan.
  const exactId = exact?.id ?? null;
  React.useEffect(() => {
    if (exactId) document.getElementById(`plot-${exactId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [exactId]);
  React.useEffect(() => {
    if (pinnedId) document.getElementById(`plan-${pinnedId}`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [pinnedId]);

  // Which Plots changed status since the last refresh; they turn over once.
  const seen = React.useRef(new Map<string, PublicPlotStatus>());
  const [changed, setChanged] = React.useState<ReadonlySet<string>>(new Set());
  React.useEffect(() => {
    const turned = new Set<string>();
    for (const plot of plots) {
      const before = seen.current.get(plot.id);
      if (before && before !== plot.status) turned.add(plot.id);
      seen.current.set(plot.id, plot.status);
    }
    if (turned.size > 0) setChanged(turned);
  }, [plots]);
  React.useEffect(() => {
    if (changed.size === 0) return;
    const timer = setTimeout(() => setChanged(new Set()), 900);
    return () => clearTimeout(timer);
  }, [changed]);

  const visible = plots.filter((p) => !filter || p.status === filter);
  // Residential first, as Plot Inventory lists them, whatever the numbers sort to.
  const types = [...new Set(visible.map((p) => p.type))].sort((a, b) => typeRank(a) - typeRank(b));

  return (
    <div className={`space-y-4 ${selected ? "pb-[22rem]" : ""}`}>
      {/* The bar and the counts are one control: how much is free, and the
          filter. A count pressed shows only its Plots; pressed again, all. */}
      {plots.length > 0 && (
        <section aria-label="Availability" className="space-y-1.5">
          <div className="flex min-h-5 items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>
              <span className="font-bold tabular-nums text-foreground">{plots.length}</span> Plots
              {filter && <> · showing {PUBLIC_STATUS_LABEL[filter]}</>}
            </p>
            {filter && (
              <button
                type="button"
                onClick={() => setFilter(null)}
                className="-my-2 rounded-full px-2 py-2 font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Show all
              </button>
            )}
          </div>
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
            <AvailabilityBar tally={tally} focus={filter} className="h-1.5 rounded-none" />
            <div role="group" aria-label="Show only" className="grid grid-cols-3 divide-x divide-border/70">
              {STATUSES.map((status) => {
                const on = filter === status;
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(on ? null : status)}
                    // Number over label on a phone, the three alike ("Sold /
                    // Booked" does not fit beside its number there); one line from sm.
                    className={`flex min-h-12 flex-col items-start justify-center gap-1 px-3 py-2 text-left text-xs font-medium text-foreground transition-colors focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-start sm:gap-1.5 sm:px-3.5 ${
                      on ? TONE[status].pressed : "hover:bg-secondary/70"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${TONE[status].dot}`} />
                      <span className="text-base font-bold leading-none tabular-nums">{tally[status]}</span>
                    </span>
                    <span className="leading-tight">{PUBLIC_STATUS_LABEL[status]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Search Plot — only when there is a Plot to find. */}
      <div className={`flex gap-2 ${plots.length === 0 ? "hidden" : ""}`}>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search plot number</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPinnedId(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const first = exact ?? plots.find(matches);
              if (first) setSelectedId(first.id);
            }}
            placeholder="Plot number"
            name="plot"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            // 16px on a phone: iPhone Safari zooms the page into any smaller field.
            className="block h-11 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-base text-foreground transition-shadow placeholder:text-[hsl(var(--placeholder))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
          />
        </label>
      </div>

      {/* The Plots as tiles, a section per type; the plan follows below. */}
      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {plots.length === 0 ? noPlots : "No Plot has this status right now."}
        </p>
      ) : (
        <div className="space-y-5">
          {types.map((type) => {
            const ofType = visible.filter((p) => p.type === type);
            return (
              <section key={type} className="space-y-2">
                {types.length > 1 && (
                  <h2 className="text-xs font-semibold text-foreground">
                    {type} Plots <span className="font-normal text-muted-foreground">({ofType.length})</span>
                  </h2>
                )}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-2">
                  {ofType.map((plot) => (
                    <button
                      key={plot.id}
                      id={`plot-${plot.id}`}
                      type="button"
                      onClick={() => setSelectedId(plot.id)}
                      aria-label={`Plot ${plot.number}, ${PUBLIC_STATUS_LABEL[plot.status]}`}
                      className={`flex h-12 items-center justify-center rounded-lg border px-1 text-sm font-bold tabular-nums transition-[filter,opacity] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 ${
                        TONE[plot.status].tile
                      } ${matches(plot) ? "" : "opacity-25"} ${
                        ringedId === plot.id || selectedId === plot.id ? "ring-2 ring-foreground ring-offset-2" : ""
                      } ${changed.has(plot.id) ? "motion-safe:animate-plot-flip" : ""}`}
                    >
                      <span className="truncate">{plot.number}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
          {!layout && !layoutDocument && layoutUrl && (
            <a
              href={layoutUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              Open the drawn layout <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {/* The plan, under the list: the drawn site plan, else the layout picture. */}
      {layout ? (
        <SiteMap
          layout={layout}
          plots={plots}
          isDimmed={(plot) => (filter !== null && plot.status !== filter) || !matches(plot)}
          ringedId={ringedId ?? selectedId}
          changed={changed}
          onSelect={setSelectedId}
        />
      ) : layoutDocument ? (
        <LayoutDocumentPreview document={layoutDocument} />
      ) : null}

      {selected && (
        <PlotSheet
          plot={selected}
          projectName={projectName}
          onClose={() => setSelectedId(null)}
          // Only a drawn plan knows where a Plot sits; a picture does not.
          onShowOnPlan={
            layout
              ? () => {
                  setPinnedId(selected.id);
                  setSelectedId(null);
                }
              : null
          }
        />
      )}
    </div>
  );
}

/**
 * The picked Plot, in a sheet risen from the bottom edge. Not a modal: the
 * plan stays live under it, and tapping another Plot changes what it shows.
 * Escape closes it and hands focus back to the Plot it came from.
 */
function PlotSheet({
  plot,
  projectName,
  onClose,
  onShowOnPlan,
}: {
  plot: PublicPlot;
  projectName: string;
  onClose: () => void;
  onShowOnPlan: (() => void) | null;
}) {
  const sheet = React.useRef<HTMLDivElement>(null);
  // The latest onClose, read through a ref: the page refreshes every two
  // seconds and hands a new one each time, which must not re-run the opening.
  const close = React.useRef(onClose);
  close.current = onClose;

  React.useEffect(() => {
    const opener = document.activeElement;
    sheet.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener instanceof HTMLElement || opener instanceof SVGElement) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      ref={sheet}
      role="dialog"
      aria-modal="false"
      aria-labelledby="plot-sheet-title"
      tabIndex={-1}
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-lg overflow-hidden rounded-t-[22px] border border-b-0 border-border/80 bg-card shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.25)] outline-none motion-safe:animate-sheet-up"
    >
      {/* The sheet's edge carries the Plot's own colour. */}
      <div className={`h-1 ${TONE[plot.status].bar}`} aria-hidden="true" />
      <div className="space-y-3 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {/* Number and where it is; status and Close on the same line. */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="plot-sheet-title" className="text-2xl font-bold leading-none tracking-tight tabular-nums text-foreground">
              <span className="sr-only">Plot </span>
              {plot.number}
            </h2>
            <p className="mt-1.5 truncate text-xs font-medium text-foreground">
              {projectName} · {plot.type}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant={TONE[plot.status].badge} className="gap-1.5 px-2 py-0.5 text-[11px]">
              <span className={`h-1.5 w-1.5 rounded-full ${TONE[plot.status].dot}`} />
              {PUBLIC_STATUS_LABEL[plot.status]}
            </Badge>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Size and Area on the left, sized to their figures; the Plot's
            drawing takes the rest of the row (owner, 23 Nov 2026). */}
        <div
          className={`grid items-center gap-x-5 border-t border-border/60 pt-3 ${
            plot.shape ? "grid-cols-[auto_minmax(0,1fr)]" : ""
          }`}
        >
          <dl className="min-w-0 space-y-3 whitespace-nowrap tabular-nums">
            <div>
              <dt className="text-[11px] font-medium text-foreground/70">Size</dt>
              <dd className="mt-0.5 text-sm font-semibold text-foreground">{plot.size ?? "Irregular"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-foreground/70">Area</dt>
              <dd className="mt-0.5 text-sm font-semibold text-foreground">{plot.area[0]}</dd>
              {plot.area.slice(1).map((line) => (
                <dd key={line} className="text-xs text-foreground/80">
                  {line}
                </dd>
              ))}
            </div>
            {/* "East Facing", "Park Facing": each says what it is, so no label. */}
            {plot.facing.length > 0 && (
              <div>
                <dt className="sr-only">Facing</dt>
                {plot.facing.map((line) => (
                  <dd key={line} className="text-xs font-semibold text-foreground">
                    {line}
                  </dd>
                ))}
              </div>
            )}
          </dl>
          {plot.shape && (
            <PlotShape
              narrow
              plotNumber={plot.number}
              widthFt={plot.shape.widthFt}
              lengthFt={plot.shape.lengthFt}
              sides={plot.shape.sides}
            />
          )}
        </div>

        {onShowOnPlan && (
          <button
            type="button"
            onClick={onShowOnPlan}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MapPinned className="h-4 w-4" />
            Show on site plan
          </button>
        )}
      </div>
    </div>
  );
}
