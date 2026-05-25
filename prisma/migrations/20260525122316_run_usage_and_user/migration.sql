-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "completionTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "estimatedCostUsd" DECIMAL(10,6),
ADD COLUMN     "promptTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "Run_userId_idx" ON "Run"("userId");
