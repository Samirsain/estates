// A Member's own business — Firm Name, Deals In, Experience. All optional,
// entered on Add Member and changed later through Edit details.

export const DEALS_IN = [
  { value: "RESIDENTIAL", label: "Residential" },
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "AGRICULTURE", label: "Agriculture" },
  { value: "RENTAL", label: "Rental" },
] as const;

/** Stored as the band's value, or as the years typed under Other ("7"). */
export const EXPERIENCE_BANDS = [
  { value: "1-5", label: "1–5 years" },
  { value: "5-10", label: "5–10 years" },
  { value: "10+", label: "Above 10 years" },
] as const;

/** Only known Deals In values survive, each once, in the list's order. */
export function cleanDealsIn(values: string[]): string[] {
  return DEALS_IN.map((d) => d.value).filter((v) => values.includes(v));
}

/** A band, or Other's years (0–99); blank means not recorded. Throws on anything else. */
export function cleanExperience(band: string, years: string): string | null {
  if (!band) return null;
  if (band !== "OTHER") {
    if (!EXPERIENCE_BANDS.some((b) => b.value === band)) throw new Error("Choose an Experience from the list.");
    return band;
  }
  const typed = years.trim();
  if (!/^\d{1,2}$/.test(typed)) throw new Error("Experience under Other is years in up to two digits.");
  return String(Number(typed));
}

/** The raw form values, as Add Member and Edit details send them. */
export type MemberBusinessInput = {
  firmName: string;
  dealsIn: string[];
  experienceBand: string;
  experienceYears: string;
};

/** The Person columns these fields write. */
export function cleanMemberBusiness(i: MemberBusinessInput) {
  return {
    firmName: i.firmName.trim() || null,
    dealsIn: cleanDealsIn(i.dealsIn),
    businessExperience: cleanExperience(i.experienceBand, i.experienceYears),
  };
}

export function dealsInLabel(values: string[]): string {
  return DEALS_IN.filter((d) => values.includes(d.value)).map((d) => d.label).join(", ");
}

export function experienceLabel(value: string | null): string {
  if (!value) return "";
  const band = EXPERIENCE_BANDS.find((b) => b.value === value);
  if (band) return band.label;
  return value === "1" ? "1 year" : `${value} years`;
}
