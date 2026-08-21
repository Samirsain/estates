// Staff and Member portal are separate security contexts (ARCHITECTURE §9.1).

import { Building2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GENERIC_LOGIN_ERROR } from "@/lib/security/auth";
import { memberLogin, staffLogin } from "./actions";

const MESSAGES: Record<string, string> = {
  GENERIC: GENERIC_LOGIN_ERROR,
  MFA: "MD and Admin accounts require a multi-factor code. Enter the 6-digit code from your authenticator app.",
  RATE: "Too many attempts. Wait a minute and try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const { tab = "staff", error } = await searchParams;
  const member = tab === "member";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight gradient-text">3% Club CRM</h1>
            <p className="text-xs text-muted-foreground">v3.1 — Asia/Kolkata</p>
          </div>
        </div>

        <div className="flex gap-2">
          <a
            href="/login?tab=staff"
            aria-current={!member ? "page" : undefined}
            className={`flex-1 rounded-xl border px-3 py-2 text-center text-xs font-semibold ${
              !member ? "border-primary/40 bg-primary/15 text-primary" : "border-border/60 text-muted-foreground"
            }`}
          >
            Staff
          </a>
          <a
            href="/login?tab=member"
            aria-current={member ? "page" : undefined}
            className={`flex-1 rounded-xl border px-3 py-2 text-center text-xs font-semibold ${
              member ? "border-primary/40 bg-primary/15 text-primary" : "border-border/60 text-muted-foreground"
            }`}
          >
            Member portal
          </a>
        </div>

        <Card className="p-6">
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            >
              {MESSAGES[error] ?? GENERIC_LOGIN_ERROR}
            </p>
          )}

          <form action={member ? memberLogin : staffLogin} className="space-y-4">
            <label className="block space-y-1 text-xs font-medium text-muted-foreground">
              <span>{member ? "Member ID" : "Staff Account ID"}</span>
              <Input
                name="loginId"
                required
                autoComplete="username"
                placeholder={member ? "MEM-0217" : "STF-0001"}
              />
            </label>

            <label className="block space-y-1 text-xs font-medium text-muted-foreground">
              <span>Password</span>
              <Input name="password" type="password" required autoComplete="current-password" minLength={10} />
            </label>

            {!member && (
              <label className="block space-y-1 text-xs font-medium text-muted-foreground">
                <span>MFA code — required for MD and Admin</span>
                <Input name="mfaCode" inputMode="numeric" pattern="\d{6}" placeholder="123456" />
              </label>
            )}

            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>

          <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {member
              ? "A Member signs in with their Member ID. A mobile number is contact information only."
              : "Sessions end after 8 hours. A password reset signs out every device."}
          </p>
        </Card>
      </div>
    </div>
  );
}
