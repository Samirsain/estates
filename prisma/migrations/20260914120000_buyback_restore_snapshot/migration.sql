-- CR-016 — an approved Buyback can now be unwound, which puts the old sale back
-- exactly as it stood. Nothing after the fact can tell Booked from Payment
-- Completed, because approving the Buyback overwrote the status that said
-- which, so the answer is written down at the moment it is still known. This is
-- the same shape and the same reason as "CancellationRequest"."restoreSnapshot"
-- (main-PRD §15.4).
--
-- Null on every existing row, which is exactly right: a Buyback approved before
-- this migration has no snapshot, and unwinding it therefore restores nothing
-- rather than guessing.
ALTER TABLE "Acquisition"
  ADD COLUMN "sourceBookingRestore" JSONB;
