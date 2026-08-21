// Current TOTP code for the MFA-enrolled staff accounts, so a local login does
// not need an authenticator app on hand. Development only.
// Run: npm run db:otp
import { PrismaClient } from "@prisma/client";
import { totpCode } from "@/lib/security/auth";
import { decryptSensitive } from "@/lib/security/identity";

const db = new PrismaClient();

const enrolled = await db.staffAccount.findMany({
  where: { mfaSecretCipher: { not: null } },
  select: { staffAccountId: true, role: true, mfaSecretCipher: true },
  orderBy: { staffAccountId: "asc" },
});

for (const account of enrolled) {
  const code = totpCode(decryptSensitive(account.mfaSecretCipher!));
  console.log(`${account.staffAccountId}  ${account.role.padEnd(8)}  ${code}`);
}
console.log(`\nCodes roll every 30 seconds — read them just before signing in.`);

await db.$disconnect();
