// What a server action tells the person when it fails. A business refusal is
// shown word for word; a raw database or Decimal error is not — it used to
// reach the screen as "Invalid `prisma.…` invocation" or "Unique constraint
// failed on the fields", which says nothing to the person and too much to
// anyone else. The detail goes to the server log instead.

import { Prisma } from "@prisma/client";
import { CommandError } from "@/lib/services/command";
import { PermissionError } from "@/lib/security/permissions";

export const SAVE_FAILED =
  "This could not be saved, and nothing was changed. Check the details and try again; if it happens again, tell Admin.";

export function actionErrorText(error: unknown, fallback = "Action failed."): string {
  if (error instanceof CommandError) return error.message;
  if (error instanceof PermissionError) return "You do not have permission to do this.";
  const raw =
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    (error instanceof Error && /\[DecimalError\]|prisma\.|Raw query failed/i.test(error.message));
  if (raw) {
    console.error(error);
    return SAVE_FAILED;
  }
  return error instanceof Error ? error.message : fallback;
}
