// City Master (owner, 17 Nov 2026) — the search behind every City field, and
// the check every action runs on the city it is about to save.

import { db } from "@/lib/db";
import { blocked, type Tx } from "@/lib/services/command";
import type { CityOption } from "@/lib/domain/city";

/**
 * The active cities matching what was typed — a name (anywhere in it), a City
 * Code, a State Name or a State Code — A to Z (owner, 17 Nov 2026): Jai →
 * Jaitsar, HMH → Hanumangarh, garh → Anupgarh, Hanumangarh, Lalgarh,
 * Suratgarh, Raj → every Rajasthan city. Nothing typed, nothing shown.
 * ponytail: plain A–Z with a 50-row cap and an ILIKE scan, right for a few
 * thousand cities; past that, rank the exact code first and add a pg_trgm GIN
 * index on "name".
 */
export async function searchCities(text: string, take = 50): Promise<CityOption[]> {
  const q = text.trim().replace(/\s+/g, " ").slice(0, 60);
  // Nothing typed: the whole list, A to Z, for the City dropdown (owner, 18 Nov 2026).
  // ponytail: unbounded; the list is the owner's own cities, add paging if it reaches the thousands.
  if (!q)
    return db.city.findMany({
      where: { active: true },
      select: { id: true, name: true, code: true, stateName: true, stateCode: true, countryName: true, countryCode: true },
      orderBy: { name: "asc" },
    });
  const like = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  return db.$queryRaw<CityOption[]>`
    SELECT "id", "name", "code", "stateName", "stateCode", "countryName", "countryCode"
      FROM "City"
     WHERE "active"
       AND ("name" ILIKE '%' || ${like} || '%'
         OR "code" ILIKE ${like} || '%'
         OR "stateName" ILIKE ${like} || '%'
         OR "stateCode" ILIKE ${like})
     ORDER BY "name"
     LIMIT ${take}`;
}

/**
 * The city to save: blank stays blank, a city on the list is saved with the
 * list's spelling, and the city already on the record may stay as it is even
 * when it is not on the list — it was typed before the list existed, or has
 * since been made Inactive. Anything else is refused.
 */
export async function cityFromList(
  typed: string | null | undefined,
  onFile?: string | null,
  client: Pick<Tx, "city"> = db
): Promise<string | null> {
  const name = (typed ?? "").trim().replace(/\s+/g, " ");
  if (!name) return null;
  if (onFile && name === onFile.trim()) return onFile;
  const city = await client.city.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, active: true },
    select: { name: true },
  });
  if (!city) {
    blocked(`"${name}" is not on the city list. Pick a city from the suggestions; MD adds new ones under Administration → Cities.`);
  }
  return city.name;
}
