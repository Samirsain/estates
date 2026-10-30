"use client";

// Projects and PLC rules — design.md §7; prd-corrections.md §16.

import React from "react";
import { useRouter } from "next/navigation";
import { Box, ChevronDown, Info, Layers, Map, Plus, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { useCommercialRewardsDraft } from "./[id]/commission-settings";
import { ProjectIdentity, SheetHeading, amenityList, projectWhere } from "./project-identity";
import { headline } from "@/lib/pdf/project-sheet";
import DownloadPdfButton from "./download-pdf-button";
import { plcComponentLabel, plcDisplayComponents, type PlcCategory } from "@/lib/domain/inventory";
import { formatPercent } from "@/lib/tasks";
import { formatIst, type StaffRole } from "@/lib/tasks";
import {
  createProjectAction,
  type ProjectFields,
  type ActionResult,
} from "./actions";
import { RemarkSelect } from "@/components/ui/remark-select";

type ComponentRow = { category: PlcCategory; threshold: string | null; percent: string; remark?: string | null };

export type ProjectRowView = {
  id: string;
  projectCode: string;
  name: string;
  type: string;
  status: string;
  developer: string | null;
  location: string | null;
  locationUrl: string | null;
  driveUrl: string | null;
  renderUrl: string | null;
  city: string | null;
  amenities: string | null;
  reraNumber: string | null;
  isExternalResaleGroup: boolean;
  /** Listed on the Public Project Portal (/p) — on unless turned off from Update. */
  publicPortal: boolean;
  plotCount: number;
  plotTypeCounts: Array<{ plotType: string; count: number }>;
  /** Feet, as set on this Project's Plot sides — the PLC dialog lists each one. */
  roadWidths: string[];
  components: ComponentRow[];
  /** PLC spec §15.1 — published, draft and superseded, newest first. */
  plcVersions: Array<{
    id: string;
    version: number;
    status: string;
    reason: string | null;
    createdBy: string | null;
    createdAt: string;
    publishedBy: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    components: ComponentRow[];
  }>;
};

const PLC_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published (current)",
  SUPERSEDED: "Superseded",
};

const TYPE_LABEL: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  AGRICULTURAL: "Agricultural",
  MIXED: "Mixed",
};

/** Plot Types, in the order the inventory grid offers them. */
const PLOT_TYPE_LABEL: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INFORMAL_SECTOR: "Informal Sector",
};

const BULLET = "•";

/**
 * The card's link pills. Four of them with their names on share one row of a
 * card three to a screen, which they only do at this size — the default xs
 * button wrapped the fourth onto a second line and made the card taller than
 * the ones beside it.
 */
const CARD_PILL = "h-6 shrink-0 px-2 text-[10px]";

const STATUS_LABEL: Record<string, string> = {
  // Screen wording only. The enum value stays SETUP_NOT_ACTIVE — DEVIATIONS D-03.
  SETUP_NOT_ACTIVE: "Unreleased",
  ACTIVE: "Active",
  SOLD_OUT: "Sold Out",
  COMPLETED: "Completed",
};

