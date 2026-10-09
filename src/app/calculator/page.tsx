// Plot Rate & Area Calculator — a calculation utility, not a ledger.
//
// PRD §1.2 and prd-complete §1: the CRM stores no deal value, rate or rupee amount,
// and no rupee column exists in the schema. Nothing here writes anything. This
// page reads Projects, Plots and the published PLC version the Plot Inventory
// already reads, hands them to the browser, and the arithmetic happens there.
// There is no server action, no model and no migration behind this screen.
//
// Two sources feed the commission side, and they are kept apart on purpose:
//
//   • A Plot that has been sold carries its Booking's own frozen commission
//     records, and those arrive filled in, with the eligibility and payment
//     state the engine already decided (PRD §6.9, §14.8).
//   • A Plot that has not been sold has nobody to name, so the lines are added
//     by hand — which is the point: who would earn what is asked before a
//     Booking exists.
//
// Either way the entitlement facts travel with the people: the Member's status
// and RERA, the Customer closer's KYC, Terms and lifetime Customer-closing
// Loyalty count, Aadhaar and a verified bank. Those are what decide whether a
// commission is payable at all (v2.1 §19–§25; PRD §14.7, §19.5), so the screen
// shows them rather than leaving the reader to look each one up. The rates are
// the selected Project's approved commission settings (v2.1 §12).

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { buildPlcSnapshot, locationChargeLabel } from "@/lib/domain/inventory";
import { personLabel } from "@/lib/domain/person-search";
import { maskMobile } from "@/lib/security/identity";
import { plcRules } from "@/lib/services/plc-service";
import { CUSTOMER_CLOSING_LOYALTY_LIMIT, DIRECT_MILESTONE, FULL_MILESTONE } from "@/lib/domain/commission";
import { closingLoyaltyUsed, termsOf } from "@/lib/services/commission-service";
import CalculatorClient, {
  type CalcCommissionTypeView,
  type CalcDealRecordView,
  type CalcPersonView,
  type CalcPlotView,
  type CalcProjectView,
} from "./calculator-client";

export const dynamic = "force-dynamic";

/** A Booking that has been rejected or cancelled is not a deal on the Plot. */
const LIVE_BOOKING: Prisma.EnumBookingStatusFilter = {
  notIn: ["REQUEST_REJECTED", "REQUEST_CANCELLED", "CANCELLED"],
};

