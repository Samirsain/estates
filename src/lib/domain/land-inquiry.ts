// Land Inquiry rules — Land Inquiry spec §5, §8, §11, §16, §21, §22, §28.
//
// Everything here is pure. The service does the reading and writing; what may
// be recorded, what a number means and what a stage move costs live here so
// they can be checked without a database.

export type LandInquiryReceivedFrom =
  | "MEMBER"
  | "CUSTOMER"
  | "THREE_PERCENT_CLUB"
  | "ANOTHER_DEALER";

export type LandInquiryStatus = "WORKING" | "CLOSED";

export type LandInquiryStage =
  | "NEW"
  | "DOCUMENTS_PENDING"
  | "SITE_VISIT"
  | "UNDER_VERIFICATION"
  | "NEGOTIATION"
  | "APPROVED_FOR_ACQUISITION"
  | "REJECTED_CLOSED";

export type LandRateBasis =
  | "TOTAL"
  | "PER_BIGHA"
  | "PER_BISWA"
  | "PER_HECTARE"
  | "PER_SQ_M"
  | "PER_SQ_FT";

export type LandMetricSourceUnit = "SQ_M" | "HECTARE" | "SQ_FT";

export type LandCategory =
  | "RESIDENTIAL"
  | "COMMERCIAL"
  | "INDUSTRIAL"
  | "AGRICULTURAL"
  | "OTHER";

export type LandApprovalStatus =
  | "UNKNOWN"
  | "NOT_APPLICABLE"
  | "NOT_STARTED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

export type LandCheckState = "UNKNOWN" | "YES" | "NO";

export type LandDevelopmentPotential =
  | "RESIDENTIAL"
  | "COMMERCIAL"
  | "WAREHOUSE"
  | "AGRICULTURE"
  | "OTHER";

export type LandDocumentType =
  | "JAMABANDI"
  | "REGISTRY"
  | "MUTATION"
  | "BHU_NAKSHA"
  | "KHASRA_MAP"
  | "CONVERSION_ORDER_90A"
  | "PATTA"
  | "OWNER_ID"
  | "SITE_PHOTOS"
  | "LOCATION_MAP";

export type LandEvaluationType =
  | "SITE_VISIT_REQUIRED"
  | "LEGAL_VERIFICATION_REQUIRED"
  | "REVENUE_VERIFICATION_REQUIRED";

export type LinearUnit = "FT" | "MTR";


/** Spec §21 — the working ladder, in displayed order. */
export const WORKING_STAGES: readonly LandInquiryStage[] = [
  "NEW",
  "DOCUMENTS_PENDING",
  "SITE_VISIT",
  "UNDER_VERIFICATION",
  "NEGOTIATION",
  "APPROVED_FOR_ACQUISITION",
];

export const STAGE_ORDER: readonly LandInquiryStage[] = [...WORKING_STAGES, "REJECTED_CLOSED"];

export const STAGE_LABEL: Record<LandInquiryStage, string> = {
  NEW: "New",
  DOCUMENTS_PENDING: "Documents Pending",
  SITE_VISIT: "Site Visit",
  UNDER_VERIFICATION: "Under Verification",
  NEGOTIATION: "Negotiation",
  APPROVED_FOR_ACQUISITION: "Approved for Acquisition",
  REJECTED_CLOSED: "Rejected / Closed",
};

export const RECEIVED_FROM_LABEL: Record<LandInquiryReceivedFrom, string> = {
  MEMBER: "Member",
  CUSTOMER: "Customer",
  THREE_PERCENT_CLUB: "3% Club",
  ANOTHER_DEALER: "Another Dealer",
};

export const RATE_BASIS_LABEL: Record<LandRateBasis, string> = {
  TOTAL: "Total",
  PER_BIGHA: "Per Bigha",
  PER_BISWA: "Per Biswa",
  PER_HECTARE: "Per Hectare",
  PER_SQ_M: "Per Sq. Mtr.",
  PER_SQ_FT: "Per Sq. Ft.",
};

/* ------------------------------------------------------------ area (spec §11)

   Rajasthan's own Land Revenue (Land Records) Rules, 1957 Appendix I publishes
   different Bigha equivalents for different districts and former-state areas.
   There is therefore no statewide Bigha factor to apply, and inventing one
   would silently restate what an owner said their land measures. Bigha and
   Biswa are stored exactly as entered; the metric side is converted only
   between metric units, where the factors are exact. */

