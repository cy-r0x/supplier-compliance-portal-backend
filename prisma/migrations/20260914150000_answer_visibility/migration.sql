-- Add visibility on answers (default PRIVATE)
ALTER TABLE "product_document_answers" ADD COLUMN "visibility" "DocumentVisibility" NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE "product_field_answers" ADD COLUMN "visibility" "DocumentVisibility" NOT NULL DEFAULT 'PRIVATE';

-- Backfill from template requirement visibility
UPDATE "product_document_answers" AS pda
SET "visibility" = rtd."visibility"
FROM "requirement_template_documents" AS rtd
WHERE pda."templateDocumentId" = rtd."id";

UPDATE "product_field_answers" AS pfa
SET "visibility" = rtf."visibility"
FROM "requirement_template_fields" AS rtf
WHERE pfa."templateFieldId" = rtf."id";

-- Drop visibility from template ask matrix
ALTER TABLE "requirement_template_documents" DROP COLUMN "visibility";
ALTER TABLE "requirement_template_fields" DROP COLUMN "visibility";
