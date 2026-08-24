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
      <div className={`w-full space-y-6 ${needsTerms ? "max-w-lg" : "max-w-md"}`}>
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0066cc] text-white shadow-lg shadow-[#0066cc]/20">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1d1d1f] sm:text-3xl">
            Member Portal
          </h1>
          <p className="text-xs text-[#7a7a7a]">
            3% Real Estate Club
          </p>
        </div>

        <Card className="border border-slate-200/80 bg-white p-7 shadow-xl shadow-slate-200/60 rounded-3xl">
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
            <label className="block space-y-1 text-xs font-medium text-[#1d1d1f]">
              <span>Member ID</span>
              <Input
                name="loginId"
                required
                autoComplete="username"
                defaultValue={loginId}
                placeholder="MEM-0217"
                className="h-11 rounded-xl border-slate-200 bg-[#fafafc] text-sm text-[#1d1d1f] placeholder:text-[#7a7a7a] focus-visible:ring-[#0066cc]"
              />
            </label>

            <label className="block space-y-1 text-xs font-medium text-[#1d1d1f]">
              <span>Password</span>
              <Input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                minLength={10}
                className="h-11 rounded-xl border-slate-200 bg-[#fafafc] text-sm text-[#1d1d1f] placeholder:text-[#7a7a7a] focus-visible:ring-[#0066cc]"
              />
            </label>

            {/* Asked once, on the first sign-in and again when a new version is
                published — never on every sign-in. What was accepted, and when,
                is recorded against the Member (Terms §2.1). */}
            {needsTerms && <TermsGate blocks={readTerms()} version={MEMBER_TERMS_VERSION} />}

            <SubmitButton />
          </form>

          <div className="mt-5 border-t border-slate-100 pt-4 space-y-2">
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[#7a7a7a]">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0066cc]" />
              <span>A Member signs in with their assigned Member ID.</span>
            </p>

            {!needsTerms && (
              <p className="text-[11px] text-[#7a7a7a]">
                <a href="/terms" className="underline underline-offset-2 hover:text-[#0066cc] transition-colors">
                  Terms and Privacy Notice
                </a>
              </p>
            )}
          </div>
        </Card>

        <p className="text-center text-xs text-[#7a7a7a]">
          Staff Account?{" "}
          <a href="/login" className="font-medium text-[#0066cc] underline underline-offset-2 hover:text-[#0071e3] transition-colors">
            Staff CRM Login
          </a>
        </p>
      </div>
    </div>
  );
}
