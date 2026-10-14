# Demo Dataset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A re-runnable `npm run seed:demo` that fills the development database with six months (April → 14 Oct 2026) of realistic Jaipur real-estate business, plus a generated guide for the owner's walkthrough.

**Architecture:** A story is a list of dated steps. Each step runs through the real services while a story clock makes `new Date()` read the story date; afterwards one SQL `DO` block moves every timestamp the database stamped during that step back to story time. Data (Projects, cast) lives in its own module, seed helpers in a toolkit, the narrative in `story.ts`, and an entry script wires wipe → story → jobs → guide. A separate verifier asserts the result looks real.

**Tech Stack:** TypeScript run by Node with `prisma/alias-loader.mjs` (no build), Prisma 5 on Supabase Postgres, the app's own services in `src/lib/services`.

**Spec:** `docs/superpowers/specs/2026-10-14-demo-dataset-design.md`

## Global Constraints

- Guarded: every script calls `assertCheckDatabase()` (refuses unless `ALLOW_CHECK_WRITES="true"`).
- Everything goes through the services the screens call; direct writes only where the spec says (Project rows, PLC version, Member Terms acceptance, the External Resale group, the time shift).
- Demo People use mobiles beginning **93**; references begin `UTR26`, `NEFT26`, `RFD26`; Project codes `SRE`, `AH`, `MBP`, `RSL`.
- No test-looking text anywhere: no "UAT", "ZZ-", "Filler", "Buyer … Sharma", "mock".
- Staff are the existing accounts: MD `STF-0001`, Accounts `STF-0003` and `STF-0004`, CRM `STF-0005`; no staff are created or changed. The UAT-only staff account `STF-UAT-01` is removed.
- Story dates are IST business days; a step's default time is 11:00 IST.
- Do not run `*:check` scripts after the demo seed (they add "ZZ-" rows); re-seed instead.

## Review Focus

1. **A step that throws mid-way** — the time shift must still run for what it wrote, and the clock must return to real time (`finally`). Pinned in Task 1's check.
2. **Rows written outside a step** must keep their real timestamps. Pinned in Task 1's check.
3. **The append-only ledger trigger** must be enabled again after every shift. Pinned in Task 1's check.
4. **A re-run after a dropped connection** must start clean (own Projects, People, references, `STF-UAT-01`). Pinned in Task 5's verifier (counts are exact, not "at least").
5. **Nothing on screen dated in the future by accident** (a step dated after today, or a shift that missed a column). Pinned in Task 5's verifier (no `createdAt` after real now).

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/demo/story-clock.ts` | `installStoryClock()`, `at(db, day, work, time?)`, `shiftWindow()` |
| `prisma/demo/story-clock.check.ts` | DB check for the clock and the shift |
| `prisma/demo/world.ts` | Projects, plot layouts, PLC rules, settings, the cast (pure data) |
| `prisma/demo/world.check.ts` | Pure check of the data (no DB) |
| `prisma/demo/toolkit.ts` | `db`, staff refs, keys, references, `person`, `member`, `project`, `settings`, `sell`, `pay`, `enquiry`, `payReadyCommissions`, … |
| `prisma/demo/story.ts` | The dated steps, April → October |
| `prisma/demo/guide.ts` | Writes `docs/Demo_Data_Guide.md` |
| `prisma/demo-seed.ts` | Entry: guard → clock → wipe → story → jobs (real time) → guide |
| `prisma/demo/verify.ts` | `npm run demo:verify` — asserts the dataset looks real |
| `package.json` | scripts `seed:demo`, `demo:verify`, `demo-clock:check` |

---

### Task 1: Story clock

**Files:**
- Create: `prisma/demo/story-clock.ts`
- Create: `prisma/demo/story-clock.check.ts`
- Modify: `package.json` (script `demo-clock:check`)

**Interfaces:**
- Produces: `installStoryClock(): void`; `at<T>(db: PrismaClient, day: string /* YYYY-MM-DD */, work: () => Promise<T>, time?: string /* HH:MM IST, default "11:00" */): Promise<T>`; `shiftWindow(db, fromMs: number, toMs: number, byMs: number): Promise<void>`; `realNow(): Date`.

- [ ] **Step 1: Write the failing check**

`prisma/demo/story-clock.check.ts`:

```ts
// The demo's story clock (spec §4) against the real database.
// Run: npm run demo-clock:check
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "../check-guard.ts";
import { at, installStoryClock, realNow } from "./story-clock.ts";

assertCheckDatabase();
installStoryClock();
const db = new PrismaClient();
const TAG = "ZZ-CLOCK";

async function main() {
  await db.person.deleteMany({ where: { fullName: { startsWith: TAG } } });

  // Written outside any step: keeps its real time.
  const before = await db.person.create({ data: { fullName: `${TAG} Outside`, primaryMobile: "9299900001" } });

  const inside = await at(db, "2026-04-12", async () => {
    assert.equal(new Date().toISOString().slice(0, 10), "2026-04-12", "the script reads story time");
    assert.equal(new Date(Date.now()).toISOString().slice(0, 10), "2026-04-12", "Date.now() too");
    return db.person.create({ data: { fullName: `${TAG} Inside`, primaryMobile: "9299900002" } });
  });
  assert.ok(Math.abs(new Date().getTime() - realNow().getTime()) < 5_000, "the clock is real again after the step");

  const row = await db.person.findUniqueOrThrow({ where: { id: inside.id } });
  assert.equal(row.createdAt.toISOString().slice(0, 10), "2026-04-12", "the database default moved to story time");
  const outside = await db.person.findUniqueOrThrow({ where: { id: before.id } });
  assert.equal(outside.createdAt.getTime(), before.createdAt.getTime(), "a row written outside the step is untouched");

  // A step that throws still shifts what it wrote and still restores the clock.
  await assert.rejects(
    at(db, "2026-05-01", async () => {
      await db.person.create({ data: { fullName: `${TAG} Thrown`, primaryMobile: "9299900003" } });
      throw new Error("boom");
    }),
    /boom/
  );
  const thrown = await db.person.findFirstOrThrow({ where: { fullName: `${TAG} Thrown` } });
  assert.equal(thrown.createdAt.toISOString().slice(0, 10), "2026-05-01");
  assert.ok(Math.abs(new Date().getTime() - realNow().getTime()) < 5_000);

  // The append-only ledger trigger is enabled again.
  const [trigger] = await db.$queryRaw<{ tgenabled: string }[]>`SELECT tgenabled FROM pg_trigger WHERE tgname = 'token_ledger_append_only'`;
  assert.equal(trigger?.tgenabled, "O", "token_ledger_append_only is enabled");

  await db.person.deleteMany({ where: { fullName: { startsWith: TAG } } });
  console.log("story-clock.check.ts OK");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
```

Add to `package.json` scripts (next to the other checks):

```json
"demo-clock:check": "node --env-file=.env --import ./prisma/alias-loader.mjs prisma/demo/story-clock.check.ts",
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run demo-clock:check`
Expected: FAIL — `Cannot find module './story-clock.ts'`.

- [ ] **Step 3: Write the clock**

`prisma/demo/story-clock.ts`:

```ts
// The demo's story clock — docs/superpowers/specs/2026-10-14-demo-dataset-design.md §4.
//
// While `at(db, day, work)` runs, `new Date()` and `Date.now()` read the story
// date (advancing with real time), so the services compute "now" — a Hold's
// expiry, a task's due date, the Booking date — in story time. The database
// stamps its own defaults with the real time; when the step ends, one DO block
// moves every timestamp written in that real-time window back by the offset.
import type { PrismaClient } from "@prisma/client";

const RealDate = Date;
let offsetMs = 0;

class StoryDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + offsetMs);
    else super(...(args as ConstructorParameters<DateConstructor>));
  }
  static now() {
    return RealDate.now() + offsetMs;
  }
}

/** Once, before any service runs. */
export function installStoryClock() {
  globalThis.Date = StoryDate as unknown as DateConstructor;
}

export const realNow = () => new RealDate(RealDate.now());

const ONE_MINUTE = 60_000;
/** UTC text the way a `timestamp(3) without time zone` column holds it. */
const sqlTime = (ms: number) => new RealDate(ms).toISOString().replace("T", " ").replace("Z", "");

/**
 * Moves every timestamp in every public table that lies in [from, to] back by
 * `byMs`. The token ledger refuses UPDATEs; its trigger is off only for this
 * statement, and only a timestamp moves.
 */
export async function shiftWindow(db: PrismaClient, fromMs: number, toMs: number, byMs: number) {
  const by = Math.round(byMs);
  await db.$executeRawUnsafe(`DO $$
DECLARE r record;
BEGIN
  ALTER TABLE "TokenLedgerEntry" DISABLE TRIGGER token_ledger_append_only;
  FOR r IN
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type LIKE 'timestamp%' AND table_name <> '_prisma_migrations'
  LOOP
    EXECUTE format(
      'UPDATE %I SET %I = %I - interval ''${by} milliseconds'' WHERE %I BETWEEN %L AND %L',
      r.table_name, r.column_name, r.column_name, r.column_name, '${sqlTime(fromMs)}', '${sqlTime(toMs)}'
    );
  END LOOP;
  ALTER TABLE "TokenLedgerEntry" ENABLE TRIGGER token_ledger_append_only;
END $$;`);
}

/** Runs `work` at `day` `time` IST in story time, then moves what the database stamped. */
export async function at<T>(db: PrismaClient, day: string, work: () => Promise<T>, time = "11:00"): Promise<T> {
  const storyMs = RealDate.parse(`${day}T${time}:00+05:30`);
  if (Number.isNaN(storyMs)) throw new Error(`Not a story date: ${day} ${time}`);
  const started = RealDate.now();
  if (storyMs > started) throw new Error(`Story date ${day} ${time} is in the future`);
  offsetMs = storyMs - started;
  try {
    return await work();
  } finally {
    offsetMs = 0;
    await shiftWindow(db, started - ONE_MINUTE, RealDate.now() + ONE_MINUTE, started - storyMs);
  }
}
```

- [ ] **Step 4: Run the check to verify it passes**

Run: `npm run demo-clock:check`
Expected: `story-clock.check.ts OK`.
If it fails on `ALTER TABLE … DISABLE TRIGGER` (permission), the database user does not own the table: replace the two `ALTER TABLE` lines with `AND table_name <> 'TokenLedgerEntry'` in the `WHERE`, and add a note to the guide that token history shows the seed's real time.

- [ ] **Step 5: Commit**

```bash
git add prisma/demo/story-clock.ts prisma/demo/story-clock.check.ts package.json
git commit -m "feat(demo): story clock that runs services in story time"
```

---

### Task 2: World data

**Files:**
- Create: `prisma/demo/world.ts`
- Create: `prisma/demo/world.check.ts`

**Interfaces:**
- Produces:
  - `MOBILE_PREFIX = "93"`, `REF_PREFIXES = ["UTR26", "NEFT26", "RFD26"]`, `PROJECT_CODES = ["SRE", "AH", "MBP", "RSL"]`
  - `type PlotRow = { plotNumber: string; plotType: "RESIDENTIAL" | "COMMERCIAL"; widthFt: string; lengthFt: string; boundaries: { side: "NORTH"|"SOUTH"|"EAST"|"WEST"; kind: "ROAD"|"PLOT"|"PARK"; roadWidthFt?: string }[] }`
  - `type ProjectSpec = { code: string; name: string; city: string; location: string; type: "RESIDENTIAL" | "COMMERCIAL"; plc: { category: "ROAD_WIDTH"|"OPEN_SIDES"|"PARK_FACING"; threshold: string | null; percent: string }[]; plots: PlotRow[] }`
  - `PROJECTS: Record<"SRE"|"AH"|"MBP", ProjectSpec>`
  - `type CastSpec = { name: string; kyc?: "none"|"available"|"verified"; bank?: boolean; address?: string; mobile?: string }`
  - `MEMBERS: Record<string, CastSpec & { inviter: string | null; reraExpiry?: string }>` keys `M01`…`M14`
  - `CUSTOMERS: Record<string, CastSpec>` keyed by short handle (`vikas`, `neha`, …)

- [ ] **Step 1: Write the failing check**

`prisma/demo/world.check.ts`:

```ts
// The demo world is plausible and self-consistent (no database).
// Run: node --import ./prisma/alias-loader.mjs prisma/demo/world.check.ts
import assert from "node:assert/strict";
import { CUSTOMERS, MEMBERS, PROJECTS } from "./world.ts";

