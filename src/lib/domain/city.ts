// City Master (owner, 17 Nov 2026) — the pure rules: the label every picker
// shows, the code a new city is given, what a valid city looks like, and the
// CSV the Cities tab imports and exports. No database here; city-service.ts
// holds the queries.

export type CityOption = {
  id: number;
  name: string;
  code: string;
  stateName: string;
  stateCode: string;
  countryName: string;
  countryCode: string;
};

export type CityRow = CityOption & { active: boolean };

export type CityFields = Omit<CityOption, "id"> & { active?: boolean };

/** "Hanumangarh (HMH) — Rajasthan, India" */
export const cityLabel = (c: Pick<CityOption, "name" | "code" | "stateName" | "countryName">) =>
  `${c.name} (${c.code}) — ${c.stateName}, ${c.countryName}`;

const tidy = (s: string | undefined | null) => (s ?? "").trim().replace(/\s+/g, " ");
const upper = (s: string | undefined | null) => tidy(s).toUpperCase();

/**
 * A short readable code for a new city, never one in `taken`: the first three
 * letters (Jaipur → JAI), then the first letter with any two later ones in
 * order (Jaisalmer → JAS once JAI is taken), then four letters the same way.
 * Null when every one is taken — the form then asks for a code by hand.
 */
export function suggestCityCode(name: string, taken: ReadonlySet<string>): string | null {
  const l = name.toUpperCase().replace(/[^A-Z]/g, "");
  if (l.length < 2) return null;
  const tries = [l.slice(0, 3)];
  for (let i = 1; i < l.length; i++) for (let j = i + 1; j < l.length; j++) tries.push(l[0] + l[i] + l[j]);
  for (let i = 1; i < l.length; i++)
    for (let j = i + 1; j < l.length; j++) for (let k = j + 1; k < l.length; k++) tries.push(l[0] + l[i] + l[j] + l[k]);
  return tries.find((c) => c.length >= 2 && !taken.has(c)) ?? null;
}

/**
 * Trims, upper-cases the codes and checks every field. `code` may be blank on
 * a new city; the caller fills it with suggestCityCode. Returns the clean city
 * or the first thing wrong with it, worded for the person typing.
 */
export function cleanCity(input: Partial<CityFields>): { ok: true; city: CityFields } | { ok: false; error: string } {
  const city: CityFields = {
    name: tidy(input.name),
    code: upper(input.code),
    stateName: tidy(input.stateName),
    stateCode: upper(input.stateCode),
    countryName: tidy(input.countryName),
    countryCode: upper(input.countryCode),
    active: input.active ?? true,
  };
  const place = /^[\p{L}][\p{L} .'-]{1,59}$/u;
  if (!place.test(city.name)) return { ok: false, error: "Enter the city name in letters, 2 to 60 characters." };
  if (city.code && !/^[A-Z]{2,6}$/.test(city.code)) return { ok: false, error: "A City Code is 2 to 6 capital letters, e.g. HMH." };
  if (!place.test(city.stateName)) return { ok: false, error: "Enter the state name, e.g. Rajasthan." };
  if (!/^[A-Z]{2,3}$/.test(city.stateCode)) return { ok: false, error: "A State Code is 2 or 3 capital letters, e.g. RJ." };
  if (!place.test(city.countryName)) return { ok: false, error: "Enter the country name, e.g. India." };
  if (!/^[A-Z]{2,3}$/.test(city.countryCode)) return { ok: false, error: "A Country Code is 2 or 3 capital letters, e.g. IN." };
  return { ok: true, city };
}

/** Where a city sits: the part of a City row that is not the city itself. */
export type CityState = Pick<CityOption, "stateName" | "stateCode" | "countryName" | "countryCode">;

/**
 * The state a city added from a form goes under (owner, 24 Nov 2026, CR-031):
 * the one chosen, matched by name in any case, else the state most cities on
 * the list are in. Null when nothing matches — an unknown state, or a list
 * with no city yet — so the caller says what to do instead of guessing a code.
 */
export function pickCityState(
  onList: readonly (CityState & { cities: number })[],
  wanted?: string | null
): CityState | null {
  const name = tidy(wanted).toLowerCase();
  const pick = name
    ? onList.find((s) => s.stateName.toLowerCase() === name)
    : [...onList].sort((a, b) => b.cities - a.cities || a.stateName.localeCompare(b.stateName))[0];
  return pick
    ? { stateName: pick.stateName, stateCode: pick.stateCode, countryName: pick.countryName, countryCode: pick.countryCode }
    : null;
}

export const CITY_CSV_HEADER = [
  "City ID",
  "City Name",
  "City Code",
  "State Name",
  "State Code",
  "Country Name",
  "Country Code",
  "Status",
] as const;

const csvCell = (v: string | number) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function citiesToCsv(rows: CityRow[]): string {
  const lines = rows.map((r) =>
    [r.id, r.name, r.code, r.stateName, r.stateCode, r.countryName, r.countryCode, r.active ? "Active" : "Inactive"]
      .map(csvCell)
      .join(",")
  );
  return [CITY_CSV_HEADER.join(","), ...lines].join("\r\n") + "\r\n";
}

/** RFC 4180: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(cell), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

/**
 * The rows of an imported CSV, read by header name so the columns may come in
 * any order and City ID may be left out. City Name is required; a blank City
 * Code is made on import, and a blank Status means Active.
 */
export function readCityCsv(text: string): { line: number; city: Partial<CityFields> }[] | { error: string } {
  const [head, ...body] = parseCsv(text);
  if (!head) return { error: "The file is empty." };
  const key = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");
  const at = Object.fromEntries(head.map((h, i) => [key(h), i]));
  if (at["city name"] === undefined) return { error: `The first row must name the columns: ${CITY_CSV_HEADER.join(", ")}.` };
  const get = (r: string[], h: string) => (at[h] === undefined ? undefined : (r[at[h]] ?? ""));
  return body.map((r, i) => ({
    line: i + 2,
    city: {
      name: get(r, "city name"),
      code: get(r, "city code"),
      stateName: get(r, "state name"),
      stateCode: get(r, "state code"),
      countryName: get(r, "country name"),
      countryCode: get(r, "country code"),
      active: !/^inactive$/i.test((get(r, "status") ?? "").trim()),
    },
  }));
}
