-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "guestSessionId" TEXT;

-- CreateIndex
CREATE INDEX "Run_guestSessionId_idx" ON "Run"("guestSessionId");

-- CreateIndex
CREATE INDEX "Run_guestSessionId_updatedAt_idx" ON "Run"("guestSessionId", "updatedAt");
