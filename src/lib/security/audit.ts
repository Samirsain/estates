// Audit writer — ARCHITECTURE.md §5.5, §9.
// Append-only: this function only ever inserts. Nothing updates or deletes an
// AuditEvent, and every payload passes through redaction first.

import { db } from "@/lib/db";
import { redactForAudit } from "./identity";

export async function recordAudit(event: {
  actorRef: string;
  actorRole?: string;
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  /** Optional fields arrive as null from the database and forms alike. */
  reason?: string | null;
  correlationId?: string;
  ip?: string;
}): Promise<void> {
  await db.auditEvent.create({
    data: {
      actorRef: event.actorRef,
      actorRole: event.actorRole,
      entity: event.entity,
      entityId: event.entityId,
      action: event.action,
      beforeMasked: redactForAudit(event.before) as never,
      afterMasked: redactForAudit(event.after) as never,
      reason: event.reason,
      correlationId: event.correlationId,
      ip: event.ip,
    },
  });
}
