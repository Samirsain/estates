"use client";

// My Account — DESIGN.md §18; PRD.md §17.1.
// Members see this without the staff shell; staff see it inside their shell.

import React from "react";
import { KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/modal";
import type { StaffRole } from "@/lib/tasks";
import {
  beginMfaEnrolmentAction,
  changeOwnPasswordAction,
  confirmMfaEnrolmentAction,
  type ActionResult,
} from "./actions";

export default function AccountClient({
  loginId,
  name,
  role,
  context,
  mfaEnrolled,
}: {
  loginId: string;
  name: string;
  role: StaffRole | "MEMBER";
  context: "STAFF" | "MEMBER";
  mfaEnrolled: boolean;
}) {
  const body = (
    <>
      <PasswordCard loginId={loginId} name={name} />
      {context === "STAFF" && <MfaCard role={role} enrolled={mfaEnrolled} />}
    </>
  );

  if (context === "MEMBER") {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
        <h1 className="text-xl font-semibold">My Account</h1>
        {body}
      </main>
    );
  }

  return (
    <AppShell role={role as StaffRole} actorName={name} staffAccountId={loginId}>
      <div className="space-y-6">
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
    <Card className="max-w-xl space-y-4 p-6">
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
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </Field>
        <Field label="New password (at least 10 characters)">
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </Field>
        <Field label="Confirm new password">
          <Input
            type="password"
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

/** PRD §3.1 — MFA is mandatory for MD and Admin, and optional for other roles. */
function MfaCard({ role, enrolled }: { role: StaffRole | "MEMBER"; enrolled: boolean }) {
  const [secret, setSecret] = React.useState<string | null>(null);
  const [otpauth, setOtpauth] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const [done, setDone] = React.useState(enrolled);

  const mandatory = role === "MD" || role === "ADMIN";

  async function begin() {
    setBusy(true);
    setResult(null);
    const outcome = await beginMfaEnrolmentAction();
    setBusy(false);
    if (outcome.ok) {
      setSecret(outcome.secret);
      setOtpauth(outcome.otpauth);
    } else {
      setResult(outcome);
    }
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setBusy(true);
    const outcome = await confirmMfaEnrolmentAction(secret!, code);
    setBusy(false);
    setResult(outcome);
    if (outcome.ok) {
      setDone(true);
      setSecret(null);
      setOtpauth(null);
    }
  }

  return (
    <Card className="max-w-xl space-y-4 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <Smartphone className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Two-factor authentication</h2>
          <p className="text-xs text-muted-foreground">
            {done
              ? "Enrolled — sign-in asks for a code from your authenticator app."
              : mandatory
                ? "Required for your role. Sign-in is not complete without it."
                : "Optional for your role."}
          </p>
        </div>
      </div>

      {!done && !secret && (
        <Button onClick={begin} disabled={busy}>
          {busy ? "Preparing…" : "Set up authenticator"}
        </Button>
      )}

      {secret && (
        <form className="space-y-3" onSubmit={confirm}>
          <p className="text-xs text-muted-foreground">
            Add this secret to your authenticator app, then enter the code it shows. Nothing is saved
            until the code matches.
          </p>
          <div className="rounded-xl border border-border/60 bg-secondary p-3">
            <p className="break-all font-mono text-sm">{secret}</p>
            {otpauth && (
              <p className="mt-2 break-all text-[10px] text-muted-foreground">{otpauth}</p>
            )}
          </div>
          <Field label="6-digit code">
            <Input name="code" inputMode="numeric" maxLength={6} required autoComplete="one-time-code" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Verifying…" : "Verify and enrol"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSecret(null);
                setOtpauth(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {result && (
        <p className={`text-xs ${result.ok ? "text-emerald-700" : "text-red-700"}`} role="status">
          {result.ok ? result.message : result.error}
        </p>
      )}
    </Card>
  );
}
