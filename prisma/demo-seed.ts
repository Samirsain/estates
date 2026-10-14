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
