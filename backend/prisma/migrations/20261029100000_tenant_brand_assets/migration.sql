-- Institution logo images for Portal Appearance (one row per tenant and slot).
-- Additive only: one new table; nothing existing changes. Without rows the portal uses the bundled logos.
-- Rollback: DROP TABLE "tenant_brand_assets"; and delete this migration's row from "_prisma_migrations".

-- CreateTable
CREATE TABLE "tenant_brand_assets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_brand_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_brand_assets_tenantId_kind_key" ON "tenant_brand_assets"("tenantId", "kind");

-- AddForeignKey
ALTER TABLE "tenant_brand_assets" ADD CONSTRAINT "tenant_brand_assets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Only the known slots and image types (SVG is never stored), and a bounded size.
ALTER TABLE "tenant_brand_assets" ADD CONSTRAINT "tenant_brand_assets_kind_check" CHECK ("kind" IN ('dark', 'light', 'mark'));
ALTER TABLE "tenant_brand_assets" ADD CONSTRAINT "tenant_brand_assets_mime_check" CHECK ("mimeType" IN ('image/png', 'image/jpeg', 'image/webp'));
ALTER TABLE "tenant_brand_assets" ADD CONSTRAINT "tenant_brand_assets_size_check" CHECK ("byteSize" > 0 AND "byteSize" <= 1048576);
