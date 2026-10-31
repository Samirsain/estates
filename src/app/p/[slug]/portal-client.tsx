"use client";

// The Public Project Portal's working half (owner, 29 Oct 2026): availability
// summary, Search Plot, the All | Available | Hold | Sold / Booked filter, the
// three-colour legend, every Plot as a tile in its status colour, and the
// selected Plot's details.
//
// A Project with a traced site plan (lib/project-layouts) opens on that plan,
// each Plot in its status colour (owner, 30 Oct 2026); Plot list shows the
// tiles. Without one the tiles are all there is: plot-number order, a section
// per Plot type, and the Layout button in the header opens the real plan. The
// CRM stores no price or description for a Plot, so the details are what it
// does hold: size, area and facing.

import React from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PUBLIC_STATUS_LABEL, type PublicPlotStatus } from "@/lib/domain/public-portal";
import type { SiteLayout } from "@/lib/project-layouts";
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

/** Green, yellow, red — and nothing else. */
const TONE: Record<PublicPlotStatus, { dot: string; tile: string; badge: "success" | "warning" | "destructive" }> = {
  AVAILABLE: { dot: "bg-emerald-500", tile: "border-emerald-600 bg-emerald-500 text-white", badge: "success" },
  HOLD: { dot: "bg-amber-400", tile: "border-amber-500 bg-amber-400 text-amber-950", badge: "warning" },
  SOLD: { dot: "bg-red-500", tile: "border-red-600 bg-red-500 text-white", badge: "destructive" },
};

const STATUSES: PublicPlotStatus[] = ["AVAILABLE", "HOLD", "SOLD"];

const TYPE_ORDER = ["Residential", "Commercial", "Informal Sector"];
const typeRank = (type: string) => (TYPE_ORDER.includes(type) ? TYPE_ORDER.indexOf(type) : TYPE_ORDER.length);

/** "p 105", "P-105" and "p105" are the same Plot to someone typing on a phone. */
const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

