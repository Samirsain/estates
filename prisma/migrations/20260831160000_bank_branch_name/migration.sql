-- Which branch a bank account sits at, for the humans reading a payment
-- advice. Nullable because the rows entered before this column existed have no
-- branch, and an IFSC already identifies the branch to a bank — so nothing is
-- backfilled and nothing is guessed.
ALTER TABLE "BankDetail" ADD COLUMN "branchName" TEXT;
