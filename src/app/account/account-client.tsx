"use client";

// My Account — DESIGN.md §18; PRD.md §17.1.
// Members see this without the staff shell; staff see it inside their shell.

import React from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/modal";
import type { StaffRole } from "@/lib/tasks";
import { changeOwnPasswordAction, type ActionResult } from "./actions";

export default function AccountClient({
  loginId,
  name,
  role,
  context,
}: {
  loginId: string;
  name: string;
  role: StaffRole | "MEMBER";
  context: "STAFF" | "MEMBER";
}) {
  const body = <PasswordCard loginId={loginId} name={name} />;

  if (context === "MEMBER") {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <h1 className="text-xl font-semibold">My Account</h1>
        {body}
      </main>
    );
  }

  return (
    <AppShell role={role as StaffRole} actorName={name} staffAccountId={loginId}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">My Account</h1>
        {body}
      </div>
    </AppShell>
  );
}

function PasswordCard({ loginId, name }: { loginId: string; name: string }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    const outcome = await changeOwnPasswordAction(current, next, confirm);
    setResult(outcome);
    setBusy(false);
    if (outcome.ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  }

  return (
    <Card className="max-w-xl space-y-4 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <KeyRound className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Change password</h2>
          <p className="text-xs text-muted-foreground">
            {name} · {loginId}
          </p>
        </div>
      </div>

      <form className="space-y-3" onSubmit={submit}>
        <Field label="Current password">
          <PasswordInput
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </Field>
        <Field label="New password (at least 10 characters)">
          <PasswordInput
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </Field>
        <Field label="Confirm new password">
          <PasswordInput
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </Field>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Changing your password signs out every other device immediately. This one stays signed in.
        </p>

        {result && (
          <p
            className={`text-xs ${result.ok ? "text-emerald-700" : "text-red-700"}`}
            role="status"
          >
            {result.ok ? result.message : result.error}
          </p>
        )}

        <Button type="submit" disabled={busy}>
          {busy ? "Changing…" : "Change password"}
        </Button>
      </form>
    </Card>
  );
}

