// Scheduler entry point — PRD §18; ARCHITECTURE §10.
//
// One job per request:
//   POST /api/jobs?job=HOLD_EXPIRY      header  x-jobs-secret: $JOBS_SECRET
//   GET  /api/jobs?job=HOLD_EXPIRY      header  Authorization: Bearer $JOBS_SECRET
//
// Omitting ?job runs the whole catalogue, which is fine on a persistent server
// and fine while the book is small, but a host that caps request duration will
// eventually cut it off: the payment reminders open one transaction per Booking.
// Schedule the named jobs individually there.
//
// GET exists because most managed schedulers (Vercel Cron among them) only issue
// GET. Every job is idempotent, so a repeated or duplicated trigger is safe.

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { JOBS, isJobName, runAllJobs, runJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";
/** Above the worst-case command duration, so a job is never cut mid-transaction. */
export const maxDuration = 300;

/** Constant-time compare — this is an authentication secret. */
function matches(supplied: string | null, secret: string): boolean {
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorised(request: Request, secret: string): boolean {
  if (matches(request.headers.get("x-jobs-secret"), secret)) return true;
  const bearer = request.headers.get("authorization");
  return !!bearer?.startsWith("Bearer ") && matches(bearer.slice(7), secret);
}

async function handle(request: Request) {
  const secret = process.env.JOBS_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "JOBS_SECRET is not configured." }, { status: 503 });
  }
  if (!authorised(request, secret)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const requested = new URL(request.url).searchParams.get("job");
  if (requested !== null && !isJobName(requested)) {
    return NextResponse.json(
      { error: `Unknown job "${requested}".`, known: Object.keys(JOBS) },
      { status: 400 }
    );
  }

  try {
    const results = requested === null ? await runAllJobs() : [await runJob(requested)];
    return NextResponse.json({ ranAt: new Date().toISOString(), results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job run failed." },
      { status: 500 }
    );
  }
}

export const POST = handle;
export const GET = handle;
