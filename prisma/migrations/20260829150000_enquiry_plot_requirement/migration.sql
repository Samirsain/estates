-- An Enquiry may be for a Plot that inventory does not hold yet — a size, a
-- facing, a corner. It is what the caller asked for, not a Plot: it allocates
-- nothing, blocks nothing, and stays beside the optional plotId rather than
-- pretending to be one.
ALTER TABLE "Enquiry" ADD COLUMN "plotRequirement" TEXT;
