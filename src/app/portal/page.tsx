// Member portal — design.md §13, prd-corrections.md §23.
// Only this Member's own records. No buyer identity beyond the people this
// Member introduced, no Aadhaar/PAN/bank, no internal Accounts remarks.

import { db } from "@/lib/db";
import { tripOfMember } from "@/lib/trip-view";
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
        invitedMembers: { include: { person: true }, orderBy: { activationDate: "asc" } },
        royaltyLinkedCustomers: {
          select: { royaltyLinkFinalAt: true, royaltyOpportunityConsumedAt: true },
          orderBy: { royaltyLinkFinalAt: "asc" },
        },
        // SSOT §102; CP §70 — the Member's own Royalty Credits, non-cash, no Customer identity.
        royaltyCredits: {
          where: { state: { not: "REVERSED" } },
          include: { programmeVersion: { select: { programmeRef: true, version: true, catalogueVersion: true } } },
          orderBy: { eligibleAt: "desc" },
        },
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
    invitedMembers: profile.invitedMembers.map((m) => ({
      memberId: m.memberId,
      name: m.person.fullName,
      status: m.status,
      activationDate: m.activationDate?.toISOString() ?? null,
    })),
    // PRD §23.1, v2.1 §69 — the Member sees only how many Royalty
    // relationships they hold and whether each is final, never the Customer.
    royaltyLinkedCustomers: profile.royaltyLinkedCustomers.map((c) => ({
      final: c.royaltyLinkFinalAt !== null,
      // SSOT §74 — one Gift per Customer: whether this relationship can still earn it.
      opportunityOpen: c.royaltyLinkFinalAt !== null && c.royaltyOpportunityConsumedAt === null,
    })),
    // SSOT §102; CP §70 — Trip progress per Project, privacy-safe.
    trip: (await tripOfMember(member.memberProfileId)).map((p) => ({
      project: p.project,
      code: p.code,
      open: p.open,
      rules: p.rules,
      pendingOwn: p.pendingOwn,
      qualifiedOwn: p.qualifiedOwn,
      qualifiedReference: p.qualifiedReference,
      held: p.held,
      nearestExpiry: p.nearestExpiry,
      rewards: p.rewards.map((r) => ({
        state: r.state,
        holdReason: r.holdReason,
        earnedAt: r.earnedAt,
        travelledAt: r.travelledAt,
      })),
    })),
    // CP §70 — state, Programme Version, chosen Gift and fulfilment; never the Customer.
    royaltyCredits: profile.royaltyCredits.map((c) => ({
      state: c.state,
      holdReason: c.holdReason,
      programmeRef: c.programmeVersion.programmeRef,
      programmeVersion: c.programmeVersion.version,
      catalogueVersion: c.programmeVersion.catalogueVersion,
      route: c.qualificationRoute,
      selectedRewardRef: c.selectedRewardRef,
      recipient: c.recipient,
      eligibleAt: c.eligibleAt.toISOString(),
      orderedAt: c.orderedAt?.toISOString() ?? null,
      deliveredAt: c.deliveredAt?.toISOString() ?? null,
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
