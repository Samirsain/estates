// One Project, six Plots, every field and every PLC option used.
//
//   node --env-file=.env --import ./prisma/alias-loader.mjs prisma/govind-vatika-seed.ts
//
// Govind Vatika (GV) fills every Project field and configures every PLC
// category with all its bands. Between them the Plots reach each band:
//
//   G-21  Road 60 + Three side open + Park and Playground facing   9%
//   G-22  20 ft lane only — below every band                       0%
//   G-23  Road 40 + Two side open (North and South)                4%
//   G-24  Road 30 + Corner Plot + Park facing                      6%
//   G-25  Road 60 + Four side open + Playground facing, irregular 10%
//   C-1   Commercial corner shop: Road 60 + Corner Plot             6%
//
// GUARDED and re-runnable: the Project is created once, and only Plots it does
// not have yet are added.
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";
import { ensureActiveCommissionVersion } from "./seed-commission.ts";

assertCheckDatabase();

import { createProject, setProjectStatus } from "@/lib/services/project-service";
import { prepareInventory, type PlotRow } from "@/lib/services/inventory-service";

const db = new PrismaClient();
const MD = "STF-0001";
const actor = { actorRef: MD, actorRole: "MD" };
let seq = 0;
const key = () => `GV-${Date.now()}-${seq++}`;

const PLOTS: PlotRow[] = [
  {
    plotNumber: "G-21",
    plotType: "RESIDENTIAL",
    widthFt: "40",
    lengthFt: "60",
    boundaries: [
      { side: "NORTH", kind: "ROAD", roadWidthFt: "60" },
      { side: "EAST", kind: "PARK", reference: "Central Park P-1" },
      { side: "SOUTH", kind: "PLAYGROUND", reference: "Children's Playground PG-1" },
      { side: "WEST", kind: "PLOT", reference: "G-20" },
    ],
  },
  {
    plotNumber: "G-22",
    plotType: "RESIDENTIAL",
    widthFt: "30",
    lengthFt: "50",
    boundaries: [
      { side: "NORTH", kind: "ROAD", roadWidthFt: "20" },
      { side: "EAST", kind: "PLOT", reference: "G-23" },
      { side: "SOUTH", kind: "PLOT", reference: "G-32" },
      { side: "WEST", kind: "PLOT", reference: "G-26" },
    ],
  },
  {
    plotNumber: "G-23",
    plotType: "RESIDENTIAL",
    widthFt: "30",
    lengthFt: "60",
    boundaries: [
      { side: "NORTH", kind: "ROAD", roadWidthFt: "40" },
      { side: "EAST", kind: "PLOT", reference: "G-24" },
      { side: "SOUTH", kind: "ROAD", roadWidthFt: "30" },
      { side: "WEST", kind: "PLOT", reference: "G-22" },
    ],
  },
  {
    plotNumber: "G-24",
    plotType: "RESIDENTIAL",
    widthFt: "35",
    lengthFt: "55",
    boundaries: [
      { side: "NORTH", kind: "ROAD", roadWidthFt: "30" },
      { side: "EAST", kind: "PARK", reference: "Neighbourhood Park P-2" },
      { side: "SOUTH", kind: "PLOT", reference: "G-34" },
      { side: "WEST", kind: "PLOT", reference: "G-23" },
    ],
  },
  {
    // An island Plot cut by the road curve, so its area is measured, not W × L.
    plotNumber: "G-25",
    plotType: "RESIDENTIAL",
    exactAreaSqFt: "3150",
    exactAreaReason: "Irregular island plot on the road curve; area as per JDA layout plan",
    boundaries: [
      { side: "NORTH", kind: "ROAD", roadWidthFt: "60" },
      { side: "EAST", kind: "ROAD", roadWidthFt: "40" },
      { side: "SOUTH", kind: "PLAYGROUND", reference: "Sports Playground PG-2" },
      { side: "WEST", kind: "ROAD", roadWidthFt: "30" },
    ],
  },
  {
    // Corner shop on the main road. Commercial and Informal Sector close a side
    // exactly as a Plot does.
    plotNumber: "C-1",
    plotType: "COMMERCIAL",
    widthFt: "25",
    lengthFt: "60",
    boundaries: [
      { side: "NORTH", kind: "ROAD", roadWidthFt: "60" },
      { side: "EAST", kind: "ROAD", roadWidthFt: "40" },
      { side: "SOUTH", kind: "COMMERCIAL", reference: "C-2" },
      { side: "WEST", kind: "INFORMAL_SECTOR", reference: "Kiosk K-1" },
    ],
  },
];

async function main() {
  let project = await db.project.findUnique({ where: { projectCode: "GV" } });

  if (!project) {
    const { projectId } = await createProject({
      ...actor,
      idempotencyKey: key(),
      projectCode: "GV",
      name: "Govind Vatika",
      type: "RESIDENTIAL",
      developer: "Shree Govind Infra Developers Pvt. Ltd.",
      location: "Vatika Road, near Sanganer Sadar, Jaipur, Rajasthan 302029",
      locationUrl: "https://maps.google.com/?q=Vatika+Road,+Sanganer,+Jaipur",
      driveUrl: "https://drive.google.com/drive/folders/govind-vatika-layout",
      renderUrl: "https://www.youtube.com/watch?v=govind-vatika-3d",
      city: "Jaipur",
      amenities: [
        "JDA approved layout",
        "60 ft and 40 ft wide roads",
        "Gated entry with 24x7 security",
        "Central park and children's playground",
        "Underground electricity and water lines",
        "Temple and community hall",
      ].join("\n"),
      reraNumber: "RAJ/P/2026/3418",
      components: [
        { category: "ROAD_WIDTH", threshold: "30", percent: "1" },
        { category: "ROAD_WIDTH", threshold: "40", percent: "2" },
        { category: "ROAD_WIDTH", threshold: "60", percent: "3" },
        { category: "OPEN_SIDES", threshold: "2", percent: "2" },
        { category: "OPEN_SIDES", threshold: "2.5", percent: "3" },
        { category: "OPEN_SIDES", threshold: "3", percent: "4" },
        { category: "OPEN_SIDES", threshold: "4", percent: "5" },
        // One green-area charge: both rows carry the same percentage.
        { category: "PARK_FACING", percent: "2" },
        { category: "PLAYGROUND_FACING", percent: "2" },
      ],
    });
    // v2.1 §14 — no Booking Request is accepted without approved settings.
    await ensureActiveCommissionVersion(db, projectId, MD);
    project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  }

  const have = new Set(
    (await db.plot.findMany({ where: { projectId: project.id }, select: { plotNumber: true } })).map(
      (p) => p.plotNumber
    )
  );
  const rows = PLOTS.filter((p) => !have.has(p.plotNumber));
  if (rows.length > 0) {
    await prepareInventory({ ...actor, idempotencyKey: key(), projectId: project.id, rows });
  }

  // Activation releases the Plots: Not Available → Available. Plots added to an
  // already Active Project arrive Available.
  if (project.status !== "ACTIVE") {
    await setProjectStatus({
      ...actor,
      idempotencyKey: key(),
      projectId: project.id,
      status: "ACTIVE",
      reason: "Layout approved, sales open",
    });
  }

  console.log(`Govind Vatika (GV): added ${rows.map((r) => r.plotNumber).join(", ") || "nothing"}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
