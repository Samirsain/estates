// Role, record and field authorisation — PRD.md §3; ARCHITECTURE.md §9.2.
// Deny by default. Hiding a button is never the control (DESIGN.md §1).

export type StaffRole = "MD" | "ADMIN" | "ACCOUNTS" | "CRM" | "MIS" | "PC";
export type Role = StaffRole | "MEMBER";

export const STAFF_ROLES: StaffRole[] = ["MD", "ADMIN", "ACCOUNTS", "CRM", "MIS", "PC"];

export type Action =
  // Administration
  | "STAFF_MANAGE"
  | "STAFF_EMERGENCY_DISABLE"
  | "ROLE_PERMISSION_MANAGE"
  | "MEMBER_ACTIVATE"
  | "MEMBER_DEACTIVATE"
  | "PERSON_MERGE"
  | "PROJECT_SETUP"
  | "PLOT_SETUP"
  | "PLOT_RESTRICTION_MANAGE"
  | "PLOT_MAKE_AVAILABLE"
  // Pre-sales
  | "ENQUIRY_MANAGE"
  | "HOLD_CREATE"
  | "HOLD_EXTEND_FIRST"
  | "HOLD_EXTEND_FURTHER"
  | "HOLD_REQUEST_SUBMIT"
  | "HOLD_REQUEST_REVIEW"
  // Sale
  | "BOOKING_REQUEST_SUBMIT"
  | "BOOKING_DECIDE"
  | "BOOKING_CANCEL_REQUEST"
  | "PAYMENT_RECEIVED_CONFIRM"
  | "PAYMENT_GIVEN_CONFIRM"
  | "ACQUISITION_CREATE"
  | "ACQUISITION_DECIDE"
  | "ACQUISITION_CANCEL"
  | "CHANGE_PLOT_RAISE"
  | "CHANGE_PLOT_DECIDE"
  | "CANCELLATION_DECIDE"
  | "BUYING_COMMISSION_RECORD"
  | "PAYMENT_CORRECT"
  | "SCHEDULE_REVISE"
  | "SCHEDULE_DECIDE"
  | "OWNERSHIP_SHARE_CHANGE"
  | "PRIMARY_CUSTOMER_CHANGE_RAISE"
  | "PRIMARY_CUSTOMER_CHANGE_APPROVE"
  | "SOLD_BY_CORRECTION_RAISE"
  | "SOLD_BY_CORRECTION_APPROVE"
  | "COMMISSION_PROCESS"
  // Completion (PRD §4; main-PRD §18)
  | "FINAL_BUYER_RECORD"
  | "COMPLETION_RECORD"
  | "DELIVERY_REOPEN"
  | "WORK_REASSIGN"
  | "BANK_DETAILS_ENTER"
  | "BANK_VERIFY"
  // Work and reporting
  | "TASK_CREATE"
  | "TASK_COMPLETE"
  | "REPORT_VIEW"
  | "REPORT_EXPORT"
  | "AUDIT_VIEW";

