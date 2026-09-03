// Land Inquiry service — Land Inquiry spec §26.
//
// Pre-acquisition land sourcing. Reads are plain queries; every write goes
// through `runCommand`, which already gives this module the two things the
// spec asks for by name: an idempotent submission key and an append-only audit
// event with actor, before, after and reason.
//
// Nothing here touches Booking, Payment, Commission, payout or refund. The
// rupee fields are inquiry and negotiation information and stay inside this
// module (spec §0).

import { Prisma } from "@prisma/client";
import type {
  LandApprovalStatus,
  LandCategory,
  LandCheckState,
  LandDevelopmentPotential,
  LandDocumentType,
  LandEvaluationType,
  LandInquiryReceivedFrom,
  LandInquiryStage,
  LandInquiryStatus,
  LandMetricSourceUnit,
  LandRateBasis,
  LinearUnit,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  isPositiveDecimal,
  mapPinError,
  normaliseJamabandi,
  normaliseMobile,
  normaliseOwners,
  ownerError,
  parseAmount,
  planReopen,
  planStageChange,
  rateError,
  toSquareMetres,
  validateReceivedFrom,
  type JamabandiRow,
  type OwnerRow,
} from "@/lib/domain/land-inquiry";
import { istDay } from "@/lib/tasks";
import { blocked, nextReference, runCommand, type Tx } from "./command";

const D = Prisma.Decimal;

/** Everything the create and update forms send. Strings throughout: the form
 *  gives strings, and money must never pass through a JavaScript float. */
export type LandInquiryInput = {
  receivedFrom: LandInquiryReceivedFrom;
  sourcePersonId: string | null;
  anotherDealerMobile: string | null;
  assignedToId: string | null;

  district: string;
  tehsil: string;
  exactLocation: string;
  latitude: string;
  longitude: string;

  areaBigha: string;
  areaBiswa: string;
  /** The metric unit the user actually typed in, with its value. */
  areaSourceUnit: LandMetricSourceUnit | null;
  areaSourceValue: string;

  dimensions: string;
  frontageValue: string;
  frontageUnit: LinearUnit | null;
  roadWidthValue: string;
  roadWidthUnit: LinearUnit | null;
  shape: string;
  boundaries: string;

  landCategory: LandCategory | null;
  currentLandUse: string;
  masterPlanZonalUse: string;

  status90A: LandApprovalStatus;
  landConversionStatus: LandApprovalStatus;
  changeLandUseStatus: LandApprovalStatus;
  pattaLeaseStatus: LandApprovalStatus;

  registrySaleDeedAvailable: LandCheckState;
  mutationComplete: LandCheckState;
  mortgageBankCharge: LandCheckState;
  courtCaseStay: LandCheckState;
  familyDispute: LandCheckState;
  acquisitionNotice: LandCheckState;
  governmentRestriction: LandCheckState;

  approachRoad: LandCheckState;
  roadType: string;
  electricity: LandCheckState;
  water: LandCheckState;
  sewerage: LandCheckState;
  existingConstruction: LandCheckState;
  encroachment: LandCheckState;
  possessionStatus: string;

  ownerAskingRate: string;
  ownerAskingRateBasis: LandRateBasis | null;
  totalAskingValue: string;
  negotiable: boolean | null;
  dlcRate: string;
  dlcRateBasis: LandRateBasis | null;
  expectedPurchaseRate: string;
  expectedPurchaseRateBasis: LandRateBasis | null;
  paymentExpectation: string;

  developmentPotential: LandDevelopmentPotential[];
  documentsReceived: LandDocumentType[];
  evaluation: LandEvaluationType[];

  owners: OwnerRow[];
  jamabandiEntries: JamabandiRow[];
};

const text = (value: string) => value.trim() || null;
const decimal = (value: string) => {
  const cleaned = value.replace(/[,\s₹]/g, "");
  return cleaned ? new D(cleaned) : null;
};

/** Duplicates in a checkbox array are a UI slip, not a second answer (spec §17). */
const unique = <T>(values: readonly T[]) => [...new Set(values)];

/**
 * Everything that can be wrong about an inquiry before anything is written.
 * The database CHECKs say the same things; this exists so a person gets a
 * sentence rather than a constraint name.
 */
