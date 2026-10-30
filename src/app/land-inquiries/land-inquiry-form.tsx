"use client";

// The Land Inquiry form — Land Inquiry spec §23.4, in its fourteen business
// sections and in that order.
//
// One component for Create and Edit. Two would drift, and the difference
// between them is one action call and whether the Inquiry No. exists yet.

import React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, inputClass } from "@/components/ui/modal";
import { PersonPicker, type PickerOption } from "@/components/person-picker";
import {
  RECEIVED_FROM_LABEL,
  humanise,
  metricViews,
  toSquareMetres,
  type LandInquiryInput,
  type LandMetricSourceUnit,
} from "@/lib/domain/land-inquiry";
import { createLandInquiryAction, updateLandInquiryAction } from "./actions";

export type FormOptions = {
  members: PickerOption[];
  customers: PickerOption[];
};

const POTENTIAL = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "AGRICULTURE", "FARMHOUSE", "WAREHOUSE"] as const;
const DOCUMENTS = [
  "JAMABANDI",
  "REGISTRY",
  "MUTATION",
  "BHU_NAKSHA",
  "KHASRA_MAP",
  "CONVERSION_ORDER_90A",
  "PATTA",
  "OWNER_ID",
  "SITE_PHOTOS",
  "LOCATION_MAP",
] as const;

/** Spec §11 — the metric units, and how many decimals each one reads to. */
const METRIC_FIELDS = [
  { unit: "HECTARE" as const, label: "Hectare", decimals: 6 },
  { unit: "SQ_M" as const, label: "Sq. Mtr.", decimals: 6 },
  { unit: "SQ_FT" as const, label: "Sq. Ft.", decimals: 2 },
];

function Section({
  index,
  title,
  hint,
  children,
}: {
  index: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4">
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-primary">
          <span className="mr-2 tabular-nums">{index}.</span>
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

/** Two columns for short fields, full width for long text (spec §23.4). */
const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-3 sm:grid-cols-2">{children}</div>
);

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  allowBlank,
  blankLabel = "—",
}: {
  label: string;
  value: T | null;
  options: readonly T[];
  onChange: (next: T | null) => void;
  allowBlank?: boolean;
  blankLabel?: string;
}) {
  return (
    <Field label={label}>
      <select
        className={inputClass}
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || null) as T | null)}
      >
        {allowBlank && <option value="">{blankLabel}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {humanise(o)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function CheckboxGroup<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: readonly T[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    // Even tiles, the same height as the inputs, so a row of choices lines up
    // with the fields around it; a ticked tile picks up the primary edge.
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((option) => (
        <label
          key={option}
          className="flex h-9 cursor-pointer select-none items-center gap-2 rounded-lg border border-input bg-card px-3 text-xs font-medium transition-colors hover:bg-secondary has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
        >
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-input accent-primary"
            checked={selected.includes(option)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...selected, option]
                  : selected.filter((s) => s !== option)
              )
            }
          />
          <span>{humanise(option)}</span>
        </label>
      ))}
    </div>
  );
}