/** Baseline grants per role. Anything not listed is denied. */
const ROLE_ACTIONS: Record<Role, readonly Action[]> = {
  MD: [
    "STAFF_MANAGE",
    "STAFF_EMERGENCY_DISABLE",
    "ROLE_PERMISSION_MANAGE",
    "MEMBER_ACTIVATE",
    "MEMBER_DEACTIVATE",
    "PERSON_MERGE",
    "PROJECT_SETUP",
    "PLOT_SETUP",
    "PLOT_RESTRICTION_MANAGE",
    "PLOT_MAKE_AVAILABLE",
    "BANK_DETAILS_ENTER",
    "ENQUIRY_MANAGE",
    "HOLD_CREATE",
    "HOLD_EXTEND_FIRST",
    "HOLD_EXTEND_FURTHER",
    "HOLD_REQUEST_REVIEW",
    "BOOKING_REQUEST_SUBMIT",
    "BOOKING_CANCEL_REQUEST",
    "OWNERSHIP_SHARE_CHANGE",
    "PRIMARY_CUSTOMER_CHANGE_RAISE",
    "SOLD_BY_CORRECTION_RAISE",
    "ACQUISITION_CREATE",
    "CHANGE_PLOT_RAISE",
    "BUYING_COMMISSION_RECORD",
    "SOLD_BY_CORRECTION_APPROVE",
    "FINAL_BUYER_RECORD",
    "COMPLETION_RECORD",
    "DELIVERY_REOPEN",
    "WORK_REASSIGN",
    "TASK_CREATE",
    "TASK_COMPLETE",
    "REPORT_VIEW",
    "REPORT_EXPORT",
    "AUDIT_VIEW",
  ],
  ADMIN: [
    "STAFF_MANAGE",
    "STAFF_EMERGENCY_DISABLE",
    "ROLE_PERMISSION_MANAGE",
    "MEMBER_ACTIVATE",
    "MEMBER_DEACTIVATE",
    "PERSON_MERGE",
    "PROJECT_SETUP",
    "PLOT_SETUP",
    "PLOT_RESTRICTION_MANAGE",
    "PLOT_MAKE_AVAILABLE",
    "BANK_DETAILS_ENTER",
    "ENQUIRY_MANAGE",
    "HOLD_CREATE",
    "HOLD_EXTEND_FIRST",
    "HOLD_EXTEND_FURTHER",
    "HOLD_REQUEST_REVIEW",
    "BOOKING_REQUEST_SUBMIT",
    "BOOKING_CANCEL_REQUEST",
    "OWNERSHIP_SHARE_CHANGE",
    "PRIMARY_CUSTOMER_CHANGE_RAISE",
    "SOLD_BY_CORRECTION_RAISE",
    "ACQUISITION_CREATE",
    "CHANGE_PLOT_RAISE",
    "BUYING_COMMISSION_RECORD",
    "SOLD_BY_CORRECTION_APPROVE",
    "FINAL_BUYER_RECORD",
    "COMPLETION_RECORD",
    "DELIVERY_REOPEN",
    "WORK_REASSIGN",
    "TASK_CREATE",
    "TASK_COMPLETE",
    "REPORT_VIEW",
    "REPORT_EXPORT",
    "AUDIT_VIEW",
  ],
  // PRD §3 — Accounts decides Bookings, confirms payment, verifies banks and
  // processes commission. It does not administer users or set up inventory.
  ACCOUNTS: [
    "BOOKING_DECIDE",
    "PAYMENT_RECEIVED_CONFIRM",
    "PAYMENT_GIVEN_CONFIRM",
    "ACQUISITION_DECIDE",
    "CHANGE_PLOT_DECIDE",
    "CANCELLATION_DECIDE",
    "ACQUISITION_CANCEL",
    "PAYMENT_CORRECT",
    "SCHEDULE_DECIDE",
    "PRIMARY_CUSTOMER_CHANGE_APPROVE",
    "COMMISSION_PROCESS",
    "BANK_VERIFY",
    "TASK_CREATE",
    "TASK_COMPLETE",
    "REPORT_VIEW",
  ],
  CRM: [
    "ENQUIRY_MANAGE",
    "HOLD_CREATE",
    "HOLD_EXTEND_FIRST",
    "HOLD_REQUEST_REVIEW",
    "BOOKING_REQUEST_SUBMIT",
    "BOOKING_CANCEL_REQUEST",
    "SCHEDULE_REVISE",
    "BANK_DETAILS_ENTER",
    "OWNERSHIP_SHARE_CHANGE",
    "PRIMARY_CUSTOMER_CHANGE_RAISE",
    "SOLD_BY_CORRECTION_RAISE",
    "ACQUISITION_CREATE",
    "CHANGE_PLOT_RAISE",
    "BUYING_COMMISSION_RECORD",
    "FINAL_BUYER_RECORD",
    "COMPLETION_RECORD",
    "TASK_CREATE",
    "TASK_COMPLETE",
    "REPORT_VIEW",
  ],
  // Read-only masked reporting plus authorised manual task creation (PRD §3).
  MIS: ["REPORT_VIEW", "REPORT_EXPORT", "TASK_CREATE"],
  // Project/Plot preparation only; no financial approval (PRD §3).
  PC: ["PROJECT_SETUP", "PLOT_SETUP", "TASK_COMPLETE", "REPORT_VIEW"],
  // Restricted portal actions only (PRD §23).
  MEMBER: ["HOLD_REQUEST_SUBMIT", "ENQUIRY_MANAGE"],
};

/** Sensitive values are masked unless the role holds explicit field permission. */
export type SensitiveField = "AADHAAR_FULL" | "PAN_FULL" | "BANK_FULL" | "BUYER_IDENTITY";

const FIELD_ACCESS: Record<SensitiveField, readonly Role[]> = {
  // Full Aadhaar only for specifically authorised MD/Admin; every access is
  // logged by the caller (PRD RD-05, ARCHITECTURE §9.3).
  AADHAAR_FULL: ["MD", "ADMIN"],
  PAN_FULL: ["MD", "ADMIN", "ACCOUNTS"],
  BANK_FULL: ["MD", "ADMIN", "ACCOUNTS"],
  // Members never see buyer identity (PRD §23.1).
  BUYER_IDENTITY: ["MD", "ADMIN", "ACCOUNTS", "CRM", "PC"],
};

export function can(role: Role, action: Action, extraPermissions: readonly string[] = []): boolean {
  return ROLE_ACTIONS[role]?.includes(action) || extraPermissions.includes(action);
}

export function canViewField(role: Role, field: SensitiveField): boolean {
  return FIELD_ACCESS[field].includes(role);
}

export class PermissionError extends Error {
  role: Role;
  action: Action | SensitiveField;

  constructor(role: Role, action: Action | SensitiveField) {
    super(`${role} is not permitted to perform ${action}.`);
    this.name = "PermissionError";
    this.role = role;
    this.action = action;
  }
}

export function assertPermission(
  role: Role,
  action: Action,
  extraPermissions: readonly string[] = []
): void {
  if (!can(role, action, extraPermissions)) throw new PermissionError(role, action);
}

/**
 * Maker-checker separation (PRD §11.2, ARCHITECTURE §3.3): the account that
 * submitted a protected change may not be the account that approves it.
 */
export function assertDifferentActor(makerRef: string, checkerRef: string): void {
  if (makerRef === checkerRef) {
    throw new Error("Maker and checker must be different staff accounts.");
  }
}
