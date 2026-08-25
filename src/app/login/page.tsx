// Staff and Member portal are separate security contexts (ARCHITECTURE §9.1).

import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GENERIC_LOGIN_ERROR } from "@/lib/security/auth";
import { staffLogin } from "./actions";
import { SubmitButton } from "./login-form";

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
  searchParams: Promise<{ error?: string; loginId?: string }>;
}) {
  const { error, loginId = "" } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="" className="h-11 w-11" />
          <div>
            <h1 className="text-lg font-bold tracking-tight gradient-text">3% Club CRM</h1>
            <p className="text-xs text-muted-foreground">v3.1 — Staff Login</p>
          </div>
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

          <form action={staffLogin} className="space-y-4">
            <label className="block space-y-1 text-xs font-medium text-muted-foreground">
              <span>Staff Account ID</span>
              <Input
                name="loginId"
                required
                autoComplete="username"
                defaultValue={loginId}
                placeholder="STF-0001"
              />
            </label>

            <label className="block space-y-1 text-xs font-medium text-muted-foreground">
              <span>Password</span>
              <Input name="password" type="password" required autoComplete="current-password" minLength={10} />
            </label>

            <SubmitButton />
          </form>

          <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Sessions end after 8 hours. A password reset signs out every device.
          </p>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground">
          Member?{" "}
          <a href="/portal/login" className="underline underline-offset-2 hover:text-foreground">
            Sign in to Member Portal
          </a>
        </p>
      </div>
    </div>
  );
}
