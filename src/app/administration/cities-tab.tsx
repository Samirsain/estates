"use client";

// Administration → Cities (owner, 17 Nov 2026): the City Master every City
// field picks from. Add, edit (the code included), activate/deactivate,
// import a CSV and export the whole list. Rows read A to Z.

import React from "react";
import { Download, Pencil, Plus, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal } from "@/components/ui/modal";
import { citiesToCsv, type CityFields, type CityRow } from "@/lib/domain/city";
import {
  createCityAction,
  importCitiesAction,
  setCityActiveAction,
  updateCityAction,
  type CityResult,
} from "./city-actions";

const newKey = () => `city-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function CitiesTab({ rows, onResult }: { rows: CityRow[]; onResult: (r: CityResult) => void }) {
  const [filter, setFilter] = React.useState("");
  const [editing, setEditing] = React.useState<CityRow | "NEW" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const q = filter.trim().toLowerCase();
  const shown = q
    ? rows.filter((r) => `${r.name} ${r.code} ${r.stateName} ${r.stateCode}`.toLowerCase().includes(q))
    : rows;

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([citiesToCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cities-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    onResult(await importCitiesAction(await file.text(), newKey()));
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function toggle(row: CityRow) {
    setBusy(true);
    onResult(await setCityActiveAction(row.id, !row.active, newKey()));
    setBusy(false);
  }

  return (
    <Card className="space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Cities</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-56 text-xs"
            placeholder="Filter name, code or state"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => importCsv(e.target.files?.[0])} />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 h-3.5 w-3.5" /> Import CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button size="sm" onClick={() => setEditing("NEW")}>
            <Plus className="mr-2 h-3.5 w-3.5" /> Add City
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              {["City ID", "City Name", "City Code", "State Name", "State Code", "Country Name", "Country Code", "Status", ""].map(
                (h) => (
                  <th key={h} className="py-1.5 pr-3 font-medium">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id} className="border-t border-border/40">
                <td className="py-1.5 pr-3 tabular-nums">{row.id}</td>
                <td className="py-1.5 pr-3 font-medium text-foreground">{row.name}</td>
                <td className="py-1.5 pr-3 font-mono">{row.code}</td>
                <td className="py-1.5 pr-3">{row.stateName}</td>
                <td className="py-1.5 pr-3 font-mono">{row.stateCode}</td>
                <td className="py-1.5 pr-3">{row.countryName}</td>
                <td className="py-1.5 pr-3 font-mono">{row.countryCode}</td>
                <td className="py-1.5 pr-3">
                  <Badge variant={row.active ? "secondary" : "destructive"}>{row.active ? "Active" : "Inactive"}</Badge>
                </td>
                <td className="whitespace-nowrap py-1.5 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => toggle(row)}>
                    {row.active ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="py-3 text-muted-foreground">
                  {rows.length ? "No city matches that filter." : "No cities yet. Add one or import a CSV."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <CityModal
          city={editing === "NEW" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(r) => {
            setEditing(null);
            onResult(r);
          }}
        />
      )}
    </Card>
  );
}

function CityModal({
  city,
  onClose,
  onSaved,
}: {
  city: CityRow | null;
  onClose: () => void;
  onSaved: (r: CityResult) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [key] = React.useState(newKey);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const input: CityFields = {
      name: String(f.get("name") ?? ""),
      code: String(f.get("code") ?? ""),
      stateName: String(f.get("stateName") ?? ""),
      stateCode: String(f.get("stateCode") ?? ""),
      countryName: String(f.get("countryName") ?? ""),
      countryCode: String(f.get("countryCode") ?? ""),
      active: city?.active ?? true,
    };
    setBusy(true);
    setError(null);
    const outcome = city ? await updateCityAction(city.id, input, key) : await createCityAction(input, key);
    setBusy(false);
    if (outcome.ok) onSaved(outcome);
    else setError(outcome.error);
  }

  return (
    <Modal title={city ? `Edit ${city.name}` : "Add City"} onClose={onClose} width="w-[min(26rem,94vw)]" centerTitle>
      <form className="space-y-3" onSubmit={submit}>
        <Field label="City Name">
          <Input name="name" required defaultValue={city?.name} placeholder="Hanumangarh" />
        </Field>
        <Field label="City Code">
          <Input
            name="code"
            className="uppercase"
            required={!!city}
            maxLength={6}
            defaultValue={city?.code}
            placeholder={city ? "HMH" : "Made from the name if left blank"}
          />
        </Field>
        <Field label="State Name">
          <Input name="stateName" required defaultValue={city?.stateName ?? "Rajasthan"} />
        </Field>
        <Field label="State Code">
          <Input name="stateCode" className="uppercase" required maxLength={3} defaultValue={city?.stateCode ?? "RJ"} />
        </Field>
        <Field label="Country Name">
          <Input name="countryName" required defaultValue={city?.countryName ?? "India"} />
        </Field>
        <Field label="Country Code">
          <Input name="countryCode" className="uppercase" required maxLength={3} defaultValue={city?.countryCode ?? "IN"} />
        </Field>
        {error && <p className="text-xs text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : city ? "Save" : "Add City"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
