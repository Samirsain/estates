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
  // PLC spec §12.1 — a frozen snapshot is a critical correction, so it sits
  // with Admin/MD and not with the Project setup permission PC also holds.
  | "PLC_SNAPSHOT_CORRECT"
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
  // MD and Admin answer for everything the company does, so they hold every
  // Action rather than a list that has to be remembered each time one is added
  // — see FULL_ACCESS in `can`. Maker-checker still stands: holding both sides
  // of a decision never lets one account approve its own request.
  MD: [],
  ADMIN: [],
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

/** The roles that hold every Action, present and future. */
const FULL_ACCESS: readonly Role[] = ["MD", "ADMIN"];

export function can(role: Role, action: Action, extraPermissions: readonly string[] = []): boolean {
  return (
    FULL_ACCESS.includes(role) ||
    ROLE_ACTIONS[role]?.includes(action) ||
    extraPermissions.includes(action)
  );
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

/**
 * DEVIATIONS.md D-06 — staff are the company's own employees; Members and
 * Customers are the people the company sells to, and the two sides do not
 * cross. ARCHITECTURE §3.1 lists Staff beside Customer and Member as
 * capabilities one Person may hold, so nothing in the schema stops this: the
 * rule lives at the one command that creates a staff account.
 *
 * Returns the refusal to show, or null when the Person may be given a login.
 * `null` for the Person itself means nobody matched — a genuinely new employee.
 */
export function refuseStaffAccountFor(
  person: {
    fullName: string;
    memberProfile: { memberId: string } | null;
    customerProfile: { customerId: string } | null;
    staffAccount: { staffAccountId: string } | null;
  } | null,
  mobile: string
): string | null {
  if (!person) return null;

  const held = person.memberProfile
    ? `${person.memberProfile.memberId} (Member)`
    : person.customerProfile
      ? `${person.customerProfile.customerId} (Customer)`
      : null;

  if (held) {
    return (
      `${mobile} already belongs to ${person.fullName} · ${held}. A Member or Customer cannot ` +
      `hold a staff account. Use a different mobile, or raise it with the MD.`
    );
  }

  if (person.staffAccount) {
    return `${person.fullName} already holds staff account ${person.staffAccount.staffAccountId}.`;
  }

  return null;
}

/* ------------------------------------------------- the permission catalogue */

/**
 * The same grouping the `Action` union carries as comments, as data, so the
 * Administration permission screen can render it. Every Action appears exactly
 * once — `security.check.ts` fails if one is added to the union and forgotten
 * here, which would silently hide it from the screen that grants it.
 */
export const ACTION_GROUPS = [
  {
    group: "Administration",
    actions: [
      "STAFF_MANAGE",
      "STAFF_EMERGENCY_DISABLE",
      "ROLE_PERMISSION_MANAGE",
      "MEMBER_ACTIVATE",
      "MEMBER_DEACTIVATE",
      "PERSON_MERGE",
      "PROJECT_SETUP",
      "PLC_SNAPSHOT_CORRECT",
      "PLOT_SETUP",
      "PLOT_RESTRICTION_MANAGE",
      "PLOT_MAKE_AVAILABLE",
    ],
  },
  {
    group: "Pre-sales",
    actions: [
      "ENQUIRY_MANAGE",
      "HOLD_CREATE",
      "HOLD_EXTEND_FIRST",
      "HOLD_EXTEND_FURTHER",
      "HOLD_REQUEST_SUBMIT",
      "HOLD_REQUEST_REVIEW",
    ],
  },
  {
    group: "Sale",
    actions: [
      "BOOKING_REQUEST_SUBMIT",
      "BOOKING_DECIDE",
      "BOOKING_CANCEL_REQUEST",
      "PAYMENT_RECEIVED_CONFIRM",
      "PAYMENT_GIVEN_CONFIRM",
      "ACQUISITION_CREATE",
      "ACQUISITION_DECIDE",
      "ACQUISITION_CANCEL",
      "CHANGE_PLOT_RAISE",
      "CHANGE_PLOT_DECIDE",
      "CANCELLATION_DECIDE",
      "BUYING_COMMISSION_RECORD",
      "PAYMENT_CORRECT",
      "SCHEDULE_REVISE",
      "SCHEDULE_DECIDE",
      "OWNERSHIP_SHARE_CHANGE",
      "PRIMARY_CUSTOMER_CHANGE_RAISE",
      "PRIMARY_CUSTOMER_CHANGE_APPROVE",
      "SOLD_BY_CORRECTION_RAISE",
      "SOLD_BY_CORRECTION_APPROVE",
      "COMMISSION_PROCESS",
    ],
  },
  {
    group: "Completion",
    actions: [
      "FINAL_BUYER_RECORD",
      "COMPLETION_RECORD",
      "DELIVERY_REOPEN",
      "WORK_REASSIGN",
      "BANK_DETAILS_ENTER",
      "BANK_VERIFY",
    ],
  },
  {
    group: "Work and reporting",
    actions: ["TASK_CREATE", "TASK_COMPLETE", "REPORT_VIEW", "REPORT_EXPORT", "AUDIT_VIEW"],
  },
] as const satisfies readonly { group: string; actions: readonly Action[] }[];

/**
 * `satisfies` above proves every entry IS an Action. This proves the reverse —
 * that every Action is in there. Add one to the union and forget the catalogue
 * and this line stops compiling, which is the only moment anyone would notice:
 * the alternative is a permission that exists but has no checkbox to grant it.
 */
type GroupedAction = (typeof ACTION_GROUPS)[number]["actions"][number];
const _catalogueIsComplete: Exclude<Action, GroupedAction> extends never ? true : false = true;
void _catalogueIsComplete;

/** Every Action, flattened — the set an extra grant is allowed to name. */
export const ALL_ACTIONS: readonly Action[] = ACTION_GROUPS.flatMap((g) => g.actions);

export function isAction(value: string): value is Action {
  return (ALL_ACTIONS as readonly string[]).includes(value);
}

/**
 * What the Administration screen shows about protected data. Deliberately
 * read-only: an extra grant names an Action, and `canViewField` never consults
 * extra grants, so Aadhaar, PAN and bank move only when the role moves. One
 * mistaken checkbox must not be able to open a protected value (PRD RD-05).
 */
export const SENSITIVE_FIELDS: readonly { field: SensitiveField; label: string }[] = [
  { field: "AADHAAR_FULL", label: "Aadhaar in full" },
  { field: "PAN_FULL", label: "PAN in full" },
  { field: "BANK_FULL", label: "Bank account in full" },
  { field: "BUYER_IDENTITY", label: "Buyer identity" },
];

/** The roles that hold a protected field, for display beside the lock. */
export function rolesHolding(field: SensitiveField): readonly Role[] {
  return FIELD_ACCESS[field];
}