export const SQ_M_PER_HECTARE = 10000;
export const SQ_M_PER_SQ_FT = 0.09290304;
export const SQ_FT_PER_SQ_M = 10.763910416709722;

/** Canonical square metres for a metric entry. Bigha and Biswa are not here. */
export function toSquareMetres(value: number, unit: LandMetricSourceUnit): number {
  switch (unit) {
    case "SQ_M":
      return value;
    case "HECTARE":
      return value * SQ_M_PER_HECTARE;
    case "SQ_FT":
      return value * SQ_M_PER_SQ_FT;
  }
}

/** The other metric displays, derived from the canonical value. */
export function metricViews(areaSqM: number) {
  return {
    sqM: areaSqM,
    hectare: areaSqM / SQ_M_PER_HECTARE,
    sqFt: areaSqM * SQ_FT_PER_SQ_M,
  };
}

/* ---------------------------------------------------- source (spec §5, §28.1) */

/**
 * The Received From union, as the database CHECK also states it.
 *
 * Member and Customer name a Person already on file. 3% Club is the company
 * itself — this CRM has no dealer or club Person record and the spec's own
 * §26.5 says to reuse whatever classification exists rather than build one, so
 * a 3% Club inquiry names nobody and is attributed by Assigned To. Another
 * Dealer names nobody either and carries only a mobile: no Person row is
 * created, reused, converted or synced for one, even when the mobile matches
 * someone already on file.
 */
export type ReceivedFromInput =
  | { receivedFrom: "MEMBER" | "CUSTOMER"; sourcePersonId: string; anotherDealerMobile: null }
  | { receivedFrom: "THREE_PERCENT_CLUB"; sourcePersonId: null; anotherDealerMobile: null }
  | { receivedFrom: "ANOTHER_DEALER"; sourcePersonId: null; anotherDealerMobile: string };

export function validateReceivedFrom(input: {
  receivedFrom: LandInquiryReceivedFrom;
  sourcePersonId: string | null;
  anotherDealerMobile: string | null;
}): string | null {
  const person = input.sourcePersonId?.trim() || null;
  const mobile = input.anotherDealerMobile?.trim() || null;

  if (input.receivedFrom === "ANOTHER_DEALER") {
    if (person) return "Another Dealer records a mobile number only, never a Person on file.";
    if (!mobile) return "Enter the dealer's mobile number.";
    if (!isValidMobile(mobile)) return "Enter a valid 10-digit Indian mobile number.";
    return null;
  }
  if (mobile) return "A dealer mobile number applies only to an Another Dealer inquiry.";
  if (input.receivedFrom === "THREE_PERCENT_CLUB") {
    return person ? "A 3% Club inquiry is the company's own, so it names no source Person." : null;
  }
  return person ? null : `Select the ${RECEIVED_FROM_LABEL[input.receivedFrom]} this land came from.`;
}

/* ------------------------------------------------------------ mobile (§28.2) */

/** Accepts what people actually type — spaces, hyphens, +91 — and stores ten digits. */
export function normaliseMobile(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length > 10 && digits.startsWith("91") ? digits.slice(-10) : digits;
}

export function isValidMobile(value: string): boolean {
  return /^[6-9][0-9]{9}$/.test(normaliseMobile(value));
}

/* ------------------------------------------------- owners (spec §8, §30.13) */

export type OwnerRow = { ownerName: string; mobile: string | null; isPrimary: boolean };

/**
 * Spec §8 — the first owner is Primary, exactly one is, and removing the
 * Primary promotes the earliest one left. Order is the row order given, which
 * is what `sortOrder` stores.
 */
export function normaliseOwners(rows: readonly OwnerRow[]): OwnerRow[] {
  const kept = rows.filter((r) => r.ownerName.trim().length > 0);
  if (kept.length === 0) return [];
  const chosen = kept.findIndex((r) => r.isPrimary);
  const primary = chosen === -1 ? 0 : chosen;
  return kept.map((r, i) => ({
    ownerName: r.ownerName.trim(),
    mobile: r.mobile?.trim() ? normaliseMobile(r.mobile) : null,
    isPrimary: i === primary,
  }));
}

