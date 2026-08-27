// Hold, Hold extension and Member Hold Request services.
// PRD.md §8, §15; ARCHITECTURE.md §7.

import { db } from "@/lib/db";
import {
  DEFAULT_CALENDAR,
  checkOpenPositions,
  decideExtension,
  extensionRequiresAdmin,
  holdExpiry,
  holdRequestExpiry,
  isHoldExpired,
} from "@/lib/domain/holds";
import { canAllocate, plotReturnState } from "@/lib/domain/inventory";
import { blocked, lockPlot, runCommand, type Tx } from "./command";
import { freezePlcSnapshot } from "./plc-service";
import { closeTasksFor } from "./task-service";

/** PRD §8.2 — counts Active Holds, Waiting for Booking Approval and Pending requests. */
export async function countOpenPositions(tx: Tx, personId: string) {
  const [activeHolds, pendingHoldRequests, waitingBookingApproval] = await Promise.all([
    tx.hold.count({ where: { personId, status: "ACTIVE" } }),
    tx.holdRequest.count({ where: { personId, status: "PENDING" } }),
    // Counted from the Booking itself, not through the Hold: a Booking Request
    // freezes its Hold, and a request from an Available Plot has none at all.
    tx.booking.count({ where: { primaryPersonId: personId, status: "REQUEST_PENDING" } }),
  ]);
  return { activeHolds, waitingBookingApproval, pendingHoldRequests };
}


/* ------------------------------------------------------------------ Hold */

export type CreateHoldInput = {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  plotId: string;
  /** The actual Person. Anonymous Member Holds are prohibited (PRD §8.1). */
  personId: string;
  enquiryId?: string | null;
  sourceMemberId?: string | null;
  responsibleStaffId?: string | null;
  remark?: string;
};

/**
 * The one place a Hold is actually placed. Direct CRM Holds and approved
 * Member Hold Requests both route through it, so the Plot check, the
 * three-position check and the PLC freeze can never drift apart.
 */
async function placeHold(
  tx: Tx,
  input: Omit<CreateHoldInput, "idempotencyKey" | "actorRole">
) {
  if (!input.personId) blocked("A Hold must identify the actual Customer/Person.");
  await lockPlot(tx, input.plotId);

  const plot = await tx.plot.findUniqueOrThrow({
    where: { id: input.plotId },
    include: { project: { select: { status: true } } },
  });
  const allocatable = canAllocate(plot.status, plot.restriction, plot.project.status);
  if (!allocatable.ok) blocked(allocatable.reason);

  const positions = await countOpenPositions(tx, input.personId);
  const room = checkOpenPositions(positions);
  if (!room.ok) blocked(room.reason);

  const snapshot = await freezePlcSnapshot(tx, input.plotId);
  const startsAt = new Date();

  const hold = await tx.hold.create({
    data: {
      plotId: input.plotId,
      personId: input.personId,
      enquiryId: input.enquiryId ?? null,
      sourceMemberId: input.sourceMemberId ?? null,
      responsibleStaffId: input.responsibleStaffId ?? null,
      startsAt,
      expiresAt: holdExpiry(startsAt),
      plcSnapshotId: snapshot.id,
    },
  });

  await tx.plot.update({ where: { id: input.plotId }, data: { status: "HOLD" } });
  await tx.plotEvent.create({
    data: {
      plotId: input.plotId,
      actorRef: input.actorRef,
      action: "HOLD_CREATED",
      fromStatus: plot.status,
      toStatus: "HOLD",
      reason: input.remark,
    },
  });

  return hold;
}

export async function createHold(input: CreateHoldInput) {
  return runCommand(
    {
      idempotencyKey: input.idempotencyKey,
      operation: "HOLD_CREATE",
      actorRef: input.actorRef,
      actorRole: input.actorRole,
      payload: { plotId: input.plotId, personId: input.personId },
    },
    async (tx) => {
      const hold = await placeHold(tx, input);
      return {
        result: { holdId: hold.id, expiresAt: hold.expiresAt.toISOString() },
        audit: {
          entity: "Hold",
          entityId: hold.id,
          action: "HOLD_CREATED",
          after: { plotId: input.plotId, personId: input.personId, expiresAt: hold.expiresAt },
          reason: input.remark,
        },
      };
    }
  );
}

