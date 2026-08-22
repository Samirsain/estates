-- Project card fields. All informational: none of them affects inventory,
-- commission or payment.
ALTER TABLE "Project" ADD COLUMN "city" TEXT;
ALTER TABLE "Project" ADD COLUMN "amenities" TEXT;

-- PRD §26 already excludes any Project RERA operational block, and nothing
-- reads this column: RERA_EXPIRY_REMINDER works from MemberProfile.
ALTER TABLE "Project" DROP COLUMN "reraExpiryDate";
