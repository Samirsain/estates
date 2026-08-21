// The migration reconciliation report — PHASES.md Phase 7; ARCHITECTURE §13.12.
// Run: npm run reconcile            (prints the report)
//      npm run reconcile > report.txt   (the copy that gets signed)
//
// Exits non-zero when any exception is open, so a rehearsal cannot be recorded
// as passed while an exception is outstanding.
import { db } from "@/lib/db";
import { formatReport, reconcile } from "@/lib/migration/reconcile";

const report = await reconcile();
console.log(formatReport(report));
await db.$disconnect();

if (report.exceptionCount > 0) process.exit(1);
