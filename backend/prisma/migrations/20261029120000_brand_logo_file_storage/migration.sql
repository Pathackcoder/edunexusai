-- One institution logo per tenant (kind 'logo'), kept as a file in the backend's branding storage
-- directory; the row holds only its storage key and metadata. Backward-compatible: nothing is dropped,
-- `data` becomes nullable (kept for any row written by the first version), the earlier slot names stay
-- allowed so no existing row can violate the new check. No row is moved or deleted.
-- Rollback: ALTER TABLE "tenant_brand_assets" DROP COLUMN "storageKey"; restore the previous checks
-- (kind IN ('dark','light','mark')) and "data" NOT NULL, after removing any 'logo' rows.

ALTER TABLE "tenant_brand_assets" ADD COLUMN "storageKey" TEXT,
ALTER COLUMN "data" DROP NOT NULL;

ALTER TABLE "tenant_brand_assets" DROP CONSTRAINT "tenant_brand_assets_kind_check";
ALTER TABLE "tenant_brand_assets" ADD CONSTRAINT "tenant_brand_assets_kind_check" CHECK ("kind" IN ('logo', 'dark', 'light', 'mark'));
-- Every row points at its image: a stored file (new rows) or, for first-version rows, inline bytes.
ALTER TABLE "tenant_brand_assets" ADD CONSTRAINT "tenant_brand_assets_image_check" CHECK ("storageKey" IS NOT NULL OR "data" IS NOT NULL);
-- Server-generated keys only: <tenant id>/<sha-256>.<png|jpg|webp>
ALTER TABLE "tenant_brand_assets" ADD CONSTRAINT "tenant_brand_assets_storage_key_check" CHECK ("storageKey" IS NULL OR "storageKey" ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpg|webp)$');
