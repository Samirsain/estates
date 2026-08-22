# PLC Applicability and Inventory Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ## Superseded in part — 22 August 2026
>
> The owner removed the code-based PLC model outright: no typed category codes,
> no per-Plot applicability selection, and a fixed catalogue of Road width /
> Open sides / Park facing / Playground facing instead. Effective PLC now derives
> from the Plot's four boundaries. See
> [`system/change-requests/CR-005`](../../../system/change-requests/CR-005-plc-catalogue-and-derivation.md)
> and [`system/DEVIATIONS.md`](../../../system/DEVIATIONS.md) D-05.
>
> | Task | Standing |
> | --- | --- |
> | 1 · precision | **Done**, and widened further — Plot area is four decimals too (`main-PRD.md` §23.1) |
> | 2 · `PlotPlcApplicability` table | **Dropped.** Applicability is derived, not stored |
> | 3 · snapshot side evidence | **Done**, absorbed into the derivation |
> | 4, 5, 6 · Project city, edit, card | **Done** as written |
> | 7 · Prepare Inventory grid | **Done differently** — boundary columns and a live Area / Charge read-out, no tick boxes |
> | 8 · row menu | **Open.** Edit Plot Details from it is built; the `⋯` menu itself is not |
> | 9 · Plot detail panel | **Open** |
> | 10 · terminology | **Done** |
>
> Tasks 8 and 9 below still read correctly. Everything else is history.

**Goal:** Close the three PLC gaps left open by the version lifecycle — per-Plot applicability records, snapshot side evidence, and four-decimal precision — and rebuild the two screens they land on.

**Architecture:** `Plot.plcComponentCodes String[]` becomes a `PlotPlcApplicability` table holding one row per Plot and category, with the per-code reason the audit trail cannot carry. Effective PLC is still computed by the single `buildPlcSnapshot()` in the domain layer and still derived on read, never stored. The Plot Inventory row collapses into one `⋯` menu and gains an inline detail panel matching the Bookings pattern; the Projects screen gains a card layout, a generated Project Code, and the edit path that has never existed.

**Tech Stack:** Next.js 15 App Router (server components + server actions), Prisma 5 on PostgreSQL, TypeScript, Tailwind. **No test framework** — this repository verifies with `assert`-based check scripts run under `node`.

**Spec:** [`docs/superpowers/specs/2026-08-22-plc-applicability-and-inventory-screens-design.md`](../specs/2026-08-22-plc-applicability-and-inventory-screens-design.md)

## Global Constraints

- **Branch `plc-lifecycle-and-portal-privacy`. Never push, never merge to `main`.** The user runs this on localhost.
- **PLC is a percentage only.** No task may compute, store or display a rupee value derived from PLC (`plc.md` §2.1, §21).
- **Never hard-delete a PLC record.** A removal is a recorded state, not a deletion (`plc.md` §11.1, §21).
- **Effective PLC is derived on read, never stored** for Available / Not Active inventory (`plc.md` §4.3).
- **`buildPlcSnapshot()` in `src/lib/domain/inventory.ts` is the only place effective PLC is computed.** No screen or service may re-implement the sum or the deduplication.
- **Every state-changing command goes through `runCommand`** (`src/lib/services/command.ts`) so it carries an idempotency key, runs in one transaction, and writes its `AuditEvent`.
- **Migrations are hand-written SQL** in `prisma/migrations/<timestamp>_<name>/migration.sql`, applied with `npx prisma migrate deploy`. Do not run `prisma migrate dev` — it can reset the remote development database.
- **Percentages are `Decimal(7,4)`** after Task 1. Stored at four decimals, displayed at two unless the value carries more.
- Verification commands: `node src/lib/domain/domain.check.ts` (pure rules), `npm run plc:check` (PLC against the database), `npm run check` (rules + full TypeScript), `npm run db:check` (every database check).
- The check scripts refuse to run unless `ALLOW_CHECK_WRITES="true"` is set. It already is, in `.env`.

---

## File Structure

**Created**

| File | Responsibility |
| --- | --- |
| `prisma/migrations/20260823090000_plc_applicability/migration.sql` | The one migration: applicability table, precision widening, Project columns |

**Modified**

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | `PlotPlcApplicability`, `PlcApplicabilitySource`, precision, `Project.city`/`amenities` |
| `src/lib/tasks.ts` | `formatPercent()` display helper, beside the existing `formatIst()` |
| `src/lib/domain/inventory.ts` | `buildPlcSnapshot()` gains evidence fields and four-decimal output |
| `src/lib/services/inventory-service.ts` | Writes applicability rows; new `setPlotPlcApplicability()` |
| `src/lib/services/project-service.ts` | Project Code generation, `updateProject()`, applicability-aware reads |
| `src/lib/services/hold-service.ts` | Reads codes from the applicability table |
| `src/lib/services/booking-service.ts` | Same |
| `src/lib/services/change-plot-service.ts` | Same |
| `src/app/plots/page.tsx`, `plots-client.tsx`, `actions.ts` | Grid, `⋯` menu, detail panel |
| `src/app/projects/page.tsx`, `projects-client.tsx`, `actions.ts` | Card, create form, edit |
| `src/app/bookings/actions.ts`, `bookings-client.tsx` | Four-decimal display, terminology |
| `src/lib/domain/domain.check.ts`, `prisma/plc.check.ts` | Evidence |
| `system/DEVIATIONS.md` | The two visible-term changes |

---

## Task 1: Percentage precision to four decimals

Independent of everything else, and the smallest change that touches the widest set of files. Do it first so later tasks are written against the final types.

**Files:**
- Create: `prisma/migrations/20260823090000_plc_applicability/migration.sql` (first section only; Tasks 2 and 4 append to the same file)
- Modify: `prisma/schema.prisma:488,504,1519`
- Modify: `src/lib/tasks.ts` (add `formatPercent`)
- Modify: `src/lib/domain/inventory.ts:86,90`
- Modify: `src/lib/services/project-service.ts` (`componentRows`)
- Modify: `src/lib/services/hold-service.ts:46`, `change-plot-service.ts`, `booking-service.ts`
- Modify: `src/app/plots/page.tsx:56`, `src/app/projects/page.tsx:38,54`, `src/app/bookings/actions.ts:645,657`
- Test: `src/lib/domain/domain.check.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `formatPercent(value: string | number, minDecimals?: number): string` exported from `@/lib/tasks`. `buildPlcSnapshot()` keeps its signature but returns percentages at four decimals.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/domain/domain.check.ts`, immediately after the existing
`assert.equal(snapshot.totalPercent.toFixed(3), "7.500");` block:

```ts
/* ---------------------------------------------- PLC precision (plc.md §2.1) */

// Four decimals are carried through the calculation, not rounded away at three.
const fine = buildPlcSnapshot(["ROAD"], [{ code: "ROAD", label: "Road", percent: "2.1250" }]);
assert.equal(fine.totalPercent.toFixed(4), "2.1250");
assert.equal(fine.components[0].percent, "2.1250", "the breakdown keeps four decimals too");

// Display trims trailing zeros but never below two decimals.
assert.equal(formatPercent("2.0000"), "2.00");
assert.equal(formatPercent("2.1250"), "2.125");
assert.equal(formatPercent("2.1000"), "2.1");
assert.equal(formatPercent("0"), "0.00");
assert.equal(formatPercent("12.3456"), "12.3456");
```

Add `formatPercent` to the import list at the top of the file:

```ts
import { formatPercent } from "../tasks.ts";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node src/lib/domain/domain.check.ts`
Expected: FAIL — `formatPercent` is not exported from `../tasks.ts`.

- [ ] **Step 3: Add the display helper**

In `src/lib/tasks.ts`, beside `formatIst`:

```ts
/**
 * A percentage for a screen. Stored at four decimals (plc.md §2.1), but
 * "2.0000%" is noise — trailing zeros go, and never below two decimals, so a
 * column of percentages stays aligned.
 */
export function formatPercent(value: string | number, minDecimals = 2): string {
  const fixed = Number(value).toFixed(4);
  const trimmed = fixed.replace(/0+$/, "");
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length >= minDecimals) return `${whole}.${fraction}`;
  return `${whole}.${fraction.padEnd(minDecimals, "0")}`;
}
```

- [ ] **Step 4: Widen the calculation to four decimals**

In `src/lib/domain/inventory.ts`, change the two `toFixed(3)` calls inside
`buildPlcSnapshot` (lines 86 and 90) to `toFixed(4)`:

```ts
    components.push({ code, label: rule.label, percent: percent.toFixed(4) });
    totalPercent = totalPercent.add(percent);
  }

  return { components, totalPercent: new D(totalPercent.toFixed(4)) };
```

