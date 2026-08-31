-- A Hold now records who got it done, the same three answers a Booking's Sold
-- By gives: the 3% Club, a Member, or a Customer.
--
-- Existing Holds default to the 3% Club, which is what "nobody was credited"
-- has always meant on a Booking. The Holds that arrived through a Member Hold
-- Request are the one case where the answer is already on the row, so they are
-- backfilled to that Member rather than left at the default.
ALTER TABLE "Hold"
  ADD COLUMN "sourcedByType" "SoldByType" NOT NULL DEFAULT 'THREE_PERCENT_CLUB',
  ADD COLUMN "sourcedByPersonId" TEXT;

UPDATE "Hold" h
   SET "sourcedByType" = 'MEMBER',
       "sourcedByPersonId" = m."personId"
  FROM "MemberProfile" m
 WHERE h."sourceMemberId" = m."id";

ALTER TABLE "Hold"
  ADD CONSTRAINT "Hold_sourcedByPersonId_fkey"
  FOREIGN KEY ("sourcedByPersonId") REFERENCES "Person"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Hold_sourcedByPersonId_idx" ON "Hold"("sourcedByPersonId");