/** Cancel or expire a Hold and return the Plot through the one shared rule. */
export async function releaseHold(
  tx: Tx,
  holdId: string,
  actorRef: string,
  status: "CANCELLED" | "EXPIRED" | "CONVERTED_TO_BOOKING",
  reason: string
) {
  const hold = await tx.hold.findUniqueOrThrow({ where: { id: holdId }, include: { plot: true } });
  if (hold.status !== "ACTIVE") return { changed: false };

  await tx.hold.update({
    where: { id: holdId },
    data: { status, closedAt: new Date(), closeReason: reason },
  });

  // Any Pending extension request dies with the Hold (PRD §8.5).
  await tx.holdExtensionRequest.updateMany({
    where: { holdId, status: "PENDING" },
    data: { status: "EXPIRED", decidedAt: new Date(), decisionNote: reason },
  });

  if (status !== "CONVERTED_TO_BOOKING") {
    const next = plotReturnState(hold.plot.restriction, hold.plot.restrictionReason);
    await tx.plot.update({ where: { id: hold.plotId }, data: { status: next.status } });
    await tx.plotEvent.create({
      data: {
        plotId: hold.plotId,
        actorRef,
        action: `HOLD_${status}`,
        fromStatus: hold.plot.status,
        toStatus: next.status,
        reason: next.message ? `${reason} — ${next.message}` : reason,
      },
    });
  }

  await closeTasksFor(tx, "Hold", holdId, actorRef, reason);
  return { changed: true };
}

export async function cancelHold(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  holdId: string;
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to cancel a Hold.");
  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "HOLD_CANCEL",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { holdId: args.holdId },
    },
    async (tx) => {
      const hold = await tx.hold.findUniqueOrThrow({ where: { id: args.holdId } });
      await lockPlot(tx, hold.plotId);

      // `releaseHold` is a no-op on a Hold that is not running, so without this
      // the caller would be told the Hold was cancelled when nothing happened.
      if (hold.status === "FROZEN") {
        blocked(
          "This Hold is frozen behind a Booking Request waiting for the Accounts decision. " +
            "Cancel the Booking Request instead — that restores or releases the Hold."
        );
      }
      if (hold.status !== "ACTIVE") {
        blocked(`This Hold is already ${hold.status.replaceAll("_", " ").toLowerCase()}.`);
      }

      const outcome = await releaseHold(tx, args.holdId, args.actorRef, "CANCELLED", args.reason);
      return {
        result: outcome,
        audit: {
          entity: "Hold",
          entityId: args.holdId,
          action: "HOLD_CANCELLED",
          reason: args.reason,
        },
      };
    }
  );
}

/* -------------------------------------------------------------- extension */

export async function requestHoldExtension(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  holdId: string;
  reason: string;
  requestedHours: number;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to request a Hold extension.");
  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "HOLD_EXTENSION_REQUEST",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { holdId: args.holdId, requestedHours: args.requestedHours },
    },
    async (tx) => {
      const hold = await tx.hold.findUniqueOrThrow({ where: { id: args.holdId } });
      if (hold.status === "FROZEN") {
        blocked(
          "This Hold is frozen behind a Booking Request, so its timer is not running and there is " +
            "nothing to extend (PRD §10.5)."
        );
      }
      if (hold.status !== "ACTIVE") blocked("This Hold is no longer active.");
      if (isHoldExpired(hold.expiresAt)) blocked("This Hold has expired. Create a new Hold instead.");

      // CRM may always raise the request; Admin decides it from the second one on.
      const requiresAdmin = extensionRequiresAdmin(hold.extensionCount);

      const request = await tx.holdExtensionRequest.create({
        data: {
          holdId: args.holdId,
          requestedByRef: args.actorRef,
          reason: args.reason,
          requiresAdmin,
          requestedHours: args.requestedHours,
        },
      });

      return {
        result: { extensionRequestId: request.id, requiresAdmin },
        audit: {
          entity: "HoldExtensionRequest",
          entityId: request.id,
          action: "EXTENSION_REQUESTED",
          after: { holdId: args.holdId, requestedHours: args.requestedHours, requiresAdmin },
          reason: args.reason,
        },
      };
    }
  );
}

