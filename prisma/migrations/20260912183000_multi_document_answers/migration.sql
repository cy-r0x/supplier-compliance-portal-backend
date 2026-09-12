-- Allow multiple uploaded files per document requirement type
DROP INDEX IF EXISTS "product_document_answers_productRequestId_templateDocumentI_key";

CREATE INDEX "product_document_answers_productRequestId_templateDocumentI_idx" ON "product_document_answers"("productRequestId", "templateDocumentId");
