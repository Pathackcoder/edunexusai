-- AlterTable
ALTER TABLE "library_catalog_items" ADD COLUMN     "copiesLabel" TEXT,
ALTER COLUMN "copies" DROP NOT NULL,
ALTER COLUMN "copies" DROP DEFAULT;
