// Scheduler entry point. Point cron / Windows Task Scheduler at:
//   curl -X POST -H "x-jobs-secret: $JOBS_SECRET" https://<host>/api/jobs
// Jobs are idempotent, so a duplicate trigger or a catch-up after downtime is safe.

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runAllJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** Constant-time compare — this header is an authentication secret. */
function matches(supplied: string | null, secret: string): boolean {
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.JOBS_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "JOBS_SECRET is not configured." }, { status: 503 });
  }
  if (!matches(request.headers.get("x-jobs-secret"), secret)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  try {
    const results = await runAllJobs();
    return NextResponse.json({ ranAt: new Date().toISOString(), results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job run failed." },
      { status: 500 }
    );
  }
}
