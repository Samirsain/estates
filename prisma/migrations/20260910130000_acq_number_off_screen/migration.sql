-- The ACQ number is off the screens by request: a Buyback or Resale is named
-- by what it is and placed by its Project and Plot. New rows are written that
-- way by acquisition-service.ts; these are the sentences written before it.
--
-- Data only. The number itself still exists on "Acquisition"."acquisitionNo" —
-- nothing is deleted, only the copies of it inside display text.
UPDATE "Task"
SET "latestResult" = regexp_replace("latestResult", ' ACQ-[0-9]+', '', 'g')
WHERE "latestResult" LIKE '%ACQ-%';

UPDATE "Booking"
SET "closeReason" = regexp_replace("closeReason", ' ACQ-[0-9]+', '', 'g')
WHERE "closeReason" LIKE '%ACQ-%';

UPDATE "BookingCompletion"
SET "reopenReason" = regexp_replace("reopenReason", ' ACQ-[0-9]+', '', 'g')
WHERE "reopenReason" LIKE '%ACQ-%';
