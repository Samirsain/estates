-- Owner, 11 Nov 2026: a task may name a Plot beside whatever it is linked to.
ALTER TABLE "Task" ADD COLUMN "plotId" TEXT;

ALTER TABLE "Task" ADD CONSTRAINT "Task_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
