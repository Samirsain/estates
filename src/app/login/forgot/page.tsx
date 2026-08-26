// Forgot password — PRD.md §17.1. Staff context only; the Member portal has its
// own recovery path through the CRM.
//
// Identity is proven by the shared recovery key rather than by an email link:
// this system has no outbound mail, and a reset nobody can perform is how an
// account gets abandoned. The key is read out by the office, never printed here.

import { KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PASSWORD_MIN_LENGTH } from "@/lib/security/auth";
import { forgotStaffPassword } from "../actions";
import { RecoverButton } from "../login-form";

const MESSAGES: Record<string, string> = {
  // Wrong key and unknown account must read the same (PRD §17.1).
  GENERIC: "Those recovery details are not valid.",
  RATE: "Too many attempts. Wait a minute and try again.",
  MATCH: "The two new passwords do not match.",
  WEAK: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; loginId?: string }>;
}) {
  const { error, loginId = "" } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="" className="h-11 w-11" />
          <div>
            <h1 className="text-lg font-bold tracking-tight gradient-text">3% Club CRM</h1>
            <p className="text-xs text-muted-foreground">v3.1 — Reset your password</p>
          </div>
        </div>

        <Card className="p-4">
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700"
            >
              {MESSAGES[error] ?? MESSAGES.GENERIC}
            </p>
          )}

          <form action={forgotStaffPassword} className="space-y-4">
            <label className="block space-y-1 text-xs font-medium text-muted-foreground">
              <span>Staff Account ID</span>
              <Input name="loginId" required autoComplete="username" defaultValue={loginId} placeholder="STF-0001" />
            </label>

            <label className="block space-y-1 text-xs font-medium text-muted-foreground">
              <span>Recovery key</span>
              <PasswordInput name="recoveryKey" required autoComplete="off" />
              <span className="block text-[11px] font-normal">
                Ask the office for it if you do not have it.
              </span>
            </label>

            <label className="block space-y-1 text-xs font-medium text-muted-foreground">
              <span>New password</span>
              <PasswordInput
                name="newPassword"
                required
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
              />
            </label>

            <label className="block space-y-1 text-xs font-medium text-muted-foreground">
              <span>Confirm new password</span>
              <PasswordInput
                name="confirmPassword"
                required
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
              />
            </label>

            <RecoverButton />
          </form>

          <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Setting a new password here signs out every device on this account.
          </p>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground">
          <a href="/login" className="underline underline-offset-2 hover:text-foreground">
            Back to sign in
          </a>
        </p>
      </div>
    </div>
  );
}
