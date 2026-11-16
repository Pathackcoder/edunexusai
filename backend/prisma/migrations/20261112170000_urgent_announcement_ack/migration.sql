-- Urgent announcements: a notification that must be acknowledged (additive; existing rows keep requiresAck = false).
ALTER TABLE "notifications" ADD COLUMN "requiresAck" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "notifications" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);

CREATE INDEX "notifications_userId_requiresAck_acknowledgedAt_idx" ON "notifications"("userId", "requiresAck", "acknowledgedAt");
