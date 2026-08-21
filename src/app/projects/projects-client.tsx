"use client";

// Projects and PLC rules — DESIGN.md §7; PRD.md §16.

import React from "react";
import { useRouter } from "next/navigation";
import { Layers, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { formatIst, type StaffRole } from "@/lib/tasks";
import {
  createProjectAction,
  revisePlcRulesAction,
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
  reraNumber: string | null;
  reraExpiryDate: string | null;
  isExternalResaleGroup: boolean;
  plotCount: number;
  plcVersion: number | null;
  components: ComponentRow[];
};

const LIFECYCLE_LABEL: Record<string, string> = {
  SETUP_NOT_ACTIVE: "Setup / Not Active",
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
              A Project starts as Setup / Not Active. Inventory can be prepared while inactive;
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

        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((project) => (
            <Card key={project.id} className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">
                    {project.projectCode} · {project.name}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {project.type}
                    {project.location ? ` · ${project.location}` : ""}
                    {project.developer ? ` · ${project.developer}` : ""}
                  </p>
                </div>
                <Badge variant={project.lifecycle === "ACTIVE" ? "success" : "outline"}>
                  {LIFECYCLE_LABEL[project.lifecycle] ?? project.lifecycle}
                </Badge>
              </div>

              <dl className="space-y-1 text-xs">
                <Row label="Plots" value={String(project.plotCount)} />
                <Row
                  label="RERA"
                  value={
                    project.reraNumber
                      ? `${project.reraNumber}${
                          project.reraExpiryDate ? ` · expires ${formatIst(project.reraExpiryDate)}` : ""
                        }`
                      : "—"
                  }
                />
                {project.isExternalResaleGroup && (
                  <Row label="Type" value="External Resale Property Group" />
                )}
              </dl>

              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  PLC {project.plcVersion ? `version ${project.plcVersion}` : "— none set"}
                </p>
                {project.components.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {project.components.map((component) => (
                      <li key={component.code} className="flex justify-between gap-3">
                        <span>
                          {component.label}
                          <span className="ml-2 text-muted-foreground">{component.code}</span>
                        </span>
                        <span className="tabular-nums">{Number(component.percent).toFixed(2)}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {canSetup && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPlc(project)}>
                    <Layers className="mr-2 h-3.5 w-3.5" /> Revise PLC
                  </Button>
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

      {plc && (
        <PlcDialog
          project={plc}
          busy={busy}
          onClose={() => setPlc(null)}
          onSubmit={(components, reason) =>
            run(() => revisePlcRulesAction(plc.id, components, reason, newKey()))
          }
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
      description="Created as Setup / Not Active. Make it Active only when it is ready to sell."
      wide
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit({
            projectCode: String(f.get("projectCode")),
            name: String(f.get("name")),
            type: String(f.get("type")) as "RESIDENTIAL" | "COMMERCIAL" | "MIXED",
            developer: String(f.get("developer") ?? ""),
            location: String(f.get("location") ?? ""),
            reraNumber: String(f.get("reraNumber") ?? ""),
            reraExpiryDate: String(f.get("reraExpiryDate") ?? ""),
            isExternalResaleGroup: external,
            components,
          });
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Project Code">
            <Input name="projectCode" required placeholder="GRN" />
          </Field>
          <Field label="Project Name">
            <Input name="name" required />
          </Field>
          <Field label="Type">
            <select name="type" className={inputClass} defaultValue="RESIDENTIAL">
              <option value="RESIDENTIAL">Residential</option>
              <option value="COMMERCIAL">Commercial</option>
              <option value="MIXED">Mixed</option>
            </select>
          </Field>
          <Field label="Developer">
            <Input name="developer" />
          </Field>
          <Field label="Location">
            <Input name="location" />
          </Field>
          <Field label="RERA Number">
            <Input name="reraNumber" />
          </Field>
          <Field label="RERA expiry">
            <Input type="date" name="reraExpiryDate" />
          </Field>
        </div>

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

function PlcDialog({
  project,
  busy,
  onClose,
  onSubmit,
}: {
  project: ProjectRowView;
  busy: boolean;
  onClose: () => void;
  onSubmit: (components: ComponentRow[], reason: string) => void;
}) {
  const [components, setComponents] = React.useState<ComponentRow[]>(
    project.components.length > 0
      ? project.components.map((c) => ({ ...c, percent: Number(c.percent).toString() }))
      : [{ code: "", label: "", percent: "" }]
  );

  return (
    <Modal
      title={`Revise PLC — ${project.projectCode}`}
      description="This creates the next version and supersedes the current one. Holds and Bookings keep the snapshot they froze."
      wide
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(components, String(new FormData(e.currentTarget).get("reason")));
        }}
      >
        <ComponentEditor rows={components} onChange={setComponents} />
        <Field label="Reason — compulsory">
          <Input name="reason" required minLength={3} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Saving…" : "Save new PLC version"}
          </Button>
        </div>
      </form>
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
      description="Nothing may be sold while a Project is Setup / Not Active."
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