const TEST_WORDS = /\b(UAT|ZZ|filler|mock|test)\b|^Buyer /i;

assert.deepEqual(
  Object.values(PROJECTS).map((p) => p.plots.length),
  [30, 25, 20],
  "Shri Ram Enclave 30, Aravali Heights 25, Mansarovar Business Park 20"
);
for (const p of Object.values(PROJECTS)) {
  const numbers = p.plots.map((r) => r.plotNumber);
  assert.equal(new Set(numbers).size, numbers.length, `${p.name}: plot numbers are unique`);
}
const everyone = [...Object.values(MEMBERS), ...Object.values(CUSTOMERS)];
for (const c of everyone) assert.ok(!TEST_WORDS.test(c.name), `${c.name} reads as a real person`);
const names = everyone.map((c) => c.name);
assert.equal(new Set(names).size, names.length, "every name is distinct");
for (const [key, m] of Object.entries(MEMBERS)) {
  if (m.inviter) assert.ok(MEMBERS[m.inviter], `${key}'s inviter exists`);
}
assert.ok(Object.keys(MEMBERS).length === 14, "14 Members");
assert.ok(Object.keys(CUSTOMERS).length >= 40, "at least 40 Customers");
console.log("world.check.ts OK");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import ./prisma/alias-loader.mjs prisma/demo/world.check.ts`
Expected: FAIL — `Cannot find module './world.ts'`.

- [ ] **Step 3: Write the world**

`prisma/demo/world.ts`:

```ts
// The demo world (spec §2): three Jaipur Projects, their plots and PLC rules,
// and the cast. Pure data — the toolkit turns it into records.

export const MOBILE_PREFIX = "93";
export const REF_PREFIXES = ["UTR26", "NEFT26", "RFD26"];
export const PROJECT_CODES = ["SRE", "AH", "MBP", "RSL"];

type Side = "NORTH" | "SOUTH" | "EAST" | "WEST";
export type PlotRow = {
  plotNumber: string;
  plotType: "RESIDENTIAL" | "COMMERCIAL";
  widthFt: string;
  lengthFt: string;
  boundaries: { side: Side; kind: "ROAD" | "PLOT" | "PARK"; roadWidthFt?: string }[];
};
export type ProjectSpec = {
  code: string;
  name: string;
  city: string;
  location: string;
  type: "RESIDENTIAL" | "COMMERCIAL";
  plc: { category: "ROAD_WIDTH" | "OPEN_SIDES" | "PARK_FACING"; threshold: string | null; percent: string }[];
  plots: PlotRow[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const road = (side: Side, ft: string) => ({ side, kind: "ROAD" as const, roadWidthFt: ft });
const plot = (side: Side) => ({ side, kind: "PLOT" as const });
const park = (side: Side) => ({ side, kind: "PARK" as const });

/** SR-01…SR-30: 01–10 on the 60 ft main road, 11–15 face the park, row ends are corners. */
function shriRamPlots(): PlotRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const n = i + 1;
    const corner = [1, 10, 11, 20, 21, 30].includes(n);
    const [w, l] = n <= 10 ? ["30", "50"] : n <= 20 ? ["30", "60"] : ["40", "60"];
    return {
      plotNumber: `SR-${pad(n)}`,
      plotType: "RESIDENTIAL" as const,
      widthFt: w,
      lengthFt: l,
      boundaries: [
        road("NORTH", n <= 10 ? "60" : n <= 20 ? "30" : "40"),
        n >= 11 && n <= 15 ? park("SOUTH") : plot("SOUTH"),
        corner ? road("EAST", "30") : plot("EAST"),
        plot("WEST"),
      ],
    };
  });
}

/** AH-01…AH-20 residential, AH-V1…AH-V5 villa plots on the park. */
function aravaliPlots(): PlotRow[] {
  const homes = Array.from({ length: 20 }, (_, i) => ({
    plotNumber: `AH-${pad(i + 1)}`,
    plotType: "RESIDENTIAL" as const,
    widthFt: i < 10 ? "30" : "35",
    lengthFt: "60",
    boundaries: [road("NORTH", i < 5 ? "60" : "40"), plot("SOUTH"), plot("EAST"), plot("WEST")],
  }));
  const villas = Array.from({ length: 5 }, (_, i) => ({
    plotNumber: `AH-V${i + 1}`,
    plotType: "RESIDENTIAL" as const,
    widthFt: "50",
    lengthFt: "80",
    boundaries: [road("NORTH", "60"), park("SOUTH"), plot("EAST"), plot("WEST")],
  }));
  return [...homes, ...villas];
}

/** MB-S01…MB-S20 shops; 01–10 front the 80 ft Mansarovar main road. */
function businessParkPlots(): PlotRow[] {
  return Array.from({ length: 20 }, (_, i) => ({
    plotNumber: `MB-S${pad(i + 1)}`,
    plotType: "COMMERCIAL" as const,
    widthFt: "20",
    lengthFt: "40",
    boundaries: [road("NORTH", i < 10 ? "80" : "40"), plot("SOUTH"), plot("EAST"), plot("WEST")],
  }));
}

export const PROJECTS: Record<"SRE" | "AH" | "MBP", ProjectSpec> = {
  SRE: {
    code: "SRE",
    name: "Shri Ram Enclave",
    city: "Jaipur",
    location: "Jagatpura, Jaipur, Rajasthan",
    type: "RESIDENTIAL",
    plc: [
      { category: "ROAD_WIDTH", threshold: "60.00", percent: "3.0000" },
      { category: "PARK_FACING", threshold: null, percent: "2.0000" },
      { category: "OPEN_SIDES", threshold: "2.00", percent: "2.5000" },
    ],
    plots: shriRamPlots(),
  },
  AH: {
    code: "AH",
    name: "Aravali Heights",
    city: "Jaipur",
    location: "Ajmer Road, Jaipur, Rajasthan",
    type: "RESIDENTIAL",
    plc: [
      { category: "ROAD_WIDTH", threshold: "60.00", percent: "3.0000" },
      { category: "PARK_FACING", threshold: null, percent: "3.0000" },
    ],
    plots: aravaliPlots(),
  },
  MBP: {
    code: "MBP",
    name: "Mansarovar Business Park",
    city: "Jaipur",
    location: "Mansarovar, Jaipur, Rajasthan",
    type: "COMMERCIAL",
    plc: [{ category: "ROAD_WIDTH", threshold: "80.00", percent: "5.0000" }],
    plots: businessParkPlots(),
  },
};

export type CastSpec = { name: string; kyc?: "none" | "available" | "verified"; bank?: boolean; address?: string; mobile?: string };

/** Nitin Goyal's number and address — Kamal Goyal shares both (the Check Recovery Link case). */
const GOYAL = { mobile: "9311000009", address: "45, Vaishali Nagar" };

export const MEMBERS: Record<string, CastSpec & { inviter: string | null; reraExpiry?: string }> = {
  M01: { name: "Rajendra Singh Shekhawat", inviter: null, kyc: "verified" },
  M02: { name: "Anita Choudhary", inviter: "M01", kyc: "verified" },
  M03: { name: "Mukesh Jain", inviter: "M01", kyc: "verified" },
  M04: { name: "Pooja Khandelwal", inviter: null, kyc: "verified" },
  M05: { name: "Sandeep Meena", inviter: "M04", kyc: "verified" },
  M06: { name: "Kavita Rathore", inviter: "M02", kyc: "verified" },
  M07: { name: "Harish Agarwal", inviter: null, kyc: "verified" },
  M08: { name: "Deepak Saini", inviter: "M03", kyc: "verified", reraExpiry: "2026-10-19" },
  M09: { name: "Nitin Goyal", inviter: null, kyc: "verified", ...GOYAL },
  M10: { name: "Ramesh Kumawat", inviter: "M01", kyc: "verified" },
  M11: { name: "Sunita Bairwa", inviter: "M04", kyc: "verified" },
  M12: { name: "Ajay Sharma", inviter: null, kyc: "verified" },
  M13: { name: "Lokesh Yadav", inviter: "M12", kyc: "verified", bank: false },
  M14: { name: "Priya Mathur", inviter: "M12", kyc: "none" },
};