function validate(input: LandInquiryInput) {
  const source = validateReceivedFrom(input);
  if (source) blocked(source);

  const pin = mapPinError(input.latitude, input.longitude);
  if (pin) blocked(pin);

  const owners = ownerError(input.owners);
  if (owners) blocked(owners);

  const rates = rateError([
    { value: input.ownerAskingRate, basis: input.ownerAskingRateBasis, label: "Owner Asking Rate" },
    { value: input.dlcRate, basis: input.dlcRateBasis, label: "DLC Rate" },
    {
      value: input.expectedPurchaseRate,
      basis: input.expectedPurchaseRateBasis,
      label: "Expected Purchase Rate",
    },
  ]);
  if (rates) blocked(rates);

  for (const [label, value] of [
    ["Total Asking Value", input.totalAskingValue],
    ["Bigha", input.areaBigha],
    ["Biswa", input.areaBiswa],
    ["the metric area", input.areaSourceValue],
    ["Frontage", input.frontageValue],
    ["Road Width", input.roadWidthValue],
  ] as const) {
    if (value.trim() && !isPositiveDecimal(value)) blocked(`${label} must be a positive number.`);
  }

  if (input.areaSourceValue.trim() && !input.areaSourceUnit) {
    blocked("Say which metric unit the area was measured in.");
  }
  if (input.frontageValue.trim() && !input.frontageUnit) blocked("Frontage needs a unit.");
  if (input.roadWidthValue.trim() && !input.roadWidthUnit) blocked("Road Width needs a unit.");
}

/**
 * Spec §5 "Server: revalidate source capability. Never trust client labels."
 *
 * A Member inquiry must name a Person who actually holds a Member profile, and
 * a Customer inquiry a Person who holds a Customer profile. 3% Club and Another
 * Dealer name nobody, and Another Dealer must never reach the create-or-reuse
 * Person helper — which is why this function only ever reads.
 */
async function resolveSource(tx: Tx, input: LandInquiryInput) {
  if (input.receivedFrom === "ANOTHER_DEALER") {
    return { sourcePersonId: null, anotherDealerMobile: normaliseMobile(input.anotherDealerMobile!) };
  }
  if (input.receivedFrom === "THREE_PERCENT_CLUB") {
    return { sourcePersonId: null, anotherDealerMobile: null };
  }

  const person = await tx.person.findUnique({
    where: { id: input.sourcePersonId! },
    select: {
      id: true,
      mergeStatus: true,
      memberProfile: { select: { id: true } },
      customerProfile: { select: { id: true } },
    },
  });
  if (!person || person.mergeStatus === "MERGED_AWAY") {
    blocked("That source record no longer exists. Pick the current identity.");
  }
  if (input.receivedFrom === "MEMBER" && !person!.memberProfile) {
    blocked("That person is not a Member. Pick a Member, or change Received From.");
  }
  if (input.receivedFrom === "CUSTOMER" && !person!.customerProfile) {
    blocked("That person is not a Customer. Pick a Customer, or change Received From.");
  }
  return { sourcePersonId: person!.id, anotherDealerMobile: null };
}

