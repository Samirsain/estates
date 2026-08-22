// Staff and Member portal are separate security contexts (ARCHITECTURE §9.1).

import { Building2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GENERIC_LOGIN_ERROR } from "@/lib/security/auth";
import { memberLogin, staffLogin } from "./actions";
import { MEMBER_TERMS_VERSION, readTerms } from "@/lib/terms";
import { SubmitButton, TermsGate } from "./login-form";

const MESSAGES: Record<string, string> = {
  GENERIC: GENERIC_LOGIN_ERROR,
  RATE: "Too many attempts. Wait a minute and try again.",
  TERMS: "Please read and accept the Terms and Privacy Notice to continue.",
};

/** TERMS is not a failure — it is the one remaining step (Terms §2.1). */
const NOTICES = new Set(["TERMS"]);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string; loginId?: string }>;
}) {
  const { tab = "staff", error, loginId = "" } = await searchParams;
  const member = tab === "member";
  const needsTerms = member && error === "TERMS";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className={`w-full space-y-6 ${needsTerms ? "max-w-lg" : "max-w-md"}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary">
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
              className={`mb-4 rounded-xl border px-3 py-2 text-xs ${
                NOTICES.has(error)
                  ? "border-border/60 bg-secondary text-foreground"
                  : "border-red-500/30 bg-red-500/10 text-red-700"
              }`}
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
                defaultValue={loginId}
                placeholder={member ? "MEM-0217" : "STF-0001"}
              />
            </label>

            <label className="block space-y-1 text-xs font-medium text-muted-foreground">
              <span>Password</span>
              <Input name="password" type="password" required autoComplete="current-password" minLength={10} />
            </label>

            {/* Asked once, on the first sign-in and again when a new version is
                published — never on every sign-in. What was accepted, and when,
                is recorded against the Member (Terms §2.1). */}
            {needsTerms && <TermsGate blocks={readTerms()} version={MEMBER_TERMS_VERSION} />}

            <SubmitButton />
          </form>

          <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {member
              ? "A Member signs in with their Member ID. A mobile number is contact information only."
              : "Sessions end after 8 hours. A password reset signs out every device."}
          </p>

          {member && !needsTerms && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              <a href="/terms" className="underline underline-offset-2 hover:text-foreground">
                Terms and Privacy Notice
              </a>
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
