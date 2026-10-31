// Scheduled jobs — prd-corrections.md §18; architecture.md §10.
// Asia/Kolkata, idempotent, and safe to re-run: every job selects by current
// state, so a retry or a catch-up after downtime changes nothing twice.

import { db } from "@/lib/db";
import { istDay } from "@/lib/tasks";
import { settleConstraints } from "@/lib/services/command";
import { activateDueVersions } from "@/lib/services/commission-settings-service";
import { windDownTripBuckets } from "@/lib/services/trip-service";
import { closeDeactivatedReviewIfDone, releaseHold } from "@/lib/services/hold-service";
import { syncPaymentFollowUp } from "@/lib/services/payment-service";
import { completeTask, ensureTask, reviseTask } from "@/lib/services/task-service";
import { hasBuyerProcess } from "@/lib/services/selling-task";

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
    const due = { status: "PENDING" as const, expiresAt: { lte: now } };
    const members = await db.holdRequest.findMany({ where: due, select: { memberId: true }, distinct: ["memberId"] });
    const result = await db.holdRequest.updateMany({
      where: due,
      data: { status: "EXPIRED", decidedAt: now, decisionNote: "Expired on the working-day cut-off." },
    });
    for (const { memberId } of members) {
      await db.$transaction((tx) => closeDeactivatedReviewIfDone(tx, memberId, "SYSTEM"));
    }
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
          title: "Payment Given Follow-Up",
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
          title: "RERA Registration Expiring",
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

export async function runPreSalesJobs(now: Date = new Date()): Promise<JobResult[]> {
  return [await runHoldExpiry(now), await runHoldRequestExpiry(now)];
}

/**
 * CP §8, §76 — an Approved Project settings version becomes Active at its
 * Effective from. Booking Request submission also activates a due version on
 * its own Project, so this job only keeps the screens current between Bookings.
 */
export function runCommissionVersionActivation(_now: Date = new Date()): Promise<JobResult> {
  return withRun("COMMISSION_VERSION_ACTIVATION", async () => {
    const changed = await db.$transaction(async (tx) => {
      const activated = await activateDueVersions(tx);
      await settleConstraints(tx);
      return activated;
    });
    return { processed: changed, changed };
  });
}

/** SSOT §48; CP §36, §76.2 — closing programmes: open progress expires at the deadline. */
export function runTripWindDown(now: Date = new Date()): Promise<JobResult> {
  return withRun("TRIP_WIND_DOWN", async () => {
    const changed = await db.$transaction(async (tx) => {
      const expired = await windDownTripBuckets(tx, now);
      await settleConstraints(tx);
      return expired;
    });
    return { processed: changed, changed };
  });
}

/**
 * Owner, 14 Oct 2026 — "Selling Buyback/Resale Plot" closes by itself once the
 * Plot no longer has the active Hold or Booking that raised it. A Hold or
 * Booking ends along many paths (expiry, cancellation, rejection, refund,
 * Change Plot), so one sweep here covers them all.
 * Every end path also closes it at once (selling-task.ts); this sweep is the safety net.
 */
export function runManagementActionClear(_now: Date = new Date()): Promise<JobResult> {
  return withRun("MANAGEMENT_ACTION_CLEAR", async () => {
    const open = await db.task.findMany({
      where: { purpose: "MANAGEMENT_ACTION_REQUIRED", status: "PENDING", recordKind: "Acquisition" },
      select: { id: true, recordId: true },
    });
    let changed = 0;
    for (const task of open) {
      await db.$transaction(async (tx) => {
        const deal = await tx.acquisition.findUnique({ where: { id: task.recordId }, select: { plotId: true, sourceBookingId: true } });
        if (deal && (await hasBuyerProcess(tx, deal.plotId, deal.sourceBookingId))) return;
        await completeTask(tx, task.id, "SYSTEM", "The Hold or Booking on this Plot has ended.");
        changed += 1;
      });
    }
    return { processed: open.length, changed };
  });
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
  COMMISSION_VERSION_ACTIVATION: runCommissionVersionActivation,
  TRIP_WIND_DOWN: runTripWindDown,
  MANAGEMENT_ACTION_CLEAR: runManagementActionClear,
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
