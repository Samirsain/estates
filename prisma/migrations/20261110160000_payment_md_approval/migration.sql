-- Owner, 10 Nov 2026 — every payment step Accounts takes waits for MD approval.
CREATE TABLE IF NOT EXISTS "PaymentApproval" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "label" TEXT NOT NULL,
    "bookingId" TEXT,
    "acquisitionId" TEXT,
    "status" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "requestedByRef" TEXT NOT NULL,
    "requestedByRole" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "PaymentApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PaymentApproval_bookingId_status_idx" ON "PaymentApproval"("bookingId", "status");
CREATE INDEX IF NOT EXISTS "PaymentApproval_acquisitionId_status_idx" ON "PaymentApproval"("acquisitionId", "status");
