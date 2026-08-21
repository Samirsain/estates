// Encryption key rotation — PRD RD-05; ARCHITECTURE §9.3.
//
// Everything protected at rest is encrypted with SENSITIVE_KEY, and duplicate
// detection uses a keyed hash under BLIND_INDEX_KEY. Change either key without
// re-encrypting and the data stops being readable — this is the tool that makes
// the change survivable.
//
//   OLD_SENSITIVE_KEY=<previous hex>  \
//   SENSITIVE_KEY=<new hex>           \
//   npm run rotate:key -- --confirm
//
// Add OLD_BLIND_INDEX_KEY to rebuild the blind indexes in the same pass.
//
// Everything happens in ONE transaction: either every row moves to the new key
// or none does. Take a database backup first anyway — this rewrites protected
// columns, and a backup is the only thing that undoes a wrong key.
import { PrismaClient } from "@prisma/client";
import { blindIndex, decryptSensitive, encryptSensitive } from "@/lib/security/identity";

const db = new PrismaClient();

function keyBuffer(name: string): Buffer {
  const hex = process.env[name];
  if (!hex) throw new Error(`${name} is not set.`);
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes of hex (64 characters).`);
  return key;
}

const confirmed = process.argv.includes("--confirm");
const oldKey = keyBuffer("OLD_SENSITIVE_KEY");
const newKey = keyBuffer("SENSITIVE_KEY");
if (oldKey.equals(newKey)) throw new Error("OLD_SENSITIVE_KEY and SENSITIVE_KEY are the same.");

const rotateBlindIndex = !!process.env.OLD_BLIND_INDEX_KEY;
const newBlindKey = rotateBlindIndex ? keyBuffer("BLIND_INDEX_KEY") : null;

/** Re-encrypt one payload from the old key to the new one. */
const move = (payload: string) => encryptSensitive(decryptSensitive(payload, oldKey), newKey);

const counts = { aadhaar: 0, pan: 0, bank: 0, mfa: 0, blindIndexes: 0 };

await db.$transaction(
  async (tx) => {
    const persons = await tx.person.findMany({
      where: { OR: [{ aadhaarCipher: { not: null } }, { panCipher: { not: null } }] },
      select: { id: true, aadhaarCipher: true, panCipher: true },
    });

    for (const person of persons) {
      const data: Record<string, string> = {};

      if (person.aadhaarCipher) {
        const plain = decryptSensitive(person.aadhaarCipher, oldKey);
        data.aadhaarCipher = encryptSensitive(plain, newKey);
        counts.aadhaar++;
        if (newBlindKey) {
          data.aadhaarBlindIndex = blindIndex(plain, newBlindKey);
          counts.blindIndexes++;
        }
      }

      if (person.panCipher) {
        const plain = decryptSensitive(person.panCipher, oldKey);
        data.panCipher = encryptSensitive(plain, newKey);
        counts.pan++;
        if (newBlindKey) {
          data.panBlindIndex = blindIndex(plain, newBlindKey);
          counts.blindIndexes++;
        }
      }

      if (confirmed) await tx.person.update({ where: { id: person.id }, data });
    }

    const banks = await tx.bankDetail.findMany({ select: { id: true, accountCipher: true } });
    for (const bank of banks) {
      counts.bank++;
      if (confirmed) {
        await tx.bankDetail.update({
          where: { id: bank.id },
          data: { accountCipher: move(bank.accountCipher) },
        });
      }
    }

    const accounts = await tx.staffAccount.findMany({
      where: { mfaSecretCipher: { not: null } },
      select: { id: true, mfaSecretCipher: true },
    });
    for (const account of accounts) {
      counts.mfa++;
      if (confirmed) {
        await tx.staffAccount.update({
          where: { id: account.id },
          data: { mfaSecretCipher: move(account.mfaSecretCipher!) },
        });
      }
    }
  },
  { timeout: 600_000, maxWait: 30_000 }
);

console.log(
  [
    confirmed ? "Rotated:" : "Dry run — nothing was written. Would rotate:",
    `  Aadhaar ciphers   ${counts.aadhaar}`,
    `  PAN ciphers       ${counts.pan}`,
    `  Bank accounts     ${counts.bank}`,
    `  MFA secrets       ${counts.mfa}`,
    rotateBlindIndex ? `  Blind indexes     ${counts.blindIndexes}` : "  Blind indexes     unchanged",
    "",
    confirmed
      ? "Update SENSITIVE_KEY (and BLIND_INDEX_KEY if rotated) in the running environment now."
      : "Re-run with --confirm to write.",
  ].join("\n")
);

await db.$disconnect();