export const CUSTOMERS: Record<string, CastSpec> = {
  vikas: { name: "Vikas Bansal", kyc: "verified", address: "8, Tilak Nagar" },
  neha: { name: "Neha Joshi", kyc: "verified", address: "102, Shyam Nagar" },
  ashok: { name: "Ashok Gupta", kyc: "verified", address: "23, Raja Park" },
  manoj: { name: "Manoj Saxena", kyc: "verified" },
  rakesh: { name: "Rakesh Saxena", kyc: "verified" },
  suresh: { name: "Suresh Agarwal", kyc: "verified", address: "17, C-Scheme" },
  meena: { name: "Meena Agarwal", kyc: "verified", address: "17, C-Scheme" },
  rohit: { name: "Rohit Verma", kyc: "verified" },
  rohitAgain: { name: "Rohit Kumar Verma", kyc: "available" },
  dinesh: { name: "Dinesh Choudhary", kyc: "verified" },
  kamla: { name: "Kamla Devi Sharma", kyc: "verified" },
  gaurav: { name: "Gaurav Khanna", kyc: "available" },
  anjali: { name: "Anjali Mehta", kyc: "verified" },
  pradeep: { name: "Pradeep Kumawat", kyc: "verified" },
  yogesh: { name: "Yogesh Tiwari", kyc: "verified" },
  shalini: { name: "Shalini Arora", kyc: "verified" },
  bhavna: { name: "Bhavna Kothari", kyc: "verified" },
  arvind: { name: "Arvind Malhotra", kyc: "verified" },
  sunil: { name: "Sunil Jangid", kyc: "verified" },
  kamal: { name: "Kamal Goyal", kyc: "verified", ...GOYAL },
  lalit: { name: "Lalit Sharma", kyc: "verified" },
  seema: { name: "Seema Rathore", kyc: "verified" },
  hemant: { name: "Hemant Joshi", kyc: "verified" },
  nikhil: { name: "Nikhil Agarwal", kyc: "verified" },
  rajiv: { name: "Rajiv Malhotra", kyc: "verified" },
  sapna: { name: "Sapna Jain", kyc: "verified" },
  deepa: { name: "Deepa Soni", kyc: "verified" },
  tarun: { name: "Tarun Mathur", kyc: "verified" },
  vandana: { name: "Vandana Singh", kyc: "verified" },
  mohit: { name: "Mohit Bhatia", kyc: "available" },
  harsh: { name: "Harsh Vardhan Singh", kyc: "verified" },
  ritika: { name: "Ritika Chandna", kyc: "verified" },
  anil: { name: "Anil Kapoor", kyc: "verified" },
  rekha: { name: "Rekha Joshi", kyc: "available" },
  sanjay: { name: "Sanjay Khatri", kyc: "available" },
  payal: { name: "Payal Dixit", kyc: "available" },
  kirti: { name: "Kirti Sharma", kyc: "none" },
  sneha: { name: "Sneha Agrawal", kyc: "none" },
  irfan: { name: "Mohammed Irfan", kyc: "none" },
  pallavi: { name: "Pallavi Joshi", kyc: "none" },
  rakeshMeena: { name: "Rakesh Meena", kyc: "none" },
  gopal: { name: "Gopal Krishna Bhatt", kyc: "none" },
  ishaan: { name: "Ishaan Bhargava", kyc: "none" },
  poojaRawat: { name: "Pooja Rawat", kyc: "none" },
  vivek: { name: "Vivek Sood", kyc: "none" },
  aman: { name: "Aman Kalra", kyc: "none" },
  kiranPal: { name: "Kiran Pal", kyc: "none" },
  sumit: { name: "Sumit Rana", kyc: "none" },
  naveen: { name: "Naveen Bhati", kyc: "none" },
  mahendra: { name: "Mahendra Rawat", kyc: "verified" },
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --import ./prisma/alias-loader.mjs prisma/demo/world.check.ts`
Expected: `world.check.ts OK`.

- [ ] **Step 5: Commit**

```bash
git add prisma/demo/world.ts prisma/demo/world.check.ts
git commit -m "feat(demo): Jaipur projects, plots and cast"
```

---

### Task 3: Seed toolkit

**Files:**
- Create: `prisma/demo/toolkit.ts`

**Interfaces:**
- Consumes: `world.ts` (Task 2); services in `src/lib/services`.
- Produces (all `async` unless noted; every one runs inside a story step):
  - `db: PrismaClient`; `MD`, `ACC`, `ACC2`, `CRM` (staff IDs); `key()`; `ref(kind: "UTR26" | "NEFT26" | "RFD26"): string`; `inDays(n: number): Date` (sync)
  - `type Who = { id: string; name: string; mobile: string; key: string; note: string; profileId?: string }`
  - `people: Record<string, Who>`; `notes(key: string, note: string)` (sync, appends to the guide note)
  - `customer(key: string): Promise<Who>` — creates the Person from `CUSTOMERS[key]` once
  - `member(key: string): Promise<Who>` — creates the Person and activates the Member from `MEMBERS[key]`
  - `project(code: "SRE"|"AH"|"MBP"): Promise<{ id: string; name: string; plots: Record<string, string> }>`
  - `settings(projectId: string, input: CommissionVersionInput): Promise<string>`
  - `sell(plot: string /* plot number */, buyer: Who, soldBy?: { member?: Who; customer?: Who }, opts?: { joint?: Who; schedule?: "standard" | "two" | "full"; submitOnly?: boolean; reject?: string }): Promise<string /* bookingId */>`
  - `pay(bookingId: string, percent: string, payer?: { payerName: string; payerReference: string })`
  - `enquiry(who: Who, projectCode: string, source: EnquirySource, opts?: { member?: Who; customer?: Who; followUpInDays?: number; remark?: string }): Promise<string /* enquiryId */>`
  - `closerReady(who: Who)`; `payReadyCommissions()`; `directOf(bookingId)`; `plotId(number)` (sync)

- [ ] **Step 1: Confirm the staff accounts and the bank flow**

Run:

```bash
node --env-file=.env -e "const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();db.staffAccount.findMany({select:{staffAccountId:true,role:true,status:true,person:{select:{fullName:true}}},orderBy:{staffAccountId:'asc'}}).then(r=>{console.log(r);return db.\$disconnect()})"
```

Expected: `STF-0001` MD, `STF-0003`/`STF-0004` ACCOUNTS, `STF-0005` CRM, all ACTIVE. If an ID differs, use the real one in the constants below.

Then read `enterBankDetails` / `decideBankDetails` in `src/lib/services/bank-service.ts`: if a newly entered bank detail stays `PENDING` until Accounts verifies it, `person()` below must call `decideBankDetails({ …, approve: true })` with `ACC` after entering it (commission is held until the bank is verified). Note which one applies before Step 2.

- [ ] **Step 2: Write the toolkit**

`prisma/demo/toolkit.ts`:

```ts
// Seed helpers for the demo (spec §4). Every helper goes through a service and
// runs inside a story step, so "now" is story time.
import { PrismaClient, type EnquirySource } from "@prisma/client";
import { MEMBER_TERMS_VERSION } from "@/lib/terms";
import { aadhaarLastFour, blindIndex, encryptSensitive, normaliseAadhaar } from "@/lib/security/identity";
import { makeAvailable, prepareInventory } from "@/lib/services/inventory-service";
import { createCommissionVersion, type CommissionVersionInput } from "@/lib/services/commission-settings-service";
import { activateMember } from "@/lib/services/network-service";
import { enterBankDetails } from "@/lib/services/bank-service";
import { recordCustomerTermsAcceptance, verifyAadhaar } from "@/lib/services/customer-closer-service";
import { createEnquiry } from "@/lib/services/enquiry-service";
import { decideBookingRequest, submitBookingRequest } from "@/lib/services/booking-service";
import { confirmPaymentReceived } from "@/lib/services/payment-service";
import { markCommissionPaid } from "@/lib/services/commission-service";
import { CommandError } from "@/lib/services/command";
import { CUSTOMERS, MEMBERS, MOBILE_PREFIX, PROJECTS, type CastSpec } from "./world.ts";

export const db = new PrismaClient();

export const MD = "STF-0001";
export const ACC = "STF-0003";
export const ACC2 = "STF-0004";
export const CRM = "STF-0005";

let seq = 0;
export const key = () => `DEMO-${Date.now()}-${seq++}`;
let refSeq = 0;
export const ref = (kind: "UTR26" | "NEFT26" | "RFD26") => `${kind}${String(48210000 + ++refSeq * 37).padStart(8, "0")}`;
export const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

export type Who = { id: string; name: string; mobile: string; key: string; note: string; profileId?: string };
export const people: Record<string, Who> = {};
export const notes = (k: string, note: string) => {
  people[k].note = people[k].note ? `${people[k].note} ${note}` : note;
};

const BANKS = [
  ["State Bank of India", "MI Road, Jaipur", "SBIN0031025"],
  ["HDFC Bank", "C-Scheme, Jaipur", "HDFC0000123"],
  ["ICICI Bank", "Malviya Nagar, Jaipur", "ICIC0000698"],
  ["Punjab National Bank", "Raja Park, Jaipur", "PUNB0144500"],
  ["Bank of Baroda", "Vaishali Nagar, Jaipur", "BARB0VAISHA"],
] as const;
const STREETS = ["Malviya Nagar", "Vaishali Nagar", "Mansarovar", "Raja Park", "Tonk Road", "Jagatpura", "Sodala", "Shyam Nagar", "Pratap Nagar", "Bani Park"];

let mobileSeq = 0;
let aadhaarSeq = 0;
let accountSeq = 0;

async function makePerson(k: string, spec: CastSpec): Promise<Who> {
  const n = ++mobileSeq;
  const mobile = spec.mobile ?? `${MOBILE_PREFIX}${String(14000000 + n * 7).padStart(8, "0")}`;
  const kyc = spec.kyc ?? "available";
  const aadhaar = `7${String(41200000000 + ++aadhaarSeq * 13).padStart(11, "0")}`;
  const created = await db.person.create({
    data: {
      fullName: spec.name,
      primaryMobile: mobile,
      city: "Jaipur",
      addressLine: spec.address ?? `${(n % 90) + 10}, ${STREETS[n % STREETS.length]}`,
      ...(kyc === "none"
        ? {}
        : {
            aadhaarCipher: encryptSensitive(normaliseAadhaar(aadhaar)),
            aadhaarLastFour: aadhaarLastFour(aadhaar),
            aadhaarBlindIndex: blindIndex(normaliseAadhaar(aadhaar)),
            aadhaarStatus: "AVAILABLE",
          }),
    },
  });
  if (kyc === "verified") await verifyAadhaar({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", personId: created.id });
  if (spec.bank !== false && kyc !== "none") {
    const [bankName, branchName, ifsc] = BANKS[n % BANKS.length];
    await enterBankDetails({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      personId: created.id,
      accountHolder: spec.name,
      bankName,
      branchName,
      accountNumber: `3${String(1002003000 + ++accountSeq * 11).padStart(11, "0")}`,
      ifsc,
    });
    // If Task 3 Step 1 found that entered details stay PENDING, verify them here
    // with decideBankDetails({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", personId: created.id, approve: true, ... }).
  }
  const who = { id: created.id, name: spec.name, mobile, key: k, note: "" };
  people[k] = who;
  return who;
}

export async function customer(k: string): Promise<Who> {
  return people[k] ?? makePerson(k, CUSTOMERS[k]);
}

export async function member(k: string): Promise<Who> {
  if (people[k]?.profileId) return people[k];
  const spec = MEMBERS[k];
  const who = await makePerson(k, spec);
  const inviter = spec.inviter ? people[spec.inviter] : null;
  const activated = await activateMember({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    personId: who.id,
    invitedByMemberId: inviter?.profileId ?? null,
    reraStatus: "REGISTERED",
    reraNumber: `RAJ/A/${2026}/${k.slice(1)}${String(who.mobile).slice(-3)}`,
    reraExpiryDate: new Date(`${spec.reraExpiry ?? "2028-03-31"}T00:00:00+05:30`),
  });
  await db.memberTermsAcceptance.create({ data: { memberProfileId: activated.memberProfileId, version: MEMBER_TERMS_VERSION } });
  who.profileId = activated.memberProfileId;
  return who;
}

const plotIds: Record<string, string> = {};
export const plotId = (number: string) => {
  const id = plotIds[number];
  if (!id) throw new Error(`No plot ${number}`);
  return id;
};
export const projectIds: Record<string, string> = {};

/** A Project as MD launches it: the record, a published PLC rule set, inventory made Available. */
export async function project(code: "SRE" | "AH" | "MBP") {
  const spec = PROJECTS[code];
  const created = await db.project.create({
    data: {
      projectCode: spec.code,
      name: spec.name,
      developer: "3% Real Estate Club",
      location: spec.location,
      city: spec.city,
      type: spec.type,
      status: "ACTIVE",
    },
  });
  projectIds[code] = created.id;
  await db.plcRuleVersion.create({
    data: {
      projectId: created.id,
      version: 1,
      status: "PUBLISHED",
      effectiveFrom: new Date(),
      publishedAt: new Date(),
      reason: `Location charges for ${spec.name}`,
      components: { create: spec.plc },
    },
  });
  await prepareInventory({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", projectId: created.id, rows: spec.plots });
  const made = await db.plot.findMany({ where: { projectId: created.id } });
  for (const p of made) {
    plotIds[p.plotNumber] = p.id;
    if (p.status === "NOT_AVAILABLE") {
      await makeAvailable({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", plotId: p.id, reason: "Released for sale" });
    }
  }
  return { id: created.id, name: spec.name };
}

export async function settings(projectId: string, input: CommissionVersionInput) {
  const created = await createCommissionVersion({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    projectId,
    ...input,
    economicsReviewed: input.trip?.tripEnabled ?? false,
  });
  return created.versionId;
}

const SCHEDULES = {
  standard: () => [
    { seq: 1, percent: "30", dueDate: new Date() },
    { seq: 2, percent: "35", dueDate: inDays(60) },
    { seq: 3, percent: "35", dueDate: inDays(120) },
  ],
  two: () => [
    { seq: 1, percent: "30", dueDate: new Date() },
    { seq: 2, percent: "70", dueDate: inDays(60) },
  ],
  full: () => [{ seq: 1, percent: "100", dueDate: new Date() }],
};

/** CRM submits, Accounts approves (unless `submitOnly` or `reject`). */
export async function sell(
  plotNumber: string,
  buyer: Who,
  soldBy: { member?: Who; customer?: Who } = {},
  opts: { joint?: Who; schedule?: keyof typeof SCHEDULES; submitOnly?: boolean; reject?: string } = {}
) {
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plotId(plotNumber),
    parties: opts.joint
      ? [
          { personId: buyer.id, role: "PRIMARY" as const, sharePercent: "50" },
          { personId: opts.joint.id, role: "ADDITIONAL" as const, sharePercent: "50" },
        ]
      : [{ personId: buyer.id, role: "PRIMARY" as const, sharePercent: null }],
    soldByType: soldBy.member ? "MEMBER" : soldBy.customer ? "CUSTOMER" : "THREE_PERCENT_CLUB",
    soldByPersonId: soldBy.member?.id ?? soldBy.customer?.id ?? null,
    bookingDate: new Date(),
    customerType: "END_USER",
    schedule: SCHEDULES[opts.schedule ?? "standard"](),
  });
  if (opts.submitOnly) return submitted.bookingId;
  await decideBookingRequest({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: submitted.bookingId,
    approve: !opts.reject,
    note: opts.reject ?? "Verified against the signed agreement and the first receipt.",
  });
  return submitted.bookingId;
}

export const pay = (bookingId: string, percent: string, payer?: { payerName: string; payerReference: string }) =>
  confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId,
    percent,
    paidOn: new Date(),
    reference: ref("UTR26"),
    ...payer,
  });

export const directOf = (bookingId: string) =>
  db.commissionRecord.findFirstOrThrow({ where: { bookingId, type: "DIRECT", isCurrent: true } });

let crmAccountId = "";
export async function enquiry(
  who: Who,
  projectCode: string,
  source: EnquirySource,
  opts: { member?: Who; customer?: Who; followUpInDays?: number; remark?: string } = {}
) {
  if (!crmAccountId) crmAccountId = (await db.staffAccount.findFirstOrThrow({ where: { staffAccountId: CRM } })).id;
  const customerProfileId = opts.customer
    ? (await db.customerProfile.findUniqueOrThrow({ where: { personId: opts.customer.id } })).id
    : null;
  const made = await createEnquiry({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: who.id,
    projectId: projectIds[projectCode],
    source,
    sourceMemberId: opts.member?.profileId ?? null,
    sourceCustomerId: customerProfileId,
    assignedStaffId: crmAccountId,
    assigneeRole: "CRM",
    nextFollowUpAt: inDays(opts.followUpInDays ?? 3),
    remark: opts.remark ?? "Interested; wants a site visit and the price list.",
  });
  return (made as { enquiryId: string }).enquiryId;
}

/** A Customer closer: verified KYC (from the cast) and Customer Terms accepted. */
export async function closerReady(who: Who) {
  const profile = await db.customerProfile.findUniqueOrThrow({ where: { personId: who.id } });
  await recordCustomerTermsAcceptance({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    customerProfileId: profile.id,
    termsVersion: "CT-2026-10",
    acceptedOn: new Date(),
  });
}

/** Accounts' monthly payout run: every Ready, unpaid line on the demo's Projects. */
export async function payReadyCommissions() {
  const ready = await db.commissionRecord.findMany({
    where: { isCurrent: true, eligibility: "READY", payment: "NOT_PAID", booking: { projectId: { in: Object.values(projectIds) } } },
    select: { id: true },
  });
  for (const r of ready) {
    try {
      await markCommissionPaid({
        idempotencyKey: key(),
        actorRef: ACC,
        actorRole: "ACCOUNTS",
        recordId: r.id,
        early: false,
        paidOn: new Date(),
        reference: ref("NEFT26"),
        remarks: "",
      });
    } catch (error) {
      if (!(error instanceof CommandError)) throw error; // e.g. a Recovery is outstanding: it stays unpaid
    }
  }
}
```

If a service's argument shape differs from the call above (TypeScript will say so), follow the service signature; keep the behaviour the same.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors from `prisma/demo/`.

- [ ] **Step 4: Commit**

```bash
git add prisma/demo/toolkit.ts
git commit -m "feat(demo): seed toolkit over the real services"
```

---

### Task 4: The story, the entry script and the guide

**Files:**
- Create: `prisma/demo/story.ts`
- Create: `prisma/demo/guide.ts`
- Create: `prisma/demo-seed.ts`
- Modify: `package.json` (script `seed:demo`)

**Interfaces:**
- Consumes: Task 1 `at`, `installStoryClock`; Task 3 toolkit.
- Produces: `tellStory(): Promise<void>` (story.ts); `writeGuide(): Promise<void>` (guide.ts); `B: Record<string, string>` booking ids by story key (exported from story.ts for the guide).

- [ ] **Step 1: Write the story**

`prisma/demo/story.ts` — the dated steps. Steps are registered with `on(day, label, run, time?)`, sorted by `day time` (stable), and run one by one inside `at()`. Booking ids land in `B` as they are made.

```ts
// The six-month story (spec §3). Each `on()` is one dated step; `tellStory`
// runs them in date order inside the story clock.
import { createHold, decideHoldRequest, requestHoldExtension, submitHoldRequest } from "@/lib/services/hold-service";
import {
  cancelBooking,
  decidePrimaryCustomerChange,
  decideSoldByCorrection,
  requestPrimaryCustomerChange,
  requestSoldByCorrection,
} from "@/lib/services/booking-service";
import { decideCancellation } from "@/lib/services/cancellation-service";
import { decideChangePlot, submitChangePlot } from "@/lib/services/change-plot-service";
import { recordCompletion, recordFinalBuyers } from "@/lib/services/completion-service";
import { setMemberStatus } from "@/lib/services/network-service";
import { enterBankDetails } from "@/lib/services/bank-service";
import { approveCommissionPaidEarly, markCommissionPaid, requestCommissionPaidEarly } from "@/lib/services/commission-service";
import { openRecovery } from "@/lib/services/recovery-service";
import { recordTokenRedemption } from "@/lib/services/royalty-service";
import { bookTripReward, markTripTravelled, recordTripNominee } from "@/lib/services/trip-service";
import { requestPersonMerge } from "@/lib/services/merge-service";
import { recordFollowUp, closeEnquiry } from "@/lib/services/enquiry-service";
import { changeLandInquiryStage, createLandInquiry } from "@/lib/services/land-inquiry-service";
import { emptyInput } from "@/lib/domain/land-inquiry";
import {
  confirmPaymentGiven,
  createAcquisition,
  decideAcquisition,
  recordBuybackDocumentsReturned,
  recordBuyingCommission,
} from "@/lib/services/acquisition-service";
import { ensureTask } from "@/lib/services/task-service";
import { istDay } from "@/lib/tasks";
import { at } from "./story-clock.ts";
import {
  ACC,
  ACC2,
  CRM,
  MD,
  closerReady,
  customer,
  db,
  directOf,
  enquiry,
  inDays,
  key,
  member,
  notes,
  pay,
  payReadyCommissions,
  people,
  plotId,
  project,
  projectIds,
  ref,
  sell,
  settings,
  type Who,
} from "./toolkit.ts";

type Step = { day: string; time: string; label: string; run: () => Promise<unknown> };
const steps: Step[] = [];
const on = (day: string, label: string, run: () => Promise<unknown>, time = "11:00") => steps.push({ day, time, label, run });

/** Booking ids by story key. */
export const B: Record<string, string> = {};
const P = (k: string) => people[k];
const base = { loyaltyExceptionReason: null, effectiveFrom: null } as const;

/* ------------------------------------------------------------ the launches */

on("2026-04-02", "Shri Ram Enclave launches", async () => {
  const sre = await project("SRE");
  await settings(sre.id, { ...base, directEnabled: true, directPercent: "3", loyaltyEnabled: true, loyaltyPercent: "1", royaltyTokensPerAward: 10, reason: "Launch terms for Shri Ram Enclave" });
});
on("2026-06-01", "Aravali Heights launches with its Trip programme", async () => {
  const ah = await project("AH");
  await settings(ah.id, {
    ...base,
    directEnabled: true,
    directPercent: "3",
    loyaltyEnabled: true,
    loyaltyPercent: "1.5",
    royaltyTokensPerAward: 15,
    reason: "Launch terms for Aravali Heights, with the Goa Trip programme",
    trip: {
      tripEnabled: true,
      tripTotalTarget: 3,
      tripMinOwnCredits: 2,
      tripMaxReferenceCredits: 1,
      tripProgrammeCode: "TRIP-AH-26",
      tripProgrammeVersionRef: "TRIP-AH-26 v1",
      tripTermsVersionRef: "TRIP-AH-2026-1",
      tripCutOffAt: null,
      tripWindDownAt: null,
      excludedPlotIds: [],
      sharedPools: [],
    },
  });
});
on("2026-08-01", "Mansarovar Business Park launches", async () => {
  const mbp = await project("MBP");
  await settings(mbp.id, { ...base, directEnabled: true, directPercent: "2", loyaltyEnabled: true, loyaltyPercent: "1", royaltyTokensPerAward: 20, reason: "Launch terms for Mansarovar Business Park" });
});
on("2026-08-16", "Shri Ram Enclave festive terms (settings version 2)", () =>
  settings(projectIds.SRE, { ...base, directEnabled: true, directPercent: "3.5", loyaltyEnabled: true, loyaltyPercent: "1", royaltyTokensPerAward: 15, reason: "Festive season: Direct 3.5% and 15 Royalty points from 16 Aug" })
);

/* ------------------------------------------------------------- the network */

for (const [day, keys] of [
  ["2026-04-03", ["M01", "M04", "M07", "M09", "M12"]],
  ["2026-04-10", ["M02", "M03", "M05"]],
  ["2026-05-05", ["M06", "M13", "M14"]],
  ["2026-06-02", ["M08", "M10", "M11"]],
] as const) {
  on(day, `Members activated: ${keys.join(", ")}`, async () => {
    for (const k of keys) await member(k);
  });
}

/* --------------------------------------------------------------- the sales */

type Sale = {
  key: string;
  day: string;
  plot: string;
  buyer: string;
  by?: { member?: string; customer?: string };
  joint?: string;
  schedule?: "standard" | "two" | "full";
  pays?: [string, string][];
  lead?: "SITE_VISIT" | "ONLINE" | "DIRECT" | "EXISTING_CUSTOMER" | null;
  submitOnly?: boolean;
  reject?: string;
  project: "SRE" | "AH" | "MBP";
};

const SALES: Sale[] = [
  { key: "S01", project: "SRE", day: "2026-04-12", plot: "SR-03", buyer: "vikas", pays: [["2026-04-12", "30"], ["2026-06-12", "35"], ["2026-08-12", "35"]] },
  { key: "S02", project: "SRE", day: "2026-04-15", plot: "SR-05", buyer: "neha", by: { member: "M04" }, pays: [["2026-04-15", "30"], ["2026-06-15", "35"], ["2026-08-14", "35"]] },
  { key: "S03", project: "SRE", day: "2026-04-18", plot: "SR-08", buyer: "ashok", by: { member: "M01" }, schedule: "two", pays: [["2026-04-18", "30"], ["2026-06-18", "70"]] },
  { key: "S04", project: "SRE", day: "2026-04-22", plot: "SR-12", buyer: "manoj", by: { member: "M02" }, pays: [["2026-04-22", "30"], ["2026-06-22", "35"], ["2026-08-21", "35"]] },
  { key: "S05", project: "SRE", day: "2026-04-25", plot: "SR-14", buyer: "suresh", joint: "meena", by: { member: "M01" }, pays: [["2026-04-25", "30"], ["2026-06-25", "35"], ["2026-08-25", "35"]] },
  { key: "S06", project: "SRE", day: "2026-04-28", plot: "SR-21", buyer: "rohit", by: { member: "M03" }, pays: [["2026-04-28", "30"], ["2026-06-29", "35"]] },
  { key: "S07", project: "SRE", day: "2026-05-03", plot: "SR-01", buyer: "dinesh", schedule: "full", pays: [["2026-05-03", "100"]] },
  { key: "S08", project: "SRE", day: "2026-05-08", plot: "SR-09", buyer: "kamla", by: { member: "M05" }, schedule: "two", pays: [["2026-05-08", "30"], ["2026-07-08", "70"]] },
  { key: "S09", project: "SRE", day: "2026-05-12", plot: "SR-15", buyer: "gaurav", reject: "First instalment cheque was returned unpaid by the bank." },
  { key: "S10", project: "SRE", day: "2026-05-15", plot: "SR-16", buyer: "anjali", by: { member: "M06" }, pays: [["2026-05-15", "30"], ["2026-07-15", "35"], ["2026-09-15", "35"]] },
  { key: "S11", project: "SRE", day: "2026-05-20", plot: "SR-22", buyer: "pradeep", by: { member: "M09" }, pays: [["2026-05-20", "30"]] },
  { key: "S12", project: "SRE", day: "2026-05-25", plot: "SR-23", buyer: "yogesh", pays: [["2026-05-25", "30"], ["2026-07-27", "35"]] },
  { key: "S13", project: "SRE", day: "2026-06-05", plot: "SR-24", buyer: "shalini", pays: [["2026-06-05", "30"], ["2026-08-05", "35"]] },
  { key: "S14", project: "SRE", day: "2026-06-10", plot: "SR-25", buyer: "bhavna", by: { member: "M12" }, pays: [["2026-06-10", "30"], ["2026-08-10", "35"]] },
  { key: "S15", project: "SRE", day: "2026-07-10", plot: "SR-26", buyer: "ashok", schedule: "two", lead: null, pays: [["2026-07-10", "30"], ["2026-09-08", "70"]] },
  { key: "S16", project: "SRE", day: "2026-09-05", plot: "SR-27", buyer: "neha", schedule: "full", lead: null, pays: [["2026-09-05", "100"]] },
  { key: "S17", project: "SRE", day: "2026-07-05", plot: "SR-28", buyer: "arvind", pays: [["2026-07-05", "30"]] },
  { key: "S18", project: "SRE", day: "2026-09-12", plot: "SR-29", buyer: "sunil", by: { customer: "vikas" }, pays: [["2026-09-12", "30"]] },
  { key: "S19", project: "SRE", day: "2026-08-20", plot: "SR-30", buyer: "kamal", schedule: "full", pays: [["2026-08-20", "100"]] },
  { key: "S20", project: "AH", day: "2026-06-08", plot: "AH-01", buyer: "lalit", by: { member: "M01" }, schedule: "full", pays: [["2026-06-08", "100"]] },
  { key: "S21", project: "AH", day: "2026-06-18", plot: "AH-02", buyer: "seema", by: { member: "M02" }, schedule: "two", pays: [["2026-06-18", "30"], ["2026-07-18", "70"]] },
  { key: "S22", project: "AH", day: "2026-07-02", plot: "AH-03", buyer: "hemant", by: { member: "M01" }, schedule: "two", pays: [["2026-07-02", "30"], ["2026-08-02", "70"]] },
  { key: "S23", project: "AH", day: "2026-07-12", plot: "AH-04", buyer: "nikhil", by: { member: "M05" }, pays: [["2026-07-12", "30"], ["2026-09-11", "35"]] },
  { key: "S24", project: "AH", day: "2026-07-20", plot: "AH-V1", buyer: "rajiv", pays: [["2026-07-20", "30"], ["2026-09-18", "35"]] },
  { key: "S25", project: "AH", day: "2026-08-08", plot: "AH-05", buyer: "sapna", by: { member: "M11" }, schedule: "full", pays: [["2026-08-08", "100"]] },
  { key: "S26", project: "AH", day: "2026-08-22", plot: "AH-06", buyer: "deepa", by: { member: "M07" }, pays: [["2026-08-22", "10"]] },
  { key: "S27", project: "AH", day: "2026-09-03", plot: "AH-07", buyer: "tarun", by: { member: "M13" }, pays: [["2026-09-03", "30"]] },
  { key: "S28", project: "AH", day: "2026-09-18", plot: "AH-V2", buyer: "vandana", by: { member: "M01" }, pays: [["2026-09-18", "30"]] },
  { key: "S29", project: "AH", day: "2026-10-06", plot: "AH-08", buyer: "mohit", by: { member: "M08" }, pays: [["2026-10-06", "30"]] },
  { key: "S30", project: "MBP", day: "2026-08-10", plot: "MB-S01", buyer: "harsh", pays: [["2026-08-10", "30"], ["2026-10-09", "35"]] },
  { key: "S31", project: "MBP", day: "2026-08-14", plot: "MB-S02", buyer: "ritika", by: { member: "M12" }, pays: [["2026-08-14", "30"]] },
  { key: "S32", project: "MBP", day: "2026-09-08", plot: "MB-S03", buyer: "anil", by: { member: "M04" }, pays: [["2026-09-08", "30"]] },
  { key: "S33", project: "MBP", day: "2026-10-01", plot: "MB-S05", buyer: "rekha", by: { customer: "kamal" }, pays: [["2026-10-01", "30"]] },
  { key: "S34", project: "MBP", day: "2026-10-09", plot: "MB-S06", buyer: "sanjay", by: { member: "M14" }, pays: [["2026-10-09", "30"]] },
  { key: "S35", project: "SRE", day: "2026-10-13", plot: "SR-17", buyer: "gaurav", by: { member: "M02" }, submitOnly: true, lead: "EXISTING_CUSTOMER" },
  { key: "S36", project: "MBP", day: "2026-10-13", plot: "MB-S08", buyer: "payal", submitOnly: true },
];

const clubLeads = ["SITE_VISIT", "ONLINE", "DIRECT"] as const;
const minusDays = (day: string, n: number) => istDay(new Date(Date.parse(`${day}T11:00:00+05:30`) - n * 86_400_000));

SALES.forEach((s, i) => {
  const lead = s.lead === undefined ? (s.by?.member ? "BY_MEMBER" : s.by?.customer ? "BY_CUSTOMER" : clubLeads[i % 3]) : s.lead;
  if (lead) {
    on(minusDays(s.day, 6), `Enquiry for ${s.plot}`, async () => {
      const who = await customer(s.buyer);
      if (s.joint) await customer(s.joint);
      await enquiry(who, s.project, lead, {
        member: s.by?.member ? P(s.by.member) : undefined,
        customer: s.by?.customer ? P(s.by.customer) : undefined,
        remark: `Asked about ${s.plot}; site visit fixed.`,
      });
    }, "10:00");
  }
  on(s.day, `Booking ${s.key} on ${s.plot}`, async () => {
    const buyer = await customer(s.buyer);
    const soldBy = { member: s.by?.member ? P(s.by.member) : undefined, customer: s.by?.customer ? P(s.by.customer) : undefined };
    B[s.key] = await sell(s.plot, buyer, soldBy, {
      joint: s.joint ? await customer(s.joint) : undefined,
      schedule: s.schedule,
      submitOnly: s.submitOnly,
      reject: s.reject,
    });
  }, "11:00");
  for (const [day, percent] of s.pays ?? []) {
    on(day, `Payment ${percent}% on ${s.plot}`, () =>
      s.key === "S20"
        ? pay(B[s.key], percent, { payerName: "Om Prakash Sharma (father)", payerReference: ref("UTR26") })
        : pay(B[s.key], percent),
      day === s.day ? "12:00" : "13:00");
  }
});

/* ----------------------------------------------------- Accounts' payout runs */

for (const day of ["2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30"]) {
  on(day, "Monthly commission payout", payReadyCommissions, "17:00");
}

/* ------------------------------------------------------ changes to bookings */

on("2026-07-08", "Sold By Correction requested on SR-23", () =>
  requestSoldByCorrection({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B.S12, toSoldByType: "MEMBER", toSoldByPersonId: P("M14").id, reason: "Priya Mathur brought Yogesh to the site; entered as a walk-in by mistake.", supportingNote: "Site visit register, 22 May, page 31." })
);
on("2026-07-09", "MD approves the Sold By Correction", () =>
  decideSoldByCorrection({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", bookingId: B.S12, approve: true, note: "Register entry confirmed." })
);
on("2026-07-14", "Primary Customer change requested on SR-12", async () => {
  const rakesh = await customer("rakesh");
  await requestPrimaryCustomerChange({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B.S04, toPersonId: rakesh.id, reason: "Manoj Saxena transfers the plot to his brother Rakesh." });
});
on("2026-07-15", "Accounts approves the transfer", () =>
  decidePrimaryCustomerChange({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B.S04, approve: true, note: "Transfer letter and ID proofs verified." })
);
on("2026-07-20", "Change Plot requested: SR-24 → SR-13", () =>
  submitChangePlot({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B.S13, toPlotId: plotId("SR-13"), remark: "Wants the park-facing plot." })
);
on("2026-07-21", "Accounts approves the Change Plot", () =>
  decideChangePlot({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: B.S13,
    approve: true,
    note: "Revised agreement signed; PLC difference explained.",
    appliedPercent: "30",
    schedule: [
      { seq: 1, percent: "30", dueDate: new Date() },
      { seq: 2, percent: "35", dueDate: new Date("2026-08-05T11:00:00+05:30") },
      { seq: 3, percent: "35", dueDate: new Date("2026-10-05T11:00:00+05:30") },
    ],
  })
);
on("2026-07-25", "SR-28 cancelled", () =>
  cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B.S17, reason: "Buyer relocating to Pune; requested cancellation." })
);
on("2026-07-28", "Refund approved for SR-28", () =>
  decideCancellation({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B.S17, approve: true, note: "Refund sent after deduction as per agreement.", reference: ref("RFD26"), actionDate: new Date() })
);

/* ------------------------------------------------- duplicate Customer merge */

on("2026-07-16", "Rohit Verma enquires again from a second number", async () => {
  const again = await customer("rohitAgain");
  await enquiry(again, "AH", "ONLINE", { remark: "Looking at villa plots." });
});
on("2026-07-18", "MD merges the duplicate", () =>
  requestPersonMerge({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", survivingPersonId: P("rohit").id, mergedPersonId: P("rohitAgain").id, reason: "Same person — enquired again from his office number." })
);

/* ------------------------------------------- Recovery and Check Recovery Link */

on("2026-08-03", "SR-22 cancelled after its Direct was paid", () =>
  cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B.S11, reason: "Buyer could not arrange the second instalment." })
);
on("2026-08-06", "Refund approved for SR-22", () =>
  decideCancellation({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: B.S11, approve: true, note: "Refund sent.", reference: ref("RFD26"), actionDate: new Date() })
);
on("2026-08-10", "Recovery opened on Nitin Goyal", async () => {
  const direct = await directOf(B.S11);
  await openRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: direct.id, noticeOn: new Date(), reference: "REC-2026-001", reason: "Direct paid on a sale later cancelled." });
  notes("M09", "Owes a Recovery for the Direct paid on SR-22, which was later cancelled.");
});
on("2026-09-01", "Customer closers accept the Customer Terms", async () => {
  await closerReady(P("vikas"));
  await closerReady(P("kamal"));
  notes("kamal", "Shares Nitin Goyal's mobile and address — his Loyalty waits for Check Recovery Link.");
});

/* ------------------------------------------------------------- Paid Early */

on("2026-08-24", "Accounts asks to pay Harish's Direct early", async () => {
  await requestCommissionPaidEarly({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: (await directOf(B.S26)).id, reason: "Member requested an advance before Diwali; buyer's loan disbursal is due." });
});
on("2026-08-25", "MD approves the early payment", async () => {
  await approveCommissionPaidEarly({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", recordId: (await directOf(B.S26)).id, note: "Approved; long-standing Member." });
});
on("2026-08-27", "Accounts pays it early", async () => {
  await markCommissionPaid({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: (await directOf(B.S26)).id, early: true, paidOn: new Date(), reference: ref("NEFT26"), remarks: "Paid early with MD approval of 25 Aug." });
});

/* --------------------------------------------------------- Allotment, Registry */

const finalBuyers = (k: string, who: string) =>
  recordFinalBuyers({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: B[k], buyers: [{ personId: P(who).id, dateOfBirth: new Date("1982-03-14"), address: "Jaipur, Rajasthan" }] });
const complete = (k: string, route: "ALLOTMENT" | "REGISTRY") =>
  recordCompletion({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: B[k],
    completion: route === "REGISTRY" ? { route, advocateName: "R. K. Bhargava", registryDate: new Date() } : { route },
  });

on("2026-05-20", "Final buyer details for SR-01", () => finalBuyers("S07", "dinesh"));
on("2026-06-05", "Allotment for SR-01", () => complete("S07", "ALLOTMENT"));
on("2026-06-28", "Final buyer details for SR-08", () => finalBuyers("S03", "ashok"));
on("2026-07-05", "Allotment for SR-08", () => complete("S03", "ALLOTMENT"));
on("2026-07-20", "Final buyer details for SR-09", () => finalBuyers("S08", "kamla"), "15:00");
on("2026-08-20", "Final buyer details for SR-03", () => finalBuyers("S01", "vikas"), "15:00");
on("2026-08-25", "Final buyer details for SR-05", () => finalBuyers("S02", "neha"), "15:00");
on("2026-09-15", "Registry for SR-03", () => complete("S01", "REGISTRY"), "15:00");
on("2026-09-25", "Registry for SR-05", () => complete("S02", "REGISTRY"), "15:00");

/* ---------------------------------------------------------------- Buybacks */

on("2026-08-05", "Buyback of SR-01 (seller exit)", async () => {
  const made = await createAcquisition({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    type: "BUYBACK",
    sourceBookingId: B.S07,
    sellerPersonId: P("dinesh").id,
    arrangedByType: "THREE_PERCENT_CLUB",
    purchaseDate: new Date(),
    remark: "Seller moving abroad; Club buys the plot back.",
    schedule: [
      { seq: 1, percent: "25", dueDate: new Date() },
      { seq: 2, percent: "75", dueDate: inDays(31) },
    ],
  });
  B.BB1 = made.acquisitionId;
  await confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: made.acquisitionId, percent: "25", paidOn: new Date(), reference: ref("UTR26") });
});
on("2026-08-06", "Buyback of SR-01 approved", () =>
  decideAcquisition({ idempotencyKey: key(), actorRef: ACC2, actorRole: "ACCOUNTS", acquisitionId: B.BB1, approve: true, note: "Agreement and first payment verified." })
);
on("2026-09-05", "Buyback of SR-01 paid in full", () =>
  confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: B.BB1, percent: "75", paidOn: new Date(), reference: ref("UTR26") })
