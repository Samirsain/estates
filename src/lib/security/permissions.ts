// Role, record and field authorisation — prd-corrections.md §3; architecture.md §9.2.
// Deny by default. Hiding a button is never the control (design.md §1).

export type StaffRole = "MD" | "ACCOUNTS" | "CRM" | "MIS" | "PC";
/** Staff only: Members have no sign-in since the portal was removed (owner, 29 Oct 2026). */
export type Role = StaffRole;

export const STAFF_ROLES: StaffRole[] = ["MD", "ACCOUNTS", "CRM", "MIS", "PC"];

export type Action =
  // Administration
  | "STAFF_MANAGE"
  | "STAFF_EMERGENCY_DISABLE"
  | "ROLE_PERMISSION_MANAGE"
  | "MEMBER_ACTIVATE"
  | "MEMBER_DEACTIVATE"
  | "PERSON_MERGE"
  // A Customer or Member is often taken down as a name and a number and
  // nothing else. Filling the rest in later is ordinary desk work, so CRM
  // holds it — with a compulsory reason and a before/after audit either way.
  | "PERSON_DETAILS_EDIT"
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
  | "HOLD_REQUEST_REVIEW"
  // Pre-acquisition land sourcing (Land Inquiry spec §27). Viewing is any
  // signed-in staff account; reopening and archiving are MD/Admin only, which
  // is what holding no role grant already means.
  | "LAND_INQUIRY_MANAGE"
  | "LAND_INQUIRY_REOPEN"
  | "LAND_INQUIRY_ARCHIVE"
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
  // Completion (PRD §4; prd-complete §18)
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

/**
 * The ticks a new account starts with, by job (owner, 17 Nov 2026). After that
 * the account's own list is the whole truth: MD ticks and unticks anything on
 * the Permissions screen, and a role change starts the list again from here.
 */
const STARTING_PERMISSIONS: Record<Role, readonly Action[]> = {
  // MD answers for everything the company does, so it holds every Action
  // rather than a list that has to be remembered each time one is added — see
  // FULL_ACCESS in `can`. There is no Admin role: the owner folded it into MD.
  MD: [],
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
    "LAND_INQUIRY_MANAGE",
    "PERSON_DETAILS_EDIT",
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
  // No financial approval (PRD §3). Project and Plot setup is MD's alone (owner, 16 Oct 2026).
  PC: ["TASK_COMPLETE", "REPORT_VIEW"],
};

/** Sensitive values are masked unless the role holds explicit field permission. */
export type SensitiveField =
  | "AADHAAR_FULL"
  | "PAN_FULL"
  | "BANK_FULL"
  | "MOBILE_FULL"
  | "BUYER_IDENTITY";

const FIELD_ACCESS: Record<SensitiveField, readonly Role[]> = {
  // Full Aadhaar only for specifically authorised MD/Admin; every access is
  // logged by the caller (PRD RD-05, ARCHITECTURE §9.3).
  AADHAAR_FULL: ["MD"],
  PAN_FULL: ["MD", "ACCOUNTS"],
  BANK_FULL: ["MD", "ACCOUNTS"],
  // A contact number is not encrypted and is not a protected identity value —
  // it is masked so a screen shared in a room does not leak it. MD and Admin
  // run the business off these numbers, so they read them whole.
  MOBILE_FULL: ["MD"],
  // Members never see buyer identity (PRD §23.1).
  BUYER_IDENTITY: ["MD", "ACCOUNTS", "CRM", "PC"],
};

/** The roles that hold every Action, present and future. */
const FULL_ACCESS: readonly Role[] = ["MD"];

/**
 * No tick reaches these, so the permission screen hides them. Projects and
 * Plots are MD's alone (owner, 16 Oct 2026). Administration is MD's menu, so
 * staff, permission and merge work stays there — a tick would open nothing and
 * would let one account hand itself more. The last two are never checked
 * outside MD's own paths, so a tick for them would do nothing.
 */
export const MD_ONLY_ACTIONS: readonly Action[] = [
  "PROJECT_SETUP",
  "PLOT_SETUP",
  "STAFF_MANAGE",
  "STAFF_EMERGENCY_DISABLE",
  "ROLE_PERMISSION_MANAGE",
  "PERSON_MERGE",
  "HOLD_EXTEND_FURTHER",
  "PLC_SNAPSHOT_CORRECT",
];