export async function decideHoldExtension(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  requestId: string;
  approve: boolean;
  note?: string;
}) {
  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "HOLD_EXTENSION_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { requestId: args.requestId, approve: args.approve },
    },
    async (tx) => {
      const request = await tx.holdExtensionRequest.findUniqueOrThrow({
        where: { id: args.requestId },
        include: { hold: true },
      });
      if (request.status !== "PENDING") blocked("This extension request has already been decided.");
      if (request.requiresAdmin && args.actorRole !== "ADMIN" && args.actorRole !== "MD") {
        blocked("A further Hold extension requires Admin approval.");
      }
      // Approving against a frozen Hold would push out an expiry that the
      // Booking rejection then overwrites with the frozen remainder, silently
      // losing the extension.
      if (request.hold.status === "FROZEN") {
        blocked(
          "This Hold is frozen behind a Booking Request waiting for the Accounts decision. " +
            "Decide the Booking Request first — the Hold timer is not running."
        );
      }
      if (request.hold.status !== "ACTIVE") {
        blocked(`This Hold is already ${request.hold.status.replaceAll("_", " ").toLowerCase()}.`);
      }

      const decision = decideExtension(
        args.approve,
        request.hold.expiresAt,
        request.requestedHours
      );

      if (decision.outcome === "EXPIRED") {
        await tx.holdExtensionRequest.update({
          where: { id: request.id },
          data: {
            status: "EXPIRED",
            decidedAt: new Date(),
            decidedByRef: args.actorRef,
            decisionNote: decision.reason,
          },
        });
      } else if (decision.outcome === "REJECTED") {
        await tx.holdExtensionRequest.update({
          where: { id: request.id },
          data: {
            status: "REJECTED",
            decidedAt: new Date(),
            decidedByRef: args.actorRef,
            decisionNote: args.note,
          },
        });
      } else {
        await tx.holdExtensionRequest.update({
          where: { id: request.id },
          data: {
            status: "APPROVED",
            decidedAt: new Date(),
            decidedByRef: args.actorRef,
            decisionNote: args.note,
          },
        });
        await tx.hold.update({
          where: { id: request.holdId },
          data: { expiresAt: decision.newExpiresAt, extensionCount: request.hold.extensionCount + 1 },
        });
      }

      return {
        result: { outcome: decision.outcome },
        audit: {
          entity: "HoldExtensionRequest",
          entityId: request.id,
          action: `EXTENSION_${decision.outcome}`,
          before: { expiresAt: request.hold.expiresAt },
          after: decision.outcome === "APPROVED" ? { expiresAt: decision.newExpiresAt } : undefined,
          reason: args.note,
        },
      };
    }
  );
}

/* --------------------------------------------------- Member Hold Request */

export async function submitHoldRequest(args: {
  idempotencyKey: string;
  actorRef: string;
  memberProfileId: string;
  personId: string;
  plotId: string;
}) {
  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "HOLD_REQUEST_SUBMIT",
      actorRef: args.actorRef,
      actorRole: "MEMBER",
      payload: { personId: args.personId, plotId: args.plotId },
    },
    async (tx) => {
      if (!args.personId) blocked("A Member Hold Request must identify the actual Customer/Person.");

      // PRD §8.3 — show the existing request rather than queueing another.
      const existing = await tx.holdRequest.findFirst({
        where: { personId: args.personId, plotId: args.plotId, status: "PENDING" },
      });
      if (existing) {
        return {
          result: {
            holdRequestId: existing.id,
            duplicate: true,
            expiresAt: existing.expiresAt.toISOString(),
          },
          audit: {
            entity: "HoldRequest",
            entityId: existing.id,
            action: "HOLD_REQUEST_DUPLICATE_SHOWN",
          },
        };
      }

      const plot = await tx.plot.findUniqueOrThrow({
        where: { id: args.plotId },
        include: { project: { select: { status: true } } },
      });
      const allocatable = canAllocate(plot.status, plot.restriction, plot.project.status);
      if (!allocatable.ok) blocked(allocatable.reason);

      const positions = await countOpenPositions(tx, args.personId);
      const room = checkOpenPositions(positions);
      if (!room.ok) blocked(room.reason);

      const createdAt = new Date();
      const request = await tx.holdRequest.create({
        data: {
          memberId: args.memberProfileId,
          personId: args.personId,
          plotId: args.plotId,
          createdAt,
          expiresAt: holdRequestExpiry(createdAt, DEFAULT_CALENDAR),
        },
      });

      return {
        result: { holdRequestId: request.id, duplicate: false, expiresAt: request.expiresAt.toISOString() },
        audit: {
          entity: "HoldRequest",
          entityId: request.id,
          action: "HOLD_REQUEST_SUBMITTED",
          after: { plotId: args.plotId, personId: args.personId, expiresAt: request.expiresAt },
        },
      };
    }
  );
}

/**
 * CRM decision on a Member Hold Request. Approval places the Hold through the
 * same path as a direct CRM Hold; an expired request can no longer be approved
 * (PRD §8.4).
 */