export default function LandInquiryForm({
  mode,
  initial,
  options,
  inquiryNo,
  inquiryDate,
  id,
  version,
}: {
  mode: "create" | "edit";
  initial: LandInquiryInput;
  options: FormOptions;
  /** Blank on create: the number does not exist until the row does (spec §6). */
  inquiryNo?: string;
  inquiryDate: string;
  id?: string;
  version?: number;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<LandInquiryInput>(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Spec §26.6 — one submission key per form instance, so a double-click or a
  // retry after a dropped connection returns the first result rather than
  // creating a second inquiry.
  const [createRequestId] = React.useState(() => globalThis.crypto.randomUUID());

  const set = <K extends keyof LandInquiryInput>(key: K, value: LandInquiryInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** Spec §5 — changing the source type clears whatever the old one held, so
   *  a Member id can never travel with an Another Dealer inquiry. */
  const setReceivedFrom = (receivedFrom: LandInquiryInput["receivedFrom"]) =>
    setForm((f) => ({
      ...f,
      receivedFrom,
      sourcePersonId: null,
      anotherDealerMobile: null,
      anotherDealerName: null,
    }));

  /**
   * Spec §11 — one measurement shown in three units. The box the user typed in
   * shows exactly what they typed, because that is what is stored; the other
   * two are converted from it. Sq. Ft. reads to two decimals and Hectare to
   * six, and neither display rounds the canonical value.
   */
  const metric =
    form.areaSourceValue.trim() && form.areaSourceUnit && Number(form.areaSourceValue) > 0
      ? metricViews(toSquareMetres(Number(form.areaSourceValue), form.areaSourceUnit))
      : null;

  const metricValue = (unit: LandMetricSourceUnit, decimals: number) => {
    if (form.areaSourceUnit === unit) return form.areaSourceValue;
    if (!metric) return "";
    const derived =
      unit === "SQ_M" ? metric.sqM : unit === "HECTARE" ? metric.hectare : metric.sqFt;
    // Trailing zeros make a converted figure look more precise than it reads.
    return String(Number(derived.toFixed(decimals)));
  };

  async function submit() {
    setBusy(true);
    setError(null);
    const result =
      mode === "create"
        ? await createLandInquiryAction(form, createRequestId)
        : await updateLandInquiryAction(
            { id: id!, version: version!, input: form },
            globalThis.crypto.randomUUID()
          );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/land-inquiries/${result.id ?? id}`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {/* 1 */}
      <Section index={1} title="Inquiry Details">
        <Grid>
          {/* Only once it exists. On a new inquiry the number is issued by the
              database at save, so a row saying so is a row that tells nobody
              anything — and the heading carries it on an edit anyway. */}
          {inquiryNo && (
            <Field label="Inquiry No.">
              <div className={`${inputClass} flex items-center text-muted-foreground`}>
                {inquiryNo}
              </div>
            </Field>
          )}
          <Field label="Date">
            <div className={`${inputClass} flex items-center text-muted-foreground`}>
              {inquiryDate}
            </div>
          </Field>
          <Choice
            label="Received From"
            value={form.receivedFrom}
            options={["MEMBER", "CUSTOMER", "THREE_PERCENT_CLUB", "ANOTHER_DEALER"] as const}
            onChange={(v) => setReceivedFrom(v ?? "MEMBER")}
          />
          {form.receivedFrom === "MEMBER" && (
            <Field label="Member">
              <PersonPicker
                options={options.members}
                value={form.sourcePersonId ?? ""}
                onChange={(personId) => set("sourcePersonId", personId || null)}
                placeholder="Search Member ID, name or mobile"
              />
            </Field>
          )}
          {form.receivedFrom === "CUSTOMER" && (
            <Field label="Customer">
              <PersonPicker
                options={options.customers}
                value={form.sourcePersonId ?? ""}
                onChange={(personId) => set("sourcePersonId", personId || null)}
                placeholder="Search Customer ID, name or mobile"
              />
            </Field>
          )}
          {form.receivedFrom === "ANOTHER_DEALER" && (
            <>
              <Field label="Dealer Name">
                <Input
                  className="h-9"
                  value={form.anotherDealerName ?? ""}
                  onChange={(e) => set("anotherDealerName", e.target.value)}
                  placeholder="As told on the call"
                />
              </Field>
              <Field label="Dealer Mobile Number">
                <Input
                  className="h-9"
                  value={form.anotherDealerMobile ?? ""}
                  onChange={(e) => set("anotherDealerMobile", e.target.value)}
                  placeholder="10-digit mobile"
                />
              </Field>
            </>
          )}
          {form.receivedFrom === "THREE_PERCENT_CLUB" && (
            <Field label="Source">
              <div className={`${inputClass} flex items-center text-muted-foreground`}>
                3% Club — the company&apos;s own sourcing
              </div>
            </Field>
          )}
        </Grid>
        {form.receivedFrom === "ANOTHER_DEALER" && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            A dealer&apos;s name and mobile are kept on this inquiry only. No Person, Customer or
            Member record is created for them, and the same dealer may appear on other
            inquiries as an unrelated pair of strings.
          </p>
        )}
      </Section>

      {/* 2 */}
      <Section index={2} title="Land Owner Details">
        <div className="space-y-2">
          {form.owners.map((owner, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
              <Input
                className="h-9"
                placeholder="Owner name"
                value={owner.ownerName}
                onChange={(e) =>
                  set(
                    "owners",
                    form.owners.map((o, j) =>
                      j === i ? { ...o, ownerName: e.target.value } : o
                    )
                  )
                }
              />
              <Input
                className="h-9"
                placeholder="Mobile (optional)"
                value={owner.mobile ?? ""}
                onChange={(e) =>
                  set(
                    "owners",
                    form.owners.map((o, j) => (j === i ? { ...o, mobile: e.target.value } : o))
                  )
                }
              />
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={owner.isPrimary ? "default" : "outline"}
                  onClick={() =>
                    set(
                      "owners",
                      form.owners.map((o, j) => ({ ...o, isPrimary: j === i }))
                    )
                  }
                  title="Make Primary Owner"
                >
                  <Star className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    // Spec §8 — removing the Primary promotes the earliest one
                    // left; removing the last one leaves none, which is valid.
                    const rest = form.owners.filter((_, j) => j !== i);
                    set(
                      "owners",
                      rest.length && !rest.some((o) => o.isPrimary)
                        ? rest.map((o, j) => ({ ...o, isPrimary: j === 0 }))
                        : rest
                    );
                  }}
                  title="Remove owner"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              set("owners", [
                ...form.owners,
                { ownerName: "", mobile: "", isPrimary: form.owners.length === 0 },
              ])
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Owner
          </Button>
        </div>
      </Section>

      {/* 3 */}
      <Section index={3} title="Location">
        <Grid>
          <Field label="District">
            <Input className="h-9" value={form.district} onChange={(e) => set("district", e.target.value)} />
          </Field>
          <Field label="Tehsil">
            <Input className="h-9" value={form.tehsil} onChange={(e) => set("tehsil", e.target.value)} />
          </Field>
          <Field label="Latitude">
            <Input className="h-9" value={form.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="26.9124" />
          </Field>
          <Field label="Longitude">
            <Input className="h-9" value={form.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="75.7873" />
          </Field>
        </Grid>
        <div className="mt-3">
          <Field label="Exact Location">
            <textarea
              className={`${inputClass} h-16 py-2`}
              value={form.exactLocation}
              onChange={(e) => set("exactLocation", e.target.value)}
            />
          </Field>
          {form.latitude.trim() && form.longitude.trim() && (
            <a
              className="mt-1 inline-block text-[11px] text-primary hover:underline"
              href={`https://www.google.com/maps?q=${form.latitude.trim()},${form.longitude.trim()}`}
              target="_blank"
              rel="noreferrer"
            >
              Open this pin in Google Maps
            </a>
          )}
        </div>
      </Section>

      {/* 4 */}
      <Section index={4} title="Jamabandi Details" hint="A row needs at least one of the three.">
        <div className="space-y-2">
          {form.jamabandiEntries.map((row, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              {(["murbbaNo", "patharNo", "khasraNo"] as const).map((key) => (
                <Input
                  key={key}
                  className="h-9"
                  placeholder={
                    key === "murbbaNo" ? "Murbba No." : key === "patharNo" ? "Pathar No." : "Khasra No."
                  }
                  value={row[key]}
                  onChange={(e) =>
                    set(
                      "jamabandiEntries",
                      form.jamabandiEntries.map((r, j) =>
                        j === i ? { ...r, [key]: e.target.value } : r
                      )
                    )
                  }
                />
              ))}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  set(
                    "jamabandiEntries",
                    form.jamabandiEntries.filter((_, j) => j !== i)
                  )
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              set("jamabandiEntries", [
                ...form.jamabandiEntries,
                { murbbaNo: "", patharNo: "", khasraNo: "" },
              ])
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Row
          </Button>
        </div>
      </Section>

      {/* 5 */}
      <Section index={5} title="Land Details">
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Local measure
            </p>
            <Grid>
              <Field label="Bigha">
                <Input
                  className="h-9"
                  value={form.areaBigha}
                  onChange={(e) => set("areaBigha", e.target.value)}
                />
              </Field>
              <Field label="Biswa">
                <Input
                  className="h-9"
                  value={form.areaBiswa}
                  onChange={(e) => set("areaBiswa", e.target.value)}
                />
              </Field>
            </Grid>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Metric measure
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {METRIC_FIELDS.map(({ unit, label, decimals }) => (
                <Field key={unit} label={label}>
                  <Input
                    className="h-9"
                    value={metricValue(unit, decimals)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        areaSourceUnit: unit,
                        areaSourceValue: e.target.value,
                      }))
                    }
                  />
                </Field>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <Grid>
            <Field label="Frontage">
              <div className="flex gap-2">
                <Input className="h-9" value={form.frontageValue} onChange={(e) => set("frontageValue", e.target.value)} />
                <select
                  className={`${inputClass} w-24`}
                  value={form.frontageUnit ?? "FT"}
                  onChange={(e) => set("frontageUnit", e.target.value as "FT" | "MTR")}
                >
                  <option value="FT">Ft</option>
                  <option value="MTR">Mtr</option>
                </select>
              </div>
            </Field>
            <Field label="Approach Road Width">
              <div className="flex gap-2">
                <Input className="h-9" value={form.roadWidthValue} onChange={(e) => set("roadWidthValue", e.target.value)} />
                <select
                  className={`${inputClass} w-24`}
                  value={form.roadWidthUnit ?? "FT"}
                  onChange={(e) => set("roadWidthUnit", e.target.value as "FT" | "MTR")}
                >
                  <option value="FT">Ft</option>
                  <option value="MTR">Mtr</option>
                </select>
              </div>
            </Field>
          </Grid>
        </div>
      </Section>

      {/* 6 */}
      <Section index={6} title="Development Potential">
        <div className="space-y-4">
          <CheckboxGroup
            options={POTENTIAL}
            selected={form.developmentPotential}
            onChange={(v) => set("developmentPotential", v)}
          />
          <Grid>
            <Field label="Current Land Use">
              <Input className="h-9" value={form.currentLandUse} onChange={(e) => set("currentLandUse", e.target.value)} />
            </Field>
            <Field label="Master Plan / Zonal Use">
              <Input
                className="h-9"
                value={form.masterPlanZonalUse}
                onChange={(e) => set("masterPlanZonalUse", e.target.value)}
              />
            </Field>
          </Grid>
        </div>
      </Section>

      {/* 7 */}
      <Section index={7} title="Documents Received">
        <CheckboxGroup
          options={DOCUMENTS}
          selected={form.documentsReceived}
          onChange={(v) => set("documentsReceived", v)}
        />
      </Section>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-destructive/10 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 pb-6">
        <Button onClick={submit} disabled={busy} variant="gradient">
          {busy ? "Saving…" : mode === "create" ? "Create Land Inquiry" : "Save Changes"}
        </Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
