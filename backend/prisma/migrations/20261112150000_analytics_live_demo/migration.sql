-- Admin Analytics: live concurrent users, browser and operating system, and an isolated demo dataset. Additive only.
--   analytics_visits.browser / .os      normalised categories (never a user-agent string); NULL on visits recorded before this
--   tenants.analyticsDemoEnabled         "Include demo data" (default false: reports show real figures only)
--   analytics_presence                   one row per signed-in person whose portal is open now (heartbeat; deleted at sign-out)
--   analytics_concurrency                distinct people present, sampled into 5-minute buckets (peak of the bucket)
--   analytics_demo_*                     the synthetic dataset. Analytics-only storage: no row here is a portal account, and no
--                                        foreign key reaches "users". Reset = DELETE FROM these tables for the tenant.
-- Rollback (demo off, collection off): DROP TABLE "analytics_demo_notifications", "analytics_demo_concurrency",
--   "analytics_demo_rollups", "analytics_demo_user_daily", "analytics_demo_events", "analytics_demo_page_views",
--   "analytics_demo_visits", "analytics_demo_people", "analytics_demo_datasets", "analytics_concurrency", "analytics_presence";
--   ALTER TABLE "tenants" DROP COLUMN "analyticsDemoEnabled";
--   ALTER TABLE "analytics_visits" DROP COLUMN "browser", DROP COLUMN "os";

-- AlterTable
ALTER TABLE "analytics_visits" ADD COLUMN "browser" VARCHAR(12), ADD COLUMN "os" VARCHAR(12);

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "analyticsDemoEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "analytics_presence" (
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_presence_pkey" PRIMARY KEY ("tenantId","userId")
);

-- CreateTable
CREATE TABLE "analytics_concurrency" (
    "tenantId" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "users" INTEGER NOT NULL,

    CONSTRAINT "analytics_concurrency_pkey" PRIMARY KEY ("tenantId","bucketStart")
);