export default async function CalculatorPage({
  searchParams,
}: {
  /** ?plot=<id> from a Plot's own page opens the calculator on that Plot. */
  searchParams: Promise<{ plot?: string }>;
}) {
  const { plot: initialPlotId } = await searchParams;
  // The gate is server-side and it is the whole gate: hiding the nav item is
  // never the control (DESIGN §1). REPORT_VIEW is the existing permission every
  // staff role holds and no Member does — the calculator shows Plot dimensions
  // the Plot Inventory already shows, so it needs no Action of its own.
  const actor = await requireStaff("REPORT_VIEW");

  const [projects, plots, people, records, verifiedBanks, purchases] =
    await Promise.all([
      db.project.findMany({
        include: {
          plcRuleVersions: {
            where: { status: "PUBLISHED" },
            include: { components: true },
            take: 1,
          },
          // v2.1 §12 — the rates a new sale on this Project would freeze.
          commissionVersions: { where: { status: "ACTIVE" }, take: 1 },
        },
        orderBy: { name: "asc" },
      }),
      db.plot.findMany({
        include: { boundaries: true },
        orderBy: [{ plotType: "asc" }, { plotNumber: "asc" }],
        take: 1000,
      }),
      // The same list every other picker screen ships, plus the facts that decide
      // a commission. Nobody is invented here: a beneficiary is a Person on file.
      db.person.findMany({
        where: { mergeStatus: { not: "MERGED_AWAY" } },
        select: {
          id: true,
          fullName: true,
          primaryMobile: true,
          aadhaarStatus: true,
          customerProfile: {
            select: {
              customerId: true,
              // v2.1 §22 — a Customer closer needs accepted Customer Terms.
              termsAcceptances: { select: { id: true }, take: 1 },
            },
          },
          memberProfile: {
            select: {
              memberId: true,
              status: true,
              reraStatus: true,
              commissionHold: true,
            },
          },
        },
        orderBy: { fullName: "asc" },
        take: 300,
      }),
      /*
       * The commission a sold Plot already carries.
       *
       * These are the current, non-superseded CommissionRecord rows the engine
       * produced for the Booking (PRD §6.9) — the calculator reads them and does
       * not re-derive who earns what. They carry a percentage and no rupee value
       * (PRD §6, prd-complete §1.2), which is exactly what a percentage is for: the
       * screen applies it to the figure the user calculated, and the result is
       * never written back.
       */
      db.commissionRecord.findMany({
        where: { isCurrent: true, booking: { status: LIVE_BOOKING } },
        include: {
          beneficiaryPerson: {
            select: {
              id: true,
              fullName: true,
              memberProfile: { select: { memberId: true } },
              customerProfile: { select: { customerId: true } },
            },
          },
          booking: {
            select: {
              plotId: true,
              bookingNumber: true,
              requestNo: true,
              status: true,
              soldByType: true,
              soldByPersonId: true,
              primaryPersonId: true,
              paymentReceivedPercent: true,
              soldByPerson: { select: { fullName: true } },
            },
          },
        },
        orderBy: { type: "asc" },
      }),
      // One query rather than a verified-bank lookup per Person (PRD §14.4).
      db.bankDetail.findMany({
        where: { status: "VERIFIED" },
        select: { personId: true },
        distinct: ["personId"],
      }),
      /*
       * PRD §14.5 — "first personal purchase receives no repeat-purchase
       * Loyalty", so the engine needs to know whether a buyer already owns one.
       * commissionInputFor() asks the same question of a real Booking and adds
       * "submitted before this one"; a sale that does not exist yet has no such
       * anchor, so any approved, uncancelled Booking counts.
       */
      db.booking.groupBy({
        by: ["primaryPersonId"],
        where: { bookingNumber: { not: null }, status: LIVE_BOOKING },
        _count: { _all: true },
      }),
    ]);

  const banked = new Set(verifiedBanks.map((b) => b.personId));
  const bought = new Set(purchases.map((b) => b.primaryPersonId));
  const closing = await closingLoyaltyUsed(people.map((p) => p.id));

  const peopleRows: CalcPersonView[] = people.map((p) => {
    const member = p.memberProfile;
    const customer = p.customerProfile;
    return {
      id: p.id,
      label: personLabel({
        fullName: p.fullName,
        mobileMasked: maskMobile(p.primaryMobile),
        customerId: customer?.customerId ?? null,
        memberId: member?.memberId ?? null,
      }),
      name: p.fullName,
      // PRD §14.7 — the commission condition is Aadhaar Available, and Verified
      // satisfies it too. PAN never creates an automatic hold.
      aadhaarAvailable: p.aadhaarStatus !== "PENDING",
      // v2.1 §22, §77 — the stricter KYC a Customer closer needs.
      aadhaarVerified: p.aadhaarStatus === "VERIFIED",
      bankVerified: banked.has(p.id),
      hasPriorPurchase: bought.has(p.id),
      member: member
        ? {
            memberId: member.memberId,
            status: member.status,
            reraStatus: member.reraStatus,
            commissionHold: member.commissionHold,
          }
        : null,
      customer: customer
        ? {
            customerId: customer.customerId,
            termsAccepted: customer.termsAcceptances.length > 0,
            closingLoyaltyUsed: closing.get(p.id) ?? 0,
          }
        : null,
    };
  });

  const dealByPlot = new Map<string, CalcDealRecordView[]>();
  for (const record of records) {
    const booking = record.booking;
    if (!booking) continue; // Buying Commission hangs off an Acquisition.
    const person = record.beneficiaryPerson;
    const list = dealByPlot.get(booking.plotId) ?? [];
    list.push({
      personId: person.id,
      personName: person.fullName,
      personRef: person.memberProfile?.memberId ?? person.customerProfile?.customerId ?? null,
      type: record.type,
      beneficiaryRole: record.beneficiaryRole,
      percent: record.percent.toFixed(4),
      milestonePercent: record.milestonePercent.toFixed(0),
      eligibility: record.eligibility,
      holdReason: record.holdReason,
      payment: record.payment,
      bookingRef: booking.bookingNumber ?? booking.requestNo,
      bookingStatus: booking.status,
      soldBy: booking.soldByPerson?.fullName ?? "3% Club",
      soldByType: booking.soldByType,
      soldByPersonId: booking.soldByPersonId,
      buyerPersonId: booking.primaryPersonId,
      paymentReceivedPercent: booking.paymentReceivedPercent.toFixed(2),
    });
    dealByPlot.set(booking.plotId, list);
  }

  // PLC spec §15.2 — the effective PLC is derived on read from the published
  // version, exactly as the Plot Inventory derives it. The calculator shows the
  // same number rather than deriving a second one.
  const published = new Map(projects.map((p) => [p.id, p.plcRuleVersions[0] ?? null]));

  const plotRows: CalcPlotView[] = plots.map((plot) => {
    const version = published.get(plot.projectId) ?? null;
    let plcPercent: string | null = null;
    let plcIssue: string | null = version ? null : "No published PLC version for this Project";

    if (version) {
      try {
        const effective = buildPlcSnapshot(
          plot.boundaries.map((b) => ({
            side: b.side,
            kind: b.kind,
            roadWidthFt: b.roadWidthFt?.toString(),
          })),
          plcRules(version.components)
        );
        plcPercent = effective.totalPercent.toFixed(4);
      } catch (error) {
        plcIssue = error instanceof Error ? error.message : "PLC could not be derived.";
      }
    }

    return {
      id: plot.id,
      projectId: plot.projectId,
      plotNumber: plot.plotNumber,
      plotType: plot.plotType,
      status: plot.status,
      widthFt: plot.widthFt?.toString() ?? "",
      lengthFt: plot.lengthFt?.toString() ?? "",
      // An irregular Plot carries an exact area and a compulsory reason instead
      // of sides (PRD §23.1). The calculator charges against that area and
      // leaves the stored width and length alone.
      exactAreaSqFt: plot.exactAreaSqFt?.toString() ?? "",
      exactAreaReason: plot.exactAreaReason ?? "",
      storedAreaSqFt: plot.areaSqFt.toString(),
      // What the Plot faces, in the words the Booking screens and the Plot's
      // own page use — "NORTH-EAST CORNER · PARK FACING" — rather than the PLC
      // component names, which say what is charged and not where it sits.
      locationCharge: locationChargeLabel(
        plot.boundaries.map((b) => ({ side: b.side, kind: b.kind }) as never)
      ),
      plcPercent,
      plcIssue,
      deal: dealByPlot.get(plot.id) ?? null,
    };
  });

  /*
   * v2.1 §11 — the two sale-commission components. A sale earns one or the
   * other, never both. The rate is the selected Project's approved version; the
   * milestone is the engine's own constant.
   */
  const commissionTypes: CalcCommissionTypeView[] = [
    {
      type: "DIRECT",
      label: "Direct Commission",
      milestonePercent: DIRECT_MILESTONE,
      note: "to the selling Member at 25% paid, or to a Member buying for themselves at 100%",
    },
    {
      type: "LOYALTY",
      label: "Customer Loyalty",
      milestonePercent: FULL_MILESTONE,
      note:
        `to the closing Customer (${CUSTOMER_CLOSING_LOYALTY_LIMIT} for life), or to the buyer on a ` +
        "3% Club repeat purchase",
    },
  ];

  const projectRows: CalcProjectView[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    projectCode: p.projectCode,
    city: p.city,
    location: p.location,
    terms: p.commissionVersions[0] ? termsOf(p.commissionVersions[0]) : null,
  }));

  return (
    <CalculatorClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      projects={projectRows}
      plots={plotRows}
      people={peopleRows}
      commissionTypes={commissionTypes}
      initialPlotId={plotRows.some((p) => p.id === initialPlotId) ? (initialPlotId ?? null) : null}
    />
  );
}
