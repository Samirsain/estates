CREATE TABLE "CalculatorPriceBasis" (
  "bookingId" TEXT PRIMARY KEY REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tokenCipher" TEXT NOT NULL
);