export default function PublicPortalClient({
  plots,
  hasLayout,
  layout,
}: {
  plots: PublicPlot[];
  hasLayout: boolean;
  layout: SiteLayout | null;
}) {
  const [filter, setFilter] = React.useState<PublicPlotStatus | "ALL">("ALL");
  const [view, setView] = React.useState<"PLAN" | "LIST">(layout ? "PLAN" : "LIST");
  const onPlan = layout !== null && view === "PLAN";
  const [query, setQuery] = React.useState("");
  // Held by id, not by value: when the page refreshes itself the open Plot
  // shows its new status rather than the one it had when it was opened.
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = plots.find((p) => p.id === selectedId) ?? null;

  const count = (status: PublicPlotStatus) => plots.filter((p) => p.status === status).length;
  const wanted = plain(query);
  const matches = (plot: PublicPlot) => !wanted || plain(plot.number).includes(wanted);
  // An exact number is the Plot being asked for: it is ringed and brought into view.
  const exact = wanted ? plots.find((p) => plain(p.number) === wanted) ?? null : null;

  React.useEffect(() => {
    if (!exact) return;
    const id = onPlan ? `plan-${exact.id}` : `plot-${exact.id}`;
    document.getElementById(id)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [exact, onPlan]);

  const visible = plots.filter((p) => filter === "ALL" || p.status === filter);
  // Residential first, as Plot Inventory lists them, whatever the numbers sort to.
  const types = [...new Set(visible.map((p) => p.type))].sort(
    (a, b) => typeRank(a) - typeRank(b)
  );

  return (
    <>
      {/* Availability Summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryTile label="Total Plots" value={plots.length} />
        {STATUSES.map((status) => (
          <SummaryTile key={status} label={PUBLIC_STATUS_LABEL[status]} value={count(status)} dot={TONE[status].dot} />
        ))}
      </div>

      <Card className="space-y-4 p-4">
        {/* Search Plot, then the filter */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="sr-only">Search Plot</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                // The dialog takes focus onto its close button before this
                // same Enter finishes; without this it would press that button
                // and shut the dialog it just opened.
                e.preventDefault();
                const first = exact ?? plots.find(matches);
                if (first) setSelectedId(first.id);
              }}
              placeholder="Search plot number..."
              className="pl-8"
              inputMode="search"
            />
          </label>
          {layout && (
            <div role="group" aria-label="View" className="flex rounded-full border border-border bg-card p-0.5">
              {(["PLAN", "LIST"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    view === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {value === "PLAN" ? "Site plan" : "Plot list"}
                </button>
              ))}
            </div>
          )}
          <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">
            {(["ALL", ...STATUSES] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {value === "ALL" ? "All" : PUBLIC_STATUS_LABEL[value]}
              </button>
            ))}
          </div>
        </div>

        {/* Legend: the three colours, and only those */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border/60 pt-3 text-xs font-semibold text-foreground">
          {STATUSES.map((status) => (
            <span key={status} className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-full ${TONE[status].dot}`} />
              {PUBLIC_STATUS_LABEL[status]}
            </span>
          ))}
          {hasLayout && !onPlan && (
            <span className="ml-auto text-[11px] font-normal text-muted-foreground">
              In plot-number order · the Layout button above opens the site plan
            </span>
          )}
        </div>

        {/* The site plan, or the Plots as tiles, a section per type */}
        {onPlan ? (
          <SiteMap
            layout={layout}
            plots={plots}
            isDimmed={(plot) => (filter !== "ALL" && plot.status !== filter) || !matches(plot)}
            ringedId={exact?.id ?? null}
            onSelect={setSelectedId}
          />
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
            {plots.length === 0 ? "No Plots to show yet." : "No Plot has this status right now."}
          </p>
        ) : (
          types.map((type) => {
            const ofType = visible.filter((p) => p.type === type);
            return (
              <section key={type} className="space-y-2">
                {types.length > 1 && (
                  <h2 className="text-xs font-semibold text-foreground">
                    {type} Plots <span className="font-normal text-muted-foreground">({ofType.length})</span>
                  </h2>
                )}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
                  {ofType.map((plot) => (
                    <button
                      key={plot.id}
                      id={`plot-${plot.id}`}
                      type="button"
                      onClick={() => setSelectedId(plot.id)}
                      aria-label={`Plot ${plot.number}, ${PUBLIC_STATUS_LABEL[plot.status]}`}
                      className={`flex h-12 items-center justify-center rounded-lg border px-1 text-xs font-bold tabular-nums shadow-sm transition-all hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 ${
                        TONE[plot.status].tile
                      } ${matches(plot) ? "" : "opacity-25"} ${
                        exact?.id === plot.id ? "ring-2 ring-foreground ring-offset-2" : ""
                      }`}
                    >
                      <span className="truncate">{plot.number}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </Card>

      {/* Selected Plot Details */}
      {selected && (
        <Modal title={`Plot ${selected.number}`} onClose={() => setSelectedId(null)}>
          <div className="space-y-3">
            <Badge variant={TONE[selected.status].badge} className="gap-1.5">
              <span className={`h-2 w-2 rounded-full ${TONE[selected.status].dot} ring-1 ring-white/70`} />
              {PUBLIC_STATUS_LABEL[selected.status]}
            </Badge>
            <dl className="text-sm">
              <Detail label="Plot Type" value={selected.type} />
              {selected.size && <Detail label="Size (Width × Length)" value={selected.size} />}
              <Detail label="Area" value={selected.area.join(" · ")} />
              {selected.facing.length > 0 && <Detail label="Facing" value={selected.facing.join(" · ")} />}
            </dl>
          </div>
        </Modal>
      )}
    </>
  );
}

function SummaryTile({ label, value, dot }: { label: string; value: number; dot?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5">
      <p className="text-xl font-bold leading-none tabular-nums text-foreground">{value}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        {dot && <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />}
        {label}
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/40 py-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
