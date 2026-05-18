-- Speed up admin dashboard IAP / subscription aggregates (status + provider + time windows).
CREATE INDEX "Subscription_status_provider_createdAt_idx" ON "Subscription"("status", "provider", "createdAt");

-- Speed up entitlement sync rollups by event type and date range.
CREATE INDEX "PaymentEvent_eventType_createdAt_idx" ON "PaymentEvent"("eventType", "createdAt");
