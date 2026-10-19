"use client";

// The Member's portal account, managed from their page's Update menu — Admin and MD only.
// Both actions carry a compulsory reason and are audited; a reset password is
// shown once and exists nowhere else afterwards.

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Modal } from "@/components/ui/modal";
import { resetPortalAccessAction } from "../actions";
import { RemarkSelect } from "@/components/ui/remark-select";

export type PortalMode = "UNLOCK" | "RESET_PASSWORD";

/** Opened from the Member page's Update menu; mounted only while open. */
export default function PortalAccessDialog({
  memberProfileId,
  memberId,
  mode,
  onClose,
}: {
  memberProfileId: string;
  memberId: string;
  mode: PortalMode;
  onClose: () => void;
}) {
  const router = useRouter();
  // One key per opened form, so a double submit is one reset, not two.
  const [key] = React.useState(() => globalThis.crypto.randomUUID());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState<string | null>(null);

  return (
    <Modal
      title={
        mode === "UNLOCK"
          ? `Unlock portal — ${memberId}`
          : `Reset portal password — ${memberId}`
      }
      onClose={() => onClose()}
    >
      {password ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Every portal session is signed out. Give the Member this password —
            it is shown only now.
          </p>
          <p className="select-all rounded-lg border border-border bg-secondary px-3 py-2 text-center font-mono text-base tracking-wider">
            {password}
          </p>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => onClose()}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason"));
            setBusy(true);
            const result = await resetPortalAccessAction(
              memberProfileId,
              mode,
              reason,
              key,
            );
            setBusy(false);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
            if (result.oneTimePassword) setPassword(result.oneTimePassword);
            else onClose();
          }}
        >
          <p className="text-xs text-muted-foreground">
            {mode === "UNLOCK"
              ? "Clears the failed sign-in count so the Member can sign in again straight away."
              : "Sets a new one-time password and signs out every portal session."}
          </p>
          <Field label="Reason — compulsory">
            <RemarkSelect presets="portalAccess" name="reason" required />
          </Field>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onClose()}
            >
              Back
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy
                ? "Working…"
                : mode === "UNLOCK"
                  ? "Unlock"
                  : "Reset password"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
