// One History timeline for a Person's profile — Customer and Member alike.
//
// Both profiles sit on the same Person, so the audit rows filed against that
// Person (detail edits, bank, identity views) read the same on either page.
// Each page adds the events only it has, then sorts with `newestFirst`.

export type HistoryItem = { at: Date; title: string; detail?: string; by?: string };

/** The fields Edit details changes, in the words the Profile card uses. */
const FIELD_LABEL: Record<string, string> = {
  fullName: "Name",
  primaryMobile: "Mobile",
  altMobile: "Alternate Mobile",
  email: "Email",
  city: "City",
  addressLine: "Address",
  dateOfBirth: "Date of Birth",
};

const AUDIT_TITLE: Record<string, string> = {
  PERSON_DETAILS_UPDATED: "Details edited",
  BANK_DETAILS_ENTERED: "Bank details entered",
  BANK_DETAILS_VERIFIED: "Bank details verified",
  BANK_DETAILS_REJECTED: "Bank details rejected",
  AADHAAR_REVEALED: "Full Aadhaar viewed",
  AADHAAR_REVEAL_DENIED: "Full Aadhaar view refused",
  IDENTITY_REVEALED: "Full Aadhaar / PAN viewed",
  IDENTITY_REVEAL_DENIED: "Full Aadhaar / PAN view refused",
  BANK_REVEALED: "Full bank account viewed",
  MEMBER_ACTIVATED: "Activated as a Member",
  MEMBER_DEACTIVATED: "Member deactivated",
  MEMBER_REACTIVATED: "Member reactivated",
  MEMBER_RERA_UPDATED: "RERA updated",
  MEMBER_COMMISSION_HOLD_APPLIED: "Commission Hold applied",
  MEMBER_COMMISSION_HOLD_REMOVED: "Commission Hold removed",
  PORTAL_PASSWORD_RESET: "Portal password reset",
  PORTAL_UNLOCKED: "Portal account unlocked",
};

const words = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replaceAll("_", " ");

type AuditRow = {
  at: Date;
  action: string;
  actorRef: string;
  reason: string | null;
  beforeMasked: unknown;
  afterMasked: unknown;
};

/**
 * Audit rows as timeline entries. Merges are left out: `mergeHistory` reads
 * them from their own requests, which name both sides. Mobile numbers go
 * through `contact`, so a viewer who sees them masked elsewhere does here too.
 */
export function auditHistory(
  events: readonly AuditRow[],
  contact: (mobile: string) => string
): HistoryItem[] {
  return events
    .filter((e) => !e.action.startsWith("PERSON_MERGE"))
    .map((e) => {
      const before = (e.beforeMasked ?? {}) as Record<string, unknown>;
      const after = (e.afterMasked ?? {}) as Record<string, unknown>;
      const shown = (field: string, value: unknown) =>
        value == null || value === ""
          ? "blank"
          : field === "primaryMobile" || field === "altMobile"
            ? contact(String(value))
            : String(value);

      let detail: string | undefined;
      if (e.action === "PERSON_DETAILS_UPDATED") {
        detail = Object.keys(FIELD_LABEL)
          .filter((k) => before[k] !== after[k])
          .map((k) => `${FIELD_LABEL[k]}: ${shown(k, before[k])} → ${shown(k, after[k])}`)
          .join(" · ");
      } else if (e.action === "BANK_DETAILS_ENTERED") {
        detail = [after.bankName, after.accountLastFour && `account ending ${after.accountLastFour}`]
          .filter(Boolean)
          .join(" · ");
      } else if (typeof before.reraStatus === "string" && typeof after.reraStatus === "string") {
        detail = `${words(before.reraStatus)} → ${words(after.reraStatus)}`;
      }

      return {
        at: e.at,
        title: AUDIT_TITLE[e.action] ?? words(e.action),
        detail: [detail, e.reason].filter(Boolean).join(" — ") || undefined,
        by: e.actorRef,
      };
    });
}

type MergeRow = {
  survivingPersonId: string;
  status: string;
  reason: string;
  requestedAt: Date;
  requestedByRef: string;
  decidedAt: Date | null;
  decidedByRef: string | null;
  decisionNote: string | null;
  survivingPerson: { fullName: string };
  mergedPerson: { fullName: string };
};

/** A merge, from the side of the Person whose profile is open. */
export function mergeHistory(merges: readonly MergeRow[], personId: string): HistoryItem[] {
  return merges.map((m) => {
    const survives = m.survivingPersonId === personId;
    const other = survives ? m.mergedPerson.fullName : m.survivingPerson.fullName;
    return {
      at: m.decidedAt ?? m.requestedAt,
      title:
        m.status === "APPROVED"
          ? survives
            ? `${other} merged into this profile`
            : `Merged into ${other}`
          : `Merge with ${other} ${m.status.toLowerCase()}`,
      detail: [m.reason, m.decisionNote].filter(Boolean).join(" — "),
      by: m.decidedByRef ?? m.requestedByRef,
    };
  });
}

export const newestFirst = (items: HistoryItem[]) =>
  items.sort((a, b) => b.at.getTime() - a.at.getTime());