/** The scalar columns, shared by create and update so the two cannot drift. */
function scalarData(input: LandInquiryInput, source: Awaited<ReturnType<typeof resolveSource>>) {
  const metric = input.areaSourceValue.trim()
    ? toSquareMetres(Number(input.areaSourceValue.replace(/[,\s]/g, "")), input.areaSourceUnit!)
    : null;

  return {
    receivedFrom: input.receivedFrom,
    sourcePersonId: source.sourcePersonId,
    anotherDealerMobile: source.anotherDealerMobile,
    assignedToId: input.assignedToId || null,

    district: text(input.district),
    tehsil: text(input.tehsil),
    exactLocation: text(input.exactLocation),
    latitude: decimal(input.latitude),
    longitude: decimal(input.longitude),

    areaBigha: decimal(input.areaBigha),
    areaBiswa: decimal(input.areaBiswa),
    // Spec §11 — the canonical value is metric, and it is never derived from
    // Bigha or Biswa. `areaSourceValue` keeps what was typed so the screen can
    // show it back without a round trip through the conversion.
    areaSqM: metric === null ? null : new D(metric.toFixed(6)),
    areaSourceUnit: input.areaSourceValue.trim() ? input.areaSourceUnit : null,
    areaSourceValue: decimal(input.areaSourceValue),

    dimensions: text(input.dimensions),
    frontageValue: decimal(input.frontageValue),
    frontageUnit: input.frontageValue.trim() ? input.frontageUnit : null,
    roadWidthValue: decimal(input.roadWidthValue),
    roadWidthUnit: input.roadWidthValue.trim() ? input.roadWidthUnit : null,
    shape: text(input.shape),
    boundaries: text(input.boundaries),

    landCategory: input.landCategory,
    currentLandUse: text(input.currentLandUse),
    masterPlanZonalUse: text(input.masterPlanZonalUse),

    status90A: input.status90A,
    landConversionStatus: input.landConversionStatus,
    changeLandUseStatus: input.changeLandUseStatus,
    pattaLeaseStatus: input.pattaLeaseStatus,

    registrySaleDeedAvailable: input.registrySaleDeedAvailable,
    mutationComplete: input.mutationComplete,
    mortgageBankCharge: input.mortgageBankCharge,
    courtCaseStay: input.courtCaseStay,
    familyDispute: input.familyDispute,
    acquisitionNotice: input.acquisitionNotice,
    governmentRestriction: input.governmentRestriction,

    approachRoad: input.approachRoad,
    roadType: text(input.roadType),
    electricity: input.electricity,
    water: input.water,
    sewerage: input.sewerage,
    existingConstruction: input.existingConstruction,
    encroachment: input.encroachment,
    possessionStatus: text(input.possessionStatus),

    ownerAskingRate: input.ownerAskingRate.trim()
      ? new D(parseAmount(input.ownerAskingRate)!)
      : null,
    ownerAskingRateBasis: input.ownerAskingRate.trim() ? input.ownerAskingRateBasis : null,
    totalAskingValue: input.totalAskingValue.trim()
      ? new D(parseAmount(input.totalAskingValue)!)
      : null,
    negotiable: input.negotiable,
    dlcRate: input.dlcRate.trim() ? new D(parseAmount(input.dlcRate)!) : null,
    dlcRateBasis: input.dlcRate.trim() ? input.dlcRateBasis : null,
    expectedPurchaseRate: input.expectedPurchaseRate.trim()
      ? new D(parseAmount(input.expectedPurchaseRate)!)
      : null,
    expectedPurchaseRateBasis: input.expectedPurchaseRate.trim()
      ? input.expectedPurchaseRateBasis
      : null,
    paymentExpectation: text(input.paymentExpectation),

    developmentPotential: unique(input.developmentPotential),
    documentsReceived: unique(input.documentsReceived),
    evaluation: unique(input.evaluation),
  };
}

async function writeChildren(tx: Tx, landInquiryId: string, input: LandInquiryInput) {
  const owners = normaliseOwners(input.owners);
  const entries = normaliseJamabandi(input.jamabandiEntries);

  // Replaced wholesale rather than diffed: the rows carry no identity of their
  // own and the audit event holds the before and after, so a diff would be
  // bookkeeping with nothing to spend it on. Deleting first also clears the
  // one-Primary-Owner partial index before the new Primary is written.
  await tx.landInquiryOwner.deleteMany({ where: { landInquiryId } });
  await tx.landInquiryJamabandiEntry.deleteMany({ where: { landInquiryId } });

  for (const [index, owner] of owners.entries()) {
    await tx.landInquiryOwner.create({
      data: { landInquiryId, ...owner, sortOrder: index + 1 },
    });
  }
  for (const [index, entry] of entries.entries()) {
    await tx.landInquiryJamabandiEntry.create({
      data: { landInquiryId, ...entry, sortOrder: index + 1 },
    });
  }
  return { owners, entries };
}

/* ------------------------------------------------------------------ create */

export async function createLandInquiry(args: {
  /** Spec §26.6 — the form's own submission key. A retry replays it. */
  createRequestId: string;
  actorRef: string;
  actorRole: string;
  input: LandInquiryInput;
}) {
  validate(args.input);

  return runCommand<{ id: string; inquiryNo: string }>(
    {
      idempotencyKey: args.createRequestId,
      operation: "LAND_INQUIRY_CREATE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: {
        receivedFrom: args.input.receivedFrom,
        sourcePersonId: args.input.sourcePersonId,
        anotherDealerMobile: args.input.anotherDealerMobile,
      },
    },
    async (tx) => {
      const source = await resolveSource(tx, args.input);
      const inquiryNo = await nextReference(tx, "LI", "LandInquiry");

      const inquiry = await tx.landInquiry.create({
        data: {
          inquiryNo,
          // Spec §7 — the server's Asia/Kolkata calendar date. There is no path
          // through the form that can backdate it.
          inquiryDate: new Date(`${istDay(new Date())}T00:00:00.000Z`),
          ...scalarData(args.input, source),
          createRequestId: args.createRequestId,
          createdByRef: args.actorRef,
          updatedByRef: args.actorRef,
        },
      });
      const children = await writeChildren(tx, inquiry.id, args.input);

      return {
        result: { id: inquiry.id, inquiryNo },
        audit: {
          entity: "LandInquiry",
          entityId: inquiry.id,
          action: "LAND_INQUIRY_CREATED",
          after: {
            inquiryNo,
            receivedFrom: inquiry.receivedFrom,
            sourcePersonId: inquiry.sourcePersonId,
            anotherDealerMobile: inquiry.anotherDealerMobile,
            assignedToId: inquiry.assignedToId,
            owners: children.owners.length,
            jamabandiEntries: children.entries.length,
          },
        },
      };
    }
  );
}

