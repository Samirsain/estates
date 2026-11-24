-- CR-029 (owner, 24 Nov 2026) — a Plot can be booked under a Member before its
-- buyer is known; the Customer is added later on the same Booking. Dropping NOT
-- NULL rewrites no row, and every existing Booking keeps its Primary Customer.
ALTER TABLE "Booking" ALTER COLUMN "primaryPersonId" DROP NOT NULL;
