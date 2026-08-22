-- Recorded acceptance of the Member Terms and Privacy Notice.
--
-- Terms §2.1 makes acceptance part of becoming a Member, so it is stored once
-- per Member per published version rather than re-asked at every sign-in. A
-- ticked box that records nothing proves nothing: this row is what answers
-- "which Terms did this Member agree to, and when".
--
-- Never updated in place. A new version adds a row of its own, so the history
-- of what was agreed stays readable (PRD §23.5).
CREATE TABLE "MemberTermsAcceptance" (
    "id" TEXT NOT NULL,
    "memberProfileId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "MemberTermsAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberTermsAcceptance_memberProfileId_version_key"
  ON "MemberTermsAcceptance"("memberProfileId", "version");

CREATE INDEX "MemberTermsAcceptance_version_idx" ON "MemberTermsAcceptance"("version");

ALTER TABLE "MemberTermsAcceptance"
  ADD CONSTRAINT "MemberTermsAcceptance_memberProfileId_fkey"
  FOREIGN KEY ("memberProfileId") REFERENCES "MemberProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
