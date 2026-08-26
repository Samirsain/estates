"use client";

// Projects and PLC rules — DESIGN.md §7; PRD.md §16.

import React from "react";
import { useRouter } from "next/navigation";
import { Layers, MoreVertical, Pencil, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import {
  PLC_CATEGORIES,
  PLC_CATEGORY_ORDER,
  plcComponentLabels,
  plcDisplayComponents,
  type PlcCategory,
} from "@/lib/domain/inventory";
import { formatPercent } from "@/lib/tasks";
import { formatIst, type StaffRole } from "@/lib/tasks";
import {
  createProjectAction,
  publishPlcVersionAction,
  revisePlcRulesAction,
  savePlcDraftAction,
  updateProjectAction,
  type ProjectFields,
  setProjectLifecycleAction,
  type ActionResult,
} from "./actions";

type ComponentRow = { category: PlcCategory; threshold: string | null; percent: string; remark?: string | null };

export type ProjectRowView = {
  id: string;
  projectCode: string;
  name: string;
  type: string;
  lifecycle: string;
  developer: string | null;
  location: string | null;
  locationUrl: string | null;
  driveUrl: string | null;
  city: string | null;
  amenities: string | null;
  reraNumber: string | null;
  isExternalResaleGroup: boolean;
  plotCount: number;
  plotTypeCounts: Array<{ plotType: string; count: number }>;
  plcVersion: number | null;
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
 * Amenities are stored one per line, without the bullet. The bullet belongs to
 * the field you type in and to the card you read; storing it would put a
 * decoration inside the data.
 */
function amenityList(amenities: string | null): string[] {
  return (amenities ?? "")
    .split("\n")
    .map((a) => a.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);
}

const LIFECYCLE_LABEL: Record<string, string> = {
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
  const [plc, setPlc] = React.useState<ProjectRowView | null>(null);
  const [editing, setEditing] = React.useState<ProjectRowView | null>(null);
  const [lifecycle, setLifecycle] = React.useState<ProjectRowView | null>(null);
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
      setPlc(null);
      setEditing(null);
      setLifecycle(null);
      router.refresh();
    }
  }

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Projects</h1>
            <p className="text-xs text-muted-foreground">
              A Project starts as Unreleased. Inventory can be prepared while it is unreleased;
              nothing may be sold until it is Active. PLC is a percentage only.
            </p>
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
              className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/70 p-3 transition-colors hover:border-border dark:bg-card/40"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => router.push(`/projects/${project.id}`)}
                  title="Click to view full details"
                >
                  <h2 className="truncate text-sm font-semibold leading-tight tracking-tight text-foreground transition-colors hover:text-primary">
                    {project.name}
                  </h2>
                  {/* Type, place and developer read as one quiet line. At this
                      size an icon per fact costs more height than the fact. */}
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[
                      project.isExternalResaleGroup
                        ? "External Resale Property Group"
                        : (TYPE_LABEL[project.type] ?? project.type),
                      [project.location, project.city].filter(Boolean).join(", "),
                      project.developer,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </button>
                <Badge
                  variant={project.lifecycle === "ACTIVE" ? "success" : "outline"}
                  className="shrink-0"
                >
                  {LIFECYCLE_LABEL[project.lifecycle] ?? project.lifecycle}
                </Badge>
              </div>

              {/* An External Resale Property Group holds acquired properties, not
                  developed inventory, so it has neither plots nor PLC (PRD §11.6). */}
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-xs text-muted-foreground">
                <span className="truncate tabular-nums">
                  {project.isExternalResaleGroup
                    ? "Acquired properties"
                    : `${project.plotCount} plots${project.plcVersion ? ` · PLC v${project.plcVersion}` : ""}`}
                </span>
                {canSetup && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Actions for ${project.name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(project)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                      </DropdownMenuItem>
                      {!project.isExternalResaleGroup && (
                        <DropdownMenuItem onSelect={() => setPlc(project)}>
                          <Layers className="mr-2 h-3.5 w-3.5" /> PLC versions
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setLifecycle(project)}>
                        Change lifecycle
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </Card>
          ))}
        </div>

        {detail && (
          <div className="rounded-2xl border border-border/80 bg-card/70 p-4 space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">{detail.name} — Full Details</h3>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >Close ✕</button>
            </div>
            <dl className="grid gap-2 sm:grid-cols-2 text-xs">
              <Row label="Project Code" value={detail.projectCode} />
              <Row label="Type" value={TYPE_LABEL[detail.type] ?? detail.type} />
              <Row label="Lifecycle" value={LIFECYCLE_LABEL[detail.lifecycle] ?? detail.lifecycle} />
              <Row label="City" value={detail.city ?? "—"} />
              <Row label="Location" value={detail.location ?? "—"} />
              <Row label="Developer" value={detail.developer ?? "—"} />
              <Row label="RERA Number" value={detail.reraNumber ?? "Not recorded"} />
              <Row label="Total Plots" value={String(detail.plotCount)} />
            </dl>
            {detail.plotTypeCounts.length > 0 && (
              <div className="text-xs">
                <p className="font-medium text-muted-foreground mb-1">Plot Breakdown</p>
                <ul className="space-y-0.5">
                  {detail.plotTypeCounts.map(({ plotType, count }) => (
                    <li key={plotType} className="tabular-nums">
                      {count} {PLOT_TYPE_LABEL[plotType] ?? plotType}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {detail.plcVersions.length > 0 && (
              <div className="text-xs">
                <p className="font-medium text-muted-foreground mb-1">PLC Version History</p>
                <ul className="space-y-1.5">
                  {detail.plcVersions.map((v) => (
                    <li key={v.id} className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">v{v.version} · {PLC_STATUS_LABEL[v.status] ?? v.status}</span>
                        {v.effectiveFrom && (
                          <span className="text-muted-foreground">{formatIst(v.effectiveFrom)}</span>
                        )}
                      </div>
                      {v.reason && <p className="mt-0.5 text-muted-foreground">{v.reason}</p>}
                      {v.components.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                          {plcDisplayComponents(v.components).map((c, i) => (
                            <li key={i} className="flex justify-between gap-3">
                              <span>{c.label}</span>
                              <span className="tabular-nums">{formatPercent(c.percent)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {creating && (
        <ProjectDialog
          busy={busy}
          onClose={() => setCreating(false)}
          onSubmit={(input) => run(() => createProjectAction(input, newKey()))}
        />
      )}

      {editing && (
        <EditProjectDialog
          project={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSubmit={(input, reason) =>
            run(() => updateProjectAction(editing.id, input, reason, newKey()))
          }
        />
      )}

      {plc && (
        <PlcDialog
          project={plc}
          busy={busy}
          onClose={() => setPlc(null)}
          onSubmit={(components, reason) =>
            run(() => revisePlcRulesAction(plc.id, components, reason, newKey()))
          }
          onDraft={(components, reason) =>
            run(() => savePlcDraftAction(plc.id, components, reason, newKey()))
          }
          onPublish={(versionId) => run(() => publishPlcVersionAction(versionId, newKey()))}
        />
      )}

      {lifecycle && (
        <LifecycleDialog
          project={lifecycle}
          busy={busy}
          onClose={() => setLifecycle(null)}
          onSubmit={(next, reason) =>
            run(() => setProjectLifecycleAction(lifecycle.id, next, reason, newKey()))
          }
        />
      )}
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

/**
 * The four categories are the whole vocabulary, so this offers them rather than
 * asking anyone to invent one. A banded category takes a number — feet of road,
 * or a count of open sides — and the label is generated from it, which is why
 * there is no Code field and no Label field here any more.
 */
function ComponentEditor({
  rows,
  onChange,
}: {
  rows: ComponentRow[];
  onChange: (rows: ComponentRow[]) => void;
}) {
  const update = (index: number, patch: Partial<ComponentRow>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  /** Band labels read as ranges, which needs the whole list, not one row. */
  const labels = plcComponentLabels(
    rows.map((r) => ({
      category: r.category,
      threshold: r.threshold,
      percent: r.percent || "0",
      remark: r.remark,
    }))
  );

  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Each category is charged once however many sides qualify, and a banded category charges only
        the highest band the Plot reaches.
      </p>
      {rows.map((row, index) => {
        const meta = PLC_CATEGORIES[row.category];

        return (
          <div key={index} className="rounded-xl border border-border/70 bg-muted/20 p-2.5 space-y-1.5 transition-all">
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_0.6fr_0.6fr_auto] items-end">
              <Field label="Category">
                <select
                  className={inputClass}
                  value={row.category}
                  onChange={(e) => {
                    const category = e.target.value as PlcCategory;
                    update(index, {
                      category,
                      threshold: PLC_CATEGORIES[category].banded ? (row.threshold ?? "") : null,
                      remark: "",
                    });
                  }}
                >
                  {PLC_CATEGORY_ORDER.map((category) => (
                    <option key={category} value={category}>
                      {PLC_CATEGORIES[category].label}
                    </option>
                  ))}
                </select>
              </Field>

              {row.category === "OPEN_SIDES" ? (
                <div className="md:col-span-2">
                  <Field label="Open Side Type">
                    <select
                      className={inputClass}
                      value={row.threshold ?? ""}
                      onChange={(e) => update(index, { threshold: e.target.value })}
                    >
                      <option value="">-- Select Open Side Type --</option>
                      <option value="2">Two Side Open</option>
                      <option value="2.5">Corner Plot</option>
                      <option value="3">Three Side Open</option>
                      <option value="4">Four Side Open</option>
                    </select>
                  </Field>
                </div>
              ) : !meta.banded ? (
                // Not a field. It was drawn as one — border, card background,
                // input height — so it read as something to fill in, sitting in
                // a row of things that were. It is a sentence about the category
                // above it, so it looks like a sentence.
                <p className="md:col-span-2 self-center text-[11px] leading-relaxed text-muted-foreground">
                  Charged once. Park and Playground share the one charge, so a Plot facing both
                  still pays it once — the rows are separate so the Plot&apos;s own facing is
                  named on its snapshot.
                </p>
              ) : (
                <>
                  <Field label="Remark / Road Name">
                    <Input
                      value={row.remark ?? ""}
                      onChange={(e) => update(index, { remark: e.target.value })}
                      placeholder="60ft Main Road"
                    />
                  </Field>
                  <Field label={`From (${meta.unit})`}>
                    <Input
                      value={row.threshold ?? ""}
                      inputMode="decimal"
                      onChange={(e) => update(index, { threshold: e.target.value })}
                      placeholder="40"
                    />
                  </Field>
                </>
              )}

              <Field label="Percent">
                <Input
                  value={row.percent}
                  inputMode="decimal"
                  onChange={(e) => update(index, { percent: e.target.value })}
                  placeholder="%"
                />
              </Field>

              <div className="pb-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Remove component"
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                >
                  ✕
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border/40 pt-1.5 text-[11px] text-muted-foreground">
              <span>
                Reads as: <strong className="font-semibold text-foreground">{labels[index]}</strong>
              </span>
              {row.percent.trim() !== "" && (
                <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  +{formatPercent(row.percent)}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...rows, { category: "ROAD_WIDTH", threshold: "", percent: "", remark: "" }])}
        >
          + Road Rule
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...rows, { category: "OPEN_SIDES", threshold: "2.5", percent: "", remark: "" }])}
        >
          + Open Side Rule
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...rows, { category: "PARK_FACING", threshold: null, percent: "", remark: "" }])}
        >
          + Park / Playground Facing Rule
        </Button>
      </div>
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
          placeholder="Google Maps link — optional"
          defaultValue={row?.locationUrl ?? ""}
        />
      </Field>
      <Field label="Structure & Layout (Drive link)">
        <Input
          name="driveUrl"
          type="url"
          inputMode="url"
          placeholder="Google Drive folder — optional"
          defaultValue={row?.driveUrl ?? ""}
        />
      </Field>
      <Field label="Developer / Company">
        <Input name="developer" defaultValue={row?.developer ?? ""} />
      </Field>
      <Field label="RERA Number (Optional)">
        <Input
          name="reraNumber"
          placeholder="Optional — can be added later via Edit"
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
    city: String(f.get("city") ?? ""),
    // The bullets are the field's, not the data's.
    amenities: amenityList(String(f.get("amenities") ?? "")).join("\n"),
    reraNumber: String(f.get("reraNumber") ?? ""),
  };
}

function ProjectDialog({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: Parameters<typeof createProjectAction>[0]) => void;
}) {
  return (
    <Modal
      title="New Project"
      description="Created as Unreleased. Make it Active only when it is ready to sell. The Project Code is generated from the name."
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            ...readProjectFields(new FormData(e.currentTarget)),
            isExternalResaleGroup: false,
            components: [],
          });
        }}
      >
        <ProjectFieldset />

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
 * container. Lifecycle has its own dialog: releasing is not editing.
 */
function EditProjectDialog({
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
      description="The Project Code and the External Resale Property Group setting cannot be changed. Use Change lifecycle to release the Project."
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
          <Input name="reason" required minLength={3} />
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

function PlcDialog({
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
  const [components, setComponents] = React.useState<ComponentRow[]>(
    project.components.length > 0
      // Trailing zeros are trimmed for editing by string, not by Number: an
      // exact stored value should not take a trip through a binary float to be
      // shown in a text box.
      ? project.components.map((c) => ({
          ...c,
          percent: c.percent.includes(".") ? c.percent.replace(/0+$/, "").replace(/\.$/, "") : c.percent,
          remark: c.remark || "",
        }))
      : [{ category: "ROAD_WIDTH" as PlcCategory, threshold: "", percent: "", remark: "" }]
  );
  const [reason, setReason] = React.useState("");

  const drafts = project.plcVersions.filter((v) => v.status === "DRAFT");

  return (
    <Modal
      title={`PLC — ${project.projectCode}`}
      description="A revision creates the next version. A published version is never edited in place, and Holds and Bookings keep the snapshot they froze."
      wide
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(components, reason);
        }}
      >
        <ComponentEditor rows={components} onChange={setComponents} />
        <Field label="Reason — compulsory">
          <Input
            name="reason"
            required
            minLength={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
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
        <div className="mt-4 border-t border-border/50 pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Drafts waiting to be published
          </h3>
          <ul className="mt-2 space-y-2 text-xs">
            {drafts.map((draft) => (
              <li key={draft.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Version {draft.version}
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    {plcDisplayComponents(draft.components)
                      .map((c) => `${c.label} ${formatPercent(c.percent)}`)
                      .join(" · ") || "No component"}
                  </span>
                  {draft.reason && (
                    <span className="block text-[11px] text-muted-foreground">{draft.reason}</span>
                  )}
                </span>
                <Button size="sm" disabled={busy} onClick={() => onPublish(draft.id)}>
                  Publish
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* PLC spec §15.1 — the version history, so what changed and when is
          answerable without opening the database. */}
      <div className="mt-4 border-t border-border/50 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Version history
        </h3>
        {project.plcVersions.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No PLC version exists yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-xs">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1">Version</th>
                  <th className="py-1">Status</th>
                  <th className="py-1 w-1/2">Components</th>
                  <th className="py-1">Effective</th>
                  <th className="py-1">Reason</th>
                </tr>
              </thead>
              <tbody>
                {project.plcVersions.map((v) => (
                  <tr
                    key={v.id}
                    className={`align-top border-t border-border/40 ${
                      v.status === "PUBLISHED" ? "" : "text-muted-foreground"
                    }`}
                  >
                    <td className="py-1.5 tabular-nums">{v.version}</td>
                    <td className="py-1.5">{PLC_STATUS_LABEL[v.status] ?? v.status}</td>
                    <td className="py-1.5">
                      {v.components.length === 0 ? (
                        "—"
                      ) : (
                        <ul className="space-y-0.5">
                          {plcDisplayComponents(v.components).map((c, i) => (
                            <li key={i} className="flex justify-between gap-3">
                              <span>{c.label}</span>
                              <span className="tabular-nums">{formatPercent(c.percent)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-1.5 text-[11px] tabular-nums">
                      {v.effectiveFrom ? formatIst(v.effectiveFrom) : "Not published"}
                      {v.effectiveTo && (
                        <span className="block text-muted-foreground">
                          to {formatIst(v.effectiveTo)}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-[11px]">{v.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

function LifecycleDialog({
  project,
  busy,
  onClose,
  onSubmit,
}: {
  project: ProjectRowView;
  busy: boolean;
  onClose: () => void;
  onSubmit: (
    lifecycle: "SETUP_NOT_ACTIVE" | "ACTIVE" | "SOLD_OUT" | "COMPLETED",
    reason: string
  ) => void;
}) {
  return (
    <Modal
      title={`Change lifecycle — ${project.projectCode}`}
      description="Nothing may be sold while a Project is Unreleased."
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit(
            String(f.get("lifecycle")) as "SETUP_NOT_ACTIVE" | "ACTIVE" | "SOLD_OUT" | "COMPLETED",
            String(f.get("reason"))
          );
        }}
      >
        <Field label="Lifecycle">
          <select name="lifecycle" className={inputClass} defaultValue={project.lifecycle}>
            {Object.entries(LIFECYCLE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason — compulsory">
          <Input name="reason" required minLength={3} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Saving…" : "Change lifecycle"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
