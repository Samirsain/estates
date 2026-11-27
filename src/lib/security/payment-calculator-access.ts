import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { paymentTrialEnabled } from "@/lib/domain/payment-percent";
import { lockKey, type Tx } from "@/lib/services/command";
import type { StaffActor } from "./current-actor";
import { constantTimeEquals } from "./identity";
import { SESSION_COOKIE_STAFF } from "./session";

export const PAYMENT_CALCULATOR_PATH = "/payment-calculator";
const ACCESS_MS = 15 * 60_000;
const CHALLENGE_MS = 2 * 60_000;
const RETRY_MS = 5 * 60_000;

async function context(actor: StaffActor) {
  if (actor.role !== "MD" || !paymentTrialEnabled()) return null;
  const origin = URL.parse(process.env.PAYMENT_CALCULATOR_ORIGIN ?? "");
  if (!origin || origin.origin !== process.env.PAYMENT_CALCULATOR_ORIGIN) return null;
  if (origin.protocol !== "https:" && !(process.env.NODE_ENV === "development" && origin.hostname === "localhost")) return null;
  if ((await headers()).get("host") !== origin.host) return null;
  const session = (await cookies()).get(SESSION_COOKIE_STAFF)?.value;
  if (!session) return null;
  return { origin: origin.origin, rpID: origin.hostname, session: createHash("sha256").update(session).digest("hex") };
}

function transact<T>(actor: StaffActor, work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await lockKey(tx, `payment-worksheet:${actor.accountId}`);
    return work(tx);
  });
}

function audit(tx: Tx, actor: StaffActor, action: string) {
  return tx.auditEvent.create({
    data: { actorRef: actor.staffAccountId, actorRole: actor.role, entity: "StaffAccount", entityId: actor.accountId, action },
  });
}

export async function startPaymentCalculatorChallenge(actor: StaffActor): Promise<boolean> {
  const ctx = await context(actor);
  if (!ctx) return false;
  const opened = { sessionDigest: ctx.session, openedUntil: new Date(Date.now() + ACCESS_MS) };
  await transact(actor, (tx) => tx.paymentCalculatorGate.upsert({
    where: { staffAccountId: actor.accountId },
    create: { staffAccountId: actor.accountId, ...opened },
    update: { ...opened, unlockedUntil: null, challenge: null, challengeUntil: null },
  }));
  return true;
}

export async function paymentCalculatorAccess(actor: StaffActor) {
  const ctx = await context(actor);
  if (!ctx) return null;
  const gate = await db.paymentCalculatorGate.findUnique({ where: { staffAccountId: actor.accountId } });
  if (!gate || gate.sessionDigest !== ctx.session) return null;
  const now = Date.now();
  if (gate.unlockedUntil && gate.unlockedUntil.getTime() > now) return { step: "unlocked" as const, expiresAt: gate.unlockedUntil.getTime() };
  if (!gate.openedUntil || gate.openedUntil.getTime() <= now) return null;
  return { step: "challenge" as const, setup: !gate.credentialId };
}