/* ------------------------------------------------------------------ update */

/**
 * Spec §26.7 — optimistic locking. A submission carrying a version that is no
 * longer current is rejected with the message the spec dictates rather than
 * overwriting whatever the other person just recorded.
 */
export async function updateLandInquiry(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  id: string;
  version: number;
  input: LandInquiryInput;
}) {
  validate(args.input);

  return runCommand<{ id: string; version: number }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "LAND_INQUIRY_UPDATE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { id: args.id, version: args.version },
    },
    async (tx) => {
      const before = await tx.landInquiry.findUniqueOrThrow({ where: { id: args.id } });
      if (before.archivedAt) blocked("This inquiry is archived and cannot be edited.");
      if (before.status === "CLOSED") {
        blocked("This inquiry is Closed. Admin or MD must reopen it before it can be edited.");
      }
      assertVersion(before.version, args.version);

      const source = await resolveSource(tx, args.input);
      const data = scalarData(args.input, source);
      const after = await tx.landInquiry.update({
        where: { id: args.id },
        data: { ...data, version: before.version + 1, updatedByRef: args.actorRef },
      });
      await writeChildren(tx, args.id, args.input);

      return {
        result: { id: args.id, version: after.version },
        audit: {
          entity: "LandInquiry",
          entityId: args.id,
          action: "LAND_INQUIRY_UPDATED",
          // Only what moved: an audit trail nobody can read is not one.
          before: changedFields(before, after).before,
          after: changedFields(before, after).after,
        },
      };
    }
  );
}

function assertVersion(current: number, submitted: number) {
  if (current !== submitted) {
    blocked(
      "This inquiry was updated by another user. Refresh and review the latest information."
    );
  }
}

/** The scalar columns that actually differ, as two matching objects. */
function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const skip = new Set(["updatedAt", "version", "updatedByRef"]);
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (skip.has(key)) continue;
    const from = before[key];
    const to = after[key];
    if (String(from) === String(to)) continue;
    b[key] = from === null || from === undefined ? null : String(from);
    a[key] = to === null || to === undefined ? null : String(to);
  }
  return { before: b, after: a };
}

/* ------------------------------------------------------------- stage moves */

export async function changeLandInquiryStage(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  id: string;
  version: number;
  stage: LandInquiryStage;
  reason: string;
}) {
  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "LAND_INQUIRY_STAGE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { id: args.id, stage: args.stage },
    },
    async (tx) => {
      const inquiry = await tx.landInquiry.findUniqueOrThrow({ where: { id: args.id } });
      if (inquiry.archivedAt) blocked("This inquiry is archived.");
      assertVersion(inquiry.version, args.version);

      const move = planStageChange({
        status: inquiry.status,
        from: inquiry.stage,
        to: args.stage,
        reason: args.reason,
      });
      if (!move.ok) blocked(move.error);

      const updated = await tx.landInquiry.update({
        where: { id: args.id },
        data: {
          stage: args.stage,
          // Spec §21 — Rejected / Closed takes the Status with it. Nothing else
          // changes the Status from here.
          status: (move as { nextStatus: LandInquiryStatus }).nextStatus,
          version: inquiry.version + 1,
          updatedByRef: args.actorRef,
        },
      });

      return {
        result: { id: args.id, stage: updated.stage, status: updated.status, version: updated.version },
        audit: {
          entity: "LandInquiry",
          entityId: args.id,
          action: "LAND_INQUIRY_STAGE_CHANGED",
          before: { stage: inquiry.stage, status: inquiry.status },
          after: { stage: updated.stage, status: updated.status },
          reason: args.reason.trim() || undefined,
        },
      };
    }
  );
}

/**
 * Spec §22 "Close Inquiry action" and §26.9 — closing from any working stage
 * sets Status Closed and Stage Rejected / Closed together, and reopening is the
 * only way back. Both carry a compulsory reason.
 */
