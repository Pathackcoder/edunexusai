-- Portal usage analytics (Admin → Analytics). Additive only: no existing table or column changes meaning.
--   tenants.analyticsEnabled (default false: nothing is collected until an institution switches it on),
--   tenants.analyticsStartedAt, users.analyticsExcludedAt;
--   analytics_visits, analytics_page_views, analytics_events (raw, ~90 days), analytics_user_daily (13 months),
--   analytics_rollups, analytics_rollup_runs (36 months), user_permissions (named grants, e.g. analytics.view).
-- Rollback (collection must be off): DROP TABLE "analytics_visits", "analytics_page_views", "analytics_events",
--   "analytics_user_daily", "analytics_rollups", "analytics_rollup_runs", "user_permissions";
--   DROP TYPE "AnalyticsDevice", "AnalyticsRollupStatus";
--   ALTER TABLE "tenants" DROP COLUMN "analyticsEnabled", DROP COLUMN "analyticsStartedAt";
--   ALTER TABLE "users" DROP COLUMN "analyticsExcludedAt";

-- CreateEnum
CREATE TYPE "AnalyticsDevice" AS ENUM ('MOBILE', 'TABLET', 'DESKTOP');

-- CreateEnum
CREATE TYPE "AnalyticsRollupStatus" AS ENUM ('PARTIAL', 'FINAL', 'FAILED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "analyticsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "analyticsStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "analyticsExcludedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "analytics_visits" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rolesHeld" "RoleKey"[],
    "authMethod" VARCHAR(12) NOT NULL,
    "deviceClass" "AnalyticsDevice" NOT NULL,
    "entryPageKey" VARCHAR(64),
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_page_views" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "visitId" UUID NOT NULL,
    "pageKey" VARCHAR(64) NOT NULL,
    "rolesHeld" "RoleKey"[],
    "contextRole" VARCHAR(12) NOT NULL,
    "deviceClass" "AnalyticsDevice" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "visibleMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "analytics_page_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "visitId" UUID,
    "pageViewId" UUID,
    "name" VARCHAR(32) NOT NULL,
    "pageKey" VARCHAR(64),
    "subjectKey" VARCHAR(64),
    "action" VARCHAR(32),
    "source" VARCHAR(24),
    "rolesHeld" "RoleKey"[],
    "deviceClass" "AnalyticsDevice",
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_user_daily" (
    "tenantId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "rolesHeld" "RoleKey"[],
    "devices" "AnalyticsDevice"[],
    "visits" INTEGER NOT NULL DEFAULT 0,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "visibleMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "analytics_user_daily_pkey" PRIMARY KEY ("tenantId","localDate","userId")
);

-- CreateTable
CREATE TABLE "analytics_rollups" (
    "tenantId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "fact" VARCHAR(24) NOT NULL,
    "subjectKey" VARCHAR(64) NOT NULL,
    "role" VARCHAR(12) NOT NULL,
    "device" VARCHAR(12) NOT NULL,
    "count" INTEGER NOT NULL,
    "uniqueUsers" INTEGER NOT NULL,
    "durationMs" BIGINT NOT NULL DEFAULT 0,
    "durationSamples" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "analytics_rollups_pkey" PRIMARY KEY ("tenantId","localDate","fact","subjectKey","role","device")
);

-- CreateTable
CREATE TABLE "analytics_rollup_runs" (
    "tenantId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "status" "AnalyticsRollupStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorCode" VARCHAR(60),

    CONSTRAINT "analytics_rollup_runs_pkey" PRIMARY KEY ("tenantId","localDate")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "grantedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_visits_tenantId_startedAt_idx" ON "analytics_visits"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "analytics_visits_userId_startedAt_idx" ON "analytics_visits"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "analytics_page_views_tenantId_startedAt_idx" ON "analytics_page_views"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "analytics_page_views_tenantId_pageKey_startedAt_idx" ON "analytics_page_views"("tenantId", "pageKey", "startedAt");

-- CreateIndex
CREATE INDEX "analytics_page_views_userId_startedAt_idx" ON "analytics_page_views"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "analytics_page_views_visitId_idx" ON "analytics_page_views"("visitId");

-- CreateIndex
CREATE INDEX "analytics_events_tenantId_occurredAt_idx" ON "analytics_events"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "analytics_events_tenantId_name_occurredAt_idx" ON "analytics_events"("tenantId", "name", "occurredAt");

-- CreateIndex
CREATE INDEX "analytics_events_userId_occurredAt_idx" ON "analytics_events"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "analytics_user_daily_userId_idx" ON "analytics_user_daily"("userId");

-- CreateIndex
CREATE INDEX "analytics_rollups_tenantId_fact_localDate_idx" ON "analytics_rollups"("tenantId", "fact", "localDate");

-- CreateIndex
CREATE INDEX "user_permissions_tenantId_permission_idx" ON "user_permissions"("tenantId", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_userId_permission_key" ON "user_permissions"("userId", "permission");

-- AddForeignKey
ALTER TABLE "analytics_visits" ADD CONSTRAINT "analytics_visits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_visits" ADD CONSTRAINT "analytics_visits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_page_views" ADD CONSTRAINT "analytics_page_views_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_page_views" ADD CONSTRAINT "analytics_page_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_user_daily" ADD CONSTRAINT "analytics_user_daily_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_user_daily" ADD CONSTRAINT "analytics_user_daily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_rollups" ADD CONSTRAINT "analytics_rollups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_rollup_runs" ADD CONSTRAINT "analytics_rollup_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Only permissions the API knows can be granted.
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_check" CHECK ("permission" IN ('analytics.view'));
-- Counters and durations are never negative; the context is a role or SHARED.
ALTER TABLE "analytics_page_views" ADD CONSTRAINT "analytics_page_views_visible_check" CHECK ("visibleMs" >= 0);
ALTER TABLE "analytics_page_views" ADD CONSTRAINT "analytics_page_views_context_check" CHECK ("contextRole" IN ('STUDENT', 'FACULTY', 'STAFF', 'ALUMNI', 'ADMIN', 'SHARED'));
ALTER TABLE "analytics_visits" ADD CONSTRAINT "analytics_visits_auth_check" CHECK ("authMethod" IN ('PASSWORD', 'SSO'));
