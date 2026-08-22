"use client";

// Projects and PLC rules — DESIGN.md §7; PRD.md §16.

import React from "react";
import { useRouter } from "next/navigation";
import { Building2, Layers, MapPin, Pencil, Plus, ScrollText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
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

type ComponentRow = { code: string; label: string; percent: string };

export type ProjectRowView = {
  id: string;
  projectCode: string;
  name: string;
  type: string;
  lifecycle: string;
  developer: string | null;
  location: string | null;
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
      <div className="space-y-6">
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

        <div className="grid items-stretch gap-4 md:grid-cols-2">
          {rows.map((project) => (
            <Card
              key={project.id}
              className="group flex flex-col gap-4 rounded-xl border border-border/60 bg-card/70 p-5 shadow-sm transition-all hover:border-border hover:shadow-md dark:bg-card/40"
            >
              {/* One status in the header, on the right. The Project type is
                  not a status, so it reads as a quiet line under the name
                  rather than a second pill competing with the badge. */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold leading-tight tracking-tight text-foreground">
                    {project.name}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {project.isExternalResaleGroup
                      ? "External Resale Property Group"
                      : (TYPE_LABEL[project.type] ?? project.type)}
                  </p>
                </div>
                <Badge
                  variant={project.lifecycle === "ACTIVE" ? "success" : "outline"}
                  className="shrink-0"
                >
                  {LIFECYCLE_LABEL[project.lifecycle] ?? project.lifecycle}
                </Badge>
              </div>

              {/* Where it is, who builds it, what it is registered as. All
                  metadata, all at one size — none of it should compete with the
                  name above. A missing RERA number says nothing at all: the Edit
                  button is where you add one. */}
              {(project.city || project.location || project.developer || project.reraNumber) && (
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {(project.city || project.location) && (
                    <p className="flex items-start gap-2">
                      <MapPin className="mt-px h-3.5 w-3.5 shrink-0" />
                      <span>{[project.location, project.city].filter(Boolean).join(", ")}</span>
                    </p>
                  )}
                  {project.developer && (
                    <p className="flex items-start gap-2">
                      <Building2 className="mt-px h-3.5 w-3.5 shrink-0" />
                      <span>{project.developer}</span>
                    </p>
                  )}
                  {project.reraNumber && (
                    <p className="flex items-start gap-2">
                      <ScrollText className="mt-px h-3.5 w-3.5 shrink-0" />
                      <span>RERA {project.reraNumber}</span>
                    </p>
                  )}
                </div>
              )}

              {/* An External Resale Property Group holds acquired properties, not
                  developed inventory (PRD §11.6). Plots, PLC and amenities do not
                  apply to it. */}
              {!project.isExternalResaleGroup && (
                <>
                  <div className="grid gap-4 rounded-lg border border-border/50 bg-muted/30 p-3.5 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Plots
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
                        {project.plotCount}
                      </p>
                      {project.plotTypeCounts.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                          {/* Only the types this Project holds — a residential
                              layout should not read "0 Commercial". */}
                          {project.plotTypeCounts.map(({ plotType, count }) => (
                            <li key={plotType} className="tabular-nums">
                              {count} {PLOT_TYPE_LABEL[plotType] ?? plotType}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      {/* The version is a label, not a figure. It sits with the
                          heading rather than in the position the plot count uses
                          for a real number — a large "Version 1" beside a large
                          "120" reads as though the two were the same kind of
                          thing. The components are the content of this column. */}
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Plot Location Charge
                        {project.plcVersion ? ` · v${project.plcVersion}` : ""}
                      </p>
                      {project.components.length > 0 ? (
                        <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                          {project.components.map((component) => (
                            <li key={component.code} className="flex justify-between gap-3">
                              <span className="truncate">{component.label}</span>
                              <span className="shrink-0 font-medium tabular-nums text-foreground">
                                {Number(component.percent).toFixed(2)}%
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          No published version
                        </p>
                      )}
                    </div>
                  </div>

                  {amenityList(project.amenities).length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Amenities
                      </p>
                      <ul className="flex flex-wrap gap-1.5">
                        {amenityList(project.amenities).map((amenity) => (
                          <li
                            key={amenity}
                            className="rounded-full bg-secondary/80 px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
                          >
                            {amenity}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {canSetup && (
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3.5">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(project)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                    </Button>
                    {!project.isExternalResaleGroup && (
                      <Button size="sm" variant="outline" onClick={() => setPlc(project)}>
                        <Layers className="mr-2 h-3.5 w-3.5" /> PLC versions
                      </Button>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setLifecycle(project)}>
                    Change lifecycle
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
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

function ComponentEditor({
  rows,
  onChange,
}: {
  rows: ComponentRow[];
  onChange: (rows: ComponentRow[]) => void;
}) {
  const update = (index: number, patch: Partial<ComponentRow>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        PLC components — each distinct component is charged once, however many sides qualify
      </p>
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 md:grid-cols-3">
          <Field label="Code">
            <Input
              value={row.code}
              onChange={(e) => update(index, { code: e.target.value })}
              placeholder="ROAD_FACING"
            />
          </Field>
          <Field label="Label">
            <Input
              value={row.label}
              onChange={(e) => update(index, { label: e.target.value })}
              placeholder="Road facing"
            />
          </Field>
          <Field label="Percent">
            <Input
              value={row.percent}
              inputMode="decimal"
              onChange={(e) => update(index, { percent: e.target.value })}
            />
          </Field>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...rows, { code: "", label: "", percent: "" }])}
        >
          Add component
        </Button>
        {rows.length > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(rows.slice(0, -1))}>
            Remove last
          </Button>
        )}
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
  const [components, setComponents] = React.useState<ComponentRow[]>([
    { code: "ROAD_FACING", label: "Road facing", percent: "5" },
  ]);
  const [external, setExternal] = React.useState(false);

  return (
    <Modal
      title="New Project"
      description="Created as Unreleased. Make it Active only when it is ready to sell. The Project Code is generated from the name."
      wide
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            ...readProjectFields(new FormData(e.currentTarget)),
            isExternalResaleGroup: external,
            components,
          });
        }}
      >
        <ProjectFieldset />

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={external} onChange={(e) => setExternal(e.target.checked)} />
          This is an External Resale Property Group (holds acquired outside properties, PRD §11.6)
        </label>

        {!external && <ComponentEditor rows={components} onChange={setComponents} />}

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
      ? project.components.map((c) => ({ ...c, percent: Number(c.percent).toString() }))
      : [{ code: "", label: "", percent: "" }]
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
        <div className="mt-5 border-t border-border/50 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Drafts waiting to be published
          </h3>
          <ul className="mt-2 space-y-2 text-xs">
            {drafts.map((draft) => (
              <li key={draft.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Version {draft.version}
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    {draft.components.map((c) => `${c.code} ${Number(c.percent).toFixed(2)}%`).join(" · ") ||
                      "No component"}
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
      <div className="mt-5 border-t border-border/50 pt-4">
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
                  <th className="py-1">Components</th>
                  <th className="py-1">Effective</th>
                  <th className="py-1">Reason</th>
                </tr>
              </thead>
              <tbody>
                {project.plcVersions.map((v) => (
                  <tr key={v.id} className={v.status === "PUBLISHED" ? "" : "text-muted-foreground"}>
                    <td className="py-1 tabular-nums">{v.version}</td>
                    <td className="py-1">{PLC_STATUS_LABEL[v.status] ?? v.status}</td>
                    <td className="py-1">
                      {v.components.length === 0
                        ? "—"
                        : v.components
                            .map((c) => `${c.code} ${Number(c.percent).toFixed(2)}%`)
                            .join(" · ")}
                    </td>
                    <td className="py-1 text-[11px]">
                      {v.effectiveFrom ? formatIst(v.effectiveFrom) : "Not published"}
                      {v.effectiveTo && (
                        <span className="block">to {formatIst(v.effectiveTo)}</span>
                      )}
                    </td>
                    <td className="py-1 text-[11px]">{v.reason ?? "—"}</td>
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