export async function setLandInquiryStatus(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  id: string;
  version: number;
  status: LandInquiryStatus;
  reason: string;
  /** Required when reopening an inquiry that was Rejected / Closed. */
  restoredStage?: LandInquiryStage | null;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "LAND_INQUIRY_STATUS",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { id: args.id, status: args.status },
    },
    async (tx) => {
      const inquiry = await tx.landInquiry.findUniqueOrThrow({ where: { id: args.id } });
      if (inquiry.archivedAt) blocked("This inquiry is archived.");
      assertVersion(inquiry.version, args.version);
      if (inquiry.status === args.status) {
        blocked(`This inquiry is already ${args.status.toLowerCase()}.`);
      }

      let stage = inquiry.stage;
      if (args.status === "CLOSED") {
        stage = "REJECTED_CLOSED";
      } else {
        const reopen = planReopen({
          stage: inquiry.stage,
          restoredStage: args.restoredStage ?? null,
          reason: args.reason,
        });
        if (!reopen.ok) blocked(reopen.error);
        stage = (reopen as { stage: LandInquiryStage }).stage;
      }

      const updated = await tx.landInquiry.update({
        where: { id: args.id },
        data: { status: args.status, stage, version: inquiry.version + 1, updatedByRef: args.actorRef },
      });

      return {
        result: { id: args.id, status: updated.status, stage: updated.stage, version: updated.version },
        audit: {
          entity: "LandInquiry",
          entityId: args.id,
          action: args.status === "CLOSED" ? "LAND_INQUIRY_CLOSED" : "LAND_INQUIRY_REOPENED",
          before: { status: inquiry.status, stage: inquiry.stage },
          after: { status: updated.status, stage: updated.stage },
          reason: args.reason,
        },
      };
    }
  );
}

/* ---------------------------------------------------- reassign and archive */

export async function reassignLandInquiry(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  id: string;
  version: number;
  assignedToId: string | null;
  reason: string;
}) {
  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "LAND_INQUIRY_REASSIGN",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { id: args.id, assignedToId: args.assignedToId },
    },
    async (tx) => {
      const inquiry = await tx.landInquiry.findUniqueOrThrow({ where: { id: args.id } });
      assertVersion(inquiry.version, args.version);

      if (args.assignedToId) {
        const staff = await tx.staffAccount.findUnique({
          where: { id: args.assignedToId },
          select: { status: true },
        });
        if (!staff || staff.status !== "ACTIVE") {
          blocked("That staff account is not active. Pick someone else.");
        }
      }

      const updated = await tx.landInquiry.update({
        where: { id: args.id },
        data: {
          assignedToId: args.assignedToId,
          version: inquiry.version + 1,
          updatedByRef: args.actorRef,
        },
      });

      return {
        result: { id: args.id, version: updated.version },
        audit: {
          entity: "LandInquiry",
          entityId: args.id,
          action: "LAND_INQUIRY_REASSIGNED",
          before: { assignedToId: inquiry.assignedToId },
          after: { assignedToId: updated.assignedToId },
          reason: args.reason.trim() || undefined,
        },
      };
    }
  );
}

/** Spec §4.6, §23.8 — no hard delete. The record leaves the default list and
 *  keeps every fact it held. */
export async function archiveLandInquiry(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  id: string;
  version: number;
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to archive an inquiry.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "LAND_INQUIRY_ARCHIVE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { id: args.id },
    },
    async (tx) => {
      const inquiry = await tx.landInquiry.findUniqueOrThrow({ where: { id: args.id } });
      if (inquiry.archivedAt) blocked("This inquiry is already archived.");
      assertVersion(inquiry.version, args.version);

      const updated = await tx.landInquiry.update({
        where: { id: args.id },
        data: {
          archivedAt: new Date(),
          archivedByRef: args.actorRef,
          version: inquiry.version + 1,
          updatedByRef: args.actorRef,
        },
      });

      return {
        result: { id: args.id, version: updated.version },
        audit: {
          entity: "LandInquiry",
          entityId: args.id,
          action: "LAND_INQUIRY_ARCHIVED",
          after: { archivedAt: updated.archivedAt },
          reason: args.reason,
        },
      };
    }
  );
}

/* ------------------------------------------------------------------- reads */

