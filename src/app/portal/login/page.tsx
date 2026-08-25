// Member portal login — separate from Staff login (ARCHITECTURE §9.1).
// A Member signs in with their Member ID. No Staff tab is shown here.

import { Building2, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GENERIC_LOGIN_ERROR } from "@/lib/security/auth";
import { memberLogin } from "@/app/login/actions";
import { MEMBER_TERMS_VERSION, readTerms } from "@/lib/terms";
import { SubmitButton, TermsGate } from "@/app/login/login-form";

const MESSAGES: Record<string, string> = {
  GENERIC: GENERIC_LOGIN_ERROR,
  RATE: "Too many attempts. Wait a minute and try again.",
  TERMS: "Please read and accept the Terms and Privacy Notice to continue.",
};

/** TERMS is not a failure — it is the one remaining step (Terms §2.1). */
const NOTICES = new Set(["TERMS"]);

export default async function MemberLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; loginId?: string }>;
}) {
  const { error, loginId = "" } = await searchParams;
  const needsTerms = error === "TERMS";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className={`w-full space-y-4 ${needsTerms ? "max-w-lg" : "max-w-md"}`}>
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Member Portal
          </h1>
          <p className="text-xs text-muted-foreground">
            3% Real Estate Club
          </p>
        </div>

        <Card className="border border-border bg-card p-5 rounded-2xl">
          {error && (
            <p
              role="alert"
              className={`mb-5 rounded-2xl border px-3.5 py-2.5 text-xs font-medium ${
                NOTICES.has(error)
                  ? "border-blue-200 bg-blue-50 text-blue-900"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {MESSAGES[error] ?? GENERIC_LOGIN_ERROR}
            </p>
          )}

          <form action={memberLogin} className="space-y-4">
            <label className="block space-y-1 text-xs font-medium text-foreground">
              <span>Member ID</span>
              <Input
                name="loginId"
                required
                autoComplete="username"
                defaultValue={loginId}
                placeholder="MEM-0217"
                className="h-11 rounded-xl border-border bg-muted text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
              />
            </label>

            <label className="block space-y-1 text-xs font-medium text-foreground">
              <span>Password</span>
              <Input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                minLength={10}
                className="h-11 rounded-xl border-border bg-muted text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
              />
            </label>

            {/* Asked once, on the first sign-in and again when a new version is
                published — never on every sign-in. What was accepted, and when,
                is recorded against the Member (Terms §2.1). */}
            {needsTerms && <TermsGate blocks={readTerms()} version={MEMBER_TERMS_VERSION} />}

            <SubmitButton />
          </form>

          <div className="mt-5 border-t border-border/50 pt-4 space-y-2">
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>A Member signs in with their assigned Member ID.</span>
            </p>

            {!needsTerms && (
              <p className="text-[11px] text-muted-foreground">
                <a href="/terms" className="underline underline-offset-2 hover:text-primary transition-colors">
                  Terms and Privacy Notice
                </a>
              </p>
            )}
          </div>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Staff Account?{" "}
          <a href="/login" className="font-medium text-primary underline underline-offset-2 hover:text-ring transition-colors">
            Staff CRM Login
          </a>
        </p>
      </div>
    </div>
  );
}