Leave `calculateAreas`' `toFixed(3)` at line 49 alone — that is an area, not a
percentage.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node src/lib/domain/domain.check.ts`
Expected: PASS, ending `domain.check.ts OK`.

- [ ] **Step 6: Widen the columns**

Create `prisma/migrations/20260823090000_plc_applicability/migration.sql`:

```sql
-- plc.md §2.1 — PLC percentages carry four decimals, like every other
-- percentage in this schema.
ALTER TABLE "PlcComponent"      ALTER COLUMN "percent"      TYPE DECIMAL(7,4);
ALTER TABLE "PlcSnapshot"       ALTER COLUMN "totalPercent" TYPE DECIMAL(7,4);
ALTER TABLE "ChangePlotRequest" ALTER COLUMN "plcPercent"   TYPE DECIMAL(7,4);
```

In `prisma/schema.prisma`, change the three `@db.Decimal(6, 3)` on lines 488,
504 and 1519 to `@db.Decimal(7, 4)`. Leave lines 147 and 178
(`introducedRatePercent`, `inviteRatePercent`) alone — they are Member
commission bands and outside this spec.

- [ ] **Step 7: Update every writer and reader to four decimals**

Replace `.toFixed(3)` with `.toFixed(4)` at each PLC site:

- `src/lib/services/project-service.ts` — inside `componentRows()`
- `src/lib/services/hold-service.ts:46` — the `percent: c.percent.toString()` map is
  unaffected, but the `totalPercent: snapshot.totalPercent.toFixed(3)` write becomes `toFixed(4)`
- `src/lib/services/change-plot-service.ts` — the same `totalPercent` write
- `src/lib/services/booking-service.ts` — the `plc.totalPercent` writes at the freeze
  and carry-forward sites
- `src/lib/services/project-service.ts` — the three `toFixed(3)` calls inside `correctPlcSnapshot`
- `src/app/plots/page.tsx:56`, `src/app/projects/page.tsx:38,54`,
  `src/app/bookings/actions.ts:645,657`

Then replace the display calls. In `src/app/plots/plots-client.tsx`,
`src/app/projects/projects-client.tsx` and `src/app/bookings/bookings-client.tsx`,
every `Number(x).toFixed(2)` applied to a PLC percentage becomes
`formatPercent(x)`, importing it from `@/lib/tasks` beside the existing
`formatIst` import.

- [ ] **Step 8: Apply and verify**

```bash
npx prisma migrate deploy
npx prisma generate
npm run check
npm run plc:check
```

Expected: migration applied, `tasks.check.ts OK`, `security.check.ts OK`,
`domain.check.ts OK`, no TypeScript errors, `plc.check.ts OK`.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/tasks.ts src/lib/domain src/lib/services src/app
git commit -m "refactor: PLC percentages carry four decimals

plc.md §2.1 asks for DECIMAL(7,4), and every other percentage in this schema —
payment, ownership shares, commission, milestone — already uses it. The three
PLC columns were the outliers.

Stored at four, displayed at two: formatPercent trims trailing zeros but never
below two decimals, because 2.0000% is noise on a screen and a ragged column is
worse than a precise one."
```

---

## Task 2: Plot applicability becomes a table

**Files:**
- Modify: `prisma/schema.prisma` (new model and enum; drop `Plot.plcComponentCodes`)
- Modify: `prisma/migrations/20260823090000_plc_applicability/migration.sql` (append)
- Modify: `src/lib/services/inventory-service.ts`
- Modify: `src/lib/services/hold-service.ts`, `booking-service.ts`, `change-plot-service.ts`
- Modify: `src/app/plots/page.tsx`
- Modify: `prisma/check-cleanup.ts`
- Test: `prisma/plc.check.ts`

**Interfaces:**
- Consumes: `buildPlcSnapshot()` from Task 1.
- Produces:
  - `applicableCodes(tx: Tx, plotId: string): Promise<string[]>` from `@/lib/services/inventory-service`
  - `setPlotPlcApplicability(args: { idempotencyKey, actorRef, actorRole, plotId, entries: Array<{ code: string; isApplicable: boolean; reason?: string }> }): Promise<{ plotId: string; applicable: string[] }>` from `@/lib/services/inventory-service`
  - `PlotRow.plcComponentCodes` keeps its name and shape in `prepareInventory`

- [ ] **Step 1: Write the failing test**

Append to `prisma/plc.check.ts`, immediately before the `await cleanup();` at the
end of `main()`:

```ts
  /* ============================== applicability rows (plc.md §4.2, §13.3) */

  const applicability = await db.plotPlcApplicability.findMany({
    where: { plotId: plot.id },
    orderBy: { categoryCode: "asc" },
  });
  assert.equal(
    applicability.filter((a) => a.isApplicable).map((a) => a.categoryCode).join(","),
    "CORNER,PARK_FACING,ROAD_FACING",
    "one row per distinct category, duplicates collapsed on the way in (§2.3)"
  );
  assert.equal(applicability[0].sourceType, "MANUAL", "applicability is chosen by hand (§4.2)");
  assert.ok(applicability[0].actorRef, "and records who chose it");

  // Removing a component keeps the row and marks it inapplicable — no PLC
  // record is ever hard-deleted (§11.1, §21).
  await setPlotPlcApplicability({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    plotId: plot.id,
    entries: [
      { code: "ROAD_FACING", isApplicable: true, reason: "North and East are roads." },
      { code: "PARK_FACING", isApplicable: false },
      { code: "CORNER", isApplicable: false },
    ],
  });

  const afterRemoval = await db.plotPlcApplicability.findMany({ where: { plotId: plot.id } });
  assert.equal(afterRemoval.length, 3, "the removed rows stay, they are not deleted (§21)");
  assert.equal(
    afterRemoval.filter((a) => a.isApplicable).length,
    1,
    "only Road facing still applies"
  );
  assert.equal(
    afterRemoval.find((a) => a.categoryCode === "ROAD_FACING")!.reason,
    "North and East are roads.",
    "the per-code reason is what this table exists for"
  );

  // The change reaches the audit trail, which is where actor, time and
  // before/after live — the table does not duplicate them (§4.2).
  const applicabilityAudit = await db.auditEvent.findFirstOrThrow({
    where: { entity: "Plot", entityId: plot.id, action: "PLC_APPLICABILITY_SET" },
  });
  assert.equal(applicabilityAudit.actorRef, ADMIN);
  assert.ok(applicabilityAudit.beforeMasked && applicabilityAudit.afterMasked);
```

Add the import at the top of the file:

```ts
import { setPlotPlcApplicability } from "@/lib/services/inventory-service";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run plc:check`
Expected: FAIL — `setPlotPlcApplicability` is not exported, and
`db.plotPlcApplicability` does not exist.

- [ ] **Step 3: Add the model**

In `prisma/schema.prisma`, add beside the other PLC models:

```prisma
/// plc.md §4.2, §13.3 — which PLC categories apply to a Plot, one row each.
/// Version-independent: the codes resolve against whichever version is
/// published, so §4.3's recalculation happens by construction.
model PlotPlcApplicability {
  id           String                 @id @default(uuid())
  plotId       String
  plot         Plot                   @relation(fields: [plotId], references: [id], onDelete: Cascade)
  categoryCode String
  /// False is a recorded removal. No PLC record is ever hard-deleted (§21).
  isApplicable Boolean                @default(true)
  sourceType   PlcApplicabilitySource @default(MANUAL)
  /// Why this component applies to this Plot. The one fact the audit trail
  /// cannot hold, and the reason this table exists.
  reason       String?
  actorRef     String
  createdAt    DateTime               @default(now())
  updatedAt    DateTime               @updatedAt

  @@unique([plotId, categoryCode])
  @@index([plotId, isApplicable])
}

/// Only MANUAL today: applicability is chosen, never derived. The column exists
/// so a snapshot frozen now can still say so if derivation is ever added.
enum PlcApplicabilitySource {
  MANUAL
}
```

In the `Plot` model, delete the `plcComponentCodes String[] @default([])` line
and its two comment lines, and add the back-relation:

```prisma
  plcApplicability PlotPlcApplicability[]
```

- [ ] **Step 4: Append to the migration**

Append to `prisma/migrations/20260823090000_plc_applicability/migration.sql`:

```sql
-- plc.md §4.2, §13.3 — per-Plot applicability, one row per category.
CREATE TYPE "PlcApplicabilitySource" AS ENUM ('MANUAL');

CREATE TABLE "PlotPlcApplicability" (
    "id"           TEXT NOT NULL,
    "plotId"       TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "isApplicable" BOOLEAN NOT NULL DEFAULT true,
    "sourceType"   "PlcApplicabilitySource" NOT NULL DEFAULT 'MANUAL',
    "reason"       TEXT,
    "actorRef"     TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlotPlcApplicability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlotPlcApplicability_plotId_categoryCode_key"
  ON "PlotPlcApplicability"("plotId", "categoryCode");
CREATE INDEX "PlotPlcApplicability_plotId_isApplicable_idx"
  ON "PlotPlcApplicability"("plotId", "isApplicable");

ALTER TABLE "PlotPlcApplicability" ADD CONSTRAINT "PlotPlcApplicability_plotId_fkey"
  FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry every existing Plot's codes across before the column goes.
INSERT INTO "PlotPlcApplicability" ("id", "plotId", "categoryCode", "actorRef", "updatedAt")
SELECT gen_random_uuid()::text, p."id", code, 'MIGRATION', now()
FROM "Plot" p, unnest(p."plcComponentCodes") AS code;

ALTER TABLE "Plot" DROP COLUMN "plcComponentCodes";
```

