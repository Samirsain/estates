// Administration — PRD.md §17.2, §21, §22; DESIGN.md §17.

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can, canViewField } from "@/lib/security/permissions";
import { maskMobile } from "@/lib/security/identity";
import AdministrationClient from "./administration-client";

export const dynamic = "force-dynamic";

export default async function AdministrationPage() {
  const actor = await requireStaff("STAFF_MANAGE");

  const [staff, queuedTasks, queuedEnquiries, merges, recentAudit, securityEvents] = await Promise.all([
    db.staffAccount.findMany({
      include: { person: true, _count: { select: { assignedTasks: true, assignedEnquiries: true } } },
      orderBy: [{ status: "asc" }, { staffAccountId: "asc" }],
    }),
    db.task.findMany({
      where: { needsReassignment: true, status: "PENDING" },
      orderBy: { dueAt: "asc" },
      take: 100,
    }),
    db.enquiry.findMany({
      where: { needsReassignment: true, status: "ACTIVE" },
      include: { person: true, project: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    db.personMergeRequest.findMany({
      include: { survivingPerson: true, mergedPerson: true },
      orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
      take: 50,
    }),
    can(actor.role, "AUDIT_VIEW", actor.extraPermissions)
      ? db.auditEvent.findMany({ orderBy: { at: "desc" }, take: 50 })
      : Promise.resolve([]),
    can(actor.role, "AUDIT_VIEW", actor.extraPermissions)
      ? db.securityEvent.findMany({ orderBy: { at: "desc" }, take: 100 })
      : Promise.resolve([]),
  ]);

  return (
    <AdministrationClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      canEmergencyDisable={can(actor.role, "STAFF_EMERGENCY_DISABLE", actor.extraPermissions)}
      canReassign={can(actor.role, "WORK_REASSIGN", actor.extraPermissions)}
      canMerge={can(actor.role, "PERSON_MERGE", actor.extraPermissions)}
      canRevealIdentity={canViewField(actor.role, "AADHAAR_FULL")}
      staff={staff.map((account) => ({
        id: account.id,
        staffAccountId: account.staffAccountId,
        name: account.person.fullName,
        mobileMasked: maskMobile(account.person.primaryMobile),
        role: account.role,
        status: account.status,
        emergencyDisabled: account.emergencyDisabled,
        disabledAt: account.disabledAt?.toISOString() ?? null,
        disabledReason: account.disabledReason,
        lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
        openTasks: account._count.assignedTasks,
        openEnquiries: account._count.assignedEnquiries,
      }))}
      queuedTasks={queuedTasks.map((task) => ({
        id: task.id,
        taskNo: task.taskNo,
        title: task.title,
        recordName: task.recordName,
        dueAt: task.dueAt.toISOString(),
      }))}
      queuedEnquiries={queuedEnquiries.map((enquiry) => ({
        id: enquiry.id,
        enquiryNo: enquiry.enquiryNo,
        person: enquiry.person.fullName,
        project: enquiry.project.name,
      }))}
      merges={merges.map((merge) => ({
        id: merge.id,
        status: merge.status,
        survivor: merge.survivingPerson.fullName,
        survivorMobile: maskMobile(merge.survivingPerson.primaryMobile),
        survivorCity: merge.survivingPerson.city ?? "—",
        merged: merge.mergedPerson.fullName,
        mergedMobile: maskMobile(merge.mergedPerson.primaryMobile),
        mergedCity: merge.mergedPerson.city ?? "—",
        reason: merge.reason,
        requestedByRef: merge.requestedByRef,
        requestedAt: merge.requestedAt.toISOString(),
        decidedByRef: merge.decidedByRef,
        loyaltyRebuiltTo: merge.loyaltyRebuiltTo,
      }))}
      audit={recentAudit.map((event) => ({
        id: event.id,
        at: event.at.toISOString(),
        actorRef: event.actorRef,
        actorRole: event.actorRole,
        entity: event.entity,
        entityId: event.entityId,
        action: event.action,
        reason: event.reason,
      }))}
      securityLogs={securityEvents.map((event) => ({
        id: event.id,
        at: event.at.toISOString(),
        type: event.type,
        identifier: event.identifier ?? "—",
        ip: event.ip ?? "—",
        detail: event.detail ?? "—",
      }))}
    />
  );
}
