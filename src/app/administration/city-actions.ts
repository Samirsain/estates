"use server";

// City Master (owner, 17 Nov 2026) — the search every City field calls, and
// the Cities tab under Administration: add, edit, activate/deactivate, import.
// Managing the list is Administration's permission; searching it is anyone's
// who is signed in.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can, type Action } from "@/lib/security/permissions";
import { actionErrorText } from "@/lib/action-error";
import { blocked, runCommand, type Tx } from "@/lib/services/command";
import { searchCities } from "@/lib/services/city-service";
import {
  cityLabel,
  cleanCity,
  pickCityState,
  readCityCsv,
  suggestCityCode,
  type CityFields,
  type CityOption,
  type CityState,
} from "@/lib/domain/city";

export type CityResult = { ok: true; message: string } | { ok: false; error: string };

export async function searchCitiesAction(text: string): Promise<CityOption[]> {
  await requireStaff();
  return searchCities(String(text ?? ""));
}

/* ----------------------------------------------- + Add City on a form (CR-031) */

const CITY_COLUMNS = { id: true, name: true, code: true, stateName: true, stateCode: true, countryName: true, countryCode: true } as const;

/** The states already on the list, most cities first: the State choice of + Add City. */
export async function cityStatesAction(): Promise<(CityState & { cities: number })[]> {
  await requireStaff();
  const rows = await db.city.groupBy({
    by: ["stateName", "stateCode", "countryName", "countryCode"],
    _count: { _all: true },
  });
  return rows
    .map(({ _count, ...state }) => ({ ...state, cities: _count._all }))
    .sort((a, b) => b.cities - a.cities || a.stateName.localeCompare(b.stateName));
}

/** Whoever fills in a form that asks for a city may add one from it. */
const ADDS_CITIES: readonly Action[] = [
  "BOOKING_REQUEST_SUBMIT",
  "HOLD_CREATE",
  "ENQUIRY_MANAGE",
  "MEMBER_ACTIVATE",
  "PERSON_DETAILS_EDIT",
  "STAFF_MANAGE",
];

export type AddCityResult = { ok: true; city: CityOption; message: string } | { ok: false; error: string };

/**
 * Owner, 24 Nov 2026 (CR-031) — a city typed on the booking form (and the other
 * Customer and Member forms) without leaving it, and without an approval. The
 * spacing is tidied and the name checked as any city's is. A name already on
 * the list, in any case, is never added twice: an active one is handed back to
 * be picked, and the database's lower(name) index holds the line in a race.
 */
export async function addCityFromFormAction(input: { name: string; stateName?: string }, key: string): Promise<AddCityResult> {
  const actor = await requireStaff();
  if (!ADDS_CITIES.some((action) => can(actor.role, action, actor.extraPermissions))) {
    return { ok: false, error: "Your account cannot add cities. Ask the MD." };
  }
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Enter the city name." };
  try {
    const same = await db.city.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { ...CITY_COLUMNS, active: true } });
    if (same && !same.active) {
      return { ok: false, error: `${same.name} is on the list but Inactive. The MD can make it Active under Administration → Cities.` };
    }
    if (same) {
      const { active: _active, ...city } = same;
      return { ok: true, city, message: `${same.name} is already on the list, so it is selected.` };
    }

    const state = pickCityState(await cityStatesAction(), input.stateName);
    if (!state) {
      return {
        ok: false,
        error: input.stateName?.trim()
          ? "Pick a State from the list. A new State is added by the MD under Administration → Cities."
          : "The city list is empty. The MD adds the first city under Administration → Cities.",
      };
    }
    const clean = cleanCity({ name, code: "", ...state });
    if (!clean.ok) return { ok: false, error: clean.error };

    const city = await runCommand(
      { idempotencyKey: key, operation: "CITY_ADD", actorRef: actor.staffAccountId, actorRole: actor.role, payload: clean.city },
      async (tx) => {
        await refuseDuplicate(tx, clean.city);
        const taken = new Set((await tx.city.findMany({ select: { code: true } })).map((c) => c.code));
        const code = suggestCityCode(clean.city.name, taken);
        if (!code) blocked("No free City Code could be made from this name. The MD can add it under Administration → Cities.");
        const made = await tx.city.create({ data: { ...clean.city, code }, select: CITY_COLUMNS });
        return {
          result: made,
          audit: { entity: "City", entityId: String(made.id), action: "CITY_ADD", after: made, reason: "Added from a form (+ Add City)" },
        };
      }
    );
    refresh();
    return { ok: true, city, message: `${cityLabel(city)} added and selected.` };
  } catch (error) {
    return { ok: false, error: actionErrorText(error, "The city could not be added. Try again.") };
  }
}