, "15:00");
on("2026-09-12", "Allotment papers back for SR-01", () =>
  recordBuybackDocumentsReturned({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", acquisitionId: B.BB1, returnedOn: new Date() })
);

on("2026-09-10", "Buyback of AH-05 arranged by Sunita Bairwa", async () => {
  const made = await createAcquisition({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    type: "BUYBACK",
    sourceBookingId: B.S25,
    sellerPersonId: P("sapna").id,
    arrangedByType: "MEMBER",
    arrangedByPersonId: P("M11").id,
    purchaseDate: new Date(),
    remark: "Seller needs funds for her daughter's wedding; Sunita arranged the buyback.",
    schedule: [
      { seq: 1, percent: "25", dueDate: new Date() },
      { seq: 2, percent: "75", dueDate: inDays(25) },
    ],
  });
  B.BB2 = made.acquisitionId;
  await confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: made.acquisitionId, percent: "25", paidOn: new Date(), reference: ref("UTR26") });
});
on("2026-09-11", "Buyback of AH-05 approved, Buying Commission recorded", async () => {
  await decideAcquisition({ idempotencyKey: key(), actorRef: ACC2, actorRole: "ACCOUNTS", acquisitionId: B.BB2, approve: true, note: "Approved." });
  await recordBuyingCommission({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", acquisitionId: B.BB2, beneficiaryPersonId: P("M11").id, percent: "1" });
});
on("2026-10-05", "Buyback of AH-05 paid in full — Buying Commission Ready", () =>
  confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: B.BB2, percent: "75", paidOn: new Date(), reference: ref("UTR26") })
);

