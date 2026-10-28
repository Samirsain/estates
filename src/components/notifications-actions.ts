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
  Recovery: "/rewards?tab=recovery",
  Task: "/dashboard",
  StaffAccount: "/administration",
};

/** null: this role is not served the feed, so it gets no bell. */
export async function recentNotifications(): Promise<Notification[] | null> {
  const actor = await currentStaff();
  if (!actor || !can(actor.role, "AUDIT_VIEW", actor.extraPermissions)) return null;
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
  // A commission line is worked from its Booking.
  const commission = new Map(
    (
      await db.commissionRecord.findMany({
        where: { id: { in: rows.filter((r) => r.entity === "CommissionRecord").map((r) => r.entityId) } },
        select: { id: true, bookingId: true },
      })
    ).map((c) => [c.id, c.bookingId])
  );
  const hrefOf = (entity: string, id: string): string | null => {
    if (entity === "CommissionRecord") {
      const bookingId = commission.get(id);
      return bookingId ? `/bookings/${bookingId}` : "/rewards?tab=monetary";
    }
    return RECORD_PAGE[entity]?.(id) ?? LIST_PAGE[entity] ?? null;
  };
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    actorRef: r.actorRef,
    action: r.action,
    entity: r.entity,
    reason: r.reason,
    href: hrefOf(r.entity, r.entityId),
  }));
}