export function ownerError(rows: readonly OwnerRow[]): string | null {
  for (const row of rows) {
    // A row that exists at all must be named; a row left entirely blank is
    // simply dropped rather than rejected, because that is what a half-filled
    // repeater means (spec §30.3).
    if (!row.ownerName.trim() && row.mobile?.trim()) {
      return "An owner row with a mobile number needs the owner's name.";
    }
    if (row.mobile?.trim() && !isValidMobile(row.mobile)) {
      return `${row.ownerName.trim() || "That owner"} has an invalid mobile number.`;
    }
  }
  return null;
}

/* --------------------------------------------------------- jamabandi (§10) */

export type JamabandiRow = { murbbaNo: string; patharNo: string; khasraNo: string };

export function normaliseJamabandi(rows: readonly JamabandiRow[]) {
  return rows
    .map((r) => ({
      murbbaNo: r.murbbaNo.trim() || null,
      patharNo: r.patharNo.trim() || null,
      khasraNo: r.khasraNo.trim() || null,
    }))
    .filter((r) => r.murbbaNo || r.patharNo || r.khasraNo);
}

/* ------------------------------------------- status and stage (spec §21, §22) */

export function stageIndex(stage: LandInquiryStage): number {
  return STAGE_ORDER.indexOf(stage);
}

/** Spec §22 — Working with a Rejected / Closed stage is the one invalid pair. */
export function isValidStatusStage(status: LandInquiryStatus, stage: LandInquiryStage): boolean {
  return !(status === "WORKING" && stage === "REJECTED_CLOSED");
}

export type StageMove =
  | { ok: true; nextStatus: LandInquiryStatus; reasonRequired: boolean }
  | { ok: false; error: string };

/**
 * Spec §21 — one step forward needs nothing said. A skip and any backward move
 * are decisions, so both carry a compulsory reason, and Rejected / Closed
 * carries a close reason and takes the Status with it.
 */
export function planStageChange(args: {
  status: LandInquiryStatus;
  from: LandInquiryStage;
  to: LandInquiryStage;
  reason: string;
}): StageMove {
  if (args.from === args.to) return { ok: false, error: "The inquiry is already at that stage." };
  if (args.status === "CLOSED") {
    return {
      ok: false,
      error: "This inquiry is Closed. Admin or MD must reopen it before the stage can move.",
    };
  }

  const reason = args.reason.trim();
  if (args.to === "REJECTED_CLOSED") {
    if (!reason) return { ok: false, error: "A close reason is compulsory." };
    return { ok: true, nextStatus: "CLOSED", reasonRequired: true };
  }

  const step = stageIndex(args.to) - stageIndex(args.from);
  const reasonRequired = step !== 1;
  if (reasonRequired && !reason) {
    return {
      ok: false,
      error:
        step < 0
          ? "Moving an inquiry back a stage needs a compulsory reason."
          : "Skipping a stage needs a compulsory reason.",
    };
  }
  return { ok: true, nextStatus: "WORKING", reasonRequired };
}

/**
 * Spec §26.9 — closing from any working stage sets both fields; reopening is
 * Admin/MD only and must land on a stage the inquiry can actually work at.
 */
export function planReopen(args: {
  stage: LandInquiryStage;
  restoredStage: LandInquiryStage | null;
  reason: string;
}): { ok: true; stage: LandInquiryStage } | { ok: false; error: string } {
  if (!args.reason.trim()) return { ok: false, error: "A compulsory reason is required to reopen." };
  if (args.stage !== "REJECTED_CLOSED") return { ok: true, stage: args.stage };
  if (!args.restoredStage || !WORKING_STAGES.includes(args.restoredStage)) {
    return { ok: false, error: "Choose the working stage this inquiry reopens at." };
  }
  return { ok: true, stage: args.restoredStage };
}

/* ------------------------------------------------- commercial values (§16) */

export type RateField = { value: string | null; basis: LandRateBasis | null; label: string };

/** Spec §16 — a rate needs its basis, and a basis needs its rate. */
export function rateError(fields: readonly RateField[]): string | null {
  for (const field of fields) {
    const hasValue = field.value !== null && field.value.trim() !== "";
    if (hasValue && !field.basis) return `${field.label} needs a rate basis.`;
    if (!hasValue && field.basis) return `${field.label} has a basis but no rate.`;
    if (hasValue && !isPositiveDecimal(field.value!)) {
      return `${field.label} must be a positive amount.`;
    }
  }
  return null;
}

