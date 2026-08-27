// Member portal — DESIGN.md §13, PRD.md §23.
// Only this Member's own records. No buyer identity beyond the people this
// Member introduced, no Aadhaar/PAN/bank, no internal Accounts remarks.

import { db } from "@/lib/db";
import { requireMember } from "@/lib/security/current-actor";
import { maskMobile } from "@/lib/security/identity";
import { experienceSince } from "@/lib/domain/commission";
import { memberCommissionView } from "@/lib/services/commission-service";
import PortalClient, { type PortalData } from "./portal-client";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const member = await requireMember();

  const [profile, availablePlots, ownEnquiries, ownRequests, commissions] = await Promise.all([
    db.memberProfile.findUniqueOrThrow({
      where: { id: member.memberProfileId },
      include: {
        person: true,
        invitedByMember: { include: { person: true } },
        invitedMembers: { include: { person: true }, orderBy: { invitePosition: "asc" } },
        introducedCustomers: { orderBy: { introducedPosition: "asc" } },
      },
    }),
    db.plot.findMany({
      // PRD §16.1 — a Project still in Setup / Not Active accepts no Hold, so
      // its Plots are not offered here either.
      where: {
        status: "AVAILABLE",
        restriction: "NONE",
        project: { status: { not: "SETUP_NOT_ACTIVE" } },
      },
      include: { project: true },
      orderBy: [{ project: { name: "asc" } }, { plotNumber: "asc" }],
      take: 200,
    }),
    db.enquiry.findMany({
      where: { sourceMemberId: member.memberProfileId },
      include: { person: true, project: true, plot: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.holdRequest.findMany({
      where: { memberId: member.memberProfileId },
      include: { plot: { include: { project: true } }, person: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    // PRD §23.1 — the view is built by the service, which selects only the
    // Member-safe columns. No buyer identity ever reaches this page.
    memberCommissionView(member.personId),
  ]);

  const data: PortalData = {
    memberId: profile.memberId,
    name: profile.person.fullName,
    activationDate: profile.activationDate?.toISOString() ?? null,
    experience: experienceSince(profile.activationDate)?.label ?? null,
    invitedBy: profile.invitedByMember
      ? `${profile.invitedByMember.memberId} · ${profile.invitedByMember.person.fullName}`
      : null,
    invitePosition: profile.invitePosition,
    inviteRatePercent: profile.inviteRatePercent?.toFixed(3) ?? null,
    invitedMembers: profile.invitedMembers.map((m) => ({
      memberId: m.memberId,
      name: m.person.fullName,
      position: m.invitePosition,
      ratePercent: m.inviteRatePercent?.toFixed(2) ?? null,
      status: m.status,
      activationDate: m.activationDate?.toISOString() ?? null,
    })),
    // PRD §23.1 / DESIGN §13.2 — the Member sees their own introduced positions
    // and bands, never the Customer's name or Customer ID.
    introducedCustomers: profile.introducedCustomers.map((c) => ({
      position: c.introducedPosition,
      ratePercent: c.introducedRatePercent?.toFixed(2) ?? null,
      loyaltySlotsConsumed: c.loyaltySlotsConsumed,
    })),
    projects: [...new Map(availablePlots.map((p) => [p.projectId, p.project.name])).entries()].map(
      ([id, name]) => ({ id, name })
    ),
    plots: availablePlots.map((p) => ({
      id: p.id,
      projectId: p.projectId,
      project: p.project.name,
      label: `${p.plotType.replaceAll("_", " ")} ${p.plotNumber}`,
      areaSqYd: p.areaSqYd.toFixed(2),
    })),
    // People this Member may request a Hold for: themselves, plus buyers they
    // introduced. No other Person appears anywhere in the portal.
    buyers: [
      { id: member.personId, label: `${profile.person.fullName} (myself)` },
      ...[
        ...new Map(
          ownEnquiries.map((e) => [
            e.personId,
            `${e.person.fullName} · ${maskMobile(e.person.primaryMobile)}`,
          ])
        ).entries(),
      ]
        .filter(([id]) => id !== member.personId)
        .map(([id, label]) => ({ id, label })),
    ],
    enquiries: ownEnquiries.map((e) => ({
      enquiryNo: e.enquiryNo,
      buyer: e.person.fullName,
      mobileMasked: maskMobile(e.person.primaryMobile),
      project: e.project.name,
      plot: e.plot ? `${e.plot.plotType.replaceAll("_", " ")} ${e.plot.plotNumber}` : "General",
      status: e.status,
      createdAt: e.createdAt.toISOString(),
    })),
    holdRequests: ownRequests.map((r) => ({
      id: r.id,
      project: r.plot.project.name,
      plot: `${r.plot.plotType.replaceAll("_", " ")} ${r.plot.plotNumber}`,
      buyer: r.person.fullName,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      // Member-safe: the decision remark is shown, internal Accounts notes are not.
      decisionNote: r.status === "PENDING" ? null : r.decisionNote,
    })),
    commissions,
  };

  return <PortalClient data={data} />;
}
