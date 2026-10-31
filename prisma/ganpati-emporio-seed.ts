// Ganpati Estate Emporio — the Project in "GE Emporio.pdf" (Sangaria Road,
// Hanumangarh Jn.), with the 71 units of its layout: Plots 1A–11B and 12–29,
// Shops S-03–S-26 and Kiosks K-1–K-7. Sizes and the road each unit faces are
// read off the drawing; Shops S-24–S-26 are irregular and carry their average
// depth. Made through the same services the screens use.
//
//   node --env-file=.env --import ./prisma/alias-loader.mjs prisma/ganpati-emporio-seed.ts
//
// GUARDED. Run once: it stops if the Project code GEE already exists.
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";
import { ensureActiveCommissionVersion } from "./seed-commission.ts";

assertCheckDatabase();

const db = new PrismaClient();
const { createProject, setProjectStatus } = await import("@/lib/services/project-service");
const { prepareInventory } = await import("@/lib/services/inventory-service");

const MD = "STF-0001";
const actor = { actorRef: MD, actorRole: "MD" };
const RUN = Date.now().toString(36);
let seq = 0;
const key = () => `GEE-${RUN}-${seq++}`;

type Side = "NORTH" | "SOUTH" | "EAST" | "WEST";
const OPPOSITE: Record<Side, Side> = { NORTH: "SOUTH", SOUTH: "NORTH", EAST: "WEST", WEST: "EAST" };
const FLANKS: Record<Side, [Side, Side]> = { NORTH: ["EAST", "WEST"], SOUTH: ["EAST", "WEST"], EAST: ["NORTH", "SOUTH"], WEST: ["NORTH", "SOUTH"] };

/** [unit, type, width ft, depth ft, road width ft, side the road is on, what is behind]. */
const UNITS: [string, "RESIDENTIAL" | "COMMERCIAL", string, string, number, Side, "plot" | "park"][] = [
  ["1A", "RESIDENTIAL", "15", "62.5", 40, "SOUTH", "plot"],
  ["1B", "RESIDENTIAL", "15", "62.5", 40, "SOUTH", "plot"],
  ["2A", "RESIDENTIAL", "15", "62.5", 40, "SOUTH", "plot"],
  ["2B", "RESIDENTIAL", "15", "62.5", 40, "SOUTH", "plot"],
  ["3A", "RESIDENTIAL", "15", "62.5", 40, "SOUTH", "plot"],
  ["3B", "RESIDENTIAL", "15", "62.5", 40, "SOUTH", "plot"],
  ["4A", "RESIDENTIAL", "15", "62.5", 40, "SOUTH", "plot"],
  ["4B", "RESIDENTIAL", "15", "62.5", 40, "SOUTH", "plot"],
  ["5A", "RESIDENTIAL", "16.25", "62.5", 40, "SOUTH", "plot"],
  ["5B", "RESIDENTIAL", "16", "62.5", 40, "SOUTH", "plot"],
  ["6A", "RESIDENTIAL", "15", "62.5", 40, "SOUTH", "plot"],
  ["6B", "RESIDENTIAL", "15", "62.5", 40, "SOUTH", "plot"],
  ["11A", "RESIDENTIAL", "14.5", "69.5", 40, "NORTH", "park"],
  ["11B", "RESIDENTIAL", "14.5", "69.5", 40, "NORTH", "park"],
  ["10A", "RESIDENTIAL", "14.5", "69.5", 40, "NORTH", "park"],
  ["10B", "RESIDENTIAL", "14.5", "69.5", 40, "NORTH", "park"],
  ["9A", "RESIDENTIAL", "14.5", "69.5", 40, "NORTH", "park"],
  ["9B", "RESIDENTIAL", "14.5", "69.5", 40, "NORTH", "park"],
  ["8A", "RESIDENTIAL", "14.5", "69.5", 40, "NORTH", "park"],
  ["8B", "RESIDENTIAL", "14.5", "69.5", 40, "NORTH", "park"],
  ["7A", "RESIDENTIAL", "14.5", "69.5", 40, "NORTH", "park"],
  ["7B", "RESIDENTIAL", "14.5", "69.5", 40, "NORTH", "park"],
  ["12", "RESIDENTIAL", "30", "50", 30, "EAST", "plot"],
  ["13", "RESIDENTIAL", "30", "50", 30, "EAST", "plot"],
  ["14", "RESIDENTIAL", "25", "50", 30, "EAST", "plot"],
  ["15", "RESIDENTIAL", "25", "50", 30, "EAST", "plot"],
  ["16", "RESIDENTIAL", "25", "50", 30, "EAST", "plot"],
  ["17", "RESIDENTIAL", "30", "50", 30, "EAST", "plot"],
  ["18", "RESIDENTIAL", "30", "60", 30, "NORTH", "plot"],
  ["19", "RESIDENTIAL", "30", "60", 30, "NORTH", "plot"],
  ["20", "RESIDENTIAL", "30", "60", 30, "NORTH", "plot"],
  ["21", "RESIDENTIAL", "30", "60", 30, "NORTH", "plot"],
  ["22", "RESIDENTIAL", "30", "60", 30, "NORTH", "plot"],
  ["23", "RESIDENTIAL", "25", "60", 40, "WEST", "plot"],
  ["24", "RESIDENTIAL", "25", "60", 40, "WEST", "plot"],
  ["25", "RESIDENTIAL", "25", "60", 40, "WEST", "plot"],
  ["26", "RESIDENTIAL", "25", "60", 40, "WEST", "plot"],
  ["27", "RESIDENTIAL", "28.5", "60", 40, "WEST", "plot"],
  ["28", "RESIDENTIAL", "25", "60", 40, "WEST", "plot"],
  ["29", "RESIDENTIAL", "25", "60", 40, "WEST", "plot"],
  ["S-03", "COMMERCIAL", "20", "84.54", 50, "SOUTH", "plot"],
  ["S-04", "COMMERCIAL", "15", "57.5", 50, "SOUTH", "plot"],
  ["S-05", "COMMERCIAL", "15", "57.5", 50, "SOUTH", "plot"],
  ["S-06", "COMMERCIAL", "15", "57.5", 50, "SOUTH", "plot"],
  ["S-07", "COMMERCIAL", "15", "57.5", 50, "SOUTH", "plot"],
  ["S-08", "COMMERCIAL", "15", "57.5", 50, "SOUTH", "plot"],
  ["S-09", "COMMERCIAL", "15", "57.5", 50, "SOUTH", "plot"],
  ["S-10", "COMMERCIAL", "15", "57.5", 50, "SOUTH", "plot"],
  ["S-11", "COMMERCIAL", "15", "57.5", 50, "SOUTH", "plot"],
  ["S-12", "COMMERCIAL", "15", "57.5", 50, "SOUTH", "plot"],
  ["S-13", "COMMERCIAL", "15", "32", 50, "NORTH", "plot"],
  ["S-14", "COMMERCIAL", "15", "57.5", 50, "NORTH", "plot"],
  ["S-15", "COMMERCIAL", "15", "57.5", 50, "NORTH", "plot"],
  ["S-16", "COMMERCIAL", "15", "57.5", 50, "NORTH", "plot"],
  ["S-17", "COMMERCIAL", "15", "57.5", 50, "NORTH", "plot"],
  ["S-18", "COMMERCIAL", "15", "57.5", 50, "NORTH", "plot"],
  ["S-19", "COMMERCIAL", "15", "57.5", 50, "NORTH", "plot"],
  ["S-20", "COMMERCIAL", "15", "57.5", 50, "NORTH", "plot"],
  ["S-21", "COMMERCIAL", "15", "57.5", 50, "NORTH", "plot"],
  ["S-22", "COMMERCIAL", "15", "57.5", 50, "NORTH", "plot"],
  ["S-23", "COMMERCIAL", "20", "57.5", 50, "NORTH", "plot"],
  ["S-24", "COMMERCIAL", "20", "95.83", 50, "NORTH", "plot"],
  ["S-25", "COMMERCIAL", "19", "73.08", 50, "NORTH", "plot"],
  ["S-26", "COMMERCIAL", "18.5", "49.88", 50, "NORTH", "plot"],
  ["K-1", "COMMERCIAL", "10", "16", 40, "WEST", "plot"],
  ["K-2", "COMMERCIAL", "10", "16", 40, "WEST", "plot"],
  ["K-3", "COMMERCIAL", "10", "16", 40, "WEST", "plot"],
  ["K-4", "COMMERCIAL", "10", "16", 40, "WEST", "plot"],
  ["K-5", "COMMERCIAL", "10", "16", 40, "SOUTH", "plot"],
  ["K-6", "COMMERCIAL", "10", "16", 40, "SOUTH", "plot"],
  ["K-7", "COMMERCIAL", "10", "16", 40, "SOUTH", "plot"],
];

