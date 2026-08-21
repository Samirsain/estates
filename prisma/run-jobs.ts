// Run the scheduled jobs from the command line — PRD §18.
//
//   npm run jobs:run                    the whole catalogue
//   npm run jobs:run -- HOLD_EXPIRY     one named job
//
// For a host without a built-in scheduler, point the system cron or Windows Task
// Scheduler at this. Every job is idempotent, so a duplicate or catch-up run
// after downtime is safe.
import { db } from "@/lib/db";
import { JOBS, isJobName, runAllJobs, runJob } from "@/lib/jobs";

const requested = process.argv[2] ?? null;

if (requested !== null && !isJobName(requested)) {
  console.error(`Unknown job "${requested}". Known jobs:\n  ${Object.keys(JOBS).join("\n  ")}`);
  await db.$disconnect();
  process.exit(1);
}

const results = requested === null ? await runAllJobs() : [await runJob(requested)];

for (const result of results) {
  console.log(
    `${result.jobType.padEnd(28)} processed ${String(result.processed).padStart(5)}  changed ${String(
      result.changed
    ).padStart(5)}`
  );
}

await db.$disconnect();

// A failed job records its own ScheduledJobRun row; the run reports it here too.
if (results.some((result) => result.jobType.endsWith(":FAILED"))) process.exit(1);