on("2026-09-22", "Purchase for Resale: Shree Nagar Residency SN-45", async () => {
  const group = await db.project.create({
    data: { projectCode: "RSL", name: "Jaipur Resale Properties", city: "Jaipur", location: "Jaipur, Rajasthan", type: "RESIDENTIAL", status: "ACTIVE", isExternalResaleGroup: true },
  });
  projectIds.RSL = group.id;
  const seller = await customer("mahendra");
  const made = await createAcquisition({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    type: "PURCHASE_FOR_RESALE",
    sellerPersonId: seller.id,
    arrangedByType: "THREE_PERCENT_CLUB",
    purchaseDate: new Date(),
    remark: "Corner plot in Shree Nagar Residency, Sanganer, bought for resale.",
    schedule: [
      { seq: 1, percent: "30", dueDate: new Date() },
      { seq: 2, percent: "70", dueDate: inDays(30) },
    ],
    property: { propertyName: "Shree Nagar Residency", location: "Sanganer, Jaipur", propertyNumber: "SN-45", projectType: "RESIDENTIAL", areaSqFt: "1800", resaleGroupId: group.id },
  });
  B.RS1 = made.acquisitionId;
  await confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: made.acquisitionId, percent: "30", paidOn: new Date(), reference: ref("UTR26") });
});
on("2026-09-23", "Purchase for Resale approved", () =>
  decideAcquisition({ idempotencyKey: key(), actorRef: ACC2, actorRole: "ACCOUNTS", acquisitionId: B.RS1, approve: true, note: "Title documents verified." })
);