- [ ] **Step 5: Add the read helper and the write command**

In `src/lib/services/inventory-service.ts`, add near the top of the PLC section:

```ts
/** The categories that currently apply to a Plot (plc.md §4.2). */
export async function applicableCodes(tx: Tx, plotId: string): Promise<string[]> {
  const rows = await tx.plotPlcApplicability.findMany({
    where: { plotId, isApplicable: true },
    select: { categoryCode: true },
    orderBy: { categoryCode: "asc" },
  });
  return rows.map((r) => r.categoryCode);
}
```

And, at the end of the file, the command:

```ts
/**
 * plc.md §4.2 — setting applicability for one Plot. A component that no longer
 * applies is marked, never deleted, and the whole change reaches AuditEvent
 * with its actor, time and before/after.
 */
export async function setPlotPlcApplicability(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  plotId: string;
  entries: Array<{ code: string; isApplicable: boolean; reason?: string }>;
}) {
  return runCommand<{ plotId: string; applicable: string[] }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PLC_APPLICABILITY_SET",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { plotId: args.plotId, entries: args.entries },
    },
    async (tx) => {
      const plot = await tx.plot.findUniqueOrThrow({
        where: { id: args.plotId },
        include: {
          project: {
            include: {
              plcRuleVersions: {
                where: { status: "PUBLISHED" },
                include: { components: true },
                take: 1,
              },
            },
          },
        },
      });
      const version = plot.project.plcRuleVersions[0];
      if (!version) blocked("The Project has no published PLC version. Complete Project setup first.");

      const validCodes = new Set(version.components.map((c) => c.code));
      for (const entry of args.entries) {
        if (!validCodes.has(entry.code)) {
          // plc.md §5.3 — an unknown code is refused, never silently dropped.
          blocked(`PLC component "${entry.code}" is not in the Project's published rule version.`);
        }
      }

      const before = await applicableCodes(tx, args.plotId);

      for (const entry of args.entries) {
        await tx.plotPlcApplicability.upsert({
          where: { plotId_categoryCode: { plotId: args.plotId, categoryCode: entry.code } },
          create: {
            plotId: args.plotId,
            categoryCode: entry.code,
            isApplicable: entry.isApplicable,
            reason: entry.reason?.trim() || null,
            actorRef: args.actorRef,
          },
          update: {
            isApplicable: entry.isApplicable,
            reason: entry.reason?.trim() || null,
            actorRef: args.actorRef,
          },
        });
      }

      const after = await applicableCodes(tx, args.plotId);

      return {
        result: { plotId: args.plotId, applicable: after },
        audit: {
          entity: "Plot",
          entityId: args.plotId,
          action: "PLC_APPLICABILITY_SET",
          before: { applicable: before },
          after: { applicable: after, entries: args.entries },
        },
      };
    }
  );
}
```

Import `Tx` alongside the existing `blocked, runCommand` import in that file.

- [ ] **Step 6: Write applicability rows from the grid**

In `prepareInventory`, replace the `plcComponentCodes: [...new Set(...)]` line
inside `tx.plot.create({ data: { ... } })` with a nested create:

```ts
            plcApplicability: {
              create: [...new Set(row.plcComponentCodes ?? [])].map((code) => ({
                categoryCode: code,
                actorRef: args.actorRef,
              })),
            },
```

The validation loop above it is unchanged — it already refuses a code that is
not in the published version.

- [ ] **Step 7: Move every reader onto the table**

In `src/lib/services/hold-service.ts`, `booking-service.ts` and
`change-plot-service.ts`, each freeze site currently reads
`plot.plcComponentCodes`. Replace that argument with a call to the helper. In
`hold-service.ts`:

```ts
  const snapshot = buildPlcSnapshot(
    await applicableCodes(tx, plot.id),
    version.components.map((c) => ({ code: c.code, label: c.label, percent: c.percent.toString() }))
  );
```

Import `applicableCodes` from `@/lib/services/inventory-service` in all three.
Remove `plcComponentCodes` from the `include`/`select` shapes and from the
`PlotWithPlc` type in `booking-service.ts:137-147`.

In `src/app/plots/page.tsx`, `listPlots()` no longer returns the codes. Add the
relation to the query in `src/lib/services/inventory-service.ts`'s `listPlots`:

```ts
      plcApplicability: { where: { isApplicable: true }, orderBy: { categoryCode: "asc" } },
```

and in `page.tsx` replace `plot.plcComponentCodes` with
`plot.plcApplicability.map((a) => a.categoryCode)` in both the `plcCodes` field
and the `buildPlcSnapshot` call.

- [ ] **Step 8: Keep the check harness able to purge**

In `prisma/check-cleanup.ts`, add before the `plcSnapshot.deleteMany` line:

```ts
  await db.plotPlcApplicability.deleteMany({ where: { plotId: { in: plotIds } } });
```

- [ ] **Step 9: Apply and verify**

```bash
npx prisma migrate deploy
npx prisma generate
npm run check
npm run plc:check
npm run db:check
```

Expected: every check ends `OK`. `db:check` runs against a remote database and
occasionally fails with a `ConnectionReset` — that is the network, not the code.
Re-run once before investigating.

- [ ] **Step 10: Commit**

```bash
git add prisma src/lib/services src/app/plots
git commit -m "feat: Plot PLC applicability becomes a table

plc.md §13.3 asks for it, and the one thing it holds that nothing else can is
the per-code reason — why this component applies to this Plot. Actor, time and
before/after already reach AuditEvent through runCommand, so this table does not
duplicate them.

A component that stops applying is marked, never deleted (§21). Applicability
stays version-independent, so publishing a new version still updates Available
inventory by construction rather than by copy-forward over every Plot."
```

---

## Task 3: Snapshot side evidence

**Files:**
- Modify: `src/lib/domain/inventory.ts`
- Modify: `src/lib/services/hold-service.ts`, `booking-service.ts`, `change-plot-service.ts`, `project-service.ts`
- Test: `src/lib/domain/domain.check.ts`, `prisma/plc.check.ts`

**Interfaces:**
- Consumes: `applicableCodes()` from Task 2.
- Produces: `buildPlcSnapshot(appliedCodes, ruleComponents, evidence?)` where
  `evidence?: { boundaries: readonly Boundary[]; parkFacing: boolean }`, and each
  component gains `applicabilitySource`, `sideEvidence`, `includedInTotal`, `exclusionReason`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/domain/domain.check.ts`, after the precision block from Task 1:

```ts
/* ------------------------------------- PLC snapshot evidence (plc.md §7.1) */

const evidenced = buildPlcSnapshot(
  ["ROAD_FACING", "PARK_FACING"],
  [
    { code: "ROAD_FACING", label: "Road facing", percent: "2" },
    { code: "PARK_FACING", label: "Park facing", percent: "1.5" },
  ],
  {
    boundaries: [
      { side: "NORTH", kind: "ROAD" },
      { side: "EAST", kind: "ROAD" },
      { side: "SOUTH", kind: "PLOT" },
      { side: "WEST", kind: "OTHER" },
    ],
    parkFacing: true,
  }
);

const road = evidenced.components.find((c) => c.code === "ROAD_FACING")!;
assert.equal(road.sideEvidence, "North, East — Road", "the sides that justify it are recorded");
assert.equal(road.applicabilitySource, "MANUAL", "chosen by hand, and the snapshot says so");
assert.equal(road.includedInTotal, true);
assert.equal(road.exclusionReason, null);

const park = evidenced.components.find((c) => c.code === "PARK_FACING")!;
assert.equal(park.sideEvidence, "Park facing", "the flag counts as evidence with no side recorded");

// Evidence is evidence, not a decision: a category with nothing to point at is
// still charged, because a person chose it (§4.2).
const unevidenced = buildPlcSnapshot(
  ["CORNER"],
  [{ code: "CORNER", label: "Corner", percent: "1" }],
  { boundaries: [], parkFacing: false }
);
assert.equal(unevidenced.components[0].sideEvidence, null);
assert.equal(unevidenced.totalPercent.toFixed(4), "1.0000", "and it still counts");

// Called without evidence — the three freeze sites before this change — the
// snapshot is still valid, with no evidence rather than wrong evidence.
assert.equal(buildPlcSnapshot(["CORNER"], [{ code: "CORNER", label: "Corner", percent: "1" }])
  .components[0].sideEvidence, null);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node src/lib/domain/domain.check.ts`
