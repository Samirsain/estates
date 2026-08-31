"use client";

// What can be done to one Member, on the Member's own page.
//
// These four used to sit behind an Update menu in the Members list, one per
// row. They are decisions about a Member — their RERA, their commission hold,
// whether they are active at all — and the page that already shows all of that
// is the honest place to make them. The list went back to being a list.

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { MemberDialog, ReraFields } from "../members-client";
import {
  generateMemberAutoLoginLinkAction,
  setCommissionHoldAction,
  setMemberStatusAction,
  updateMemberReraAction,
  type ActionResult,
} from "../actions";

export type MemberActionsView = {
  /** MemberProfile id — what every action here is addressed to. */
  id: string;
  memberId: string;
  name: string;
  status: string;
  commissionHold: boolean;
  reraStatus: string;
  reraNumber: string | null;
  reraExpiryDate: string | null;
  reraNotApplicableReason: string | null;
};

type Dialog =
  | { kind: "STATUS"; active: boolean }
  | { kind: "HOLD"; hold: boolean }
  | { kind: "RERA" }
  | null;

export function MemberActions({
  member,
  canActivate,
  canDeactivate,
}: {
  member: MemberActionsView;
  canActivate: boolean;
  canDeactivate: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);

  const active = member.status === "ACTIVE";
  // Nothing in the menu is available to a reader, so the trigger is not either.
  if (!active && !canDeactivate && !canActivate) return null;

  async function run(action: () => Promise<ActionResult>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const result = await action();
    setBusy(false);
    setNotice(result.ok ? { ok: true, text: result.message ?? "Done." } : { ok: false, text: result.error });
    if (result.ok) {
      setDialog(null);
      router.refresh();
    }
  }

  /**
   * The whole welcome message, not just the link: the Member ID, the first
   * password and the one-click way in. It goes straight to the clipboard
   * rather than onto a page somebody might leave open, and the plain portal
   * login stands in when the signed link cannot be issued.
   */
  async function copyInviteLink() {
    setBusy(true);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const result = await generateMemberAutoLoginLinkAction(member.memberId);
    setBusy(false);

    const link =
      result.ok && result.linkPath
        ? `${origin}${result.linkPath}`
        : `${origin}/portal/login?loginId=${member.memberId}`;
    const text =
      `🌟 Welcome to 3% Real Estate Club Member Portal!\n\n` +
      `Hi ${member.name}, your Member account (${member.memberId}) is active.\n\n` +
      `🔗 Instant Auto-Login Link (Direct Portal Access):\n${link}\n\n` +
      `🆔 Member ID: ${member.memberId}\n🔑 Initial Password: ChangeMe#2026\n\n` +
      `Click the link above to log in automatically and access your portal!`;

    try {
      await navigator.clipboard.writeText(text);
      setNotice({ ok: true, text: `Invite for ${member.memberId} copied to the clipboard.` });
    } catch {
      // A denied clipboard is not a failed action — the link exists either way.
      setNotice({ ok: false, text: "Could not reach the clipboard. Try again from a focused tab." });
    }
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy}>
              {busy ? "Working…" : "Update"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {active && (
              <DropdownMenuItem onSelect={() => void copyInviteLink()}>
                Copy invite link
              </DropdownMenuItem>
            )}
            {canActivate && (
              <DropdownMenuItem onSelect={() => setDialog({ kind: "RERA" })}>
                Update RERA
              </DropdownMenuItem>
            )}
            {canDeactivate && (
              <DropdownMenuItem
                onSelect={() => setDialog({ kind: "HOLD", hold: !member.commissionHold })}
              >
                {member.commissionHold ? "Remove Commission Hold" : "Apply Commission Hold"}
              </DropdownMenuItem>
            )}
            {canDeactivate && (
              <DropdownMenuItem
                onSelect={() => setDialog({ kind: "STATUS", active: !active })}
                className={active ? "text-red-700 focus:text-red-700" : ""}
              >
                {active ? "Deactivate Member" : "Reactivate Member"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {notice && (
          <p
            className={`max-w-xs text-right text-[11px] ${
              notice.ok ? "text-muted-foreground" : "text-destructive"
            }`}
          >
            {notice.text}
          </p>
        )}
      </div>

      {dialog?.kind === "STATUS" && (
        <MemberDialog
          title={dialog.active ? "Reactivate Member" : "Deactivate Member"}
          row={member}
          consequence={
            dialog.active
              ? "Portal access is restored, the Member may act again, and unpaid commission eligibility is rechecked rather than assumed. Network positions are unchanged."
              : "Portal access stops immediately, no new Member Enquiries, Hold Requests or Member-linked Booking Requests may be created, and every unpaid commission goes On Hold — Member Deactivated. Paid and Paid Early records stay historical, and Network positions stay exactly as they are."
          }
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() => setMemberStatusAction(member.id, dialog.active, String(f.get("reason")), newKey()))
          }
        />
      )}

      {dialog?.kind === "HOLD" && (
        <MemberDialog
          title={dialog.hold ? "Apply Commission Hold" : "Remove Commission Hold"}
          row={member}
          consequence={
            dialog.hold
              ? "Every unpaid commission record for this Member goes On Hold. Paid and Paid Early history is untouched."
              : "Affected records are reassessed and the same Accounts task resumes rather than a duplicate being created."
          }
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() => setCommissionHoldAction(member.id, dialog.hold, String(f.get("reason")), newKey()))
          }
        />
      )}

      {dialog?.kind === "RERA" && (
        <Modal title={`RERA — ${member.memberId}`} onClose={() => setDialog(null)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(() =>
                updateMemberReraAction(
                  {
                    memberProfileId: member.id,
                    status: String(f.get("reraStatus")) as "PENDING",
                    reraNumber: String(f.get("reraNumber") ?? ""),
                    expiryDate: String(f.get("reraExpiryDate") ?? ""),
                    notApplicableReason: String(f.get("reraNotApplicableReason") ?? ""),
                  },
                  newKey()
                )
              );
            }}
          >
            <ReraFields row={member} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialog(null)}>
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Processing…" : "Save"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

const newKey = () => globalThis.crypto.randomUUID();
