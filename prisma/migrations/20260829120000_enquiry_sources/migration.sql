-- The six Enquiry Sources of main-PRD §9.2, which the type only had four of.
--
-- ALTER TYPE ... ADD VALUE cannot be used later in the same transaction and
-- Prisma runs a migration as one, so the type is rebuilt — the same approach
-- 20260826120000_project_type_agricultural took for ProjectType.
--
-- OTHER is dropped rather than carried: it was the placeholder for the three
-- arrivals that now have their own values (Online/Advertisement/Website and
-- Site Visit), and no Enquiry was recorded under it. The cast below fails
-- loudly if that is ever untrue.
ALTER TYPE "EnquirySource" RENAME TO "EnquirySource_old";
CREATE TYPE "EnquirySource" AS ENUM ('ONLINE', 'SITE_VISIT', 'BY_MEMBER', 'BY_CUSTOMER', 'EXISTING_CUSTOMER', 'DIRECT');

ALTER TABLE "Enquiry"
  ALTER COLUMN "source" TYPE "EnquirySource" USING "source"::text::"EnquirySource";

DROP TYPE "EnquirySource_old";
