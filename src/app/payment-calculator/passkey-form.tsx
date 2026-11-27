"use client";

import React from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { beginCalculatorPasskeyAction, finishCalculatorPasskeyAction } from "./actions";

export function PasskeyForm({ setup }: { setup: boolean }) {
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [setupKey, setSetupKey] = React.useState("");
  return (
    <form className="mt-4 space-y-3" onSubmit={async (event) => {
      event.preventDefault();
      const key = setup ? setupKey : null;
      setSetupKey("");
      setBusy(true);
      setError("");
      try {
        const begin = await beginCalculatorPasskeyAction(key);
        if (!begin.ok) return setError(begin.error);
        const response = begin.kind === "registration"
          ? await startRegistration({ optionsJSON: begin.options })
          : await startAuthentication({ optionsJSON: begin.options });
        if (!(await finishCalculatorPasskeyAction(response))) {
          return setError("Verification failed. Try your registered passkey again.");
        }
        window.location.reload();
      } catch {
        setError("Passkey verification did not complete. Try again.");
      } finally {
        setBusy(false);
      }
    }}>
      {setup && (
        <div className="space-y-1">
          <label htmlFor="worksheet-key" className="block text-sm">One-time setup key</label>
          <PasswordInput id="worksheet-key" value={setupKey} onChange={(e) => setSetupKey(e.target.value)}
            autoComplete="off" visibilityLabel="setup key" required maxLength={256} />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Waiting for passkey…" : setup ? "Register passkey" : "Unlock with passkey"}
      </Button>
    </form>
  );
}
