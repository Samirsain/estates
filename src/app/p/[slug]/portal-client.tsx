"use client";

// The Public Project Portal's working half (owner, 29 Oct 2026; laid out for a
// phone 31 Oct 2026): the availability bar over three counts that are also the
// filter, Search Plot with the Plan | List switch, every Plot in its status
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
import { ExternalLink, LayoutList, Map as MapIcon, MapPinned, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PUBLIC_STATUS_LABEL, type PublicPlotStatus } from "@/lib/domain/public-portal";
import type { SiteLayout } from "@/lib/project-layouts";
import { AvailabilityBar, STATUSES, TONE } from "../availability";
import SiteMap from "./site-map";

export type PublicPlot = {
  id: string;
  number: string;
  type: string;
  status: PublicPlotStatus;
  size: string | null;
  area: string[];
  facing: string[];
};

const TYPE_ORDER = ["Residential", "Commercial", "Informal Sector"];
const typeRank = (type: string) => (TYPE_ORDER.includes(type) ? TYPE_ORDER.indexOf(type) : TYPE_ORDER.length);

/** "p 105", "P-105" and "p105" are the same Plot to someone typing on a phone. */
const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

export default function PublicPortalClient({
  plots,
  layout,
  layoutUrl,
  noPlots,
}: {
  plots: PublicPlot[];
  layout: SiteLayout | null;
  /** The Project's own Layout link, offered under the tiles when no plan is traced. */
  layoutUrl: string | null;
  /** What to say when no Plot of this Project is on the portal. */
  noPlots: string;
}) {
  const [filter, setFilter] = React.useState<PublicPlotStatus | null>(null);
  const [view, setView] = React.useState<"PLAN" | "LIST">(layout ? "PLAN" : "LIST");
  const onPlan = layout !== null && view === "PLAN";
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

  React.useEffect(() => {
    if (!ringedId) return;
    const id = onPlan ? `plan-${ringedId}` : `plot-${ringedId}`;
    document.getElementById(id)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [ringedId, onPlan]);

  // A count pressed on the plan brings the first of its Plots into view: at a
  // phone's zoom most of the plan is off to the sides. Only on the press —
  // not on each two-second refresh, which hands a new plots array.
  const latest = React.useRef(plots);
  latest.current = plots;
  React.useEffect(() => {
    if (!filter || !onPlan) return;
    const first = latest.current.find((p) => p.status === filter);
    if (first) document.getElementById(`plan-${first.id}`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [filter, onPlan]);

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
    <div className={`space-y-4 ${selected ? "pb-72" : ""}`}>
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

      {/* Search Plot, and Plan | List — only when there is a Plot to find. */}
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
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            // 16px on a phone: iPhone Safari zooms the page into any smaller field.
            className="block h-11 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-base text-foreground transition-shadow placeholder:text-[hsl(var(--placeholder))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
          />
        </label>
        {layout && (
          <div role="group" aria-label="View" className="flex shrink-0 rounded-xl border border-border bg-secondary p-1">
            {(["PLAN", "LIST"] as const).map((value) => {
              const Icon = value === "PLAN" ? MapIcon : LayoutList;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    view === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {value === "PLAN" ? "Plan" : "List"}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* The site plan, or the Plots as tiles, a section per type */}
      {onPlan ? (
        <SiteMap
          layout={layout}
          plots={plots}
          isDimmed={(plot) => (filter !== null && plot.status !== filter) || !matches(plot)}
          ringedId={ringedId ?? selectedId}
          changed={changed}
          onSelect={setSelectedId}
        />
      ) : visible.length === 0 ? (
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
          {!layout && layoutUrl && (
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

      {selected && (
        <PlotSheet
          plot={selected}
          onClose={() => setSelectedId(null)}
          onShowOnPlan={
            layout && !onPlan
              ? () => {
                  setView("PLAN");
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
  onClose,
  onShowOnPlan,
}: {
  plot: PublicPlot;
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

  const [primaryArea, ...otherAreas] = plot.area;

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
      <div className={`h-1.5 ${TONE[plot.status].bar}`} aria-hidden="true" />
      <div className="space-y-4 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-start justify-between gap-3">
          <h2 id="plot-sheet-title" className="min-w-0 text-3xl font-bold leading-tight tracking-tight tabular-nums text-foreground">
            <span className="sr-only">Plot </span>
            {plot.number}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={TONE[plot.status].badge} className="gap-1.5 px-2.5 py-1 text-xs">
              <span className={`h-2 w-2 rounded-full ${TONE[plot.status].dot}`} />
              {PUBLIC_STATUS_LABEL[plot.status]}
            </Badge>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/60 pt-4">
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Plot type</dt>
            <dd className="mt-0.5 text-base font-semibold text-foreground">{plot.type}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Size (W × L)</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{plot.size ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Area</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{primaryArea}</dd>
            {otherAreas.length > 0 && (
              <dd className="text-xs tabular-nums text-muted-foreground">{otherAreas.join(" · ")}</dd>
            )}
          </div>
        </dl>

        {/* "South Facing", "Park Facing": each says what it is, so no label above them. */}
        {plot.facing.length > 0 && (
          <ul aria-label="Facing" className="flex flex-wrap gap-1.5">
            {plot.facing.map((line) => (
              <li key={line} className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
                {line}
              </li>
            ))}
          </ul>
        )}

        {onShowOnPlan && (
          <button
            type="button"
            onClick={onShowOnPlan}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MapPinned className="h-4 w-4" />
            Show on site plan
          </button>
        )}
      </div>
    </div>
  );
}
