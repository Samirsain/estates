-- SSOT §37; CP §22 — the inviter froze when each existing Member was activated.
UPDATE "MemberProfile" SET "inviterFrozenAt" = "activationDate"
WHERE "activationDate" IS NOT NULL AND "inviterFrozenAt" IS NULL;