/* --------------------------------------------------------- Trip and points */

const rewardOf = async (memberKey: string) =>
  db.tripReward.findFirstOrThrow({ where: { memberProfileId: P(memberKey).profileId }, orderBy: { earnedAt: "asc" } });

on("2026-08-20", "Trip traveller recorded", async () => {
  await recordTripNominee({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", rewardId: (await rewardOf("M01")).id, recipient: "SPOUSE", recipientName: "Kiran Shekhawat" });
});
on("2026-08-25", "Trip booked", async () => {
  await bookTripReward({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", rewardId: (await rewardOf("M01")).id, bookingReference: "MakeMyTrip MMT-4471925 · Goa, 4N/5D", bookedOn: new Date() });
});
on("2026-09-15", "Trip travelled", async () => {
  await markTripTravelled({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", rewardId: (await rewardOf("M01")).id, travelledOn: new Date() });
});

const spend = (memberKey: string, tokens: number, recipient: "SELF" | "NON_FAMILY", recipientName: string, what: string) =>
  recordTokenRedemption({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", memberProfileId: P(memberKey).profileId!, tokens, redeemedOn: istDay(new Date()), recipient, recipientName, reference: what });
on("2026-09-20", "Pooja spends Royalty points", () => spend("M04", 10, "SELF", "", "Weekend stay at Ranthambore, booked by the team"));
on("2026-10-02", "Pooja spends points for a friend", () => spend("M04", 3, "NON_FAMILY", "Suresh Bhatt (friend)", "Diwali sweets hamper"));

/* ---------------------------------------------------- Holds and Hold Requests */

on("2026-05-18", "Hold on SR-19 (lapses)", async () => {
  const kirti = await customer("kirti");
  await enquiry(kirti, "SRE", "SITE_VISIT", { remark: "Liked SR-19; arranging funds." });
  await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: plotId("SR-19"), personId: kirti.id, remark: "Holding while she arranges the token amount." });
});
on("2026-06-20", "Sandeep requests a Hold on AH-10", async () => {
  const kiran = await customer("kiranPal");
  const req = await submitHoldRequest({ idempotencyKey: key(), actorRef: `MEMBER:${P("M05").key}`, memberProfileId: P("M05").profileId!, personId: kiran.id, plotId: plotId("AH-10") });
  B.HR1 = req.holdRequestId;
});
on("2026-06-20", "CRM approves the Hold Request", () =>
  decideHoldRequest({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", requestId: B.HR1, approve: true, note: "Approved for 72 hours." })
, "15:00");
on("2026-06-25", "Kavita requests a Hold on AH-11", async () => {
  const sumit = await customer("sumit");
  const req = await submitHoldRequest({ idempotencyKey: key(), actorRef: `MEMBER:${P("M06").key}`, memberProfileId: P("M06").profileId!, personId: sumit.id, plotId: plotId("AH-11") });
  B.HR2 = req.holdRequestId;
});
on("2026-06-26", "CRM declines it", () =>
  decideHoldRequest({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", requestId: B.HR2, approve: false, note: "Plot already offered to a walk-in buyer." })
);
on("2026-10-12", "Ramesh requests a Hold on AH-12", async () => {
  const naveen = await customer("naveen");
  await submitHoldRequest({ idempotencyKey: key(), actorRef: `MEMBER:${P("M10").key}`, memberProfileId: P("M10").profileId!, personId: naveen.id, plotId: plotId("AH-12") });
});
on("2026-10-13", "Ramesh Kumawat deactivated", () =>
  setMemberStatus({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", memberProfileId: P("M10").profileId!, active: false, reason: "Membership on hold while his RERA renewal is pending." })
, "16:00");
on("2026-10-12", "Hold on SR-18 for Pooja Rawat", async () => {
  const pooja = await customer("poojaRawat");
  await enquiry(pooja, "SRE", "BY_MEMBER", { member: P("M03"), remark: "Wants SR-18; family visiting Sunday." });
  await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: plotId("SR-18"), personId: pooja.id, sourcedByType: "MEMBER", sourcedByPersonId: P("M03").id, remark: "Token cheque expected Monday." });
}, "15:00");
on("2026-10-13", "Hold on AH-09 for Vivek Sood", async () => {
  const vivek = await customer("vivek");
  await enquiry(vivek, "AH", "SITE_VISIT", { remark: "Visited with his wife." });
  await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: plotId("AH-09"), personId: vivek.id, remark: "Loan sanction awaited." });
});
on("2026-10-13", "Hold on MB-S10 for Aman Kalra", async () => {
  const aman = await customer("aman");
  await enquiry(aman, "MBP", "ONLINE", { remark: "Wants a shop for his pharmacy." });
  const hold = await createHold({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: plotId("MB-S10"), personId: aman.id, remark: "Partner to confirm." });
  B.H3 = hold.holdId;
}, "12:00");
on("2026-10-14", "Extension requested on MB-S10", () =>
  requestHoldExtension({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", holdId: B.H3, reason: "Partner travelling; back Friday.", requestedHours: 24 })
, "09:30");

/* ---------------------------------------------------- open Enquiries */

for (const [day, who, proj, source, inDaysNext, remark] of [
  ["2026-09-28", "ishaan", "MBP", "ONLINE", 15, "Comparing shop sizes."],
  ["2026-10-02", "irfan", "AH", "SITE_VISIT", 8, "Wants a villa plot; will bring his brother."],
  ["2026-10-08", "sneha", "SRE", "ONLINE", 6, "Asked for the price list."],
  ["2026-10-09", "rakeshMeena", "SRE", "DIRECT", 5, "Walk-in; budget up to 40 lakh."],
] as const) {
  on(day, `Enquiry from ${who}`, async () => {
    await enquiry(await customer(who), proj, source, { followUpInDays: inDaysNext, remark });
  });
}
on("2026-10-10", "Enquiry from Pallavi via Ajay", async () => {
  await enquiry(await customer("pallavi"), "MBP", "BY_MEMBER", { member: P("M12"), followUpInDays: 6, remark: "Clinic space; needs ground floor." });
});
on("2026-07-01", "Enquiry from Gopal", async () => {
  B.EQ_GOPAL = await enquiry(await customer("gopal"), "AH", "ONLINE", { remark: "Asked about EMI options." });
});
on("2026-07-04", "Follow-up with Gopal", () =>
  recordFollowUp({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", enquiryId: B.EQ_GOPAL, outcome: "CALL_LATER", remark: "Will decide after Diwali bonus.", nextAt: inDays(14) })
);
on("2026-07-20", "Gopal's Enquiry closed", () =>
  closeEnquiry({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", enquiryId: B.EQ_GOPAL, closeReason: "Budget did not match; bought a flat instead." })
);

/* ---------------------------------------------------------- bank details */

on("2026-10-08", "Joint bank account entered for Meena Agarwal", () =>
  enterBankDetails({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: P("meena").id,
    accountHolder: "Suresh & Meena Agarwal",
    bankName: "HDFC Bank",
    branchName: "C-Scheme, Jaipur",
    // The same account the toolkit entered for Suresh — read it back in Task 4 Step 2 if the number differs.
    accountNumber: "SURESH_ACCOUNT",
    ifsc: "HDFC0000123",
    jointAccountProof: "Passbook first page names Suresh Agarwal and Meena Agarwal as joint holders",
  })
);

/* --------------------------------------------------------- Land Inquiries */

const LAND = [
  { day: "2026-04-20", district: "Jaipur", tehsil: "Chomu", location: "Near Chomu bypass, Khasra 211", bigha: "4", stages: [["2026-05-10", "DOCUMENTS_PENDING"], ["2026-06-02", "SITE_VISIT"], ["2026-07-15", "UNDER_VERIFICATION"], ["2026-08-20", "NEGOTIATION"], ["2026-09-25", "APPROVED_FOR_ACQUISITION"]] },
  { day: "2026-05-22", district: "Jaipur", tehsil: "Bassi", location: "Bassi–Dausa road, Khasra 87", bigha: "6", stages: [["2026-06-15", "SITE_VISIT"], ["2026-07-30", "REJECTED_CLOSED"]] },
  { day: "2026-06-12", district: "Jaipur", tehsil: "Sanganer", location: "Behind Sanganer airport road, Khasra 402", bigha: "2", stages: [["2026-07-02", "DOCUMENTS_PENDING"], ["2026-08-12", "UNDER_VERIFICATION"]] },
  { day: "2026-07-08", district: "Ajmer", tehsil: "Kishangarh", location: "NH-48 frontage, Khasra 15", bigha: "8", stages: [["2026-08-01", "SITE_VISIT"], ["2026-09-10", "NEGOTIATION"]] },
  { day: "2026-08-05", district: "Jaipur", tehsil: "Phagi", location: "Phagi road, Khasra 330", bigha: "5", stages: [["2026-09-02", "DOCUMENTS_PENDING"]] },
  { day: "2026-08-28", district: "Jaipur", tehsil: "Chaksu", location: "Chaksu town, Khasra 58", bigha: "3", stages: [["2026-09-20", "SITE_VISIT"]] },
  { day: "2026-09-14", district: "Jaipur", tehsil: "Amer", location: "Kunda village, Khasra 141", bigha: "1", stages: [] },
  { day: "2026-09-30", district: "Tonk", tehsil: "Malpura", location: "Malpura road, Khasra 77", bigha: "10", stages: [["2026-10-09", "DOCUMENTS_PENDING"]] },
  { day: "2026-10-07", district: "Jaipur", tehsil: "Sanganer", location: "Goner road, Khasra 512", bigha: "2", stages: [] },
  { day: "2026-10-11", district: "Jaipur", tehsil: "Jamwa Ramgarh", location: "Near Ramgarh lake road, Khasra 19", bigha: "7", stages: [] },
] as const;

LAND.forEach((land, i) => {
  on(land.day, `Land Inquiry ${land.tehsil}`, async () => {
    const source = i % 3 === 0 ? P("M01") : i % 3 === 1 ? P("M12") : null;
    const made = await createLandInquiry({
      createRequestId: key(),
      actorRef: CRM,
      actorRole: "CRM",
      input: {
        ...emptyInput(),
        receivedFrom: source ? "MEMBER" : "THREE_PERCENT_CLUB",
        sourcePersonId: source?.id ?? null,
        district: land.district,
        tehsil: land.tehsil,
        exactLocation: land.location,
        areaBigha: land.bigha,
        areaBiswa: "0",
      },
    });
    B[`LI${i}`] = made.id;
  }, "16:00");
  for (const [day, stage] of land.stages) {
    on(day, `Land Inquiry ${land.tehsil} → ${stage}`, async () => {
      const row = await db.landInquiry.findUniqueOrThrow({ where: { id: B[`LI${i}`] } });
      await changeLandInquiryStage({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", id: row.id, version: row.version, stage, reason: "Updated after the site team's report." });
    }, "16:30");
  }
});

/* ------------------------------------------------------------ manual tasks */

on("2026-10-10", "MD's weekly review and a CRM task", async () => {
  const anita = await db.staffAccount.findFirst({ where: { role: "CRM", status: "ACTIVE", person: { fullName: { contains: "Anita" } } } });
  await db.$transaction(async (tx) => {
    await ensureTask(tx, { recordKind: "Project", recordId: projectIds.SRE, recordName: "Shri Ram Enclave", purpose: "MANUAL:WEEKLY SALES REVIEW", title: "Weekly sales review with the CRM team", assigneeRole: "MD", dueAt: new Date("2026-10-17T11:00:00+05:30"), recurrence: "WEEKLY", origin: "MANUAL" });
    await ensureTask(tx, { recordKind: "Customer", recordId: (await tx.customerProfile.findUniqueOrThrow({ where: { personId: P("neha").id } })).id, recordName: "Neha Joshi", purpose: "MANUAL:COLLECT REGISTRY COPY", title: "Collect the registry copy from Neha Joshi", assigneeRole: "CRM", assigneeStaffId: anita?.id ?? null, dueAt: new Date("2026-10-15T11:00:00+05:30"), origin: "MANUAL" });
  });
});

/* ------------------------------------------------------------- the runner */

export async function tellStory() {
  const ordered = steps.map((s, i) => ({ ...s, i })).sort((a, b) => `${a.day} ${a.time}`.localeCompare(`${b.day} ${b.time}`) || a.i - b.i);
  for (const step of ordered) {
    console.log(`${step.day} ${step.time}  ${step.label}`);
    await at(db, step.day, step.run, step.time);
  }
}
```

- [ ] **Step 2: Resolve the two data look-ups the story leaves open**

(a) **Meena's joint account number.** In the "Joint bank account" step, replace `"SURESH_ACCOUNT"` by reading Suresh's own bank detail first:

```ts
const suresh = await db.bankDetail.findFirstOrThrow({ where: { personId: P("suresh").id } });
// …and pass its decrypted/plain number. If BankDetail stores only a cipher, call enterBankDetails for
// Suresh in this same step with a known number (e.g. "50100200300400") and reuse that number for Meena.
```

Pick whichever matches `bank-service.ts` and delete the comment.

(b) **Trip earned.** After the 2026-08-02 payment on AH-03, Rajendra (M01) has two own credits (AH-01, AH-03) and one reference credit (Anita's AH-02), which meets TRIP-AH-26 (3 / own ≥ 2 / ref ≤ 1). If `rewardOf("M01")` finds no reward at the 2026-08-20 step, read `trip-service.ts` for when a credit qualifies and move the Trip steps after that date.

- [ ] **Step 3: Write the guide writer**

`prisma/demo/guide.ts`:

```ts
// Writes docs/Demo_Data_Guide.md from what the seed actually made.
import { writeFileSync } from "node:fs";
import { db, people, projectIds } from "./toolkit.ts";

export async function writeGuide() {
  const ids = await db.person.findMany({
    where: { id: { in: Object.values(people).map((p) => p.id) } },
    select: { id: true, customerProfile: { select: { customerId: true } }, memberProfile: { select: { memberId: true, status: true } } },
  });
  const byId = new Map(ids.map((p) => [p.id, p]));
  const crmId = (id: string) => {
    const p = byId.get(id);
    return [p?.memberProfile?.memberId, p?.customerProfile?.customerId].filter(Boolean).join(" / ") || "—";
  };
  const members = Object.values(people).filter((p) => /^M\d\d$/.test(p.key));
  const named = Object.values(people).filter((p) => !/^M\d\d$/.test(p.key) && p.note);
  const counts = {
    bookings: await db.booking.count({ where: { projectId: { in: Object.values(projectIds) } } }),
    plots: await db.plot.count({ where: { projectId: { in: Object.values(projectIds) } } }),
    pendingTasks: await db.task.count({ where: { status: "PENDING" } }),
  };
  const lines = [
    "# Demo Data Guide",
    "",
    `Generated by \`npm run seed:demo\` on ${new Date().toISOString().slice(0, 10)}. Six months of business, April → today: ${counts.plots} Plots, ${counts.bookings} Bookings, ${counts.pendingTasks} open tasks.`,
    "",
    "Sign in as MD (STF-0001), Accounts (STF-0003 / STF-0004) or CRM (STF-0005) with the usual passwords.",
    "",
    "## Projects",
    "",
    "| Project | Where | Launched | What to show |",
    "|---|---|---|---|",
    "| Shri Ram Enclave (SR-01…SR-30) | Jagatpura | April | Most Bookings; Registry done on SR-03 and SR-05; festive settings version 2 from 16 Aug |",
    "| Aravali Heights (AH-01…AH-20, AH-V1…V5) | Ajmer Road | June | Goa Trip programme; Rajendra's Trip travelled in September |",
    "| Mansarovar Business Park (MB-S01…S20) | Mansarovar | August | Commercial shops; newest sales |",
    "",
    "## Members",
    "",
    "| Name | Member ID | Story |",
    "|---|---|---|",
    ...members.map((m) => `| ${m.name} | ${crmId(m.id)} | ${m.note || "—"} |`),
    "",
    "## Customers worth opening",
    "",
    "| Name | Customer ID | Story |",
    "|---|---|---|",
    ...named.map((c) => `| ${c.name} | ${crmId(c.id)} | ${c.note} |`),
    "",
    "## Suggested walk-through",
    "",
    "1. **Dashboard** — today's, overdue and upcoming tasks; the notification bell.",
    "2. **Plot Inventory** — Shri Ram Enclave: Available, Hold, Booked, Sold and the bought-back SR-01.",
    "3. **A Booking from enquiry to Registry** — Vikas Bansal, SR-03.",
    "4. **A Member's network and rewards** — Rajendra Singh Shekhawat: invitees, Trip travelled; Pooja Khandelwal: Royalty points earned and spent.",
    "5. **Buyback / Resale** — AH-05: Buying Commission Ready, **Commission Paid** on the deal page.",
    "6. **Rewards** — Commission Ready / On Hold / Paid, Recovery, Check Recovery Link.",
    "7. **Land Inquiries** — ten inquiries at every stage.",
    "",
    "Do not run the `*:check` scripts on this database: they add test records. Re-run `npm run seed:demo` after any check run.",
    "",
  ];
  writeFileSync("docs/Demo_Data_Guide.md", lines.join("\n"), "utf-8");
}
```

Also add story notes as the steps run, so the guide's tables are filled: in `story.ts`, after the step that creates each named person, call `notes(key, "…")`. Add these notes (one line each) in the matching steps:

```ts
notes("M01", "Top seller; invited Anita, Mukesh and Ramesh. Earned the Goa Trip (travelled 15 Sep).");
notes("M04", "Neha Joshi's Royalty Linked Member; earned 15 points on SR-27, spent 13.");
notes("M07", "Direct on AH-06 paid early with MD approval.");
notes("M08", "RERA registration expires 19 Oct — reminder on the Dashboard.");
notes("M10", "Deactivated 13 Oct with a Hold Request still waiting (task for CRM).");
notes("M11", "Arranged the AH-05 Buyback; her 1% Buying Commission is Ready.");
notes("M13", "No bank details — his Direct on AH-07 is On Hold.");
notes("M14", "Aadhaar not available — her Directs are On Hold; corrected Sold By on SR-23.");
notes("vikas", "SR-03: enquiry → Booking → 100% → Registry; now a Customer closer (sold SR-29).");
notes("neha", "SR-05 via Pooja, then bought SR-27 direct — Pooja's Royalty points.");
notes("ashok", "Two own purchases — repeat-purchase Loyalty.");
notes("rohit", "SR-21 instalment overdue; his duplicate record was merged in July.");
notes("shalini", "Changed plot SR-24 → SR-13 (park-facing) in July.");
notes("rakesh", "Became Primary Customer of SR-12 by transfer from his brother Manoj.");
notes("dinesh", "SR-01 bought back by the Club in August.");
notes("sapna", "AH-05 bought back; arranged by Sunita Bairwa.");
notes("gaurav", "Booking rejected in May (cheque returned); new request on SR-17 waiting for Accounts.");
notes("meena", "Joint bank account with Suresh — approval waiting for Accounts.");
```

- [ ] **Step 4: Write the entry script and the npm scripts**

`prisma/demo-seed.ts`:

```ts
// Demo dataset — docs/superpowers/specs/2026-10-14-demo-dataset-design.md.
//
//   npm run data:reset   # once, to clear the old data (staff are kept)
//   npm run seed:demo
//
// Re-runnable: removes its own Projects (SRE, AH, MBP, RSL), People (mobiles
// 93…), references (UTR26/NEFT26/RFD26) and the UAT-only staff account first.
import { assertCheckDatabase } from "./check-guard.ts";
import { purgeScope } from "./check-cleanup.ts";
import { installStoryClock } from "./demo/story-clock.ts";

assertCheckDatabase();
installStoryClock();

const { db } = await import("./demo/toolkit.ts");
const { tellStory } = await import("./demo/story.ts");
const { writeGuide } = await import("./demo/guide.ts");
const { runAllJobs } = await import("@/lib/jobs");
const { MOBILE_PREFIX, PROJECT_CODES, REF_PREFIXES } = await import("./demo/world.ts");

async function wipe() {
  const projectIds = (await db.project.findMany({ where: { projectCode: { in: PROJECT_CODES } }, select: { id: true } })).map((p) => p.id);
  const uat = await db.staffAccount.findUnique({ where: { staffAccountId: "STF-UAT-01" } });
  if (uat) {
    await db.staffAccount.delete({ where: { id: uat.id } });
    await purgeScope(db, { tag: null, bookings: { id: "none" }, persons: { id: uat.personId }, plots: { id: "none" }, projects: { id: "none" }, acquisitions: { id: "none" }, references: { normalisedKey: "none" } });
  }
  await purgeScope(db, {
    tag: null,
    bookings: { projectId: { in: projectIds } },
    persons: { primaryMobile: { startsWith: MOBILE_PREFIX } },
    plots: { projectId: { in: projectIds } },
    projects: { id: { in: projectIds } },
    acquisitions: { OR: [{ plot: { projectId: { in: projectIds } } }, { resaleGroupId: { in: projectIds } }] },
    references: { OR: REF_PREFIXES.map((p) => ({ normalisedKey: { startsWith: p } })) },
  });
}

try {
  await wipe();
  await tellStory();
  await runAllJobs(new Date()); // real time: Holds placed in the past lapse, overdue turns urgent
  await writeGuide();
  console.log("seed:demo done — see docs/Demo_Data_Guide.md");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
```

The services are imported after `installStoryClock()` (dynamic `import()`), so any module-level `new Date()` they hold is story-aware.

`package.json` scripts:

```json
"seed:demo": "node --env-file=.env --import ./prisma/alias-loader.mjs prisma/demo-seed.ts",
"demo:verify": "node --env-file=.env --import ./prisma/alias-loader.mjs prisma/demo/verify.ts",
```

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: no errors. Fix any argument-shape mismatch against the real service signature (keep the behaviour).

- [ ] **Step 6: Commit**

```bash
git add prisma/demo/story.ts prisma/demo/guide.ts prisma/demo-seed.ts package.json
git commit -m "feat(demo): six-month Jaipur story, entry script and guide"
```

---

### Task 5: Verifier, run, and browser check

**Files:**
- Create: `prisma/demo/verify.ts`

**Interfaces:**
- Consumes: the seeded database.

- [ ] **Step 1: Write the verifier**

`prisma/demo/verify.ts`:

```ts
// The demo dataset looks real (spec §1, §7). Run after seed:demo.
// Run: npm run demo:verify
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "../check-guard.ts";

assertCheckDatabase();
const db = new PrismaClient();
const now = new Date();

async function main() {
  const projects = await db.project.findMany({ where: { projectCode: { in: ["SRE", "AH", "MBP"] } }, include: { _count: { select: { plots: true } } } });
  assert.deepEqual(
    Object.fromEntries(projects.map((p) => [p.projectCode, p._count.plots])),
    { SRE: 30, AH: 25, MBP: 20 },
    "exactly the three Projects with their plots (a re-run left no duplicates)"
  );
  assert.equal(await db.project.count({ where: { projectCode: { startsWith: "UAT" } } }), 0, "no UAT Projects");

  const testy = await db.person.findMany({ where: { OR: [{ fullName: { contains: "UAT" } }, { fullName: { startsWith: "ZZ" } }, { fullName: { startsWith: "Buyer " } }, { fullName: { contains: "Filler" } }] }, select: { fullName: true } });
  assert.deepEqual(testy, [], "no test-looking people");

  const bookings = await db.booking.findMany({ where: { project: { projectCode: { in: ["SRE", "AH", "MBP"] } } }, select: { createdAt: true, bookingDate: true } });
  assert.ok(bookings.length >= 34, `at least 34 Bookings (found ${bookings.length})`);
  const months = new Set(bookings.map((b) => b.createdAt.toISOString().slice(0, 7)));
  for (const m of ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]) assert.ok(months.has(m), `a Booking made in ${m}`);
  for (const b of bookings) {
    assert.ok(b.createdAt <= now, "no Booking created in the future");
    assert.ok(b.createdAt >= new Date("2026-04-01"), "no Booking before April");
  }
  const future = await db.auditEvent.count({ where: { at: { gt: new Date(now.getTime() + 60_000) } } });
  assert.equal(future, 0, "no audit event dated in the future");

  const pending = await db.task.findMany({ where: { status: "PENDING" }, select: { dueAt: true, purpose: true } });
  const today = now.toISOString().slice(0, 10);
  assert.ok(pending.some((t) => t.dueAt.toISOString().slice(0, 10) < today), "some tasks are overdue");
  assert.ok(pending.some((t) => t.dueAt.toISOString().slice(0, 10) > today), "some tasks are upcoming");
  const purposes = new Set(pending.map((t) => t.purpose));
  for (const p of ["PAYMENT_FOLLOW_UP", "ENQUIRY_FOLLOW_UP", "COMMISSION_PAYMENT", "RECOVERY_FOLLOW_UP", "RECOVERY_CIRCUMVENTION_REVIEW", "BANK_VERIFICATION", "DEACTIVATED_MEMBER_REQUEST_REVIEW", "RERA_EXPIRY"]) {
    assert.ok(purposes.has(p), `a pending ${p} task`);
  }

  assert.equal(await db.commissionRecord.count({ where: { acquisitionId: { not: null }, eligibility: "READY", payment: "NOT_PAID" } }), 1, "the AH-05 Buying Commission is Ready");
  assert.ok(await db.tripReward.count({ where: { state: "TRAVELLED" } }), "a Trip travelled");
  assert.ok(await db.tokenRedemption.count(), "Royalty points spent");
  assert.ok((await db.landInquiry.count()) >= 10, "ten Land Inquiries");
  console.log("demo verify OK");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
```

If a purpose name in the list differs from the constant the service uses (`grep -rn "purpose: \"" src/lib/services`), use the real one.

- [ ] **Step 2: Run it to verify it fails on the old data**

Run: `npm run demo:verify`
Expected: FAIL — `exactly the three Projects` (the demo has not run yet).

- [ ] **Step 3: Reset and seed**

Run: `npm run data:reset` then `npm run seed:demo` (in the background; it prints one line per step). If the connection drops, run `npm run seed:demo` again — it wipes its own data first.
Expected: the last line is `seed:demo done — see docs/Demo_Data_Guide.md`.

Fix any step that a service refuses (the message names the rule): adjust the story's data so the rule is met — never bypass the service.

- [ ] **Step 4: Run the verifier**

Run: `npm run demo:verify`
Expected: `demo verify OK`.

- [ ] **Step 5: Walk every main screen in the browser**

With `npm run dev` running, sign in as MD and open: Dashboard, the notification bell, Plot Inventory (each Project), Bookings, a Booking (SR-03), Members (Rajendra, Pooja), Customers (Vikas), Rewards (each tab), Buyback / Resale (AH-05 deal page: **Commission Paid** visible), Land Inquiries, Enquiries. For each: populated, dates spread April–October, no test-looking text, no console or hydration errors. Fix what is not, re-seed, re-check.

- [ ] **Step 6: Commit**

```bash
git add prisma/demo/verify.ts docs/Demo_Data_Guide.md
git commit -m "feat(demo): verifier and generated demo guide"
```