Expected: FAIL — `buildPlcSnapshot` takes two arguments, and `sideEvidence` is
not a property.

- [ ] **Step 3: Extend the domain function**

In `src/lib/domain/inventory.ts`, replace the `PlcSnapshot` type and
`buildPlcSnapshot`:

```ts
export type PlcComponentRule = { code: string; label: string; percent: string | number };

export type PlcSnapshotComponent = {
  code: string;
  label: string;
  percent: string;
  /** plc.md §7.1 — how this component came to apply. */
  applicabilitySource: "MANUAL";
  /** The Plot sides or characteristic that justify it, recorded as evidence. */
  sideEvidence: string | null;
  includedInTotal: boolean;
  exclusionReason: string | null;
};

export type PlcSnapshot = {
  components: PlcSnapshotComponent[];
  totalPercent: Decimal;
};

export type PlcEvidence = { boundaries: readonly Boundary[]; parkFacing: boolean };

/**
 * plc.md §7.1 — the sides that justify a category, written as evidence. This
 * takes no decision: applicability is chosen by a person (§4.2), and a category
 * with nothing to point at is still charged.
 */
function sideEvidenceFor(code: string, evidence: PlcEvidence | undefined): string | null {
  if (!evidence) return null;
  const roads = evidence.boundaries.filter((b) => b.kind === "ROAD");
  const parks = evidence.boundaries.filter((b) => b.kind === "PARK");
  const sides = (list: readonly Boundary[]) => list.map((b) => title(b.side)).join(", ");

  if (code === "PARK_FACING") {
    if (parks.length > 0) return `${sides(parks)} — Park`;
    return evidence.parkFacing ? "Park facing" : null;
  }
  if (roads.length === 0) return null;
  if (code === "CORNER") return roads.length >= 2 ? `${sides(roads)} — Road` : null;
  return `${sides(roads)} — Road`;
}

/**
 * PRD §16.3 — PLC is percentage only, each distinct component is charged once,
 * and the same category appearing on multiple sides is not charged repeatedly.
 * An unknown code fails loudly rather than being silently dropped.
 */
export function buildPlcSnapshot(
  appliedCodes: readonly string[],
  ruleComponents: readonly PlcComponentRule[],
  evidence?: PlcEvidence
): PlcSnapshot {
  const byCode = new Map(ruleComponents.map((c) => [c.code, c]));
  const seen = new Set<string>();
  const components: PlcSnapshotComponent[] = [];
  let totalPercent = new D(0);

  for (const code of appliedCodes) {
    if (seen.has(code)) continue; // charged once, however many sides qualify
    const rule = byCode.get(code);
    if (!rule) throw new Error(`PLC component "${code}" is not in the Project's current rule version.`);
    seen.add(code);
    const percent = new D(rule.percent);
    if (percent.lt(0)) throw new Error(`PLC component "${code}" cannot be negative.`);
    components.push({
      code,
      label: rule.label,
      percent: percent.toFixed(4),
      applicabilitySource: "MANUAL",
      sideEvidence: sideEvidenceFor(code, evidence),
      // Always true and null: checkbox entry makes a duplicate structurally
      // impossible, so there is nothing to exclude. Stored because plc.md §7.1
      // asks for the shape and a future per-side model would fill them.
      includedInTotal: true,
      exclusionReason: null,
    });
    totalPercent = totalPercent.add(percent);
  }

  return { components, totalPercent: new D(totalPercent.toFixed(4)) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node src/lib/domain/domain.check.ts`
Expected: PASS.

- [ ] **Step 5: Pass evidence at every freeze site**

In `hold-service.ts`, `booking-service.ts` and `change-plot-service.ts`, add
`boundaries: true` to each Plot `include`, and pass the third argument:

```ts
  const snapshot = buildPlcSnapshot(
    await applicableCodes(tx, plot.id),
    version.components.map((c) => ({ code: c.code, label: c.label, percent: c.percent.toString() })),
    {
      boundaries: plot.boundaries.map((b) => ({
        side: b.side,
        kind: b.kind,
        roadWidthFt: b.roadWidthFt?.toString(),
      })),
      parkFacing: plot.parkFacing,
    }
  );
```

In `project-service.ts`'s `correctPlcSnapshot`, do the same — load the Plot's
boundaries alongside the old snapshot and pass them, so a corrected snapshot
carries evidence too.

- [ ] **Step 6: Assert it against the database**

Append to `prisma/plc.check.ts`, inside the correction block after `corrected`
is loaded:

```ts
  const correctedComponents = corrected.components as Array<{
    code: string;
    sideEvidence: string | null;
    applicabilitySource: string;
    includedInTotal: boolean;
  }>;
  assert.equal(
    correctedComponents[0].applicabilitySource,
    "MANUAL",
    "a corrected snapshot records how applicability was chosen (§7.1)"
  );
  assert.equal(
    correctedComponents.every((c) => c.includedInTotal),
    true,
    "checkbox entry admits no excluded row"
  );
```

- [ ] **Step 7: Verify**

```bash
npm run check
npm run plc:check
```

Expected: all `OK`.

- [ ] **Step 8: Commit**

```bash
git add src/lib prisma/plc.check.ts
git commit -m "feat: PLC snapshots record the sides that justify each component

plc.md §7.1 asks each frozen component to name the Plot side or characteristic
behind it. The Plot already holds that in PlotBoundary and parkFacing, so it is
read at freeze time rather than asked for a second time.

This records evidence; it takes no decision. Applicability is still chosen by a
person, and a category with nothing to point at is still charged.

includedInTotal and exclusionReason are always true and null, because checkbox
entry makes a duplicate structurally impossible. They exist so the shape matches
§7.1 and a future per-side model has somewhere to write."
```

---

## Task 4: Project city, amenities, and the create form

**Files:**
- Modify: `prisma/schema.prisma` (Project), `prisma/migrations/20260823090000_plc_applicability/migration.sql`
- Modify: `src/lib/services/project-service.ts` (`createProject`)
- Modify: `src/app/projects/actions.ts`, `projects-client.tsx`, `page.tsx`
- Test: `prisma/plc.check.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `createProject` no longer takes `projectCode` or `reraExpiryDate`; it takes `city?: string | null` and `amenities?: string | null`. It still returns `{ projectId, projectCode }`.

- [ ] **Step 1: Write the failing test**

Append to `prisma/plc.check.ts`, before the final `await cleanup();`:

```ts
  /* ================================ Project Code is generated, not typed */

  const generated = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  assert.match(
    generated.projectCode,
    /^[A-Z]{1,3}-\d{2}$/,
    "the code is derived from the name, not typed by a person"
  );

  const twin = await createProject({
    idempotencyKey: key(),
    actorRef: PC,
    actorRole: "PC",
    name: `${TAG} PLC Lifecycle`,
    type: "RESIDENTIAL",
    city: "Jaipur",
    amenities: "Clubhouse\n24x7 water",
    components: [{ code: "CORNER", label: "Corner", percent: "1.000" }],
  });
  assert.notEqual(twin.projectCode, generated.projectCode, "a repeated name takes the next number");

  const twinRow = await db.project.findUniqueOrThrow({ where: { id: twin.projectId } });
  assert.equal(twinRow.city, "Jaipur");
  assert.equal(twinRow.amenities, "Clubhouse\n24x7 water", "amenities are one per line");
```

The existing `createProject` call at the top of `main()` must lose its
`projectCode: `${TAG}-01`` argument at the same time, or it will not compile.
Replace the whole call's argument list with:

```ts
    name: `${TAG} PLC Lifecycle`,
    type: "RESIDENTIAL",
    city: "Jaipur",
```

...keeping `idempotencyKey`, `actorRef`, `actorRole` and `components` as they are.

> **Note for whoever runs this:** `purgeCheckData` finds its rows by
> `Project.projectCode` starting with the TAG. Generated codes will not start
> with `ZZ-PLC`, so this task must also change the check's cleanup to purge by
> name. See Step 6.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run plc:check`
Expected: FAIL — `createProject` still requires `projectCode`, and `city` is not
a known property.

- [ ] **Step 3: Add the columns**

In `prisma/schema.prisma`, inside `model Project`, after `location`:

```prisma
  city      String?
  /// One amenity per line. Rendered as bullets on the Project card.
  amenities String?
```

Append to the migration file:

```sql
-- Informational Project fields. Neither affects inventory, commission or payment.
ALTER TABLE "Project" ADD COLUMN "city" TEXT;
ALTER TABLE "Project" ADD COLUMN "amenities" TEXT;
```

- [ ] **Step 4: Generate the Project Code**

In `src/lib/services/project-service.ts`, add above `createProject`:

```ts
/**
 * The Project Code is no longer typed. It stays in the database, unique, and
 * remains the key that ties a report or an export back to a Project — but a
 * person should not have to invent one, and Project.name carries no uniqueness
 * to replace it with.
 */
async function generateProjectCode(tx: Tx, name: string): Promise<string> {
  const stem =
    name
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 3) || "PRJ";

  const taken = await tx.project.findMany({
    where: { projectCode: { startsWith: `${stem}-` } },
    select: { projectCode: true },
  });
  const used = new Set(taken.map((p) => p.projectCode));

  for (let n = 1; n < 100; n += 1) {
    const candidate = `${stem}-${String(n).padStart(2, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  blocked(`Too many Projects share the code stem ${stem}. Rename this one.`);
}
```

Then change `createProject`'s argument type — remove `projectCode`, remove
`reraExpiryDate`, narrow `type`, and add the two new fields:

```ts
export async function createProject(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  name: string;
  type: "RESIDENTIAL" | "COMMERCIAL";
  developer?: string | null;
  location?: string | null;
  city?: string | null;
  amenities?: string | null;
  reraNumber?: string | null;
  isExternalResaleGroup?: boolean;
  components: PlcComponentInput[];
}) {
```

Delete the two lines that validate and normalise the typed code
(`const code = args.projectCode...` and the `if (!code) blocked(...)`), keep the
name check, and inside the transaction replace the duplicate-code guard with the
generator:

```ts
      const code = await generateProjectCode(tx, args.name);
```

In the `tx.project.create` data, replace `projectCode: code` with the same
`code`, drop `reraExpiryDate`, and add:

```ts
          city: args.city?.trim() || null,
          amenities: args.amenities?.trim() || null,
```

- [ ] **Step 5: Update the form and the page**

In `src/app/projects/actions.ts`, remove `projectCode` and `reraExpiryDate` from
`createProjectAction`'s input type and from the call, narrow the `type` union to
`"RESIDENTIAL" | "COMMERCIAL"`, and add `city` and `amenities`.

In `src/app/projects/projects-client.tsx`'s `ProjectDialog`:

- delete the Project Code field
- delete the `<Input type="date" name="reraExpiryDate" />` field
- delete `<option value="MIXED">Mixed</option>`
- add a City input beside Location
- add an amenities textarea:

```tsx
        <Field label="Amenities — one per line">
          <textarea
            name="amenities"
            rows={4}
            className={`${inputClass} h-auto py-2`}
            placeholder={"Clubhouse\n24×7 water\nLandscaped park"}
          />
        </Field>
```

and add both to the submitted object. In `src/app/projects/page.tsx`, add
`city: project.city` and `amenities: project.amenities` to the mapped row, and
add them to `ProjectRowView` in `projects-client.tsx`.

- [ ] **Step 6: Retag the check cleanup**

`purgeCheckData` finds Projects by `projectCode`, which is now generated. In
`prisma/check-cleanup.ts`, change the two `projectCode` filters to `name`:

```ts
          { project: { name: { startsWith: tag } } },
```

```ts
      where: { name: { startsWith: tag } },
```

and update the convention comment at the top of the file from
`Project.projectCode    starts with TAG` to `Project.name    starts with TAG`.

Then fix the other check scripts that create Projects with a typed code —
`prisma/acquisition.check.ts`, `booking.check.ts`, `phase5.check.ts` — by
removing the `projectCode` argument and making sure the `name` starts with their
TAG. `prisma/db.check.ts:151` looks up the seeded Project by
`projectCode: "GRN"`; change it to `name` and set that name in `prisma/seed.ts`.

- [ ] **Step 7: Verify**

```bash
npx prisma migrate deploy
npx prisma generate
npm run check
npm run db:check
```

Expected: every check `OK`. If a check leaves rows behind, the tagging change in
Step 6 is incomplete — fix it before moving on.

- [ ] **Step 8: Commit**

```bash
git add prisma src/lib/services/project-service.ts src/app/projects
git commit -m "feat: Project gains city and amenities; the code generates itself

Nobody should have to invent a Project Code. It is derived from the name now —
Green Valley becomes GRN-01, and a repeated stem takes the next number.

The column stays, unique, because Project.name carries no uniqueness and the
code is what ties a report or an export back to what it described. It simply
leaves the form and the card.

RERA expiry goes from the Project. Nothing reads it: RERA_EXPIRY_REMINDER works
from memberProfile.reraExpiryDate, and PRD §26 already excludes any Project RERA
operational block. Mixed leaves the form; the enum value stays for
acquisition-service and existing rows."
```

---

## Task 5: Edit Project

**Files:**
- Modify: `src/lib/services/project-service.ts`
- Modify: `src/app/projects/actions.ts`, `projects-client.tsx`
- Test: `prisma/plc.check.ts`

**Interfaces:**
- Consumes: `createProject` from Task 4.
- Produces: `updateProject(args: { idempotencyKey, actorRef, actorRole, projectId, name, type, developer?, location?, city?, amenities?, reraNumber?, reason }): Promise<{ projectId: string }>` and `updateProjectAction(projectId, input, reason, key)`.

- [ ] **Step 1: Write the failing test**

Append to `prisma/plc.check.ts`, before the final `await cleanup();`:

```ts
  /* ============================================= Project edit (spec §6.3) */

  await updateProject({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    projectId,
    name: `${TAG} PLC Lifecycle Renamed`,
    type: "COMMERCIAL",
    city: "Udaipur",
    reason: "The developer renamed the launch.",
  });

  const edited = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  assert.equal(edited.name, `${TAG} PLC Lifecycle Renamed`);
  assert.equal(edited.type, "COMMERCIAL", "type is a label over the inventory, so it may change");
  assert.equal(edited.city, "Udaipur");
  assert.equal(
    edited.projectCode,
    generated.projectCode,
    "the Project Code never changes — it is what an export points back to"
  );
  assert.equal(
    edited.isExternalResaleGroup,
    generated.isExternalResaleGroup,
    "and the External Resale Group flag is not editable (PRD §11.6)"
  );

  await expectBlocked(/compulsory reason/, () =>
    updateProject({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      projectId,
      name: `${TAG} No Reason`,
      type: "COMMERCIAL",
      reason: "  ",
    })
  );

  const editAudit = await db.auditEvent.findFirstOrThrow({
    where: { entity: "Project", entityId: projectId, action: "PROJECT_UPDATED" },
  });
  assert.equal(editAudit.reason, "The developer renamed the launch.");
  assert.ok(editAudit.beforeMasked && editAudit.afterMasked, "before and after are both recorded");
```

Add `updateProject` to the import from `@/lib/services/project-service`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run plc:check`
Expected: FAIL — `updateProject` is not exported.

- [ ] **Step 3: Write the command**

In `src/lib/services/project-service.ts`, after `createProject`:

```ts
/**
 * Spec §6.3 — a Project could not be changed at all until now, so a name typed
 * wrongly at setup stayed wrong for its life.
 *
 * Two fields are missing on purpose. The Project Code is generated and is what
 * ties an issued export back to what it described. The External Resale Property
 * Group flag is what PRD §11.6 uses to tell a development Project from an
 * acquisition container, so flipping it would change the meaning of records
 * already attached. Lifecycle keeps its own command: moving a Project to Active
 * is a release decision, not an edit.
 */
export async function updateProject(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  projectId: string;
  name: string;
  type: "RESIDENTIAL" | "COMMERCIAL";
  developer?: string | null;
  location?: string | null;
  city?: string | null;
  amenities?: string | null;
  reraNumber?: string | null;
  reason: string;
}) {
  if (!args.name.trim()) blocked("A Project Name is required.");
  if (!args.reason.trim()) blocked("A compulsory reason is required to change a Project.");

  return runCommand<{ projectId: string }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PROJECT_UPDATE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { projectId: args.projectId, name: args.name, type: args.type },
    },
    async (tx) => {
      const before = await tx.project.findUniqueOrThrow({ where: { id: args.projectId } });

      const after = await tx.project.update({
        where: { id: args.projectId },
        data: {
          name: args.name.trim(),
          type: args.type,
          developer: args.developer?.trim() || null,
          location: args.location?.trim() || null,
          city: args.city?.trim() || null,
          amenities: args.amenities?.trim() || null,
          reraNumber: args.reraNumber?.trim() || null,
        },
      });

      return {
        result: { projectId: after.id },
        audit: {
          entity: "Project",
          entityId: after.id,
          action: "PROJECT_UPDATED",
          before: {
            name: before.name,
            type: before.type,
            developer: before.developer,
            location: before.location,
            city: before.city,
            amenities: before.amenities,
            reraNumber: before.reraNumber,
          },
          after: {
            name: after.name,
            type: after.type,
            developer: after.developer,
            location: after.location,
            city: after.city,
            amenities: after.amenities,
            reraNumber: after.reraNumber,
          },
          reason: args.reason,
        },
      };
    }
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run plc:check`
Expected: PASS, ending `plc.check.ts OK`.

- [ ] **Step 5: Add the server action and the dialog**

In `src/app/projects/actions.ts`:

```ts
/** Spec §6.3 — the edit path a Project has never had. */
export async function updateProjectAction(
  projectId: string,
  input: {
    name: string;
    type: "RESIDENTIAL" | "COMMERCIAL";
    developer: string;
    location: string;
    city: string;
    amenities: string;
    reraNumber: string;
  },
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PROJECT_SETUP");
  try {
    await updateProject({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      projectId,
      name: input.name,
      type: input.type,
      developer: input.developer || null,
      location: input.location || null,
      city: input.city || null,
      amenities: input.amenities || null,
      reraNumber: input.reraNumber || null,
      reason,
    });
    refresh();
    return { ok: true, message: "Project updated." };
  } catch (error) {
    return toResult(error);
  }
}
```

In `projects-client.tsx`, add an `editing` state beside `creating`, an
`Edit Project` item in the card's `⋯` menu (Task 6 builds that menu — until then
add a plain button beside `PLC versions`), and an `EditProjectDialog` that
reuses the same fields as `ProjectDialog` with `defaultValue` from the row, plus
a compulsory reason field. Project Code and External Resale Property Group are
not on the form at all.

- [ ] **Step 6: Verify**

```bash
npm run check
npm run plc:check
```

Expected: all `OK`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/project-service.ts src/app/projects prisma/plc.check.ts
git commit -m "feat: a Project can be edited

project-service offered createProject and setProjectLifecycle and nothing else,
so a name typed wrongly at setup stayed wrong for the life of the Project.

Name, type, developer, location, city, amenities and RERA number are editable.
Type is safe because a Plot carries its own Plot Type — uniqueness is
(projectId, plotType, plotNumber) — so the Project's type is a label over the
inventory, not a rule inside it.

The Project Code and the External Resale Property Group flag are not on the
form. Every edit carries a compulsory reason and runs through runCommand, so
the audit trail answers who renamed a Project and why."
```

---

## Task 6: Project card

**Files:**
- Modify: `src/app/projects/projects-client.tsx`

**Interfaces:**
- Consumes: `ProjectRowView` with `city` and `amenities` from Task 4; `formatPercent` from Task 1.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Rebuild the card body**

Replace the card's inner markup (the `<dl>` of `Row` items and the PLC block,
`projects-client.tsx:120-175`) with the layout from spec §6.1. Name first, place
together, then one strip of numbers:

```tsx
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold leading-tight">{project.name}</h2>
                <Badge>{LIFECYCLE_LABEL[project.lifecycle] ?? project.lifecycle}</Badge>
              </div>

              <p className="text-xs text-muted-foreground">
                {project.type === "RESIDENTIAL" ? "Residential" : project.type === "COMMERCIAL" ? "Commercial" : "Mixed"}
                {project.city ? ` · ${project.city}` : ""}
              </p>
              {(project.location || project.developer) && (
                <p className="text-xs text-muted-foreground">
                  {[project.location, project.developer].filter(Boolean).join(" — ")}
                </p>
              )}

              {project.isExternalResaleGroup ? (
                <p className="text-xs text-muted-foreground">External Resale Property Group</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 border-y border-border/50 py-2 text-xs">
                    {project.reraNumber && <span>RERA {project.reraNumber}</span>}
                    <span className="tabular-nums">{project.plotCount} Plots</span>
                    <span>{project.plcVersion ? `PLC v${project.plcVersion}` : "No PLC version"}</span>
                  </div>

                  {project.components.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {project.components
                        .map((c) => `${c.label} ${formatPercent(c.percent)}%`)
                        .join("   ")}
                    </p>
                  )}

                  {project.amenities && (
                    <div className="text-xs">
                      <p className="font-medium text-muted-foreground">Amenities</p>
                      <p className="mt-0.5 text-muted-foreground">
                        {project.amenities
                          .split("\n")
                          .map((a) => a.trim())
                          .filter(Boolean)
                          .map((a) => `• ${a}`)
                          .join("   ")}
                      </p>
                    </div>
                  )}
                </>
              )}
```

