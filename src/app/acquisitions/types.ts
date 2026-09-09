// The shapes the Acquisitions list and a single Acquisition's page both read.
//
// They live here rather than in either screen because both build the same row
// from the same query, and a view type owned by one of them is two view types
// the day someone edits one.

export type EntryView = {
  id: string;
  percent: string;
  paidOn: string;
  status: string;
  reference: string;
  confirmedByRef: string;
  reason: string | null;
};

export type AcquisitionRowView = {
  id: string;
  acquisitionNo: string;
  type: string;
  status: string;
  property: string;
  project: string;
  plotNumber: string;
  /** CONSTANT_CASE from the schema, or null for a property outside inventory. */
  plotType: string | null;
  location: string | null;
  seller: string;
  sellerPersonId: string;
  arrangedBy: string;
  arrangedByPersonId: string | null;
  arrangedByType: string;
  sourceBooking: string | null;
  purchaseDate: string;
  paymentGivenPercent: string;
  remark: string;
  decisionNote: string | null;
  closedReason: string | null;
  submittedByRef: string;
  instalments: Array<{ seq: number; scheduled: string; received: string; dueDate: string }>;
  entries: EntryView[];
  commission: {
    beneficiary: string;
    beneficiaryPersonId: string;
    percent: string;
    eligibility: string;
    payment: string;
  } | null;
};

export type PersonView = {
  id: string;
  fullName: string;
  mobileMasked: string;
  /** CUS-3390 / MEM-0012, where the Person holds that profile at all. */
  customerId: string | null;
  memberId: string | null;
};

export type Permissions = {
  create: boolean;
  decide: boolean;
  cancel: boolean;
  confirmGiven: boolean;
  correctGiven: boolean;
  recordCommission: boolean;
};

/** Every dialog either screen can open, other than New Buyback. */
export type Dialog =
  | { kind: "PAY"; row: AcquisitionRowView }
  | { kind: "CORRECT"; row: AcquisitionRowView; entry: EntryView }
  | { kind: "DECIDE"; row: AcquisitionRowView; approve: boolean }
  | { kind: "CANCEL"; row: AcquisitionRowView }
  | { kind: "COMMISSION"; row: AcquisitionRowView };

export const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Waiting Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Deal Cancelled",
};

export const TYPE_LABEL: Record<string, string> = {
  BUYBACK: "Buyback",
  PURCHASE_FOR_RESALE: "Purchase for Resale",
};

export const newKey = () => `acq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
