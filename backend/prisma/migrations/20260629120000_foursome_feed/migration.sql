-- CreateEnum
CREATE TYPE "FoursomeGameStyle" AS ENUM ('CASUAL', 'COMPETITIVE', 'TOURNAMENT', 'SERIOUS');

-- CreateEnum
CREATE TYPE "FoursomePostStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELED');

-- CreateTable
CREATE TABLE "FoursomeFeedPost" (
    "id" TEXT NOT NULL,
    "posterUserId" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "roundDate" TIMESTAMP(3) NOT NULL,
    "teeTime" TEXT NOT NULL,
    "spotsNeeded" INTEGER NOT NULL,
    "gameStyle" "FoursomeGameStyle" NOT NULL,
    "handicapPreference" TEXT,
    "feeLabel" TEXT,
    "notes" TEXT,
    "status" "FoursomePostStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoursomeFeedPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoursomeFeedPost_status_roundDate_idx" ON "FoursomeFeedPost"("status", "roundDate");

-- CreateIndex
CREATE INDEX "FoursomeFeedPost_posterUserId_createdAt_idx" ON "FoursomeFeedPost"("posterUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "FoursomeFeedPost" ADD CONSTRAINT "FoursomeFeedPost_posterUserId_fkey" FOREIGN KEY ("posterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
