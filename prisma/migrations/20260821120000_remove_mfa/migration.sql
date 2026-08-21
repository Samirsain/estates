-- AlterEnum
BEGIN;
CREATE TYPE "SecurityEventType_new" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'ACCOUNT_LOCKED', 'SESSION_INVALIDATED', 'ACCOUNT_DISABLED', 'PERMISSION_DENIED', 'SENSITIVE_ACCESS');
ALTER TABLE "SecurityEvent" ALTER COLUMN "type" TYPE "SecurityEventType_new" USING ("type"::text::"SecurityEventType_new");
ALTER TYPE "SecurityEventType" RENAME TO "SecurityEventType_old";
ALTER TYPE "SecurityEventType_new" RENAME TO "SecurityEventType";
DROP TYPE "SecurityEventType_old";
COMMIT;

-- AlterTable
ALTER TABLE "StaffAccount" DROP COLUMN "mfaEnrolledAt",
DROP COLUMN "mfaSecretCipher";