const newKey = () => `proj-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export default function ProjectsClient({
  role,
  actorName,
  staffAccountId,
  canSetup,
  rows,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  canSetup: boolean;
  rows: ProjectRowView[];
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<ActionResult | null>(null);
  const [detail, setDetail] = React.useState<ProjectRowView | null>(null);

  async function run(action: () => Promise<ActionResult>) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    setNotice(result);
    if (result.ok) {
      setCreating(false);
      router.refresh();
    }
  }

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Projects</h1>
          </div>
          {canSetup && (
            <Button size="sm" variant="gradient" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" /> New Project
            </Button>
          )}
        </div>

        {notice && (
          <Card
            className={`p-4 text-sm ${
              notice.ok ? "border-emerald-500/40 text-emerald-700" : "border-red-500/40 text-red-700"
            }`}
          >
            {notice.ok ? notice.message : notice.error}
          </Card>
        )}

        {/* Three across, and short enough that six sit on one screen. Everything
            a card dropped — the bands, the plot-type split, the amenities, the
            RERA number — is a click away on the detail page. A list card is for
            picking a Project, not for reading one. */}
        <div className="grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((project) => (
            <Card
              key={project.id}
              // One height for every card, whatever it holds: a Project with
              // both links and a long developer name reads as the same tile as
              // one with neither, so the grid is a grid rather than a staircase.
              className="flex h-44 flex-col gap-2 overflow-hidden rounded-xl border border-border/60 bg-card/70 p-3 transition-colors hover:border-border dark:bg-card/40"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => router.push(`/projects/${project.id}`)}
                  title="Click to view full details"
                >
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {project.projectCode}
                  </p>
                  <h2 className="truncate text-sm font-semibold leading-tight tracking-tight text-foreground transition-colors hover:text-primary">
                    {project.name}
                  </h2>
                  {/* Three facts of different weights used to run into one
                      truncated line, so the developer's name was the half that
                      got cut. What the Project is and where it is sit together;
                      whose it is takes the line under them. */}
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[
                      project.isExternalResaleGroup
                        ? "External Resale Property Group"
                        : (TYPE_LABEL[project.type] ?? project.type),
                      [project.location, project.city].filter(Boolean).join(", "),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </button>
                <Badge
                  variant={project.status === "ACTIVE" ? "success" : "outline"}
                  className="shrink-0"
                >
                  {STATUS_LABEL[project.status] ?? project.status}
                </Badge>
              </div>

              {/* Whose the Project is, and what it holds, on one line: the
                  developer's name never fills a card's width and the counts
                  never fill the other half, so they share it rather than each
                  leaving a hole. A type with no Plot here is not printed as a
                  zero, and an External Resale Property Group holds acquired
                  properties rather than developed inventory (PRD §11.6). */}
              <div className="mt-auto flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] text-muted-foreground/80">
                  {project.developer ?? ""}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {project.isExternalResaleGroup ? (
                    <span className="text-[11px] text-muted-foreground">Acquired properties</span>
                  ) : project.plotTypeCounts.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground">No plots yet</span>
                  ) : (
                    project.plotTypeCounts.map(({ plotType, count }) => (
                      <span
                        key={plotType}
                        className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {PLOT_TYPE_LABEL[plotType] ?? plotType}{" "}
                        <span className="font-semibold tabular-nums text-foreground">{count}</span>
                      </span>
                    ))
                  )}
                </span>
              </div>

              {/* Every link the office opens, each with its name on it — an
                  icon alone is a guess. The actions menu that shared this
                  footer is gone (owner, 29 Oct 2026): the Project page's Edit
                  Project and Update ▾ do Edit, PLC versions and status. The code that used to sit here now leads the card, above
                  the name, where the sheet and the PDF also put it. */}
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/50 pt-2">
                <div className="flex min-w-0 flex-nowrap items-center gap-1">
                  {project.driveUrl && (
                    <Button size="xs" variant="outline" className={CARD_PILL} asChild>
                      <a href={project.driveUrl} target="_blank" rel="noreferrer noopener">
                        <Layers className="mr-1 h-2.5 w-2.5" /> Layout
                      </a>
                    </Button>
                  )}
                  {project.locationUrl && (
                    <Button size="xs" variant="outline" className={CARD_PILL} asChild>
                      <a href={project.locationUrl} target="_blank" rel="noreferrer noopener">
                        <Map className="mr-1 h-2.5 w-2.5" /> Location
                      </a>
                    </Button>
                  )}
                  {project.renderUrl && (
                    <Button size="xs" variant="outline" className={CARD_PILL} asChild>
                      <a href={project.renderUrl} target="_blank" rel="noreferrer noopener">
                        <Box className="mr-1 h-2.5 w-2.5" /> 3D Visuals
                      </a>
                    </Button>
                  )}
                  {/* Everything the card has no room for — amenities, RERA,
                      the whole plot split — without leaving the list. */}
                  <Button
                    size="xs"
                    variant="outline"
                    className={CARD_PILL}
                    onClick={() => setDetail(project)}
                  >
                    <Info className="mr-1 h-2.5 w-2.5" /> More info
                  </Button>
                </div>

              </div>
            </Card>
          ))}
        </div>

        {detail && <ProjectInfoDialog project={detail} onClose={() => setDetail(null)} />}
      </div>

      {creating && (
        <ProjectDialog
          busy={busy}
          canPrepareCommission={role === "MD"}
          onClose={() => setCreating(false)}
          onSubmit={(input) => run(() => createProjectAction(input, newKey()))}
        />
      )}

    </AppShell>
  );
}

/**
 * More info, laid out as the sheet Download PDF writes (owner, 29 Oct 2026):
 * the Project's identity block as its own page heads it, then Project
 * Amenities, Project Resources, Plot Inventory as count cards and Plot
 * Location Charges as a ruled table, two to a row. The cards and rates are
 * worked out once here and handed to the sheet as they are, so the screen and
 * the paper never disagree.
 *
 * Download PDF writes a one-page A4 sheet of the same facts and hands it
 * straight to the browser's downloads — see lib/pdf/project-sheet.ts.
 */
function ProjectInfoDialog({
  project,
  onClose,
}: {
  project: ProjectRowView;
  onClose: () => void;
}) {
  const published = project.plcVersions.find((v) => v.status === "PUBLISHED") ?? null;
  const countOf = (plotType: string) =>
    project.plotTypeCounts.find((c) => c.plotType === plotType)?.count ?? 0;
  // An External Resale Property Group sells nothing of its own, so like its
  // page it has neither part. Total, Residential and Commercial are always
  // there, as the sheet's three cards; Informal Sector only where there is
  // one. The rates without their version number, and nothing at all when none
  // is published.
  const inventory = project.isExternalResaleGroup
    ? null
    : [
        { label: "Total Plots", value: String(project.plotCount) },
        { label: "Residential Plots", value: String(countOf("RESIDENTIAL")) },
        { label: "Commercial Plots", value: String(countOf("COMMERCIAL")) },
        ...project.plotTypeCounts
          .filter((c) => c.plotType !== "RESIDENTIAL" && c.plotType !== "COMMERCIAL" && c.count > 0)
          .map((c) => ({ label: `${PLOT_TYPE_LABEL[c.plotType] ?? c.plotType} Plots`, value: String(c.count) })),
      ];
  const rates =
    project.isExternalResaleGroup || !published
      ? null
      : plcDisplayComponents(published.components).map((c) => ({ label: c.label, value: formatPercent(c.percent) }));

  return (
    // As wide as the Project page's own card, so the block lays out the same.
    <Modal title="" onClose={onClose} width="w-[min(64rem,94vw)]">
      {/* Download PDF in the top right corner, on the close button's own line
          and just left of it (owner, 29 Oct 2026). !mt-0 undoes the margin the
          Modal's space-y gives every child, which would drop it 14px below
          the close button and onto RERA. */}
      <div className="absolute right-12 top-3 !mt-0">
        <DownloadPdfButton
          sheet={{
            name: project.name,
            projectCode: project.projectCode,
            type: project.isExternalResaleGroup
              ? "External Resale Property Group"
              : (TYPE_LABEL[project.type] ?? project.type),
            status: STATUS_LABEL[project.status] ?? project.status,
            developer: project.developer,
            reraNumber: project.reraNumber,
            where: projectWhere(project),
            locationUrl: project.locationUrl,
            driveUrl: project.driveUrl,
            renderUrl: project.renderUrl,
            amenities: amenityList(project.amenities),
            inventory,
            plcRates: rates,
          }}
        />
      </div>

      <div className="space-y-4 pt-2">
        <ProjectIdentity project={project} heading="h2" sections />

        {inventory && (
          <section className="space-y-2">
            <SheetHeading>Plot Inventory</SheetHeading>
            <dl className={`grid grid-cols-2 gap-3 ${inventory.length > 3 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              {inventory.map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-border/60 bg-secondary px-4 py-3">
                  <dd className="text-xl font-bold leading-none tabular-nums text-foreground">{value}</dd>
                  <dt className="mt-1.5 text-xs text-muted-foreground">{label}</dt>
                </div>
              ))}
            </dl>
          </section>
        )}

        {rates && rates.length > 0 && (
          <section className="space-y-2">
            <SheetHeading>Plot Location Charges</SheetHeading>
            <dl className="grid gap-x-10 sm:grid-cols-2">
              {rates.map(({ label, value }, i) => (
                <div key={i} className="flex items-baseline justify-between gap-4 border-b border-border/50 py-2 text-sm">
                  <dt className="text-foreground">{headline(label)}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </Modal>
  );
}

/** A PLC row on the form; `typed` marks a road width added by hand, whose feet are an input. */
type EditorRow = ComponentRow & { typed?: boolean };

const OPEN_SIDE_BANDS = ["2", "2.5", "3", "4"];
const sameBand = (a: string | null, b: string | null) => a !== null && b !== null && Number(a) === Number(b);
// An exact stored value is trimmed by string, not by Number: it should not take
// a trip through a binary float to be shown in a text box.
const editablePercent = (p: string) => (p.includes(".") ? p.replace(/0+$/, "").replace(/\.$/, "") : p);

/** The road widths already known: set on the Project's Plots, or a band of the current version. Widest first. */
function knownRoadWidths(components: ComponentRow[], roadWidths: string[]): string[] {
  return [
    ...new Set(
      [...roadWidths, ...components.filter((c) => c.category === "ROAD_WIDTH").map((c) => c.threshold ?? "")]
        .filter((ft) => ft.trim() !== "")
        .map((ft) => String(Number(ft)))
    ),
  ].sort((a, b) => Number(b) - Number(a));
}

/**
 * Every charge the vocabulary allows, listed once: each road width set on the
 * Project's Plots (and any band the current version already has), the four
 * open-side types, and the two facings. A box left empty is no charge.
 */
function plcEditorRows(components: ComponentRow[], roadWidths: string[]): EditorRow[] {
  const percent = (category: PlcCategory, threshold: string | null) => {
    const found = components.find(
      (c) => c.category === category && (threshold === null ? c.threshold === null : sameBand(c.threshold, threshold))
    );
    return { percent: found ? editablePercent(found.percent) : "", remark: found?.remark || "" };
  };
  return [
    ...knownRoadWidths(components, roadWidths).map((ft) => ({ category: "ROAD_WIDTH" as const, threshold: ft, ...percent("ROAD_WIDTH", ft) })),
    ...OPEN_SIDE_BANDS.map((n) => ({ category: "OPEN_SIDES" as const, threshold: n, ...percent("OPEN_SIDES", n) })),
    { category: "PARK_FACING" as const, threshold: null, ...percent("PARK_FACING", null) },
    { category: "PLAYGROUND_FACING" as const, threshold: null, ...percent("PLAYGROUND_FACING", null) },
  ];
}

/** What is saved: only the rows given a percentage. */
const plcComponentsToSave = (rows: EditorRow[]): ComponentRow[] =>
  rows
    .filter((r) => r.percent.trim() !== "" && (r.category !== "ROAD_WIDTH" || (r.threshold ?? "").trim() !== ""))
    .map(({ typed: _typed, ...r }) => r);

/**
 * The four categories are the whole vocabulary, so the form lists every charge
 * instead of asking anyone to build rows. Labels are generated from the band —
 * feet of road, or a count of open sides — never typed.
 */
function ComponentEditor({
  rows,
  widths,
  onChange,
}: {
  rows: EditorRow[];
  /** The widths a road row offers, before Custom — as the Plot form offers them. */
  widths: string[];
  onChange: (rows: EditorRow[]) => void;
}) {
  const takenBy = (ft: string, index: number) =>
    rows.some((r, i) => i !== index && r.category === "ROAD_WIDTH" && !r.typed && sameBand(r.threshold, ft));
  const update = (index: number, patch: Partial<EditorRow>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const percentBox = (row: EditorRow, index: number, label: string) => (
    <div className="relative w-20 shrink-0">
      <Input
        aria-label={`${label} percent`}
        value={row.percent}
        inputMode="decimal"
        onChange={(e) => update(index, { percent: e.target.value })}
        className="h-9 pr-6 text-right tabular-nums"
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
    </div>
  );
  const group = (title: string, category: PlcCategory | PlcCategory[], hint?: string, extra?: React.ReactNode) => {
    const categories = Array.isArray(category) ? category : [category];
    return (
      <section>
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        <div className="mt-1">
          {rows.map((row, index) => {
            if (!categories.includes(row.category)) return null;
            const label = plcComponentLabel(row.category, row.threshold);
            return (
              <div key={index} className="flex items-center gap-2 border-b border-border/40 py-1.5 last:border-0">
                {row.category === "ROAD_WIDTH" ? (
                  // The Plot form's road picker: the widths already known, then
                  // Custom, which puts a feet box beside it.
                  <div className="flex w-40 shrink-0 items-center gap-1">
                    <select
                      aria-label="Road width"
                      className={`${inputClass} h-9 min-w-0 flex-1 text-xs`}
                      value={row.typed ? "custom" : (row.threshold ?? "")}
                      onChange={(e) =>
                        update(
                          index,
                          e.target.value === "custom"
                            ? { typed: true, threshold: "" }
                            : { typed: false, threshold: e.target.value }
                        )
                      }
                    >
                      {widths.map((ft) => (
                        <option key={ft} value={ft} disabled={takenBy(ft, index)}>
                          Road {ft} ft
                        </option>
                      ))}
                      <option value="custom">Custom</option>
                    </select>
                    {row.typed && (
                      <Input
                        aria-label="Road width in feet"
                        value={row.threshold ?? ""}
                        inputMode="decimal"
                        placeholder="ft"
                        onChange={(e) => update(index, { threshold: e.target.value })}
                        className="h-9 w-14 shrink-0 px-2 tabular-nums"
                      />
                    )}
                  </div>
                ) : (
                  <span className="w-28 shrink-0 text-xs text-foreground">{label}</span>
                )}
                {row.category === "ROAD_WIDTH" ? (
                  <Input
                    aria-label={`${label} road name`}
                    value={row.remark ?? ""}
                    placeholder="Road name (optional)"
                    onChange={(e) => update(index, { remark: e.target.value })}
                    className="h-9 min-w-0 flex-1"
                  />
                ) : (
                  <span className="flex-1" />
                )}
                {percentBox(row, index, label)}
                {/* Every row keeps the slot, so the % boxes stay one column. */}
                {row.category === "ROAD_WIDTH" ? (
                  <button
                    type="button"
                    aria-label="Remove this road width"
                    onClick={() => onChange(rows.filter((_, i) => i !== index))}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <span aria-hidden className="w-8 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
        {extra}
      </section>
    );
  };

  return (
    <div className="space-y-4">
      {group(
        "Road width",
        "ROAD_WIDTH",
        "Every width set on this Project's Plots. A Plot pays the highest band its road reaches.",
        <button
          type="button"
          onClick={() => {
            const free = widths.find((ft) => !takenBy(ft, -1));
            onChange([
              ...rows,
              { category: "ROAD_WIDTH", threshold: free ?? "", percent: "", remark: "", typed: free === undefined },
            ]);
          }}
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Plus className="h-3 w-3" /> Add road width
        </button>
      )}
      {group("Open sides", "OPEN_SIDES")}
      {group(
        "Park / Playground facing",
        ["PARK_FACING", "PLAYGROUND_FACING"],
        "Charged once — a Plot facing both pays the higher of the two."
      )}
    </div>
  );
}

/** The fields a Project carries on both the create and the edit form. */
function ProjectFieldset({ row }: { row?: ProjectRowView }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Project Name">
        <Input name="name" required defaultValue={row?.name ?? ""} />
      </Field>
      <Field label="Type">
        <select name="type" className={inputClass} defaultValue={row?.type ?? "RESIDENTIAL"}>
          <option value="RESIDENTIAL">Residential</option>
          <option value="COMMERCIAL">Commercial</option>
          <option value="AGRICULTURAL">Agricultural</option>
          {/* Mixed is no longer offered for a new Project, but a Project that
              already carries it keeps the option — without it the select would
              fall back to Residential and change the type on save. */}
          {row?.type === "MIXED" && <option value="MIXED">Mixed</option>}
        </select>
      </Field>
      <Field label="City">
        <Input name="city" defaultValue={row?.city ?? ""} />
      </Field>
      <Field label="Location">
        <Input name="location" defaultValue={row?.location ?? ""} />
      </Field>
      <Field label="Location link">
        <Input
          name="locationUrl"
          type="url"
          inputMode="url"
          placeholder="Google Maps link"
          defaultValue={row?.locationUrl ?? ""}
        />
      </Field>
      <Field label="Structure & Layout (Drive link)">
        <Input
          name="driveUrl"
          type="url"
          inputMode="url"
          placeholder="Google Drive folder"
          defaultValue={row?.driveUrl ?? ""}
        />
      </Field>
      <Field label="3D Visuals (Drive link)">
        <Input
          name="renderUrl"
          type="url"
          inputMode="url"
          placeholder="Google Drive folder or walkthrough link"
          defaultValue={row?.renderUrl ?? ""}
        />
      </Field>
      <Field label="Developer / Company">
        <Input name="developer" defaultValue={row?.developer ?? ""} />
      </Field>
      <Field label="RERA Number">
        <Input
          name="reraNumber"
          placeholder="Can be added later via Edit"
          defaultValue={row?.reraNumber ?? ""}
        />
      </Field>
      <div className="md:col-span-2">
        <AmenitiesField defaultValue={row?.amenities ?? ""} />
      </div>
    </div>
  );
}

/**
 * The bullets are typed for you: pressing Enter starts the next amenity, and
 * the first appears as soon as you begin. They are stripped again on the way
 * out, so what is stored is the amenity and nothing else.
 */
function AmenitiesField({ defaultValue }: { defaultValue: string }) {
  const [text, setText] = React.useState(() =>
    amenityList(defaultValue)
      .map((a) => `${BULLET} ${a}`)
      .join("\n")
  );

  return (
    <Field label="Amenities">
      <textarea
        name="amenities"
        rows={4}
        className={`${inputClass} h-auto py-2 leading-relaxed`}
        value={text}
        placeholder={`${BULLET} Clubhouse`}
        onChange={(e) => {
          const next = e.target.value;
          // The first character gets a bullet, so the list never has to be
          // started by hand.
          setText(next && !next.startsWith(BULLET) ? `${BULLET} ${next}` : next);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const el = e.currentTarget;
          const at = el.selectionStart;
          setText(`${text.slice(0, at)}\n${BULLET} ${text.slice(el.selectionEnd)}`);
          // Put the caret after the bullet just inserted, rather than wherever
          // React would otherwise leave it.
          requestAnimationFrame(() => {
            el.selectionStart = el.selectionEnd = at + 3;
          });
        }}
      />
    </Field>
  );
}

function readProjectFields(f: FormData): ProjectFields {
  return {
    name: String(f.get("name")),
    type: String(f.get("type")) as ProjectFields["type"],
    developer: String(f.get("developer") ?? ""),
    location: String(f.get("location") ?? ""),
    locationUrl: String(f.get("locationUrl") ?? ""),
    driveUrl: String(f.get("driveUrl") ?? ""),
    renderUrl: String(f.get("renderUrl") ?? ""),
    city: String(f.get("city") ?? ""),
    // The bullets are the field's, not the data's.
    amenities: amenityList(String(f.get("amenities") ?? "")).join("\n"),
    reraNumber: String(f.get("reraNumber") ?? ""),
  };
}

function ProjectDialog({
  busy,
  canPrepareCommission,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  /** v2.1 §14 — only Admin prepares commission settings; MD approves them. */
  canPrepareCommission: boolean;
  onClose: () => void;
  onSubmit: (input: Parameters<typeof createProjectAction>[0]) => void;
}) {
  // SSOT §12–§14; CP §8 — the Project is created with its Commercial &
  // Rewards settings, the same fields a later version uses. Saved as version 1,
  // approved by the MD creating it.
  const [withCommission, setWithCommission] = React.useState(canPrepareCommission);
  const draft = useCommercialRewardsDraft(null, [], "Initial Project settings");
  const commissionProblem = withCommission ? draft.problem : null;
  // The problem shows once Create is pressed, not while the form is being filled.
  const [tried, setTried] = React.useState(false);

  return (
    <Modal
      title="New Project"
      description="Created as Unreleased. Make it Active only when it is ready to sell. The Project Code cannot be changed later."
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (commissionProblem) return setTried(true);
          const form = new FormData(e.currentTarget);
          onSubmit({
            ...readProjectFields(form),
            projectCode: String(form.get("projectCode")),
            isExternalResaleGroup: false,
            components: [],
            commission: canPrepareCommission && withCommission ? draft.value : null,
          });
        }}
      >
        <Field label="Project Code">
          <Input
            name="projectCode"
            required
            maxLength={9}
            pattern="[A-Za-z0-9]{1,9}"
            title="1 to 9 letters or digits"
            className="uppercase"
          />
        </Field>
        <ProjectFieldset />

        {canPrepareCommission && (
          <div className="space-y-3 border-t border-border/60 pt-3">
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={withCommission}
                onChange={(e) => setWithCommission(e.target.checked)}
              />
              Rewards settings
            </label>
            {withCommission && (
              <>
                {draft.fields}
                {tried && commissionProblem && <p className="text-xs text-red-700">{commissionProblem}</p>}
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Creating…" : "Create Project"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The Project Code and the External Resale Property Group flag are not here.
 * The code is what ties an issued export back to what it described, and the
 * flag is what PRD §11.6 uses to tell a development Project from an acquisition
 * container. Status has its own dialog: releasing is not editing.
 */
export function EditProjectDialog({
  project,
  busy,
  onClose,
  onSubmit,
}: {
  project: ProjectRowView;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: ProjectFields, reason: string) => void;
}) {
  return (
    <Modal
      title={`Edit ${project.name}`}
      description="The Project Code and the External Resale Property Group setting cannot be changed. Use Change status to release the Project."
      wide
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit(readProjectFields(f), String(f.get("reason")));
        }}
      >
        <ProjectFieldset row={project} />

        <Field label="Reason — compulsory">
          <RemarkSelect presets="editProject" name="reason" required />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function PlcDialog({
  project,
  busy,
  onClose,
  onSubmit,
  onDraft,
  onPublish,
}: {
  project: ProjectRowView;
  busy: boolean;
  onClose: () => void;
  onSubmit: (components: ComponentRow[], reason: string) => void;
  onDraft: (components: ComponentRow[], reason: string) => void;
  onPublish: (plcRuleVersionId: string) => void;
}) {
  const [rows, setRows] = React.useState<EditorRow[]>(() => plcEditorRows(project.components, project.roadWidths));
  const widths = knownRoadWidths(project.components, project.roadWidths);
  const [reason, setReason] = React.useState("");
  const components = plcComponentsToSave(rows);

  const drafts = project.plcVersions.filter((v) => v.status === "DRAFT");

  // Portrait (owner, 29 Oct 2026): one narrow column that reads top to bottom.
  return (
    <Modal
      title={`PLC — ${project.projectCode}`}
      description="Leave a box empty for no charge."
      width="w-[min(32rem,94vw)]"
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(components, reason);
        }}
      >
        <ComponentEditor rows={rows} widths={widths} onChange={setRows} />
        <Field label="Reason — compulsory">
          <RemarkSelect presets="locationCharge" name="reason" required value={reason} onChange={setReason} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          {/* PLC spec §3.1 — a draft changes nothing until it is published. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || reason.trim().length < 3}
            onClick={() => onDraft(components, reason)}
          >
            Save as draft
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Saving…" : "Save and publish"}
          </Button>
        </div>
      </form>

      {drafts.length > 0 && (
        <section className="border-t border-border/50 pt-3">
          <h3 className="text-xs font-semibold text-foreground">Drafts waiting to be published</h3>
          <ul className="mt-1">
            {drafts.map((draft) => (
              <li key={draft.id} className="flex items-start justify-between gap-3 border-b border-border/40 py-2 last:border-0">
                <div className="min-w-0 text-xs">
                  <p className="font-medium">Version {draft.version}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {plcDisplayComponents(draft.components)
                      .map((c) => `${c.label} ${formatPercent(c.percent)}`)
                      .join(" · ") || "No component"}
                  </p>
                  {draft.reason && <p className="text-[11px] text-muted-foreground">{draft.reason}</p>}
                </div>
                <Button size="sm" disabled={busy} onClick={() => onPublish(draft.id)}>
                  Publish
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* PLC spec §15.1 — the version history, so what changed and when is
          answerable without opening the database. One version under another,
          so the column stays narrow. Closed until asked for (owner, 29 Oct 2026). */}
      <details className="group border-t border-border/50 pt-3">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-semibold text-foreground [&::-webkit-details-marker]:hidden">
          Version history ({project.plcVersions.length})
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        {project.plcVersions.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No PLC version exists yet.</p>
        ) : (
          <ul className="mt-1">
            {project.plcVersions.map((v) => (
              <li
                key={v.id}
                className={`border-b border-border/40 py-2 text-xs last:border-0 ${
                  v.status === "PUBLISHED" ? "" : "text-muted-foreground"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">
                    Version {v.version} · {PLC_STATUS_LABEL[v.status] ?? v.status}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {v.effectiveFrom ? formatIst(v.effectiveFrom) : "Not published"}
                    {v.effectiveTo && ` to ${formatIst(v.effectiveTo)}`}
                  </span>
                </div>
                {v.components.length > 0 && (
                  <dl className="mt-1">
                    {plcDisplayComponents(v.components).map((c, i) => (
                      <div key={i} className="flex justify-between gap-3 py-0.5">
                        <dt>{c.label}</dt>
                        <dd className="tabular-nums">{formatPercent(c.percent)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {v.reason && <p className="mt-0.5 text-[11px] text-muted-foreground">{v.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </details>
    </Modal>
  );
}

export function StatusDialog({
  project,
  busy,
  onClose,
  onSubmit,
}: {
  project: ProjectRowView;
  busy: boolean;
  onClose: () => void;
  onSubmit: (
    status: "SETUP_NOT_ACTIVE" | "ACTIVE" | "SOLD_OUT" | "COMPLETED",
    reason: string
  ) => void;
}) {
  return (
    <Modal
      title={`Change status — ${project.projectCode}`}
      description="Nothing may be sold while a Project is Unreleased."
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit(
            String(f.get("status")) as "SETUP_NOT_ACTIVE" | "ACTIVE" | "SOLD_OUT" | "COMPLETED",
            String(f.get("reason"))
          );
        }}
      >
        <Field label="Status">
          <select name="status" className={inputClass} defaultValue={project.status}>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason — compulsory">
          <RemarkSelect presets="projectStatus" name="reason" required />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Saving…" : "Change status"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