/** Refuses a name or code another city already has; `id` is the city being edited. */
async function refuseDuplicate(tx: Tx, city: Pick<CityFields, "name" | "code">, id?: number) {
  const not = id === undefined ? {} : { NOT: { id } };
  const byName = await tx.city.findFirst({ where: { name: { equals: city.name, mode: "insensitive" }, ...not } });
  if (byName) blocked(`${cityLabel(byName)} is already on the list.`);
  if (!city.code) return;
  const byCode = await tx.city.findFirst({ where: { code: city.code, ...not } });
  if (byCode) blocked(`City Code ${city.code} is already used by ${byCode.name}. Pick another code.`);
}

const refresh = () => revalidatePath("/administration");
const fail = (error: unknown): CityResult => ({ ok: false, error: actionErrorText(error, "The city could not be saved.") });

export async function createCityAction(input: CityFields, key: string): Promise<CityResult> {
  const actor = await requireStaff("STAFF_MANAGE");
  const clean = cleanCity(input);
  if (!clean.ok) return { ok: false, error: clean.error };
  try {
    const city = await runCommand(
      { idempotencyKey: key, operation: "CITY_ADD", actorRef: actor.staffAccountId, actorRole: actor.role, payload: clean.city },
      async (tx) => {
        await refuseDuplicate(tx, clean.city);
        const taken = new Set((await tx.city.findMany({ select: { code: true } })).map((c) => c.code));
        const code = clean.city.code || suggestCityCode(clean.city.name, taken);
        if (!code) blocked("No free code could be made from this name. Type a City Code.");
        const made = await tx.city.create({ data: { ...clean.city, code } });
        return { result: made, audit: { entity: "City", entityId: String(made.id), action: "CITY_ADD", after: made } };
      }
    );
    refresh();
    return { ok: true, message: `${cityLabel(city)} added.` };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Edits a city, its code included — the only way a code ever changes. A new
 * name is carried to every Person, Investor Lead and Project that held the old
 * one, so those records stay on the list.
 */
export async function updateCityAction(id: number, input: CityFields, key: string): Promise<CityResult> {
  const actor = await requireStaff("STAFF_MANAGE");
  const clean = cleanCity(input);
  if (!clean.ok) return { ok: false, error: clean.error };
  if (!clean.city.code) return { ok: false, error: "Enter the City Code." };
  try {
    const moved = await runCommand(
      { idempotencyKey: key, operation: "CITY_EDIT", actorRef: actor.staffAccountId, actorRole: actor.role, payload: { id, ...clean.city } },
      async (tx) => {
        const before = await tx.city.findUnique({ where: { id } });
        if (!before) blocked("This city is no longer on the list. Refresh the page.");
        await refuseDuplicate(tx, clean.city, id);
        const after = await tx.city.update({ where: { id }, data: clean.city });
        let records = 0;
        if (after.name !== before.name) {
          const where = { city: { equals: before.name, mode: "insensitive" as const } };
          const data = { city: after.name };
          for (const n of await Promise.all([
            tx.person.updateMany({ where, data }),
            tx.potentialInvestor.updateMany({ where, data }),
            tx.project.updateMany({ where, data }),
          ]))
            records += n.count;
        }
        return {
          result: records,
          audit: { entity: "City", entityId: String(id), action: "CITY_EDIT", before, after, reason: records ? `Renamed on ${records} record(s)` : undefined },
        };
      }
    );
    refresh();
    return { ok: true, message: `City saved${moved ? `; ${moved} record(s) now read ${clean.city.name}` : ""}.` };
  } catch (error) {
    return fail(error);
  }
}

export async function setCityActiveAction(id: number, active: boolean, key: string): Promise<CityResult> {
  const actor = await requireStaff("STAFF_MANAGE");
  try {
    const city = await runCommand(
      { idempotencyKey: key, operation: "CITY_STATUS", actorRef: actor.staffAccountId, actorRole: actor.role, payload: { id, active } },
      async (tx) => {
        const made = await tx.city.update({ where: { id }, data: { active } });
        return { result: made, audit: { entity: "City", entityId: String(id), action: active ? "CITY_ACTIVATE" : "CITY_DEACTIVATE", after: { active } } };
      }
    );
    refresh();
    return { ok: true, message: `${city.name} is now ${active ? "Active" : "Inactive"}.` };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Adds the file's new cities in one go, or none of them: one bad row stops the
 * whole import and every bad line is listed. A city already on the list is
 * skipped and left exactly as it is — an import never changes a code.
 */
export async function importCitiesAction(csv: string, key: string): Promise<CityResult> {
  const actor = await requireStaff("STAFF_MANAGE");
  if (csv.length > 2_000_000) return { ok: false, error: "The file is too large. Import at most 2 MB at a time." };
  const read = readCityCsv(csv);
  if ("error" in read) return { ok: false, error: read.error };
  if (!read.length) return { ok: false, error: "The file has no city rows under its header row." };
  try {
    const { added, skipped } = await runCommand(
      { idempotencyKey: key, operation: "CITY_IMPORT", actorRef: actor.staffAccountId, actorRole: actor.role, payload: { csv } },
      async (tx) => {
        const onFile = await tx.city.findMany({ select: { name: true, code: true } });
        const names = new Set(onFile.map((c) => c.name.toLowerCase()));
        const codes = new Set(onFile.map((c) => c.code));
        const fresh: CityFields[] = [];
        const errors: string[] = [];
        let skipped = 0;
        for (const { line, city } of read) {
          const clean = cleanCity(city);
          if (!clean.ok) {
            errors.push(`Line ${line}: ${clean.error}`);
            continue;
          }
          if (names.has(clean.city.name.toLowerCase())) {
            skipped++;
            continue;
          }
          if (clean.city.code && codes.has(clean.city.code)) {
            errors.push(`Line ${line}: City Code ${clean.city.code} is already used.`);
            continue;
          }
          const code = clean.city.code || suggestCityCode(clean.city.name, codes);
          if (!code) {
            errors.push(`Line ${line}: no free code could be made for ${clean.city.name}; type one.`);
            continue;
          }
          names.add(clean.city.name.toLowerCase());
          codes.add(code);
          fresh.push({ ...clean.city, code });
        }
        if (errors.length) {
          blocked(`Nothing was imported. Fix these lines and import again — ${errors.slice(0, 8).join("; ")}${errors.length > 8 ? `; and ${errors.length - 8} more` : ""}.`);
        }
        if (fresh.length) await tx.city.createMany({ data: fresh });
        return {
          result: { added: fresh.length, skipped },
          audit: { entity: "City", entityId: "IMPORT", action: "CITY_IMPORT", after: { added: fresh.length, skipped } },
        };
      }
    );
    refresh();
    return { ok: true, message: `${added} city(ies) added; ${skipped} already on the list were left as they were.` };
  } catch (error) {
    return fail(error);
  }
}
