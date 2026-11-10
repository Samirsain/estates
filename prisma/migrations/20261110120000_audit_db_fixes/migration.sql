-- Audit 7 Nov 2026, fixed 10 Nov.

-- DB08 — INT4 milliseconds stop at ~24.8 days; a Hold extended past that and
-- then frozen by a Booking Request could not be saved. Whole milliseconds stay
-- exact in DOUBLE PRECISION far beyond any Hold.
ALTER TABLE "Hold" ALTER COLUMN "frozenRemainingMs" TYPE DOUBLE PRECISION;

-- DB10 / DB11 — filtered on by Member pages, Trips, Customer pages, the merge
-- preview, every Buyback milestone lookup and the invite network.
CREATE INDEX IF NOT EXISTS "Booking_soldByPersonId_idx" ON "Booking"("soldByPersonId");
CREATE INDEX IF NOT EXISTS "BookingParty_personId_idx" ON "BookingParty"("personId");
CREATE INDEX IF NOT EXISTS "Acquisition_sourceBookingId_idx" ON "Acquisition"("sourceBookingId");
CREATE INDEX IF NOT EXISTS "MemberProfile_invitedByMemberId_idx" ON "MemberProfile"("invitedByMemberId");
