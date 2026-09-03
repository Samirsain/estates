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
  RATE_BASIS_LABEL,
  RECEIVED_FROM_LABEL,
  metricViews,
  toSquareMetres,
  type LandMetricSourceUnit,
} from "@/lib/domain/land-inquiry";
import type { LandInquiryInput } from "@/lib/services/land-inquiry-service";
import { createLandInquiryAction, updateLandInquiryAction } from "./actions";

export type FormOptions = {
  members: PickerOption[];
  customers: PickerOption[];
  staff: Array<{ id: string; label: string }>;
};

const CHECK_STATES = ["UNKNOWN", "YES", "NO"] as const;
const APPROVAL_STATES = [
  "UNKNOWN",
  "NOT_APPLICABLE",
  "NOT_STARTED",
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;
const CATEGORIES = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "AGRICULTURAL", "OTHER"] as const;
const POTENTIAL = ["RESIDENTIAL", "COMMERCIAL", "WAREHOUSE", "AGRICULTURE", "OTHER"] as const;
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
const EVALUATIONS = [
  "SITE_VISIT_REQUIRED",
  "LEGAL_VERIFICATION_REQUIRED",
  "REVENUE_VERIFICATION_REQUIRED",
] as const;
const RATE_BASES = ["TOTAL", "PER_BIGHA", "PER_BISWA", "PER_HECTARE", "PER_SQ_M", "PER_SQ_FT"] as const;

export const humanise = (value: string) =>
  value
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ")
    .replace("Bhu Naksha", "Bhu-Naksha")
    .replace("Conversion Order 90a", "90A / Conversion Order")
    .replace("Owner Id", "Owner ID")
    .replace("Sq M", "Sq. Mtr.")
    .replace("Sq Ft", "Sq. Ft.");

