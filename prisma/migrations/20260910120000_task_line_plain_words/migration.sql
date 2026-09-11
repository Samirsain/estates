-- The Accounts Verification task line used to read "Review version 1", which
-- is the pack's vocabulary and not the office's — the people working this
-- queue are not technical. The line now says what happened, and the attempt
-- count it used to carry is already the task's Revised number.
--
-- Data only: the wording of rows written before booking-service.ts changed.
-- Anything not written by that task is untouched.
UPDATE "Task"
SET "latestResult" = 'Sent to Accounts to check'
WHERE "latestResult" = 'Review version 1';

UPDATE "Task"
SET "latestResult" = 'Corrected and sent again to Accounts'
WHERE "latestResult" LIKE 'Review version %';
