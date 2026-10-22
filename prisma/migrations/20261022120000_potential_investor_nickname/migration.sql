-- A Member's nickname, printed on the Member profile only.
ALTER TABLE "Person" ADD COLUMN "nickname" TEXT;

-- Potential Investors: a name, a mobile and a city.
CREATE TABLE "PotentialInvestor" (
    "id" TEXT NOT NULL,
    "investorNo" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "city" TEXT,
    "createdByRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PotentialInvestor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PotentialInvestor_investorNo_key" ON "PotentialInvestor"("investorNo");
CREATE INDEX "PotentialInvestor_mobile_idx" ON "PotentialInvestor"("mobile");
