-- A Member's own business: Firm Name, Deals In, Experience — all optional.
ALTER TABLE "Person" ADD COLUMN "firmName" TEXT;
ALTER TABLE "Person" ADD COLUMN "dealsIn" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Person" ADD COLUMN "businessExperience" TEXT;