export const emptyInput = (): LandInquiryInput => ({
  receivedFrom: "MEMBER",
  sourcePersonId: null,
  anotherDealerMobile: null,
  assignedToId: null,
  district: "",
  tehsil: "",
  exactLocation: "",
  latitude: "",
  longitude: "",
  areaBigha: "",
  areaBiswa: "",
  areaSourceUnit: "SQ_M",
  areaSourceValue: "",
  dimensions: "",
  frontageValue: "",
  frontageUnit: "FT",
  roadWidthValue: "",
  roadWidthUnit: "FT",
  shape: "",
  boundaries: "",
  landCategory: null,
  currentLandUse: "",
  masterPlanZonalUse: "",
  status90A: "UNKNOWN",
  landConversionStatus: "UNKNOWN",
  changeLandUseStatus: "UNKNOWN",
  pattaLeaseStatus: "UNKNOWN",
  registrySaleDeedAvailable: "UNKNOWN",
  mutationComplete: "UNKNOWN",
  mortgageBankCharge: "UNKNOWN",
  courtCaseStay: "UNKNOWN",
  familyDispute: "UNKNOWN",
  acquisitionNotice: "UNKNOWN",
  governmentRestriction: "UNKNOWN",
  approachRoad: "UNKNOWN",
  roadType: "",
  electricity: "UNKNOWN",
  water: "UNKNOWN",
  sewerage: "UNKNOWN",
  existingConstruction: "UNKNOWN",
  encroachment: "UNKNOWN",
  possessionStatus: "",
  ownerAskingRate: "",
  ownerAskingRateBasis: null,
  totalAskingValue: "",
  negotiable: null,
  dlcRate: "",
  dlcRateBasis: null,
  expectedPurchaseRate: "",
  expectedPurchaseRateBasis: null,
  paymentExpectation: "",
  developmentPotential: [],
  documentsReceived: [],
  evaluation: [],
  owners: [],
  jamabandiEntries: [],
});

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
        <h2 className="text-sm font-semibold">
          <span className="mr-2 text-muted-foreground tabular-nums">{index}.</span>
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
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {options.map((option) => (
        <label key={option} className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-input"
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
    setForm((f) => ({ ...f, receivedFrom, sourcePersonId: null, anotherDealerMobile: null }));

  const metric =
    form.areaSourceValue.trim() && form.areaSourceUnit && Number(form.areaSourceValue) > 0
      ? metricViews(toSquareMetres(Number(form.areaSourceValue), form.areaSourceUnit))
      : null;

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
      <Section
        index={1}
        title="Inquiry Details"
        hint="The number and the date are the system's. Received From decides what the source is."
      >
        <Grid>
          <Field label="Inquiry No.">
            <div className={`${inputClass} flex items-center text-muted-foreground`}>
              {inquiryNo ?? "Generated after Save"}
            </div>
          </Field>
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
            <Field label="Dealer Mobile Number">
              <Input
                className="h-9"
                value={form.anotherDealerMobile ?? ""}
                onChange={(e) => set("anotherDealerMobile", e.target.value)}
                placeholder="10-digit mobile"
              />
            </Field>
          )}
          {form.receivedFrom === "THREE_PERCENT_CLUB" && (
            <Field label="Source">
              <div className={`${inputClass} flex items-center text-muted-foreground`}>
                3% Club — the company&apos;s own sourcing
              </div>
            </Field>
          )}
          <Field label="Assigned To">
            <select
              className={inputClass}
              value={form.assignedToId ?? ""}
              onChange={(e) => set("assignedToId", e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {options.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </Grid>
        {form.receivedFrom === "ANOTHER_DEALER" && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            A dealer&apos;s mobile is kept on this inquiry only. No Person, Customer, Member or
            portal record is created for it, and the same number may appear on other inquiries.
          </p>
        )}
      </Section>

      {/* 2 */}
      <Section
        index={2}
        title="Land Owner Details"
        hint="The first owner is Primary. Owners are recorded on the inquiry, not created as people."
      >
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
              {(["murbbaNo", "patwarNo", "khasraNo"] as const).map((key) => (
                <Input
                  key={key}
                  className="h-9"
                  placeholder={
                    key === "murbbaNo" ? "Murbba No." : key === "patwarNo" ? "Patwar No." : "Khasra No."
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
                { murbbaNo: "", patwarNo: "", khasraNo: "" },
              ])
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Row
          </Button>
        </div>
      </Section>

      {/* 5 */}
      <Section
        index={5}
        title="Land Details"
        hint="Bigha and Biswa are local measures and are stored exactly as entered — no statewide conversion exists to apply."
      >
        <Grid>
          <Field label="Bigha">
            <Input className="h-9" value={form.areaBigha} onChange={(e) => set("areaBigha", e.target.value)} />
          </Field>
          <Field label="Biswa">
            <Input className="h-9" value={form.areaBiswa} onChange={(e) => set("areaBiswa", e.target.value)} />
          </Field>
          <Field label="Metric Area">
            <Input
              className="h-9"
              value={form.areaSourceValue}
              onChange={(e) => set("areaSourceValue", e.target.value)}
              placeholder="Measured area"
            />
          </Field>
          <Choice
            label="Metric Unit"
            value={form.areaSourceUnit}
            options={["SQ_M", "HECTARE", "SQ_FT"] as const satisfies readonly LandMetricSourceUnit[]}
            onChange={(v) => set("areaSourceUnit", v)}
          />
        </Grid>
        {metric && (
          <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
            {metric.sqM.toFixed(6)} Sq. Mtr. · {metric.hectare.toFixed(6)} Hectare ·{" "}
            {metric.sqFt.toFixed(2)} Sq. Ft.
          </p>
        )}
        <div className="mt-3">
          <Grid>
            <Field label="Dimensions">
              <Input className="h-9" value={form.dimensions} onChange={(e) => set("dimensions", e.target.value)} />
            </Field>
            <Field label="Shape">
              <Input className="h-9" value={form.shape} onChange={(e) => set("shape", e.target.value)} />
            </Field>
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
            <Field label="Road Width">
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
          <div className="mt-3">
            <Field label="Boundaries">
              <textarea
                className={`${inputClass} h-16 py-2`}
                value={form.boundaries}
                onChange={(e) => set("boundaries", e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Section>

      {/* 6 */}
      <Section index={6} title="Land Category / Use">
        <Grid>
          <Choice
            label="Category"
            value={form.landCategory}
            options={CATEGORIES}
            onChange={(v) => set("landCategory", v)}
            allowBlank
          />
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
      </Section>

      {/* 7 */}
      <Section
        index={7}
        title="Conversion / Approval"
        hint="Internal tracking only. Never a guarantee of title, legality or a future approval."
      >
        <Grid>
          <Choice label="90A Status" value={form.status90A} options={APPROVAL_STATES} onChange={(v) => set("status90A", v ?? "UNKNOWN")} />
          <Choice label="Land Conversion Status" value={form.landConversionStatus} options={APPROVAL_STATES} onChange={(v) => set("landConversionStatus", v ?? "UNKNOWN")} />
          <Choice label="Change of Land Use Status" value={form.changeLandUseStatus} options={APPROVAL_STATES} onChange={(v) => set("changeLandUseStatus", v ?? "UNKNOWN")} />
          <Choice label="Patta / Lease Status" value={form.pattaLeaseStatus} options={APPROVAL_STATES} onChange={(v) => set("pattaLeaseStatus", v ?? "UNKNOWN")} />
        </Grid>
      </Section>

      {/* 8 */}
      <Section
        index={8}
        title="Legal Check"
        hint="Unknown is a real answer. On the risk lines, Yes means the issue exists or has been reported."
      >
        <Grid>
          <Choice label="Registry / Sale Deed Available" value={form.registrySaleDeedAvailable} options={CHECK_STATES} onChange={(v) => set("registrySaleDeedAvailable", v ?? "UNKNOWN")} />
          <Choice label="Mutation Complete" value={form.mutationComplete} options={CHECK_STATES} onChange={(v) => set("mutationComplete", v ?? "UNKNOWN")} />
          <Choice label="Mortgage / Bank Charge" value={form.mortgageBankCharge} options={CHECK_STATES} onChange={(v) => set("mortgageBankCharge", v ?? "UNKNOWN")} />
          <Choice label="Court Case / Stay" value={form.courtCaseStay} options={CHECK_STATES} onChange={(v) => set("courtCaseStay", v ?? "UNKNOWN")} />
          <Choice label="Family Dispute" value={form.familyDispute} options={CHECK_STATES} onChange={(v) => set("familyDispute", v ?? "UNKNOWN")} />
          <Choice label="Acquisition Notice" value={form.acquisitionNotice} options={CHECK_STATES} onChange={(v) => set("acquisitionNotice", v ?? "UNKNOWN")} />
          <Choice label="Government Restriction" value={form.governmentRestriction} options={CHECK_STATES} onChange={(v) => set("governmentRestriction", v ?? "UNKNOWN")} />
        </Grid>
      </Section>

      {/* 9 */}
      <Section index={9} title="Access &amp; Site Condition">
        <Grid>
          <Choice label="Approach Road" value={form.approachRoad} options={CHECK_STATES} onChange={(v) => set("approachRoad", v ?? "UNKNOWN")} />
          <Field label="Road Type">
            <Input className="h-9" value={form.roadType} onChange={(e) => set("roadType", e.target.value)} />
          </Field>
          <Choice label="Electricity" value={form.electricity} options={CHECK_STATES} onChange={(v) => set("electricity", v ?? "UNKNOWN")} />
          <Choice label="Water" value={form.water} options={CHECK_STATES} onChange={(v) => set("water", v ?? "UNKNOWN")} />
          <Choice label="Sewerage" value={form.sewerage} options={CHECK_STATES} onChange={(v) => set("sewerage", v ?? "UNKNOWN")} />
          <Choice label="Existing Construction" value={form.existingConstruction} options={CHECK_STATES} onChange={(v) => set("existingConstruction", v ?? "UNKNOWN")} />
          <Choice label="Encroachment" value={form.encroachment} options={CHECK_STATES} onChange={(v) => set("encroachment", v ?? "UNKNOWN")} />
          <Field label="Possession Status">
            <Input className="h-9" value={form.possessionStatus} onChange={(e) => set("possessionStatus", e.target.value)} />
          </Field>
        </Grid>
      </Section>

      {/* 10 */}
      <Section
        index={10}
        title="Commercial Details"
        hint="Pre-acquisition figures only. Nothing here reaches a Booking, a Payment, a Commission or accounting."
      >
        <Grid>
          <Field label="Owner Asking Rate (₹)">
            <div className="flex gap-2">
              <Input className="h-9" value={form.ownerAskingRate} onChange={(e) => set("ownerAskingRate", e.target.value)} />
              <select
                className={`${inputClass} w-36`}
                value={form.ownerAskingRateBasis ?? ""}
                onChange={(e) => set("ownerAskingRateBasis", (e.target.value || null) as never)}
              >
                <option value="">Basis…</option>
                {RATE_BASES.map((b) => (
                  <option key={b} value={b}>
                    {RATE_BASIS_LABEL[b]}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Total Asking Value (₹)">
            <Input
              className="h-9"
              value={form.totalAskingValue}
              onChange={(e) => set("totalAskingValue", e.target.value)}
              placeholder="As stated by the owner"
            />
          </Field>
          <Field label="DLC Rate (₹)">
            <div className="flex gap-2">
              <Input className="h-9" value={form.dlcRate} onChange={(e) => set("dlcRate", e.target.value)} />
              <select
                className={`${inputClass} w-36`}
                value={form.dlcRateBasis ?? ""}
                onChange={(e) => set("dlcRateBasis", (e.target.value || null) as never)}
              >
                <option value="">Basis…</option>
                {RATE_BASES.map((b) => (
                  <option key={b} value={b}>
                    {RATE_BASIS_LABEL[b]}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Expected Purchase Rate (₹)">
            <div className="flex gap-2">
              <Input
                className="h-9"
                value={form.expectedPurchaseRate}
                onChange={(e) => set("expectedPurchaseRate", e.target.value)}
              />
              <select
                className={`${inputClass} w-36`}
                value={form.expectedPurchaseRateBasis ?? ""}
                onChange={(e) => set("expectedPurchaseRateBasis", (e.target.value || null) as never)}
              >
                <option value="">Basis…</option>
                {RATE_BASES.map((b) => (
                  <option key={b} value={b}>
                    {RATE_BASIS_LABEL[b]}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Negotiable">
            <select
              className={inputClass}
              value={form.negotiable === null ? "" : form.negotiable ? "YES" : "NO"}
              onChange={(e) =>
                set("negotiable", e.target.value === "" ? null : e.target.value === "YES")
              }
            >
              <option value="">Unknown</option>
              <option value="YES">Yes</option>
              <option value="NO">No</option>
            </select>
          </Field>
        </Grid>
        <div className="mt-3">
          <Field label="Payment Expectation">
            <textarea
              className={`${inputClass} h-16 py-2`}
              value={form.paymentExpectation}
              onChange={(e) => set("paymentExpectation", e.target.value)}
              placeholder="Token expectation, balance timeline, registry-linked payment…"
            />
          </Field>
        </div>
      </Section>

      {/* 11 */}
      <Section index={11} title="Development Potential">
        <CheckboxGroup
          options={POTENTIAL}
          selected={form.developmentPotential}
          onChange={(v) => set("developmentPotential", v)}
        />
      </Section>

      {/* 12 */}
      <Section
        index={12}
        title="Documents Received"
        hint="A record of what the inquiry says was received. Nothing is uploaded or legally verified here."
      >
        <CheckboxGroup
          options={DOCUMENTS}
          selected={form.documentsReceived}
          onChange={(v) => set("documentsReceived", v)}
        />
      </Section>

      {/* 13 */}
      <Section index={13} title="Evaluation">
        <CheckboxGroup options={EVALUATIONS} selected={form.evaluation} onChange={(v) => set("evaluation", v)} />
      </Section>

      {/* 14 */}
      <Section
        index={14}
        title="Inquiry Stage"
        hint={
          mode === "create"
            ? "A new inquiry starts Working at stage New. The stage moves from the inquiry's own screen, where the reason is recorded."
            : "The stage and the status move from the inquiry's own screen, so the reason travels with them."
        }
      >
        <p className="text-xs text-muted-foreground">
          {mode === "create" ? "Working · New" : "Managed on the inquiry screen."}
        </p>
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
        <span className="text-[11px] text-muted-foreground">
          Every business section may be left blank. Only the source is required.
        </span>
      </div>
    </div>
  );
}