export function startingPermissions(role: Role): Action[] {
  return STARTING_PERMISSIONS[role].filter((action) => !MD_ONLY_ACTIONS.includes(action));
}

/** `granted` is the account's own tick list (StaffAccount.extraPermissions). */
export function can(role: Role, action: Action, granted: readonly string[]): boolean {
  if (FULL_ACCESS.includes(role)) return true;
  if (MD_ONLY_ACTIONS.includes(action)) return false;
  return granted.includes(action);
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

export function assertPermission(role: Role, action: Action, granted: readonly string[]): void {
  if (!can(role, action, granted)) throw new PermissionError(role, action);
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
 * approved-deviations.md D-06 — staff are the company's own employees; Members and
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
 * Every Action, grouped the way the Administration permission screen shows
 * them (owner, 17 Nov 2026: plain words, by area of work). Every Action appears exactly
 * once — `security.check.ts` fails if one is added to the union and forgotten
 * here, which would silently hide it from the screen that grants it.
 */
export const ACTION_GROUPS = [
  {
    group: "Enquiries and land",
    actions: ["ENQUIRY_MANAGE", "LAND_INQUIRY_MANAGE", "LAND_INQUIRY_REOPEN", "LAND_INQUIRY_ARCHIVE"],
  },
  {
    group: "Plots and holds",
    actions: [
      "HOLD_CREATE",
      "HOLD_EXTEND_FIRST",
      "HOLD_EXTEND_FURTHER",
      "HOLD_REQUEST_REVIEW",
      "PLOT_RESTRICTION_MANAGE",
      "PLOT_MAKE_AVAILABLE",
      "PROJECT_SETUP",
      "PLOT_SETUP",
      "PLC_SNAPSHOT_CORRECT",
    ],
  },
  {
    group: "Bookings",
    actions: [
      "BOOKING_REQUEST_SUBMIT",
      "BOOKING_DECIDE",
      "BOOKING_CANCEL_REQUEST",
      "CANCELLATION_DECIDE",
      "CHANGE_PLOT_RAISE",
      "CHANGE_PLOT_DECIDE",
      "SCHEDULE_REVISE",
      "SCHEDULE_DECIDE",
      "OWNERSHIP_SHARE_CHANGE",
      "PRIMARY_CUSTOMER_CHANGE_RAISE",
      "PRIMARY_CUSTOMER_CHANGE_APPROVE",
      "SOLD_BY_CORRECTION_RAISE",
      "SOLD_BY_CORRECTION_APPROVE",
      "FINAL_BUYER_RECORD",
      "COMPLETION_RECORD",
      "DELIVERY_REOPEN",
    ],
  },
  {
    group: "Money",
    actions: [
      "PAYMENT_RECEIVED_CONFIRM",
      "PAYMENT_CORRECT",
      "COMMISSION_PROCESS",
      "BANK_DETAILS_ENTER",
      "BANK_VERIFY",
    ],
  },
  {
    group: "Buyback / Resale",
    actions: [
      "ACQUISITION_CREATE",
      "ACQUISITION_DECIDE",
      "ACQUISITION_CANCEL",
      "PAYMENT_GIVEN_CONFIRM",
      "BUYING_COMMISSION_RECORD",
    ],
  },
  {
    group: "Members and customers",
    actions: ["MEMBER_ACTIVATE", "MEMBER_DEACTIVATE", "PERSON_DETAILS_EDIT", "PERSON_MERGE"],
  },
  {
    group: "Tasks and reports",
    actions: ["TASK_CREATE", "TASK_COMPLETE", "WORK_REASSIGN", "REPORT_VIEW", "REPORT_EXPORT", "AUDIT_VIEW"],
  },
  {
    group: "Staff",
    actions: ["STAFF_MANAGE", "STAFF_EMERGENCY_DISABLE", "ROLE_PERMISSION_MANAGE"],
  },
] as const satisfies readonly { group: string; actions: readonly Action[] }[];

/** What each tick means, in the words the screen shows. */
export const ACTION_LABELS: Record<Action, string> = {
  ENQUIRY_MANAGE: "Add and follow up enquiries",
  LAND_INQUIRY_MANAGE: "Add and follow up land inquiries",
  LAND_INQUIRY_REOPEN: "Reopen a closed land inquiry",
  LAND_INQUIRY_ARCHIVE: "Archive a land inquiry",
  HOLD_CREATE: "Put a plot on hold for a buyer",
  HOLD_EXTEND_FIRST: "Extend a hold (first time)",
  HOLD_EXTEND_FURTHER: "Extend a hold again",
  HOLD_REQUEST_REVIEW: "Approve or reject hold requests",
  PLOT_RESTRICTION_MANAGE: "Block a plot from sale, or unblock it",
  PLOT_MAKE_AVAILABLE: "Put a plot back on sale",
  PROJECT_SETUP: "Create and edit projects",
  PLOT_SETUP: "Create and edit plots",
  PLC_SNAPSHOT_CORRECT: "Correct a locked location charge",
  BOOKING_REQUEST_SUBMIT: "Send a booking for approval",
  BOOKING_DECIDE: "Approve or reject a booking",
  BOOKING_CANCEL_REQUEST: "Ask to cancel a booking",
  CANCELLATION_DECIDE: "Approve a booking cancellation",
  CHANGE_PLOT_RAISE: "Ask to move a booking to another plot",
  CHANGE_PLOT_DECIDE: "Approve moving a booking to another plot",
  SCHEDULE_REVISE: "Change a booking's payment plan",
  SCHEDULE_DECIDE: "Approve a payment plan change",
  OWNERSHIP_SHARE_CHANGE: "Change each buyer's share in a booking",
  PRIMARY_CUSTOMER_CHANGE_RAISE: "Ask to change the main buyer",
  PRIMARY_CUSTOMER_CHANGE_APPROVE: "Approve a main buyer change",
  SOLD_BY_CORRECTION_RAISE: "Ask to correct who made the sale",
  SOLD_BY_CORRECTION_APPROVE: "Approve a correction of who made the sale",
  FINAL_BUYER_RECORD: "Fill in the final buyer details",
  COMPLETION_RECORD: "Mark a plot as handed over",
  DELIVERY_REOPEN: "Reopen a handed-over booking",
  PAYMENT_RECEIVED_CONFIRM: "Confirm money received from a buyer",
  PAYMENT_CORRECT: "Correct a wrong payment entry",
  COMMISSION_PROCESS: "Pay out commission",
  BANK_DETAILS_ENTER: "Enter bank details",
  BANK_VERIFY: "Check and approve bank details",
  ACQUISITION_CREATE: "Start a buyback",
  ACQUISITION_DECIDE: "Approve or reject a buyback",
  ACQUISITION_CANCEL: "Cancel a buyback",
  PAYMENT_GIVEN_CONFIRM: "Confirm money paid to a seller",
  BUYING_COMMISSION_RECORD: "Record commission on a buyback",
  MEMBER_ACTIVATE: "Add Members and edit their details",
  MEMBER_DEACTIVATE: "Turn a Member off",
  PERSON_DETAILS_EDIT: "Edit a customer's or member's details",
  PERSON_MERGE: "Join two records of the same person",
  TASK_CREATE: "Add tasks",
  TASK_COMPLETE: "Mark tasks as done",
  WORK_REASSIGN: "Hand someone's open work to another staff member",
  REPORT_VIEW: "See reports",
  REPORT_EXPORT: "Download reports",
  AUDIT_VIEW: "See the history of who did what",
  STAFF_MANAGE: "Add staff and reset passwords",
  STAFF_EMERGENCY_DISABLE: "Block a staff login at once",
  ROLE_PERMISSION_MANAGE: "Change a staff member's job and permissions",
};

/** Each job in plain words, for the Role pickers. */
export const ROLE_LABELS: Record<StaffRole, string> = {
  MD: "MD — Managing Director, can do everything",
  ACCOUNTS: "Accounts — approves bookings and handles money",
  CRM: "CRM — handles customers, enquiries and bookings",
  MIS: "MIS — sees reports and adds tasks",
  PC: "PC — project and plot work",
};

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
  { field: "MOBILE_FULL", label: "Mobile number in full" },
  { field: "BUYER_IDENTITY", label: "Buyer identity" },
];

/** The roles that hold a protected field, for display beside the lock. */
export function rolesHolding(field: SensitiveField): readonly Role[] {
  return FIELD_ACCESS[field];
}
