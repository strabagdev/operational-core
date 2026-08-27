-- Store a minimal durable response for replayable state-update workflow requests.
-- Existing idempotency rows are left without a response and must not be
-- replayed as if a result were known.
ALTER TABLE "ApiIdempotencyKey"
ADD COLUMN "responseBody" JSONB,
ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE INDEX "ApiIdempotencyKey_completedAt_idx" ON "ApiIdempotencyKey"("completedAt");