export async function beginCalculatorPasskey(actor: StaffActor, enrollmentKey: string | null) {
  const ctx = await context(actor);
  const reopen = { ok: false as const, error: "Open the worksheet again from the header search." };
  if (!ctx) return reopen;
  return transact(actor, async (tx) => {
    const where = { staffAccountId: actor.accountId };
    const gate = await tx.paymentCalculatorGate.findUnique({ where });
    const now = Date.now();
    if (!gate || gate.sessionDigest !== ctx.session || !gate.openedUntil || gate.openedUntil.getTime() <= now) return reopen;
    const sameWindow = !!gate.attemptWindow && gate.attemptWindow.getTime() + RETRY_MS > now;
    const attempts = sameWindow ? gate.attempts : 0;
    if (attempts >= 5) {
      await audit(tx, actor, "PAYMENT_WORKSHEET_RATE_LIMITED");
      return { ok: false as const, error: "Too many attempts. Try again in five minutes." };
    }
    const charged = { attempts: attempts + 1, attemptWindow: sameWindow ? gate.attemptWindow : new Date(now) };
    const challengeUntil = new Date(now + CHALLENGE_MS);
    if (gate.credentialId) {
      const options = await generateAuthenticationOptions({
        rpID: ctx.rpID, allowCredentials: [{ id: gate.credentialId }], userVerification: "required",
      });
      await tx.paymentCalculatorGate.update({ where, data: { ...charged, challenge: options.challenge, challengeUntil } });
      return { ok: true as const, kind: "authentication" as const, options };
    }

    const key = process.env.PAYMENT_CALCULATOR_ENROLLMENT_KEY;
    if (!key || key.length < 32 || typeof enrollmentKey !== "string" || enrollmentKey.length > 256 || !constantTimeEquals(key, enrollmentKey)) {
      await tx.paymentCalculatorGate.update({ where, data: { ...charged, challenge: null, challengeUntil: null } });
      await audit(tx, actor, "PAYMENT_WORKSHEET_ENROLLMENT_DENIED");
      return { ok: false as const, error: "Check the setup key with the account owner." };
    }
    const options = await generateRegistrationOptions({
      rpName: "3% Club CRM",
      rpID: ctx.rpID,
      userName: actor.staffAccountId,
      userID: new TextEncoder().encode(actor.accountId),
      attestationType: "none",
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    });
    await tx.paymentCalculatorGate.update({ where, data: { ...charged, challenge: options.challenge, challengeUntil } });
    return { ok: true as const, kind: "registration" as const, options };
  });
}

export async function finishCalculatorPasskey(actor: StaffActor, response: RegistrationResponseJSON | AuthenticationResponseJSON) {
  const ctx = await context(actor);
  if (!ctx) return false;
  return transact(actor, async (tx) => {
    const where = { staffAccountId: actor.accountId };
    const gate = await tx.paymentCalculatorGate.findUnique({ where });
    const now = Date.now();
    if (!gate || gate.sessionDigest !== ctx.session || !gate.openedUntil || gate.openedUntil.getTime() <= now ||
      !gate.challenge || !gate.challengeUntil || gate.challengeUntil.getTime() <= now) return false;

    await tx.paymentCalculatorGate.update({ where, data: { challenge: null, challengeUntil: null } });
    const expected = { expectedChallenge: gate.challenge, expectedOrigin: ctx.origin, expectedRPID: ctx.rpID, requireUserVerification: true };
    let credential;
    try {
      if (gate.credentialId && gate.publicKey) {
        const result = await verifyAuthenticationResponse({
          ...expected, response: response as AuthenticationResponseJSON,
          credential: { id: gate.credentialId, publicKey: new Uint8Array(gate.publicKey), counter: gate.counter },
        });
        if (result.verified) credential = { counter: result.authenticationInfo.newCounter };
      } else if (!gate.credentialId) {
        const result = await verifyRegistrationResponse({ ...expected, response: response as RegistrationResponseJSON });
        if (result.verified && result.registrationInfo) {
          const { id, publicKey, counter } = result.registrationInfo.credential;
          credential = { credentialId: id, publicKey: Buffer.from(publicKey), counter };
        }
      }
    } catch {
      // Store the outcome alone. Responses and enrollment keys are private.
    }
    if (!credential) {
      await audit(tx, actor, "PAYMENT_WORKSHEET_PASSKEY_DENIED");
      return false;
    }
    await tx.paymentCalculatorGate.update({ where, data: {
      ...credential, openedUntil: null, attempts: 0, attemptWindow: null, unlockedUntil: new Date(Date.now() + ACCESS_MS),
    } });
    await audit(tx, actor, gate.credentialId ? "PAYMENT_WORKSHEET_UNLOCKED" : "PAYMENT_WORKSHEET_PASSKEY_ENROLLED");
    return true;
  });
}
