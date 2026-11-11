-- Owner, 11 Nov 2026 — a Hold takes its buyers as a Booking does.
CREATE TABLE IF NOT EXISTS "HoldParty" (
    "id" TEXT NOT NULL,
    "holdId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "PartyRole" NOT NULL,
    "sharePercent" DECIMAL(7,4),

    CONSTRAINT "HoldParty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HoldParty_holdId_personId_key" ON "HoldParty"("holdId", "personId");
CREATE INDEX IF NOT EXISTS "HoldParty_personId_idx" ON "HoldParty"("personId");

ALTER TABLE "HoldParty" ADD CONSTRAINT "HoldParty_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "Hold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HoldParty" ADD CONSTRAINT "HoldParty_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
