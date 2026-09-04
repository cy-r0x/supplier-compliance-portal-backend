-- AlterTable
ALTER TABLE "product_field_requirements" ADD COLUMN IF NOT EXISTS "visibility" "DocumentVisibility" NOT NULL DEFAULT 'PRIVATE';