-- CreateTable
CREATE TABLE "analytics_demo_datasets" (
    "tenantId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "coversFrom" DATE NOT NULL,
    "coversTo" DATE NOT NULL,
    "people" INTEGER NOT NULL,
    "online" INTEGER NOT NULL,

    CONSTRAINT "analytics_demo_datasets_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "analytics_demo_people" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "institutionId" VARCHAR(24) NOT NULL,
    "rolesHeld" "RoleKey"[],
    "status" VARCHAR(12) NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "deviceClass" "AnalyticsDevice" NOT NULL,
    "browser" VARCHAR(12) NOT NULL,
    "os" VARCHAR(12) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_demo_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_demo_visits" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rolesHeld" "RoleKey"[],
    "authMethod" VARCHAR(12) NOT NULL,
    "deviceClass" "AnalyticsDevice" NOT NULL,
    "entryPageKey" VARCHAR(64),
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "browser" VARCHAR(12),
    "os" VARCHAR(12),

    CONSTRAINT "analytics_demo_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_demo_page_views" (
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

    CONSTRAINT "analytics_demo_page_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_demo_events" (
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

    CONSTRAINT "analytics_demo_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_demo_user_daily" (
    "tenantId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "rolesHeld" "RoleKey"[],
    "devices" "AnalyticsDevice"[],
    "visits" INTEGER NOT NULL DEFAULT 0,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "visibleMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "analytics_demo_user_daily_pkey" PRIMARY KEY ("tenantId","localDate","userId")
);

-- CreateTable
CREATE TABLE "analytics_demo_rollups" (
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

    CONSTRAINT "analytics_demo_rollups_pkey" PRIMARY KEY ("tenantId","localDate","fact","subjectKey","role","device")
);

-- CreateTable
CREATE TABLE "analytics_demo_concurrency" (
    "tenantId" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "users" INTEGER NOT NULL,

    CONSTRAINT "analytics_demo_concurrency_pkey" PRIMARY KEY ("tenantId","bucketStart")
);

-- CreateTable
CREATE TABLE "analytics_demo_notifications" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_demo_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_presence_tenantId_lastSeenAt_idx" ON "analytics_presence"("tenantId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "analytics_presence_userId_idx" ON "analytics_presence"("userId");

-- CreateIndex
CREATE INDEX "analytics_demo_people_tenantId_lastLoginAt_idx" ON "analytics_demo_people"("tenantId", "lastLoginAt");

-- CreateIndex
CREATE INDEX "analytics_demo_people_tenantId_online_idx" ON "analytics_demo_people"("tenantId", "online");

-- CreateIndex
CREATE INDEX "analytics_demo_visits_tenantId_startedAt_idx" ON "analytics_demo_visits"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "analytics_demo_visits_userId_idx" ON "analytics_demo_visits"("userId");

-- CreateIndex
CREATE INDEX "analytics_demo_page_views_tenantId_startedAt_idx" ON "analytics_demo_page_views"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "analytics_demo_page_views_userId_idx" ON "analytics_demo_page_views"("userId");

-- CreateIndex
CREATE INDEX "analytics_demo_events_tenantId_occurredAt_idx" ON "analytics_demo_events"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "analytics_demo_events_tenantId_name_occurredAt_idx" ON "analytics_demo_events"("tenantId", "name", "occurredAt");

-- CreateIndex
CREATE INDEX "analytics_demo_events_userId_idx" ON "analytics_demo_events"("userId");

-- CreateIndex
CREATE INDEX "analytics_demo_user_daily_userId_idx" ON "analytics_demo_user_daily"("userId");

-- CreateIndex
CREATE INDEX "analytics_demo_rollups_tenantId_fact_localDate_idx" ON "analytics_demo_rollups"("tenantId", "fact", "localDate");

-- CreateIndex
CREATE INDEX "analytics_demo_notifications_tenantId_createdAt_idx" ON "analytics_demo_notifications"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_demo_notifications_userId_idx" ON "analytics_demo_notifications"("userId");

-- AddForeignKey
ALTER TABLE "analytics_presence" ADD CONSTRAINT "analytics_presence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_presence" ADD CONSTRAINT "analytics_presence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_concurrency" ADD CONSTRAINT "analytics_concurrency_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_demo_datasets" ADD CONSTRAINT "analytics_demo_datasets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_demo_people" ADD CONSTRAINT "analytics_demo_people_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_demo_visits" ADD CONSTRAINT "analytics_demo_visits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "analytics_demo_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_demo_page_views" ADD CONSTRAINT "analytics_demo_page_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "analytics_demo_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_demo_events" ADD CONSTRAINT "analytics_demo_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "analytics_demo_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_demo_user_daily" ADD CONSTRAINT "analytics_demo_user_daily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "analytics_demo_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_demo_rollups" ADD CONSTRAINT "analytics_demo_rollups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_demo_concurrency" ADD CONSTRAINT "analytics_demo_concurrency_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_demo_notifications" ADD CONSTRAINT "analytics_demo_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "analytics_demo_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Normalised categories only (shared/analyticsAgent.js); counts are never negative; synthetic ids and addresses are unmistakable.
ALTER TABLE "analytics_visits" ADD CONSTRAINT "analytics_visits_browser_check" CHECK ("browser" IS NULL OR "browser" IN ('CHROME', 'SAFARI', 'EDGE', 'FIREFOX', 'OPERA', 'OTHER', 'UNKNOWN'));
ALTER TABLE "analytics_visits" ADD CONSTRAINT "analytics_visits_os_check" CHECK ("os" IS NULL OR "os" IN ('WINDOWS', 'MACOS', 'IOS', 'ANDROID', 'CHROMEOS', 'LINUX', 'OTHER', 'UNKNOWN'));
ALTER TABLE "analytics_concurrency" ADD CONSTRAINT "analytics_concurrency_users_check" CHECK ("users" >= 0);
ALTER TABLE "analytics_demo_concurrency" ADD CONSTRAINT "analytics_demo_concurrency_users_check" CHECK ("users" >= 0);
ALTER TABLE "analytics_demo_people" ADD CONSTRAINT "analytics_demo_people_id_check" CHECK ("id" LIKE 'demo-%');
ALTER TABLE "analytics_demo_people" ADD CONSTRAINT "analytics_demo_people_email_check" CHECK ("email" LIKE '%@example.invalid');