export type LandInquiryListFilters = {
  q?: string;
  district?: string;
  tehsil?: string;
  khasraNo?: string;
  receivedFrom?: LandInquiryReceivedFrom;
  status?: LandInquiryStatus;
  stage?: LandInquiryStage;
  assignedToId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  includeArchived?: boolean;
};

export const DEFAULT_PAGE_SIZE = 25;

/**
 * Spec §25 — every filter is applied by the database. The list page never
 * fetches the whole table to filter it in the browser, which is the one thing
 * that stops working the day the table is large.
 */
export async function listLandInquiries(filters: LandInquiryListFilters) {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? DEFAULT_PAGE_SIZE)));

  const where: Prisma.LandInquiryWhereInput = {
    ...(filters.includeArchived ? {} : { archivedAt: null }),
    ...(filters.receivedFrom ? { receivedFrom: filters.receivedFrom } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.stage ? { stage: filters.stage } : {}),
    ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
    ...(filters.district ? { district: { contains: filters.district, mode: "insensitive" } } : {}),
    ...(filters.tehsil ? { tehsil: { contains: filters.tehsil, mode: "insensitive" } } : {}),
    ...(filters.khasraNo
      ? { jamabandiEntries: { some: { khasraNo: { contains: filters.khasraNo, mode: "insensitive" } } } }
      : {}),
  };

  const from = filters.dateFrom?.trim();
  const to = filters.dateTo?.trim();
  if (from && to && from > to) blocked("The date range starts after it ends.");
  if (from || to) {
    where.inquiryDate = {
      ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
    };
  }

  // Spec §25 — one search box across the fields a person actually remembers:
  // the number, an owner, a mobile, where it is, or the Khasra.
  const q = filters.q?.trim();
  if (q) {
    const mobile = normaliseMobile(q);
    where.OR = [
      { inquiryNo: { contains: q, mode: "insensitive" } },
      { district: { contains: q, mode: "insensitive" } },
      { tehsil: { contains: q, mode: "insensitive" } },
      { exactLocation: { contains: q, mode: "insensitive" } },
      { owners: { some: { ownerName: { contains: q, mode: "insensitive" } } } },
      { jamabandiEntries: { some: { khasraNo: { contains: q, mode: "insensitive" } } } },
      { sourcePerson: { fullName: { contains: q, mode: "insensitive" } } },
      ...(mobile.length >= 4
        ? [
            { anotherDealerMobile: { contains: mobile } },
            { owners: { some: { mobile: { contains: mobile } } } },
            { sourcePerson: { primaryMobile: { contains: mobile } } },
          ]
        : []),
    ];
  }

  const [rows, totalRows] = await Promise.all([
    db.landInquiry.findMany({
      where,
      include: {
        sourcePerson: { select: { id: true, fullName: true } },
        assignedTo: { select: { id: true, staffAccountId: true, person: { select: { fullName: true } } } },
        owners: { orderBy: { sortOrder: "asc" } },
      },
      // Spec §24 — newest first, and a stable tiebreak so paging never repeats
      // or skips a row.
      orderBy: [{ inquiryDate: "desc" }, { inquiryNo: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.landInquiry.count({ where }),
  ]);

  return {
    rows,
    page,
    pageSize,
    totalRows,
    totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
  };
}

export function getLandInquiry(id: string) {
  return db.landInquiry.findUnique({
    where: { id },
    include: {
      sourcePerson: {
        select: {
          id: true,
          fullName: true,
          primaryMobile: true,
          memberProfile: { select: { memberId: true } },
          customerProfile: { select: { customerId: true } },
        },
      },
      assignedTo: {
        select: { id: true, staffAccountId: true, role: true, person: { select: { fullName: true } } },
      },
      owners: { orderBy: { sortOrder: "asc" } },
      jamabandiEntries: { orderBy: { sortOrder: "asc" } },
    },
  });
}

/**
 * Spec §26.5 — the source lookup. Capability is decided here, from the
 * profiles a Person holds, not from a label the browser sent.
 */
export function searchLandInquirySourcePeople(type: "MEMBER" | "CUSTOMER") {
  return db.person.findMany({
    where: {
      mergeStatus: { not: "MERGED_AWAY" },
      ...(type === "MEMBER"
        ? { memberProfile: { isNot: null } }
        : { customerProfile: { isNot: null } }),
    },
    select: {
      id: true,
      fullName: true,
      primaryMobile: true,
      city: true,
      memberProfile: { select: { memberId: true } },
      customerProfile: { select: { customerId: true } },
    },
    orderBy: { fullName: "asc" },
    take: 500,
  });
}
