-- Owner, 10 Nov 2026 — Add Member and Edit details tick whether the office has
-- the Member's photo. Every existing Member starts at "not received".
ALTER TABLE "MemberProfile" ADD COLUMN IF NOT EXISTS "photoReceived" BOOLEAN NOT NULL DEFAULT false;
