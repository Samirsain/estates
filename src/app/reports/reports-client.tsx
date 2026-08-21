"use client";

// Reports — DESIGN.md §16; PRD.md §21.
// Payment Received and Payment Given are separate reports by design, never one
// merged money view (PRD §1.2).

import React from "react";
import { Download, FileSpreadsheet, Play } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { formatIst, type StaffRole } from "@/lib/tasks";
import type { ReportName } from "@/lib/services/report-service";
import { exportReportAction, runReportAction, type ReportResult, type ReportRow } from "./actions";

const REPORTS: Array<{ name: ReportName; label: string; note: string }> = [
  { name: "BOOKINGS", label: "Bookings", note: "Every Booking with its Plot, Customer and payment progress." },
  { name: "PAYMENTS_RECEIVED", label: "Payment Received", note: "Sale-side receipts. Its own dataset (PRD §1.2)." },
  { name: "PAYMENTS_GIVEN", label: "Payment Given", note: "Acquisition-side payments. Never merged with the sale side." },
  { name: "COMMISSION", label: "Commission", note: "Current records only — superseded rows are excluded (PRD §21)." },
  { name: "INVENTORY", label: "Plot Inventory", note: "Every Plot with lifecycle, restriction and resale flag." },
  { name: "COMPLETIONS", label: "Allotment / Registry", note: "Delivered Bookings and the route that completed them." },
];

export type ExportLogView = {
  id: string;
  at: string;
  report: string;
  actorRef: string;
  rowCount: number;
};

export default function ReportsClient({
  role,
  actorName,
  staffAccountId,
  canExport,
  projects,
  recentExports,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  canExport: boolean;
  projects: Array<{ id: string; name: string; projectCode: string }>;
  recentExports: ExportLogView[];
}) {
  const [report, setReport] = React.useState<ReportName>("BOOKINGS");
  const [projectId, setProjectId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ReportResult | null>(null);
  const [masked, setMasked] = React.useState(false);

  const filters = { projectId, from, to };
  const active = REPORTS.find((r) => r.name === report)!;

  async function run(kind: "VIEW" | "EXPORT") {
    setBusy(true);
    setResult(null);
    const outcome =
      kind === "VIEW"
        ? await runReportAction(report, filters)
        : await exportReportAction(report, filters);
    setMasked(kind === "EXPORT");
    setResult(outcome);
    setBusy(false);
  }

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="text-xs text-muted-foreground">
            Live from current records. Exports are masked and logged with the filters, user and row
            count (PRD §21).
          </p>
        </div>

        <Card className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Report">
              <select
                className={inputClass}
                value={report}
                onChange={(e) => setReport(e.target.value as ReportName)}
              >
                {REPORTS.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project (optional)">
              <select
                className={inputClass}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode} · {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From (optional)">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To (optional)">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>

          <p className="text-xs text-muted-foreground">{active.note}</p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run("VIEW")} disabled={busy}>
              <Play className="mr-2 h-3.5 w-3.5" />
              {busy ? "Running…" : "Run report"}
            </Button>
            {canExport && (
              <Button variant="outline" onClick={() => run("EXPORT")} disabled={busy}>
                <Download className="mr-2 h-3.5 w-3.5" />
                Export (masked)
              </Button>
            )}
          </div>
        </Card>

        {result && !result.ok && (
          <Card className="border-red-500/40 p-4 text-sm text-red-300">{result.error}</Card>
        )}

        {result?.ok && (
          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {active.label} · {result.rows.length} row{result.rows.length === 1 ? "" : "s"}
              </h2>
              {masked && (
                <Badge variant="secondary">
                  Masked export logged{result.exportId ? ` · ${result.exportId.slice(0, 8)}` : ""}
                </Badge>
              )}
            </div>

            {result.rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No records match these filters.</p>
            ) : (
              <ReportTable columns={result.columns} rows={result.rows} />
            )}
          </Card>
        )}

        {canExport && recentExports.length > 0 && (
          <Card className="space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <FileSpreadsheet className="h-4 w-4" /> Recent exports
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 pr-4 font-medium">Report</th>
                    <th className="py-2 pr-4 font-medium">By</th>
                    <th className="py-2 pr-4 font-medium">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {recentExports.map((log) => (
                    <tr key={log.id} className="border-t border-border/40">
                      <td className="py-2 pr-4">{formatIst(log.at)}</td>
                      <td className="py-2 pr-4">{log.report}</td>
                      <td className="py-2 pr-4">{log.actorRef}</td>
                      <td className="py-2 pr-4">{log.rowCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function ReportTable({ columns, rows }: { columns: string[]; rows: ReportRow[] }) {
  return (
    <div className="max-h-[32rem] overflow-auto">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap py-2 pr-4 font-medium">
                {humanise(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-border/40">
              {columns.map((column) => (
                <td key={column} className="whitespace-nowrap py-2 pr-4">
                  {display(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function humanise(column: string): string {
  return column
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function display(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  // Dates arrive as ISO strings across the server-action boundary.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatIst(value);
  if (value instanceof Date) return formatIst(value);
  return String(value);
}