/** Indian comma grouping in, a plain decimal out. Money never touches a float. */
export function parseAmount(value: string): string | null {
  const cleaned = value.replace(/[,\s₹]/g, "");
  if (!cleaned) return null;
  return /^\d+(\.\d{1,2})?$/.test(cleaned) ? cleaned : value.trim();
}

export function isPositiveDecimal(value: string): boolean {
  const cleaned = value.replace(/[,\s₹]/g, "");
  return /^\d+(\.\d+)?$/.test(cleaned) && Number(cleaned) > 0;
}

/* ------------------------------------------------------------- coordinates */

export function mapPinError(latitude: string, longitude: string): string | null {
  const lat = latitude.trim();
  const lng = longitude.trim();
  if (!lat && !lng) return null;
  if (!lat || !lng) return "A map pin needs both latitude and longitude.";
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
    return "Latitude must be between -90 and 90.";
  }
  if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
    return "Longitude must be between -180 and 180.";
  }
  return null;
}

/* --------------------------------------------------- shape and formatting */

/**
 * Everything the create and update forms hold. Strings throughout: the form
 * gives strings, and money must never pass through a JavaScript float.
 *
 * It lives beside the rules rather than in the service because both the server
 * and the browser build one, and a type owned by the service would drag the
 * service's imports across that boundary.
 */
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

/** A blank inquiry: Working, stage New, and every optional section empty. */
export const emptyInput = (): LandInquiryInput => ({
  receivedFrom: "MEMBER",
  sourcePersonId: null,
  anotherDealerMobile: null,
  assignedToId: null,
  district: "",
  tehsil: "",
  exactLocation: "",
  latitude: "",
  longitude: "",
  areaBigha: "",
  areaBiswa: "",
  areaSourceUnit: "SQ_M",
  areaSourceValue: "",
  dimensions: "",
  frontageValue: "",
  frontageUnit: "FT",
  roadWidthValue: "",
  roadWidthUnit: "FT",
  shape: "",
  boundaries: "",
  landCategory: null,
  currentLandUse: "",
  masterPlanZonalUse: "",
  status90A: "UNKNOWN",
  landConversionStatus: "UNKNOWN",
  changeLandUseStatus: "UNKNOWN",
  pattaLeaseStatus: "UNKNOWN",
  registrySaleDeedAvailable: "UNKNOWN",
  mutationComplete: "UNKNOWN",
  mortgageBankCharge: "UNKNOWN",
  courtCaseStay: "UNKNOWN",
  familyDispute: "UNKNOWN",
  acquisitionNotice: "UNKNOWN",
  governmentRestriction: "UNKNOWN",
  approachRoad: "UNKNOWN",
  roadType: "",
  electricity: "UNKNOWN",
  water: "UNKNOWN",
  sewerage: "UNKNOWN",
  existingConstruction: "UNKNOWN",
  encroachment: "UNKNOWN",
  possessionStatus: "",
  ownerAskingRate: "",
  ownerAskingRateBasis: null,
  totalAskingValue: "",
  negotiable: null,
  dlcRate: "",
  dlcRateBasis: null,
  expectedPurchaseRate: "",
  expectedPurchaseRateBasis: null,
  paymentExpectation: "",
  developmentPotential: [],
  documentsReceived: [],
  evaluation: [],
  owners: [],
  jamabandiEntries: [],
});

/** An enum value as a person reads it. */
export const humanise = (value: string) =>
  value
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ")
    .replace("Bhu Naksha", "Bhu-Naksha")
    .replace("Conversion Order 90a", "90A / Conversion Order")
    .replace("Owner Id", "Owner ID")
    .replace("Sq M", "Sq. Mtr.")
    .replace("Sq Ft", "Sq. Ft.");

/** Indian grouping, so a rate reads the way it is spoken (spec §16). */
export const inr = (value: string) =>
  `\u20b9${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Which badge a stage wears. Rejected reads as a stop, Approved as a pass. */
export function stageVariant(stage: LandInquiryStage) {
  if (stage === "REJECTED_CLOSED") return "destructive" as const;
  if (stage === "APPROVED_FOR_ACQUISITION") return "success" as const;
  if (stage === "NEW") return "outline" as const;
  return "info" as const;
}
