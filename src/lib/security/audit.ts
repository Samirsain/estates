// Audit and security-event writers — ARCHITECTURE.md §5.5, §9.
// Append-only: these functions only ever insert. Nothing updates or deletes an
// AuditEvent, and every payload passes through redaction first.

import { db } from "@/lib/db";
import { redactForAudit } from "./identity";
import type { SecurityEventType } from "@prisma/client";

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

export async function recordSecurityEvent(event: {
  type: SecurityEventType;
  /** Already-masked identifier. Never a password, Aadhaar, PAN or bank value. */
  identifier?: string;
  /** Null where no trusted proxy vouches for the address (see TRUST_PROXY). */
  ip?: string | null;
  detail?: string;
}): Promise<void> {
  await db.securityEvent.create({ data: event });
}
