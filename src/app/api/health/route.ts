// Liveness and configuration check — PRD §18 monitoring; PRD §27 gate 9.
//
// Point the hosting platform's health check here. It answers 200 only when the
// database is reachable AND every secret the CRM needs is configured, so a
// deployment missing a key fails visibly at the load balancer instead of at the
// first Aadhaar write.
//
// No authentication: it exposes no data, only names of missing configuration.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Secrets without which the CRM cannot operate correctly. */
const REQUIRED_ENV = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "SENSITIVE_KEY",
  "BLIND_INDEX_KEY",
  "JOBS_SECRET",
] as const;

export async function GET() {
  const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);

  let database: "up" | "down" = "down";
  let databaseError: string | undefined;
  try {
    await db.$queryRaw`SELECT 1`;
    database = "up";
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "unreachable";
  }

  // The last successful run of each job, so a stalled scheduler is visible
  // without opening the database (PRD §18).
  let jobs: Array<{ jobType: string; lastSuccessAt: string | null }> = [];
  if (database === "up") {
    const runs = await db.scheduledJobRun.groupBy({
      by: ["jobType"],
      where: { status: "SUCCESS" },
      _max: { finishedAt: true },
    });
    jobs = runs.map((run) => ({
      jobType: run.jobType,
      lastSuccessAt: run._max.finishedAt?.toISOString() ?? null,
    }));
  }

  const healthy = database === "up" && missingEnv.length === 0;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "unhealthy",
      at: new Date().toISOString(),
      database,
      databaseError,
      missingEnv,
      jobs,
    },
    { status: healthy ? 200 : 503 }
  );
}
