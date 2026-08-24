// Member Magic / Auto-Login route — direct link authentication (ARCHITECTURE §9.1).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { recordSecurityEvent } from "@/lib/security/audit";
import {
  SESSION_COOKIE_MEMBER,
  sessionExpiry,
  signSession,
  verifyAutoLoginToken,
} from "@/lib/security/session";
import { MEMBER_TERMS_VERSION } from "@/lib/terms";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    redirect("/portal/login?error=GENERIC");
  }

  const payload = verifyAutoLoginToken(token);
  if (!payload) {
    redirect("/portal/login?error=GENERIC");
  }

  const account = await db.portalAccount.findUnique({
    where: { id: payload.portalAccountId },
    include: { memberProfile: true },
  });

  if (!account || account.status !== "ACTIVE" || account.memberProfile.status !== "ACTIVE") {
    redirect("/portal/login?error=GENERIC");
  }

  const now = new Date();

  // Update last login timestamp
  await db.portalAccount.update({
    where: { id: account.id },
    data: { lastLoginAt: now },
  });

  // Set member session cookie
  const cookieJar = await cookies();
  cookieJar.set(
    SESSION_COOKIE_MEMBER,
    signSession({
      context: "MEMBER",
      accountId: account.id,
      loginId: account.loginId,
      role: "MEMBER",
      sessionVersion: account.sessionVersion,
      expiresAt: sessionExpiry(now),
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    }
  );

  await recordSecurityEvent({
    type: "LOGIN_SUCCESS",
    identifier: account.loginId,
    ip: request.headers.get("x-forwarded-for") ?? null,
    detail: "Direct Auto-Login via Magic Link",
  });

  // Check if Terms Acceptance is completed
  const termsAccepted = await db.memberTermsAcceptance.findUnique({
    where: {
      memberProfileId_version: {
        memberProfileId: account.memberProfileId,
        version: MEMBER_TERMS_VERSION,
      },
    },
  });

  if (!termsAccepted) {
    redirect(`/portal/login?error=TERMS&loginId=${encodeURIComponent(account.loginId)}`);
  }

  redirect("/portal");
}
