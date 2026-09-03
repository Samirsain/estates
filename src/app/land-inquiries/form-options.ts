// The options the Land Inquiry form needs, loaded once on the server.
//
// Member and Customer pickers reuse the project's own person label and search
// (spec §26.5). The capability is still re-checked when the inquiry is saved:
// this list is a convenience, not the authorisation.

import { db } from "@/lib/db";
import { personLabel } from "@/lib/domain/person-search";
import { maskMobile } from "@/lib/security/identity";
import { searchLandInquirySourcePeople } from "@/lib/services/land-inquiry-service";
import type { FormOptions } from "./land-inquiry-form";

export async function loadFormOptions(): Promise<FormOptions> {
  const [members, customers, staff] = await Promise.all([
    searchLandInquirySourcePeople("MEMBER"),
    searchLandInquirySourcePeople("CUSTOMER"),
    db.staffAccount.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, staffAccountId: true, role: true, person: { select: { fullName: true } } },
      orderBy: { staffAccountId: "asc" },
    }),
  ]);

  return {
    members: members.map((p) => ({
      id: p.id,
      label: personLabel(
        {
          fullName: p.fullName,
          mobileMasked: maskMobile(p.primaryMobile),
          memberId: p.memberProfile?.memberId ?? null,
          customerId: p.customerProfile?.customerId ?? null,
        },
        "MEMBER"
      ),
    })),
    customers: customers.map((p) => ({
      id: p.id,
      label: personLabel({
        fullName: p.fullName,
        mobileMasked: maskMobile(p.primaryMobile),
        memberId: p.memberProfile?.memberId ?? null,
        customerId: p.customerProfile?.customerId ?? null,
      }),
    })),
    staff: staff.map((s) => ({
      id: s.id,
      label: `${s.staffAccountId} · ${s.person.fullName} · ${s.role}`,
    })),
  };
}

/** A stored inquiry, back in the shape the form edits. */
export function toFormInput(
  inquiry: NonNullable<Awaited<ReturnType<typeof import("@/lib/services/land-inquiry-service").getLandInquiry>>>
): import("@/lib/services/land-inquiry-service").LandInquiryInput {
  // A Decimal prints its full stored precision, which is exactly what should
  // go back into the box: the form must not quietly round what was recorded.
  const num = (value: { toString(): string } | null) => value?.toString() ?? "";
  return {
    receivedFrom: inquiry.receivedFrom,
    sourcePersonId: inquiry.sourcePersonId,
    anotherDealerMobile: inquiry.anotherDealerMobile,
    assignedToId: inquiry.assignedToId,
    district: inquiry.district ?? "",
    tehsil: inquiry.tehsil ?? "",
    exactLocation: inquiry.exactLocation ?? "",
    latitude: num(inquiry.latitude),
    longitude: num(inquiry.longitude),
    areaBigha: num(inquiry.areaBigha),
    areaBiswa: num(inquiry.areaBiswa),
    areaSourceUnit: inquiry.areaSourceUnit ?? "SQ_M",
    areaSourceValue: num(inquiry.areaSourceValue),
    dimensions: inquiry.dimensions ?? "",
    frontageValue: num(inquiry.frontageValue),
    frontageUnit: inquiry.frontageUnit ?? "FT",
    roadWidthValue: num(inquiry.roadWidthValue),
    roadWidthUnit: inquiry.roadWidthUnit ?? "FT",
    shape: inquiry.shape ?? "",
    boundaries: inquiry.boundaries ?? "",
    landCategory: inquiry.landCategory,
    currentLandUse: inquiry.currentLandUse ?? "",
    masterPlanZonalUse: inquiry.masterPlanZonalUse ?? "",
    status90A: inquiry.status90A,
    landConversionStatus: inquiry.landConversionStatus,
    changeLandUseStatus: inquiry.changeLandUseStatus,
    pattaLeaseStatus: inquiry.pattaLeaseStatus,
    registrySaleDeedAvailable: inquiry.registrySaleDeedAvailable,
    mutationComplete: inquiry.mutationComplete,
    mortgageBankCharge: inquiry.mortgageBankCharge,
    courtCaseStay: inquiry.courtCaseStay,
    familyDispute: inquiry.familyDispute,
    acquisitionNotice: inquiry.acquisitionNotice,
    governmentRestriction: inquiry.governmentRestriction,
    approachRoad: inquiry.approachRoad,
    roadType: inquiry.roadType ?? "",
    electricity: inquiry.electricity,
    water: inquiry.water,
    sewerage: inquiry.sewerage,
    existingConstruction: inquiry.existingConstruction,
    encroachment: inquiry.encroachment,
    possessionStatus: inquiry.possessionStatus ?? "",
    ownerAskingRate: num(inquiry.ownerAskingRate),
    ownerAskingRateBasis: inquiry.ownerAskingRateBasis,
    totalAskingValue: num(inquiry.totalAskingValue),
    negotiable: inquiry.negotiable,
    dlcRate: num(inquiry.dlcRate),
    dlcRateBasis: inquiry.dlcRateBasis,
    expectedPurchaseRate: num(inquiry.expectedPurchaseRate),
    expectedPurchaseRateBasis: inquiry.expectedPurchaseRateBasis,
    paymentExpectation: inquiry.paymentExpectation ?? "",
    developmentPotential: inquiry.developmentPotential,
    documentsReceived: inquiry.documentsReceived,
    evaluation: inquiry.evaluation,
    owners: inquiry.owners.map((o) => ({
      ownerName: o.ownerName,
      mobile: o.mobile ?? "",
      isPrimary: o.isPrimary,
    })),
    jamabandiEntries: inquiry.jamabandiEntries.map((j) => ({
      murbbaNo: j.murbbaNo ?? "",
      patharNo: j.patharNo ?? "",
      khasraNo: j.khasraNo ?? "",
    })),
  };
}
