// Scheduled jobs — PRD.md §18; ARCHITECTURE.md §10.
// Asia/Kolkata, idempotent, and safe to re-run: every job selects by current
// state, so a retry or a catch-up after downtime changes nothing twice.

import { db } from "@/lib/db";
import { istDay } from "@/lib/tasks";
import { settleConstraints } from "@/lib/services/command";
import { releaseHold } from "@/lib/services/hold-service";
import { membersRollingToday } from "@/lib/services/network-service";
import { upgradeCycleIfDue } from "@/lib/services/cycle-service";
import { syncPaymentFollowUp } from "@/lib/services/payment-service";
import { ensureTask, reviseTask } from "@/lib/services/task-service";

export type JobResult = { jobType: string; processed: number; changed: number };

async function withRun(jobType: string, work: () => Promise<{ processed: number; changed: number }>) {
  const run = await db.scheduledJobRun.create({ data: { jobType } });
  try {
    const { processed, changed } = await work();
    await db.scheduledJobRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        cursorAt: new Date(),
        status: "SUCCESS",
        processedCount: processed,
        changedCount: changed,
      },
    });
    return { jobType, processed, changed };
  } catch (error) {
    await db.scheduledJobRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "FAILED",
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

/** PRD §18 — a Hold expires at its exact stored expiry. */
export function runHoldExpiry(now: Date = new Date()): Promise<JobResult> {
  return withRun("HOLD_EXPIRY", async () => {
    const due = await db.hold.findMany({
      where: { status: "ACTIVE", expiresAt: { lte: now } },
      select: { id: true },
    });
    let changed = 0;
    for (const hold of due) {
      // Each Hold is its own transaction, so one failure cannot strand the rest.
      const outcome = await db.$transaction(async (tx) => {
        const released = await releaseHold(
          tx,
          hold.id,
          "SYSTEM:HOLD_EXPIRY",
          "EXPIRED",
          "Hold expired at 72 hours."
        );
        await settleConstraints(tx);
        return released;
      });
      if (outcome.changed) changed++;
    }
    return { processed: due.length, changed };
  });
}

/**
 * PRD §8.4, §18 — a Pending Member Hold Request expires on the working-day
 * cut-off calendar. Expired requests stop counting toward the three-position limit.
 */
export function runHoldRequestExpiry(now: Date = new Date()): Promise<JobResult> {
  return withRun("MEMBER_HOLD_REQUEST_EXPIRY", async () => {
    const result = await db.holdRequest.updateMany({
      where: { status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED", decidedAt: now, decisionNote: "Expired on the working-day cut-off." },
    });
    return { processed: result.count, changed: result.count };
  });
}

/** PRD §18 — one task seven days before the next unpaid due date. */
const REMINDER_DAYS = 7;
const shiftDays = (at: Date, days: number) => new Date(at.getTime() + days * 86_400_000);

/**
 * PRD §18 — the rolling Payment Received follow-up. `syncPaymentFollowUp` owns
 * the one-task-per-Booking rule, so this job only decides which Bookings still
 * owe money; a re-run re-derives the same task and changes nothing twice.
 */
export function runPaymentReceivedReminder(): Promise<JobResult> {
  return withRun("PAYMENT_RECEIVED_REMINDER", async () => {
    const bookings = await db.booking.findMany({
      where: { status: { in: ["BOOKED", "PAYMENT_COMPLETED"] }, activeProcess: "NONE" },
      select: { id: true },
    });
    let changed = 0;
    for (const booking of bookings) {
      const task = await db.$transaction(async (tx) => {
        const result = await syncPaymentFollowUp(tx, booking.id, "SYSTEM:PAYMENT_RECEIVED_REMINDER");
        await settleConstraints(tx);
        return result;
      });
      if (task) changed++;
    }
    return { processed: bookings.length, changed };
  });
}

/**
 * PRD §18 — the Payment Given mirror. Payment Given is its own dataset, so the
 * reminder is its own task on the Acquisition and never merges with the sale
 * side (PRD §1.2, §11.2).
 */
export function runPaymentGivenReminder(now: Date = new Date()): Promise<JobResult> {
  return withRun("PAYMENT_GIVEN_REMINDER", async () => {
    const schedules = await db.paymentScheduleVersion.findMany({
      where: {
        status: "ACTIVE",
        acquisitionId: { not: null },
        acquisition: { status: { in: ["PENDING_APPROVAL", "APPROVED"] } },
      },
      include: { acquisition: true, instalments: { orderBy: { seq: "asc" } } },
    });

    let changed = 0;
    for (const schedule of schedules) {
      const acquisition = schedule.acquisition;
      const next = schedule.instalments.find((i) => i.receivedPercent.lt(i.scheduledPercent));
      if (!next || !acquisition) continue;
      if (next.dueDate.getTime() > shiftDays(now, REMINDER_DAYS).getTime()) continue;

      await db.$transaction(async (tx) => {
        await ensureTask(tx, {
          recordKind: "Acquisition",
          recordId: acquisition.id,
          recordName: acquisition.acquisitionNo,
          purpose: "PAYMENT_GIVEN_FOLLOW_UP",
          title: "Payment Given Follow-up",
          assigneeRole: "ACCOUNTS",
          dueAt: next.dueDate,
          latestResult: `Instalment ${next.seq}: ${next.scheduledPercent
            .sub(next.receivedPercent)
            .toFixed(2)}% still due`,
        });
        await settleConstraints(tx);
      });
      changed++;
    }
    return { processed: schedules.length, changed };
  });
}

/**
 * PRD §18 — the remaining balance becomes Overdue the day after the due date.
 * The instalment status itself is derived from that date (PRD §10.1), so the
 * job makes the overdue obligation visible: the follow-up task turns urgent.
 */
export function runInstalmentOverdue(now: Date = new Date()): Promise<JobResult> {
  return withRun("INSTALMENT_OVERDUE", async () => {
    const overdue = await db.task.findMany({
      where: {
        purpose: "PAYMENT_FOLLOW_UP",
        status: "PENDING",
        urgent: false,
        dueAt: { lt: new Date(`${istDay(now)}T00:00:00+05:30`) },
      },
      select: { id: true },
    });
    for (const task of overdue) {
      await db.task.update({ where: { id: task.id }, data: { urgent: true } });
    }
    return { processed: overdue.length, changed: overdue.length };
  });
}

/** PRD §18 — a Booking Request left seven calendar days without a decision. */
export function runBookingDecisionAlert(now: Date = new Date()): Promise<JobResult> {
  return withRun("BOOKING_DECISION_ALERT", async () => {
    const stale = await db.task.findMany({
      where: {
        purpose: "BOOKING_REVIEW",
        status: "PENDING",
        urgent: false,
        createdAt: { lte: shiftDays(now, -REMINDER_DAYS) },
      },
      select: { id: true, dueAt: true },
    });
    for (const task of stale) {
      await db.$transaction(async (tx) => {
        await tx.task.update({ where: { id: task.id }, data: { urgent: true } });
        await reviseTask(
          tx,
          task.id,
          "SYSTEM:BOOKING_DECISION_ALERT",
          task.dueAt,
          "Seven calendar days without an Accounts decision."
        );
        await settleConstraints(tx);
      });
    }
    return { processed: stale.length, changed: stale.length };
  });
}

/** PRD §18, §19.5 — one task seven days before the RERA registration expires. */
export function runReraExpiryReminder(now: Date = new Date()): Promise<JobResult> {
  return withRun("RERA_EXPIRY_REMINDER", async () => {
    const due = await db.memberProfile.findMany({
      where: {
        status: "ACTIVE",
        reraStatus: "REGISTERED",
        reraExpiryDate: { not: null, lte: shiftDays(now, REMINDER_DAYS) },
      },
      include: { person: true },
    });
    for (const member of due) {
      await db.$transaction(async (tx) => {
        await ensureTask(tx, {
          recordKind: "Member",
          recordId: member.id,
          recordName: `${member.memberId} · ${member.person.fullName}`,
          purpose: "RERA_EXPIRY",
          title: "RERA registration expiring",
          assigneeRole: "CRM",
          dueAt: member.reraExpiryDate!,
          urgent: true,
        });
        await settleConstraints(tx);
      });
    }
    return { processed: due.length, changed: due.length };
  });
}

/**
 * CR-027 — the Performance Cycle Anniversary Upgrade Check, which replaces the
 * Annual Counter Reset outright.
 *
 * Per Member whose Activation Anniversary is today, independently for Invite and
 * Royalty: if the current cycle's positions 1 to 9 are not all successful, do
 * nothing — an incomplete counter is not reset, which is the whole point of the
 * change. If it is Upgrade Eligible, open the next cycle. Existing positions are
 * never moved, renumbered or re-rated.
 *
 * Re-running it, or running it twice in a day after a missed run, opens nothing
 * a second time: the roll makes the current cycle a fresh IN_PROGRESS one, which
 * `mayOpenNextCycle` refuses, and the unique key on (Member, kind, number) is the
 * backstop underneath that.
 */
export function runPerformanceCycleUpgradeCheck(now: Date = new Date()): Promise<JobResult> {
  return withRun("PERFORMANCE_CYCLE_UPGRADE_CHECK", async () => {
    const rolling = await membersRollingToday(now);
    let changed = 0;
    for (const member of rolling) {
      // One transaction per Member: a failure on one Member's counters must not
      // roll back another's, and the run stays short on a hosted request cap.
      await db.$transaction(async (tx) => {
        for (const kind of ["INVITE", "ROYALTY"] as const) {
          if (await upgradeCycleIfDue(tx, member.id, kind, now, "JOB")) changed++;
        }
        await settleConstraints(tx);
      });
    }
    return { processed: rolling.length * 2, changed };
  });
}

export async function runPreSalesJobs(now: Date = new Date()): Promise<JobResult[]> {
  return [await runHoldExpiry(now), await runHoldRequestExpiry(now)];
}

/**
 * PRD §18 — the full daily run. Every job records its own start, finish, counts
 * and error, so one failure is visible per job and never stops the rest.
 */
/**
 * The job catalogue, keyed by the name the scheduler calls. Running one job per
 * request keeps every invocation short, which matters on a host that caps how
 * long a single request may run: `runPaymentReceivedReminder` opens a
 * transaction per Booking, so a full catalogue run grows with the book.
 */
export const JOBS = {
  HOLD_EXPIRY: runHoldExpiry,
  MEMBER_HOLD_REQUEST_EXPIRY: runHoldRequestExpiry,
  INSTALMENT_OVERDUE: runInstalmentOverdue,
  PAYMENT_RECEIVED_REMINDER: runPaymentReceivedReminder,
  PAYMENT_GIVEN_REMINDER: runPaymentGivenReminder,
  BOOKING_DECISION_ALERT: runBookingDecisionAlert,
  RERA_EXPIRY_REMINDER: runReraExpiryReminder,
  PERFORMANCE_CYCLE_UPGRADE_CHECK: runPerformanceCycleUpgradeCheck,
} as const;

export type JobName = keyof typeof JOBS;

export function isJobName(value: string): value is JobName {
  return value in JOBS;
}

/** One named job. Idempotent, exactly as the catalogue run is. */
export function runJob(name: JobName, now: Date = new Date()): Promise<JobResult> {
  return JOBS[name](now);
}

export async function runAllJobs(now: Date = new Date()): Promise<JobResult[]> {
  const jobs = Object.values(JOBS);

  const results: JobResult[] = [];
  for (const job of jobs) {
    try {
      results.push(await job(now));
    } catch (error) {
      results.push({ jobType: `${job.name}:FAILED`, processed: 0, changed: 0 });
      console.error(`${job.name} failed`, error);
    }
  }
  return results;
}
