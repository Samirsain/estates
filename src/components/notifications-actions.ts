"use server";

// The header bell. Its feed is the audit trail itself — every approval,
// decision and change already writes one row there — so there is nothing
// extra to store. Only staff who may read Activity History (AUDIT_VIEW) are
// served it, and only what other people did.

import { db } from "@/lib/db";
import { currentStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";

export type Notification = {
  id: string;
  at: string;
  actorRef: string;
  action: string;
  entity: string;
  reason: string | null;
  /** Where the work is: the record itself, or the list it is done from. */
  href: string | null;
};

const RECORD_PAGE: Record<string, (id: string) => string> = {
  Booking: (id) => `/bookings/${id}`,
  Acquisition: (id) => `/acquisitions/${id}`,
  Project: (id) => `/projects/${id}`,
  MemberProfile: (id) => `/members/${id}`,
  CustomerProfile: (id) => `/customers/${id}`,
  Person: (id) => `/people/${id}`,
  Plot: (id) => `/plots/${id}`,
  LandInquiry: (id) => `/land-inquiries/${id}`,
};
const LIST_PAGE: Record<string, string> = {
  Enquiry: "/enquiries",
  Hold: "/enquiries",
  HoldRequest: "/enquiries",
  HoldExtensionRequest: "/enquiries",
  Task: "/dashboard",
  StaffAccount: "/administration",
};

/** null: this role is not served the feed, so it gets no bell. */
export async function recentNotifications(): Promise<{ items: Notification[]; canOpenAdministration: boolean } | null> {
  const actor = await currentStaff();
  if (!actor || !can(actor.role, "AUDIT_VIEW", actor.extraPermissions)) return null;
  // /administration needs STAFF_MANAGE; AUDIT_VIEW alone (an extra) would land on a refusal.
  const canOpenAdministration = can(actor.role, "STAFF_MANAGE", actor.extraPermissions);
  const rows = await db.auditEvent.findMany({
    where: {
      actorRef: { not: actor.staffAccountId },
      // Who looked at what, and who was refused, is security history rather
      // than news; it stays in Activity History.
      NOT: [{ action: { contains: "REVEAL" } }, { action: { endsWith: "_DENIED" } }, { action: { contains: "PASSWORD" } }],
    },
    orderBy: { at: "desc" },
    take: 30,
  });
  // A commission line is worked from its Booking, or its Buyback / Resale deal;
  // a Recovery from the owing person's own page. (The /rewards page that used
  // to catch both was removed, 11 Nov 2026.)
  const idsOf = (entity: string) => rows.filter((r) => r.entity === entity).map((r) => r.entityId);
  const [commissionRows, recoveryRows] = await Promise.all([
    db.commissionRecord.findMany({
      where: { id: { in: idsOf("CommissionRecord") } },
      select: { id: true, bookingId: true, acquisitionId: true },
    }),
    db.recovery.findMany({ where: { id: { in: idsOf("Recovery") } }, select: { id: true, personId: true } }),
  ]);
  const commission = new Map(commissionRows.map((c) => [c.id, c]));
  const recoveryPerson = new Map(recoveryRows.map((r) => [r.id, r.personId]));
  const hrefOf = (entity: string, id: string): string | null => {
    if (entity === "CommissionRecord") {
      const c = commission.get(id);
      if (c?.bookingId) return `/bookings/${c.bookingId}`;
      return c?.acquisitionId ? `/acquisitions/${c.acquisitionId}` : null;
    }
    if (entity === "Recovery") {
      const personId = recoveryPerson.get(id);
      return personId ? `/people/${personId}` : null;
    }
    if (entity === "StaffAccount" && !canOpenAdministration) return null;
    return RECORD_PAGE[entity]?.(id) ?? LIST_PAGE[entity] ?? null;
  };
  const items = rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    actorRef: r.actorRef,
    action: r.action,
    entity: r.entity,
    reason: r.reason,
    href: hrefOf(r.entity, r.entityId),
  }));
  return { items, canOpenAdministration };
}
