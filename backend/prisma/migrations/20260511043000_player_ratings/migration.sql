-- CreateEnum
CREATE TYPE "PlayerRatingStatus" AS ENUM ('PENDING', 'APPROVED', 'FLAGGED', 'REMOVED');

-- CreateTable
CREATE TABLE "PlayerRatingReview" (
    "id" TEXT NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "revieweeUserId" TEXT NOT NULL,
    "roundDate" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "course" TEXT NOT NULL,
    "overallRating" INTEGER NOT NULL,
    "handicapAccuracy" INTEGER NOT NULL,
    "sportsmanship" INTEGER NOT NULL,
    "paceOfPlay" INTEGER NOT NULL,
    "wouldPlayAgain" BOOLEAN NOT NULL,
    "comment" TEXT NOT NULL,
    "status" "PlayerRatingStatus" NOT NULL DEFAULT 'PENDING',
    "reportedReason" TEXT,
    "adminNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,

    CONSTRAINT "PlayerRatingReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerRatingReview_revieweeUserId_status_submittedAt_idx" ON "PlayerRatingReview"("revieweeUserId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "PlayerRatingReview_reviewerUserId_submittedAt_idx" ON "PlayerRatingReview"("reviewerUserId", "submittedAt");

-- CreateIndex
CREATE INDEX "PlayerRatingReview_status_submittedAt_idx" ON "PlayerRatingReview"("status", "submittedAt");

-- AddForeignKey
ALTER TABLE "PlayerRatingReview" ADD CONSTRAINT "PlayerRatingReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRatingReview" ADD CONSTRAINT "PlayerRatingReview_revieweeUserId_fkey" FOREIGN KEY ("revieweeUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRatingReview" ADD CONSTRAINT "PlayerRatingReview_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