export async function decideHoldRequest(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  requestId: string;
  approve: boolean;
  note: string;
}) {
  if (!args.note.trim()) blocked("A compulsory remark is required to decide a Member Hold Request.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "HOLD_REQUEST_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { requestId: args.requestId, approve: args.approve },
    },
    async (tx) => {
      const request = await tx.holdRequest.findUniqueOrThrow({ where: { id: args.requestId } });
      if (request.status !== "PENDING") {
        blocked(`This request is already ${request.status.toLowerCase()}.`);
      }
      if (request.expiresAt.getTime() <= Date.now()) {
        await tx.holdRequest.update({
          where: { id: request.id },
          data: {
            status: "EXPIRED",
            decidedAt: new Date(),
            decidedByRef: args.actorRef,
            decisionNote: "Expired on the working-day cut-off before a decision.",
          },
        });
        blocked(
          "This request expired on the working-day cut-off and can no longer be approved. " +
            "The Member must submit a new request."
        );
      }

      if (!args.approve) {
        await tx.holdRequest.update({
          where: { id: request.id },
          data: {
            status: "REJECTED",
            decidedAt: new Date(),
            decidedByRef: args.actorRef,
            decisionNote: args.note,
          },
        });
        return {
          result: { requestId: request.id, status: "REJECTED", holdId: null as string | null },
          audit: {
            entity: "HoldRequest",
            entityId: request.id,
            action: "HOLD_REQUEST_REJECTED",
            reason: args.note,
          },
        };
      }

      const hold = await placeHold(tx, {
        actorRef: args.actorRef,
        plotId: request.plotId,
        personId: request.personId,
        sourceMemberId: request.memberId,
        remark: `Approved Member Hold Request — ${args.note}`,
      });

      await tx.holdRequest.update({
        where: { id: request.id },
        data: {
          status: "APPROVED",
          decidedAt: new Date(),
          decidedByRef: args.actorRef,
          decisionNote: args.note,
          resultingHoldId: hold.id,
        },
      });

      return {
        result: { requestId: request.id, status: "APPROVED", holdId: hold.id },
        audit: {
          entity: "HoldRequest",
          entityId: request.id,
          action: "HOLD_REQUEST_APPROVED",
          after: { holdId: hold.id, expiresAt: hold.expiresAt },
          reason: args.note,
        },
      };
    }
  );
}

/** A Member may withdraw their own request while it is Pending (PRD §8.4). */
export async function withdrawHoldRequest(args: {
  idempotencyKey: string;
  actorRef: string;
  memberProfileId: string;
  requestId: string;
}) {
  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "HOLD_REQUEST_WITHDRAW",
      actorRef: args.actorRef,
      actorRole: "MEMBER",
      payload: { requestId: args.requestId },
    },
    async (tx) => {
      const request = await tx.holdRequest.findUniqueOrThrow({ where: { id: args.requestId } });
      if (request.memberId !== args.memberProfileId) {
        blocked("A Member may withdraw only their own Hold Request.");
      }
      if (request.status !== "PENDING") {
        blocked(`This request is already ${request.status.toLowerCase()}.`);
      }

      await tx.holdRequest.update({
        where: { id: request.id },
        data: {
          status: "WITHDRAWN",
          decidedAt: new Date(),
          decidedByRef: args.actorRef,
          decisionNote: "Withdrawn by the Member.",
        },
      });

      return {
        result: { requestId: request.id, status: "WITHDRAWN" },
        audit: {
          entity: "HoldRequest",
          entityId: request.id,
          action: "HOLD_REQUEST_WITHDRAWN",
        },
      };
    }
  );
}

/** DESIGN §9.3 — the queue, with each request's position for its Plot. */
export async function listPendingHoldRequests() {
  const rows = await db.holdRequest.findMany({
    where: { status: "PENDING" },
    include: {
      plot: { include: { project: true } },
      person: true,
      member: { include: { person: true } },
    },
    orderBy: [{ plotId: "asc" }, { createdAt: "asc" }],
  });

  const seen = new Map<string, number>();
  return rows.map((r) => {
    const position = (seen.get(r.plotId) ?? 0) + 1;
    seen.set(r.plotId, position);
    return { ...r, queuePosition: position };
  });
}

export function listActiveHolds() {
  return db.hold.findMany({
    where: { status: "ACTIVE" },
    include: { plot: { include: { project: true } }, person: true },
    orderBy: { expiresAt: "asc" },
  });
}