async function main() {
  if (await db.project.findUnique({ where: { projectCode: "GEE" } })) {
    console.log("Ganpati Estate Emporio (GEE) already exists. Nothing to do.");
    return;
  }
  const { projectId } = await createProject({
    ...actor,
    idempotencyKey: key(),
    projectCode: "GEE",
    name: "Ganpati Estate Emporio",
    type: "RESIDENTIAL",
    location: "Sangaria Road, Hanumangarh Jn., Rajasthan",
    city: "Hanumangarh",
    amenities: [
      "90-A approved layout (Govt. of Rajasthan)",
      "Frontage on the 100 ft Master Plan road",
      "50 ft, 40 ft and 30 ft internal roads",
      "Park and public utility",
      "Path and parking",
      "Utility block",
    ].join("\n"),
    components: [
      { category: "ROAD_WIDTH", threshold: "40", percent: "1" },
      { category: "ROAD_WIDTH", threshold: "50", percent: "2" },
      { category: "PARK_FACING", percent: "2" },
    ],
  });
  await ensureActiveCommissionVersion(db, projectId, MD);
  // Active before the Plots arrive, so each one is released (Available) on arrival.
  await setProjectStatus({ ...actor, idempotencyKey: key(), projectId, status: "ACTIVE", reason: "Launched with its full layout" });
  await prepareInventory({
    ...actor,
    idempotencyKey: key(),
    projectId,
    rows: UNITS.map(([plotNumber, plotType, widthFt, lengthFt, road, side, back]) => ({
      plotNumber,
      plotType,
      widthFt,
      lengthFt,
      boundaries: [
        { side, kind: "ROAD" as const, roadWidthFt: String(road) },
        { side: OPPOSITE[side], kind: back === "park" ? ("PARK" as const) : ("PLOT" as const) },
        { side: FLANKS[side][0], kind: "PLOT" as const },
        { side: FLANKS[side][1], kind: "PLOT" as const },
      ],
    })),
  });
  const plots = await db.plot.groupBy({ by: ["status"], where: { projectId }, _count: { _all: true } });
  console.log("Ganpati Estate Emporio (GEE) created:", plots.map((p) => `${p._count._all} ${p.status}`).join(", "));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
