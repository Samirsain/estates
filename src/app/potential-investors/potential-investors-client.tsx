"use client";

// Potential Investors — the list, and the three-field form that adds and edits it.

import React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Modal } from "@/components/ui/modal";
import { type StaffRole } from "@/lib/tasks";
import {
  addPotentialInvestorAction,
  deletePotentialInvestorAction,
  updatePotentialInvestorAction,
  type ActionResult,
} from "./actions";

export type PotentialInvestorRowView = {
  id: string;
  investorNo: string;
  name: string;
  /** Masked unless this actor may read it whole. */
  mobile: string;
  /** The City as stored, blank when none; the table prints "—" for blank. */
  city: string;
  addedOn: string;
};

type Dialog =
  | { kind: "ADD" }
  | { kind: "EDIT"; row: PotentialInvestorRowView }
  | { kind: "DELETE"; row: PotentialInvestorRowView }
  | null;

const newKey = () => globalThis.crypto.randomUUID();

export default function PotentialInvestorsClient({
  role,
  actorName,
  staffAccountId,
  rows,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  rows: PotentialInvestorRowView[];
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const visible = q
    ? rows.filter((r) => `${r.investorNo} ${r.name} ${r.mobile} ${r.city}`.toLowerCase().includes(q))
    : rows;

  function open(next: Dialog) {
    setError(null);
    setDialog(next);
  }

  async function run(action: () => Promise<ActionResult>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await action();
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    setDialog(null);
    router.refresh();
  }

  const errorBox = error && (
    <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {error}
    </p>
  );

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="mx-auto max-w-6xl space-y-3">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Potential Investors</h1>
          <Button size="sm" variant="gradient" onClick={() => open({ kind: "ADD" })}>
            <Plus className="mr-1 h-4 w-4" /> Add Potential Investor
          </Button>
        </header>

        <Input
          className="h-9 w-72"
          placeholder="Search ID, name, mobile or city"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-xs">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="w-[7rem] px-3 py-1.5">ID</th>
                <th className="px-3 py-1.5">Name</th>
                <th className="w-[7.5rem] px-3 py-1.5">Mobile</th>
                <th className="w-[9rem] px-3 py-1.5">City</th>
                <th className="w-[8rem] px-3 py-1.5">Added on</th>
                <th className="w-[5rem] px-3 py-1.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    {rows.length === 0 ? "No Potential Investors yet." : "Nothing matches that search."}
                  </td>
                </tr>
              )}
              {visible.map((row) => (
                <tr
                  key={row.id}
                  className="h-11 border-b border-border/60 align-middle last:border-0 hover:bg-secondary/50 [&>td]:px-3 [&>td]:py-1.5"
                >
                  <td className="whitespace-nowrap font-bold text-primary">{row.investorNo}</td>
                  <td className="truncate text-foreground" title={row.name}>{row.name}</td>
                  <td className="whitespace-nowrap">{row.mobile}</td>
                  <td className="truncate" title={row.city}>{row.city || "—"}</td>
                  <td className="whitespace-nowrap text-muted-foreground">{row.addedOn}</td>
                  <td className="whitespace-nowrap text-right">
                    <button
                      type="button"
                      aria-label={`Edit ${row.investorNo}`}
                      title="Edit"
                      onClick={() => open({ kind: "EDIT", row })}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${row.investorNo}`}
                      title="Delete"
                      onClick={() => open({ kind: "DELETE", row })}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(dialog?.kind === "ADD" || dialog?.kind === "EDIT") && (
        <Modal
          title={dialog.kind === "ADD" ? "Add Potential Investor" : `Edit ${dialog.row.investorNo}`}
          onClose={() => setDialog(null)}
        >
          {errorBox}
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const input = {
                fullName: String(f.get("fullName") ?? ""),
                mobile: String(f.get("mobile") ?? ""),
                city: String(f.get("city") ?? ""),
              };
              void run(() =>
                dialog.kind === "ADD"
                  ? addPotentialInvestorAction(input, newKey())
                  : updatePotentialInvestorAction(dialog.row.id, input, newKey())
              );
            }}
          >
            <Field label="Name">
              <Input
                name="fullName"
                required
                placeholder="e.g. Samir Sain"
                defaultValue={dialog.kind === "EDIT" ? dialog.row.name : undefined}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              {/* The list may only hold the number masked, so an edit never
                  prefills it: blank keeps the one on file. */}
              <Field label={dialog.kind === "ADD" ? "Mobile" : "Mobile — leave blank to keep"}>
                <Input
                  name="mobile"
                  required={dialog.kind === "ADD"}
                  inputMode="tel"
                  placeholder={dialog.kind === "EDIT" ? dialog.row.mobile : "9876543210"}
                />
              </Field>
              <Field label="City">
                <Input
                  name="city"
                  placeholder="Jaipur"
                  defaultValue={dialog.kind === "EDIT" ? dialog.row.city : undefined}
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialog(null)}>
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Saving…" : dialog.kind === "ADD" ? "Add" : "Save"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {dialog?.kind === "DELETE" && (
        <Modal title={`Delete ${dialog.row.investorNo}`} onClose={() => setDialog(null)}>
          {errorBox}
          <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
            <p className="font-semibold text-foreground">
              {dialog.row.investorNo} · {dialog.row.name}
            </p>
            <p className="mt-1 text-muted-foreground">
              The Potential Investor leaves the list for good. What it held stays in the audit trail.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setDialog(null)}>
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => void run(() => deletePotentialInvestorAction(dialog.row.id, newKey()))}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