An External Resale Property Group is a container under PRD §11.6, not a
development Project, so plots, PLC and amenities are not shown for it.

- [ ] **Step 2: Change the lifecycle label**

In the same file, change the `LIFECYCLE_LABEL` map:

```ts
const LIFECYCLE_LABEL: Record<string, string> = {
  // Screen wording only. The enum value stays SETUP_NOT_ACTIVE — see
  // DEVIATIONS.md D-03.
  SETUP_NOT_ACTIVE: "Unreleased",
  ACTIVE: "Active",
  SOLD_OUT: "Sold Out",
  COMPLETED: "Completed",
};
```

Change it in `src/app/plots/plots-client.tsx` too, wherever a Project lifecycle
is displayed.

- [ ] **Step 3: Verify by eye**

```bash
npm run check
npm run dev
```

Open `http://localhost:3000/projects`. Expected: the name reads first, place
sits on two lines under it, RERA / plot count / PLC version share one strip, and
amenities render as bullets. No Project Code anywhere.

- [ ] **Step 4: Commit**

```bash
git add src/app/projects/projects-client.tsx src/app/plots/plots-client.tsx
git commit -m "feat: Project card is laid out to be read

Name first. Place together — type · city, then location — company — instead of
scattered across three rows. RERA, plot count and PLC version share one strip
because all three answer the same kind of question about a Project.

An External Resale Property Group shows none of it: PRD §11.6 makes it a
container, not a development Project.

Setup / Not Active now reads Unreleased on screen. The enum is untouched."
```

---

## Task 7: Prepare Inventory grid

**Files:**
- Modify: `src/app/plots/plots-client.tsx`
- Modify: `src/app/plots/page.tsx` (pass component labels and percentages)

**Interfaces:**
- Consumes: `PlotPlcApplicability` write path from Task 2; `formatPercent` from Task 1.
- Produces: `GridRow.plcCodes` changes type from `string` to `string[]`.

- [ ] **Step 1: Change the row shape**

In `plots-client.tsx`, change `GridRow` and `EMPTY_ROW`:

```ts
type GridRow = {
  plotNumber: string;
  plotType: string;
  widthFt: string;
  lengthFt: string;
  exactAreaSqFt: string;
  exactAreaReason: string;
  plcCodes: string[];
  parkFacing: boolean;
};

const EMPTY_ROW: GridRow = {
  plotNumber: "",
  plotType: "RESIDENTIAL",
  widthFt: "",
  lengthFt: "",
  exactAreaSqFt: "",
  exactAreaReason: "",
  plcCodes: [],
  parkFacing: false,
};
```

`ProjectView` needs the components, not just their codes. In `page.tsx` replace
the `plcCodes` / `rawPlcCodes` fields with:

```ts
        plcComponents:
          p.plcRuleVersions[0]?.components.map((c) => ({
            code: c.code,
            label: c.label,
            percent: c.percent.toString(),
          })) ?? [],
```

and mirror that on `ProjectView` in `plots-client.tsx`.

- [ ] **Step 2: Replace the free-text PLC cell with checkboxes**

Replace the PLC `<td>` in the grid body:

```tsx
                <td className="p-1 align-top">
                  {(project?.plcComponents ?? []).length === 0 ? (
                    <span className="text-[11px] text-muted-foreground">
                      No published PLC version
                    </span>
                  ) : (
                    <div className="space-y-0.5">
                      {project!.plcComponents.map((c) => (
                        <label key={c.code} className="flex items-center gap-1.5 text-[11px]">
                          <input
                            type="checkbox"
                            checked={row.plcCodes.includes(c.code)}
                            onChange={(e) =>
                              update(i, {
                                plcCodes: e.target.checked
                                  ? [...row.plcCodes, c.code]
                                  : row.plcCodes.filter((x) => x !== c.code),
                              })
                            }
                          />
                          {c.label} {formatPercent(c.percent)}%
                        </label>
                      ))}
                      <p className="pt-0.5 text-[11px] font-medium tabular-nums">
                        Total{" "}
                        {formatPercent(
                          project!.plcComponents
                            .filter((c) => row.plcCodes.includes(c.code))
                            .reduce((sum, c) => sum + Number(c.percent), 0)
                        )}
                        %
                      </p>
                    </div>
                  )}
                </td>
```

Change the column heading from `PLC codes` to `Location charge components`, and
the `Park` heading to `Park facing (Plot characteristic)` — they look like the
same thing today and are not.

- [ ] **Step 3: Per-row delete, and adding rows in bulk**

Add a delete cell as the last column of each row:

```tsx
                <td className="p-1 align-top">
                  <button
                    type="button"
                    aria-label={`Remove row ${i + 1}`}
                    className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setRows((r) => (r.length > 1 ? r.filter((_, x) => x !== i) : r))}
                  >
                    ✕
                  </button>
                </td>
```

Replace the `+ Row` / `− Row` pair in the footer with a count and one button:

```tsx
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={100}
            value={addCount}
            onChange={(e) => setAddCount(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
            className={`${inputClass} h-8 w-20`}
            aria-label="Rows to add"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setRows((r) => [...r, ...Array.from({ length: addCount }, () => ({ ...EMPTY_ROW }))])
            }
          >
            Add rows
          </Button>
        </div>
```

