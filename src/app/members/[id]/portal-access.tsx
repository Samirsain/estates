"use client";

// The Member's portal account, managed from their page — Admin and MD only.
// Both actions carry a compulsory reason and are audited; a reset password is
// shown once and exists nowhere else afterwards.

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Modal } from "@/components/ui/modal";
import { resetPortalAccessAction } from "../actions";

type Mode = "UNLOCK" | "RESET_PASSWORD";

export default function PortalAccess({
  memberProfileId,
  memberId,
  locked,
}: {
  memberProfileId: string;
  memberId: string;
  locked: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode | null>(null);
  // One key per opened form, so a double submit is one reset, not two.
  const [key, setKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState<string | null>(null);

  const open = (next: Mode) => {
    setError(null);
    setPassword(null);
    setKey(globalThis.crypto.randomUUID());
    setMode(next);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {locked && (
          <Button type="button" size="sm" variant="outline" onClick={() => open("UNLOCK")}>
            Unlock account
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" onClick={() => open("RESET_PASSWORD")}>
          Reset password
        </Button>
      </div>

      {mode && (
        <Modal
          title={mode === "UNLOCK" ? `Unlock portal — ${memberId}` : `Reset portal password — ${memberId}`}
          onClose={() => setMode(null)}
        >
          {password ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Every portal session is signed out. Give the Member this password — it is shown only
                now.
              </p>
              <p className="select-all rounded-lg border border-border bg-secondary px-3 py-2 text-center font-mono text-base tracking-wider">
                {password}
              </p>
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={() => setMode(null)}>
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
                const result = await resetPortalAccessAction(memberProfileId, mode, reason, key);
                setBusy(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.refresh();
                if (result.oneTimePassword) setPassword(result.oneTimePassword);
                else setMode(null);
              }}
            >
              <p className="text-xs text-muted-foreground">
                {mode === "UNLOCK"
                  ? "Clears the failed sign-in count so the Member can sign in again straight away."
                  : "Sets a new one-time password and signs out every portal session."}
              </p>
              <Field label="Reason — compulsory">
                <Input name="reason" required minLength={3} />
              </Field>
              {error && <p className="text-xs text-red-700">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setMode(null)}>
                  Back
                </Button>
                <Button type="submit" size="sm" disabled={busy}>
                  {busy ? "Working…" : mode === "UNLOCK" ? "Unlock" : "Reset password"}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
