-- NOTE: Structural reshape applied via prisma db push (tables renamed / rebuilt).
-- This migration records review follow-ups: CHECKs + soft-delete-friendly SKU uniqueness.

-- Soft-delete friendly SKU uniqueness (active rows only)
DROP INDEX IF EXISTS "product_requests_sku_key";
CREATE UNIQUE INDEX IF NOT EXISTS "product_requests_sku_active_unique"
  ON "product_requests" ("sku")
  WHERE "isDeleted" = false AND "sku" IS NOT NULL;

-- OTHER / built-in rules on document requirements
ALTER TABLE "product_document_requirements"
  DROP CONSTRAINT IF EXISTS "chk_doc_req_other_custom";
ALTER TABLE "product_document_requirements"
  ADD CONSTRAINT "chk_doc_req_other_custom" CHECK (
    (
      "type" <> 'OTHER'
      AND "customKey" = ''
    )
    OR
    (
      "type" = 'OTHER'
      AND "customKey" <> ''
      AND "label" IS NOT NULL
      AND length(trim("label")) > 0
    )
  );

-- OTHER / built-in rules on field requirements
ALTER TABLE "product_field_requirements"
  DROP CONSTRAINT IF EXISTS "chk_field_req_other_custom";
ALTER TABLE "product_field_requirements"
  ADD CONSTRAINT "chk_field_req_other_custom" CHECK (
    (
      "fieldType" <> 'OTHER'
      AND "customKey" = ''
    )
    OR
    (
      "fieldType" = 'OTHER'
      AND "customKey" <> ''
      AND "label" IS NOT NULL
      AND length(trim("label")) > 0
    )
  );
