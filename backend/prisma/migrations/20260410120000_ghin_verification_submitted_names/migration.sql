-- Optional legal name as submitted on verification form (for admin review / pending UI).
ALTER TABLE "GHINVerificationRequest"
ADD COLUMN "submittedFirstName" TEXT,
ADD COLUMN "submittedLastName" TEXT;
