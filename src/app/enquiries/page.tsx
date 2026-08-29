// Enquiries — DESIGN.md §8.

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { maskMobile } from "@/lib/security/identity";
import EnquiriesClient, { type EnquiryRowView } from "./enquiries-client";

export const dynamic = "force-dynamic";

export default async function EnquiriesPage() {
  const actor = await requireStaff();

  const [enquiries, projects, plots, people, members, customers, staff] = await Promise.all([
    db.enquiry.findMany({
      include: {
        person: true,
        project: true,
        plot: true,
        sourceMember: { include: { person: true } },
        assignedStaff: { include: { person: true } },
        followUps: { orderBy: { at: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.project.findMany({ orderBy: { name: "asc" } }),
    db.plot.findMany({
      select: { id: true, plotNumber: true, plotType: true, projectId: true },
      orderBy: { plotNumber: "asc" },
      take: 500,
    }),
    db.person.findMany({
      where: { mergeStatus: { not: "MERGED_AWAY" } },
      select: { id: true, fullName: true, primaryMobile: true, city: true },
      orderBy: { fullName: "asc" },
      take: 300,
    }),
    db.memberProfile.findMany({
      where: { status: "ACTIVE" },
      include: { person: true },
      orderBy: { memberId: "asc" },
    }),
    // A By Customer Enquiry names the Customer who sourced it (main-PRD §9.2).
    db.customerProfile.findMany({
      include: { person: true },
      orderBy: { customerId: "asc" },
      take: 300,
    }),
    // Assigned CRM (DESIGN §8.2). Only the roles that carry an Enquiry
    // follow-up task appear, so the picker cannot create an unworkable task.
    db.staffAccount.findMany({
      where: { status: "ACTIVE", role: { in: ["CRM", "ADMIN", "MD"] } },
      include: { person: true },
      orderBy: { staffAccountId: "asc" },
    }),
  ]);

  const rows: EnquiryRowView[] = enquiries.map((e) => ({
    id: e.id,
    enquiryNo: e.enquiryNo,
    name: e.person.fullName,
    personId: e.personId,
    // Contact numbers are masked in list views by default (DESIGN §2.6).
    mobileMasked: maskMobile(e.person.primaryMobile),
    city: e.person.city ?? "—",
    project: e.project.name,
    plot: e.plot ? `${e.plot.plotType.replaceAll("_", " ")} ${e.plot.plotNumber}` : "General",
    source: e.source,
    sourceMember: e.sourceMember ? `${e.sourceMember.memberId} · ${e.sourceMember.person.fullName}` : null,
    sourceMemberPersonId: e.sourceMember?.personId ?? null,
    status: e.status,
    closeReason: e.closeReason,
    assignedTo: e.assignedStaff?.person.fullName ?? "Unassigned",
    lastOutcome: e.followUps[0]?.outcome ?? null,
    nextFollowUpAt: e.followUps[0]?.nextAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <EnquiriesClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      rows={rows}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      plots={plots.map((p) => ({
        id: p.id,
        projectId: p.projectId,
        label: `${p.plotType.replaceAll("_", " ")} ${p.plotNumber}`,
      }))}
      people={people.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        mobileMasked: maskMobile(p.primaryMobile),
      }))}
      members={members.map((m) => ({ id: m.id, label: `${m.memberId} · ${m.person.fullName}` }))}
      customers={customers.map((c) => ({ id: c.id, label: `${c.customerId} · ${c.person.fullName}` }))}
      staff={staff.map((s) => ({
        id: s.id,
        label: `${s.person.fullName} · ${s.role}`,
        isSelf: s.id === actor.accountId,
      }))}
      canManage={can(actor.role, "ENQUIRY_MANAGE")}
    />
  );
}