with `const [addCount, setAddCount] = React.useState(10);` beside the other state.

- [ ] **Step 4: Stop dropping rows silently**

Replace the submit handler's `rows.filter((r) => r.plotNumber.trim())` with an
explicit refusal. Add above the return:

```tsx
  const filled = rows.filter((r) => Object.values(r).some((v) => (Array.isArray(v) ? v.length : v)));
  const missingNumber = filled.filter((r) => !r.plotNumber.trim()).length;
```

Disable the submit button while `missingNumber > 0`, and show the reason:

```tsx
        {missingNumber > 0 && (
          <p className="text-xs text-amber-300">
            {missingNumber} row{missingNumber === 1 ? "" : "s"} have details but no Plot No. Fill it
            in or remove the row — nothing is saved silently.
          </p>
        )}
```

and submit `filled` rather than the filtered list. Mark those rows: add
`className={!row.plotNumber.trim() && rowHasData(row) ? "bg-amber-500/10" : ""}` to
the `<tr>`, with a small `rowHasData` helper beside `EMPTY_ROW`.

- [ ] **Step 5: Confirm before discarding**

Change the footer `Back` button:

```tsx
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (filled.length > 0 && !confirm("Discard this grid? Nothing has been saved.")) return;
              onClose();
            }}
          >
            Back
          </Button>
```

- [ ] **Step 6: Verify by eye**

```bash
npm run check
npm run dev
```

Open `http://localhost:3000/plots` → **Prepare Inventory**. Expected: type `25`
and press Add rows, get twenty-five; each row deletes on its own; PLC is
checkboxes with a live total; a row with a width but no Plot No. turns amber and
blocks submit; `Back` asks first.

- [ ] **Step 7: Commit**

```bash
git add src/app/plots
git commit -m "feat: Prepare Inventory takes a hundred Plots without a hundred clicks

+ Row added exactly one, so a Project of 100 Plots meant pressing it 99 times.
A count and one button replace it.

PLC becomes checkboxes with a live total, so an unknown code cannot be typed and
the server no longer has to refuse one. Each row deletes itself instead of the
last row deleting whichever you were editing.

A row with details but no Plot No. used to vanish on submit without a word. It
now turns amber and holds the submit until it is filled in or removed. Back asks
before discarding a filled grid.

Park facing and the location charge components are relabelled: one is a fact
about the Plot, the other is a charge, and they read identically today."
```

---

## Task 8: Plot Inventory row menu

**Files:**
- Modify: `src/app/plots/plots-client.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a local `RowMenu` component; no exported interface.

- [ ] **Step 1: Add the menu component**

Native `<details>` is the whole dropdown — no state, no click-outside handler, no
dependency. Add near the bottom of `plots-client.tsx`:

```tsx
/** The row's actions. `<details>` gives keyboard support and click-away free. */
function RowMenu({ children }: { children: React.ReactNode }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer select-none rounded-lg border border-border/60 px-2.5 py-1 text-xs marker:content-['']">
        ⋯
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-52 space-y-0.5 rounded-xl border border-border/60 bg-card p-1 shadow-lg">
        {children}
      </div>
    </details>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-secondary"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block rounded-lg px-2.5 py-1.5 text-xs hover:bg-secondary">
      {children}
    </Link>
  );
}
```

Import `Link` from `next/link`.

- [ ] **Step 2: Replace the button pile**

Replace the whole `<div className="flex flex-wrap gap-1.5">` block in the
`Next action` cell (`plots-client.tsx:425-482`) with:

```tsx
                      <RowMenu>
                        {plot.lifecycle === "NOT_AVAILABLE" && permissions.makeAvailable && (
                          <MenuItem onClick={() => setDialog({ kind: "AVAILABLE", plot })}>
                            Make Available
                          </MenuItem>
                        )}
                        {plot.lifecycle === "AVAILABLE" && permissions.hold && (
                          <MenuItem onClick={() => setDialog({ kind: "HOLD", plot })}>Hold</MenuItem>
                        )}
                        {plot.lifecycle === "HOLD" && plot.hold && (
                          <MenuLink href={`/bookings?plot=${plot.id}`}>Book →</MenuLink>
                        )}
                        {plot.lifecycle === "AVAILABLE" && (
                          <MenuLink href={`/bookings?plot=${plot.id}`}>Start Booking →</MenuLink>
                        )}
                        {plot.lifecycle === "HOLD" &&
                          plot.hold &&
                          permissions.extend &&
                          !plot.hold.pendingExtension && (
                            <MenuItem onClick={() => setDialog({ kind: "EXTEND", plot })}>
                              Extend Hold
                            </MenuItem>
                          )}
                        {plot.lifecycle === "HOLD" && plot.hold && permissions.hold && (
                          <MenuItem onClick={() => setDialog({ kind: "CANCEL_HOLD", plot })}>
                            Cancel Hold
                          </MenuItem>
                        )}
                        {["WAITING_FOR_BOOKING_APPROVAL", "BOOKED", "PAYMENT_COMPLETED", "DELIVERED"].includes(
                          plot.lifecycle
                        ) && <MenuLink href={`/bookings?plot=${plot.id}`}>Open Booking →</MenuLink>}
                        {["AVAILABLE", "NOT_AVAILABLE"].includes(plot.lifecycle) &&
                          permissions.restriction && (
                            <MenuItem onClick={() => setDialog({ kind: "RESTRICT", plot })}>
                              Restriction…
                            </MenuItem>
                          )}
                      </RowMenu>
```

Three things are deliberately gone. `Start Booking` was a permanently disabled
button whose tooltip said Phase 3 had not arrived — it is a link now. The
extension approve/reject pair is gone entirely: it is a maker-checker decision
under PRD §8.5 and belongs to the Dashboard task queue, not a row that shows
neither who asked nor why. And there is no combined Make Available and Hold —
DESIGN §7.4 forbids it in those words.

- [ ] **Step 3: Verify by eye**

```bash
npm run check
npm run dev
```

Open `http://localhost:3000/plots`. Expected: one `⋯` per row; the menu opens on
click and closes on click-away and on Escape; `Start Booking` navigates instead
of sitting greyed out; no approve/reject extension buttons anywhere.

- [ ] **Step 4: Commit**

```bash
git add src/app/plots/plots-client.tsx
git commit -m "feat: Plot row actions collapse into one menu

A row could carry five buttons at once, all the same size, with nothing to say
which mattered. The column is headed Next action and showed every action.

Start Booking was permanently disabled with a tooltip saying Booking Requests
arrive in Phase 3, long after Phase 3 shipped. It is a link into /bookings now.

The extension approve and reject pair is gone. It is a maker-checker decision
under PRD §8.5, and deciding it from a row that shows neither who asked nor why
is the thing maker-checker exists to prevent — it belongs to the task queue.

Native <details> is the whole dropdown: keyboard support and click-away for
free, and no dependency."
```

---

## Task 9: Plot detail panel

**Files:**
- Modify: `src/app/plots/actions.ts` (add `loadPlotDetail`)
- Modify: `src/app/plots/plots-client.tsx`

**Interfaces:**
- Consumes: `applicableCodes`, `setPlotPlcApplicability` from Task 2; `buildPlcSnapshot` from Task 3; `formatPercent` from Task 1.
- Produces: `loadPlotDetail(plotId: string)` and `setPlcApplicabilityAction(plotId, entries, key)`.

- [ ] **Step 1: Add the loader**

In `src/app/plots/actions.ts`:

```ts
/**
 * DESIGN §7.2 — the Plot detail. An inline panel loaded on demand, the same
 * shape Bookings uses, because this application has no dynamic routes.
 */
export async function loadPlotDetail(plotId: string) {
  await requireStaff();
  const plot = await db.plot.findUnique({
    where: { id: plotId },
    include: {
      project: {
        include: {
          plcRuleVersions: { where: { status: "PUBLISHED" }, include: { components: true }, take: 1 },
        },
      },
      boundaries: true,
      plcApplicability: { orderBy: { categoryCode: "asc" } },
      holds: { where: { status: { in: ["ACTIVE", "FROZEN"] } }, include: { person: true }, take: 1 },
      events: { orderBy: { at: "desc" }, take: 20 },
    },
  });
  if (!plot) return null;

  const version = plot.project.plcRuleVersions[0] ?? null;
  const applicable = plot.plcApplicability.filter((a) => a.isApplicable).map((a) => a.categoryCode);

  return {
    id: plot.id,
    boundaries: plot.boundaries.map((b) => ({
      side: b.side,
      kind: b.kind,
      roadWidthFt: b.roadWidthFt?.toString() ?? null,
      adjacentPlotNumber: b.adjacentPlotNumber,
    })),
    parkFacing: plot.parkFacing,
    areaSqFt: plot.areaSqFt.toFixed(3),
    areaSqYd: plot.areaSqYd.toFixed(3),
    areaSqM: plot.areaSqM.toFixed(3),
    exactAreaReason: plot.exactAreaReason,
    plcVersion: version?.version ?? null,
    plcComponents:
      version?.components.map((c) => ({
        code: c.code,
        label: c.label,
        percent: c.percent.toString(),
        applies: applicable.includes(c.code),
        reason: plot.plcApplicability.find((a) => a.categoryCode === c.code)?.reason ?? "",
      })) ?? [],
    plcTotal: version
      ? buildPlcSnapshot(
          applicable,
          version.components.map((c) => ({ code: c.code, label: c.label, percent: c.percent.toString() }))
        ).totalPercent.toFixed(4)
      : null,
    hold: plot.holds[0]
      ? { buyer: plot.holds[0].person.fullName, expiresAt: plot.holds[0].expiresAt.toISOString() }
      : null,
    events: plot.events.map((e) => ({
      at: e.at.toISOString(),
      actorRef: e.actorRef,
      action: e.action,
      reason: e.reason,
    })),
  };
}

export type PlotDetail = NonNullable<Awaited<ReturnType<typeof loadPlotDetail>>>;

/** plc.md §4.2 — set which components apply to this Plot, with a reason each. */
export async function setPlcApplicabilityAction(
  plotId: string,
  entries: Array<{ code: string; isApplicable: boolean; reason?: string }>,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PLOT_SETUP");
  try {
    await setPlotPlcApplicability({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      plotId,
      entries,
    });
    revalidatePath("/plots");
    return { ok: true, message: "Location charge applicability updated." };
  } catch (error) {
    return toResult(error);
  }
}
```

Import `db`, `buildPlcSnapshot` and `setPlotPlcApplicability` at the top.

- [ ] **Step 2: Open the panel from the row**

In `plots-client.tsx`, add the state and loader, mirroring
`bookings-client.tsx:246`:

```tsx
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<PlotDetail | null>(null);

  async function openPlot(id: string) {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(await loadPlotDetail(id));
  }
```

Make the Plot Type / Number cell a button calling `openPlot(plot.id)` with
`aria-expanded={openId === plot.id}`, and render the panel as a full-width row
beneath when `openId === plot.id`.

- [ ] **Step 3: Render the sections**

The panel carries DESIGN §7.2's eight sections. The PLC one is where
applicability is edited:

```tsx
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Plot Location Charge
            </h3>
            {detail.plcComponents.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                The Project has no published PLC version.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-base font-semibold tabular-nums">
                  {formatPercent(detail.plcTotal ?? "0")}%
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    from PLC version {detail.plcVersion}
                  </span>
                </p>
                {detail.plcComponents.map((c) => (
                  <div key={c.code} className="flex flex-wrap items-center gap-2 text-xs">
                    <label className="flex min-w-48 items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={draft[c.code]?.applies ?? c.applies}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            [c.code]: { applies: e.target.checked, reason: d[c.code]?.reason ?? c.reason },
                          }))
                        }
                      />
                      {c.label}
                      <span className="tabular-nums text-muted-foreground">
                        {formatPercent(c.percent)}%
                      </span>
                    </label>
                    <input
                      className={`${inputClass} h-8 flex-1`}
                      placeholder="Why this applies to this Plot — optional"
                      value={draft[c.code]?.reason ?? c.reason}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [c.code]: { applies: d[c.code]?.applies ?? c.applies, reason: e.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
                {permissions.setup && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        setPlcApplicabilityAction(
                          detail.id,
                          detail.plcComponents.map((c) => ({
                            code: c.code,
                            isApplicable: draft[c.code]?.applies ?? c.applies,
                            reason: draft[c.code]?.reason ?? c.reason,
                          })),
                          newKey()
                        )
                      )
                    }
                  >
                    Save applicability
                  </Button>
                )}
              </div>
            )}
          </section>
```

with `const [draft, setDraft] = React.useState<Record<string, { applies: boolean; reason: string }>>({});`,
reset to `{}` each time a panel opens.

The other seven sections — Overview, Dimensions and boundaries, Current
allocation, Customer/Booking link, Payment progress, Commission summary,
Restriction and lifecycle history — read from the same `detail` object and need
no new queries beyond what Step 1 loads.

- [ ] **Step 4: Verify by eye**

```bash
npm run check
npm run dev
```

Open `http://localhost:3000/plots` and click a Plot Number. Expected: the panel
opens beneath the row, PLC shows the effective total and each component with its
reason field, and saving updates the total in the list behind it.

- [ ] **Step 5: Commit**

```bash
git add src/app/plots
git commit -m "feat: Plot detail panel, and applicability is edited there

DESIGN §7.2 describes a Plot detail with eight sections. It has never existed,
so Edit Plot Details had nowhere to go and the PLC applicability had to be
squeezed into a grid cell.

It is an inline panel rather than a route, matching Bookings, because this
application has no dynamic routes and adding the first one for this would be a
change of shape rather than a feature.

The PLC section is where a component's per-code reason is written — the one
thing the applicability table holds that the audit trail cannot."
```

---

## Task 10: Terminology and the deviations record

**Files:**
- Modify: `src/app/plots/plots-client.tsx`, `src/app/bookings/bookings-client.tsx`, `src/app/projects/projects-client.tsx`
- Modify: `system/DEVIATIONS.md`

**Interfaces:** none.

- [ ] **Step 1: Change the visible term**

Replace every visible `Location Charge (PLC %)` and `Location charge (PLC)` with
**`Plot Location Charge (PLC %)`**:

- `plots-client.tsx` — the table heading, and the page subtitle that reads
  "Location Charge is a percentage only"
- `bookings-client.tsx` — the `Location charge (PLC)` panel heading
- `projects-client.tsx` — the PLC dialog copy

- [ ] **Step 2: Record both deviations**

Append to `system/DEVIATIONS.md`, after D-02:

```markdown
---

## D-03 · Two visible terms differ from the approved wording

**Date:** 22 August 2026
**Approved by:** Product Owner (during the build session)
**Governed area touched:** none — display only

### What changed

| Screens now read | Approved documents say |
| --- | --- |
| **Plot Location Charge (PLC %)** | `main-PRD.md` §8.5 — "Use the visible term **Location Charge (PLC %)**"; `DESIGN.md` §7.1 lists the column as `Location Charge (PLC %)` |
| **Unreleased** | `PRD.md` §16.1 and `main-PRD.md` §16.1 list the Project status as **Setup / Not Active** |

### Why it is recorded

`main-PRD.md` §8.5 does not merely use a term, it instructs which term to show.
Changing it is small, but it is a departure from an explicit instruction, and a
reviewer comparing the screens to the documents should find an answer here.

### How it behaves

Both are labels only. `ProjectLifecycle.SETUP_NOT_ACTIVE` is unchanged in the
database, in the API and in every rule; only the string rendered beside it
differs. No migration, no permission change, no status transition affected.

**One thing to watch.** The Plot restriction `NOT_YET_RELEASED` displays as
"Not Yet Released". A Project reading "Unreleased" beside a Plot reading "Not
Yet Released" invites the assumption that they are the same state. They are not:
one is a Project lifecycle, the other a Plot restriction, and a Plot may be
Not Yet Released inside an Active Project.

### Where it lives

`LIFECYCLE_LABEL` in `src/app/projects/projects-client.tsx` and
`src/app/plots/plots-client.tsx`; the PLC headings in `plots-client.tsx`,
`bookings-client.tsx` and `projects-client.tsx`.
```

- [ ] **Step 3: Verify**

```bash
npm run check
npm run dev
```

Expected: checks pass; `/plots`, `/projects` and a Booking detail all read
"Plot Location Charge".

- [ ] **Step 4: Commit**

```bash
git add src/app system/DEVIATIONS.md
git commit -m "docs: record the two visible terms that differ from the baseline

main-PRD §8.5 does not merely use the term Location Charge (PLC %), it instructs
which term to show. Plot Location Charge departs from that, and Unreleased
departs from PRD §16.1's Setup / Not Active.

Both are labels: the enum, the API and every rule are untouched. Recorded so a
reviewer comparing the screens to the documents finds an answer rather than a
surprise — and with the warning that a Project reading Unreleased sits beside a
Plot restriction reading Not Yet Released, which is a different thing."
```

---

## Final verification

- [ ] Run the whole suite

```bash
npm run check
npm run db:check
npm run build
```

Expected: `tasks.check.ts OK`, `security.check.ts OK`, `domain.check.ts OK`, no
TypeScript errors, every database check `OK`, and a successful build.

`db:check` runs against a remote database and occasionally fails with
`PrismaClientKnownRequestError` caused by `ConnectionReset`. That is the
network, not the code — re-run once before investigating.

- [ ] Confirm nothing was pushed

```bash
git status
git log --oneline -12
```

Expected: clean tree, branch `plc-lifecycle-and-portal-privacy`, `main`
untouched, no remote.
