// CP §57 — one-off: gives bank details entered before the account identity
// index existed their index, so one-account-one-Person covers them too.
//
//   npm run backfill:bank-index
//
// Re-runnable: it only touches rows without an index.
import { PrismaClient } from "@prisma/client";
import { bankAccountIndex } from "@/lib/services/bank-service";
import { decryptSensitive } from "@/lib/security/identity";

const db = new PrismaClient();
const rows = await db.bankDetail.findMany({ where: { accountBlindIndex: null }, select: { id: true, ifsc: true, accountCipher: true } });
for (const row of rows) {
  await db.bankDetail.update({
    where: { id: row.id },
    data: { accountBlindIndex: bankAccountIndex(row.ifsc, decryptSensitive(row.accountCipher)) },
  });
}
console.log(`Bank account indexes backfilled: ${rows.length}`);
await db.$disconnect();
