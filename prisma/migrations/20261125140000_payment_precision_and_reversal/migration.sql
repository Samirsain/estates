-- Confidential payment trial (owner review, 25 Nov 2026) — LOCAL TRIAL ONLY.
-- 1. Payment progress keeps eight decimal places, so a rupee payment that does
--    not divide evenly is not cut to four. Widening a numeric column rewrites
--    no value. Instalment targets, shares and Payment Given stay at four.
ALTER TABLE "Booking" ALTER COLUMN "paymentReceivedPercent" TYPE DECIMAL(11,8);
ALTER TABLE "PaymentInstalment" ALTER COLUMN "receivedPercent" TYPE DECIMAL(11,8);
ALTER TABLE "PaymentReceivedEntry" ALTER COLUMN "percent" TYPE DECIMAL(11,8);

-- 2. MD may reverse a whole payment; the entry is kept and marked REVERSED.
ALTER TYPE "EntryStatus" ADD VALUE IF NOT EXISTS 'REVERSED';
