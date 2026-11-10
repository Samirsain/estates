"use client";

// Firm Name, Deals In, Experience — the same fields on Add Member and on the
// Member profile's Edit details, so what is skipped at joining is filled later.

import React from "react";
import { Input } from "@/components/ui/input";
import { Field, inputClass } from "@/components/ui/modal";
import { DEALS_IN, EXPERIENCE_BANDS, type MemberBusinessInput } from "@/lib/domain/member-business";

/** The raw values; the server cleans them with cleanMemberBusiness. */
export function readMemberBusiness(f: FormData): MemberBusinessInput {
  return {
    firmName: String(f.get("firmName") ?? ""),
    dealsIn: f.getAll("dealsIn").map(String),
    experienceBand: String(f.get("experienceBand") ?? ""),
    experienceYears: String(f.get("experienceYears") ?? ""),
  };
}

export function MemberBusinessFields({
  firmName = "",
  dealsIn = [],
  experience = null,
}: {
  firmName?: string;
  dealsIn?: string[];
  /** As stored: a band value or Other's years. */
  experience?: string | null;
}) {
  const isBand = EXPERIENCE_BANDS.some((b) => b.value === experience);
  const [band, setBand] = React.useState(!experience ? "" : isBand ? experience : "OTHER");

  return (
    <>
      <Field label="Company / Firm Name (optional)">
        <Input name="firmName" defaultValue={firmName} />
      </Field>

      {/* A fieldset, not a Field: Field is a <label>, and a label may hold one control. */}
      <fieldset className="space-y-1 text-xs font-medium text-muted-foreground">
        <legend className="pb-1">Deals In (optional)</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {DEALS_IN.map((d) => (
            <label key={d.value} className="flex items-center gap-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                name="dealsIn"
                value={d.value}
                defaultChecked={dealsIn.includes(d.value)}
                className="h-4 w-4 accent-primary"
              />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Experience (optional)">
          <select
            name="experienceBand"
            className={inputClass}
            value={band}
            onChange={(e) => setBand(e.target.value)}
          >
            <option value="">Not recorded</option>
            {EXPERIENCE_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
            <option value="OTHER">Other</option>
          </select>
        </Field>
        {band === "OTHER" && (
          <Field label="Years of experience">
            <Input
              name="experienceYears"
              required
              inputMode="numeric"
              pattern="\d{1,2}"
              maxLength={2}
              placeholder="e.g. 12"
              defaultValue={isBand ? "" : (experience ?? "")}
            />
          </Field>
        )}
      </div>
    </>
  );
}
