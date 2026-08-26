// Break-glass password reset from the machine — PRD §17.1.
//
// For when the in-app path is gone: the account is locked out, or an admin
// reset their own row and lost the one-time password with the page. Not
// reachable over HTTP; it needs the database URL.
//
//   npm run reset:password -- STF-0001 "SomeNewPassword#1"
import { PrismaClient } from "@prisma/client";
import { hashPassword, validatePassword } from "@/lib/security/auth";

const [loginId, password] = process.argv.slice(2);
if (!loginId || !password) {
  console.error('Usage: npm run reset:password -- STF-0001 "<new password>"');
  process.exit(1);
}

const invalid = validatePassword(password);
if (invalid) {
  console.error(invalid);
  process.exit(1);
}

const db = new PrismaClient();

const account = await db.staffAccount.update({
  where: { staffAccountId: loginId },
  data: {
    passwordHash: hashPassword(password),
    // Clears a lockout too — the point of this tool is getting back in.
    status: "ACTIVE",
    failedAttempts: 0,
    lockedUntil: null,
    // Every existing session dies, same as an in-app reset (PRD §17.1).
    sessionVersion: { increment: 1 },
  },
});

await db.securityEvent.create({
  data: {
    type: "SESSION_INVALIDATED",
    identifier: account.staffAccountId,
    detail: "Password reset from the command line (break-glass)",
  },
});

console.log(`${account.staffAccountId} reset. Every existing session is signed out. Sign in and change it under My Account.`);

await db.$disconnect();
