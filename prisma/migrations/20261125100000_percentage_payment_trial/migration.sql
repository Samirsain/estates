-- Confidential Payment & Instalment Management, LOCAL TRIAL (revised brief,
-- 25 Nov 2026). Adds no amount, price, rate or conversion column: a staff
-- payment claim carries a date, a mode and an opaque reference only, and a
-- follow-up may carry the date the customer promised. Progress stays the
-- existing Payment Received percentage.

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('UPI', 'NEFT', 'RTGS', 'IMPS', 'CHEQUE', 'CASH', 'CARD', 'OTHER');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "promisedOn" DATE;

-- CreateTable
CREATE TABLE "PaymentVerificationRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "claimedPaidOn" TIMESTAMP(3) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT NOT NULL,
    "referenceKey" TEXT NOT NULL,
    "note" TEXT,
    "status" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "requestedByRef" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "paymentEntryId" TEXT,

    CONSTRAINT "PaymentVerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentVerificationRequest_paymentEntryId_key" ON "PaymentVerificationRequest"("paymentEntryId");

-- CreateIndex
CREATE INDEX "PaymentVerificationRequest_bookingId_status_idx" ON "PaymentVerificationRequest"("bookingId", "status");

-- AddForeignKey
ALTER TABLE "PaymentVerificationRequest" ADD CONSTRAINT "PaymentVerificationRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentVerificationRequest" ADD CONSTRAINT "PaymentVerificationRequest_paymentEntryId_fkey" FOREIGN KEY ("paymentEntryId") REFERENCES "PaymentReceivedEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

