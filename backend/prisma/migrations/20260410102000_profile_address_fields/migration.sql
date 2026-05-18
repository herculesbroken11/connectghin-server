-- Add full address support for onboarding location autocomplete.
ALTER TABLE "Profile"
ADD COLUMN "addressLine1" TEXT,
ADD COLUMN "postalCode" TEXT;
