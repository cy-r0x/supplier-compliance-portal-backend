-- Query-performance indexes for list/public/requirement sync paths

-- Users: list suppliers/distributors created by a parent account
CREATE INDEX IF NOT EXISTS "users_createdById_idx" ON "users"("createdById");

-- Refresh tokens: expiry cleanup / revocation sweeps
CREATE INDEX IF NOT EXISTS "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- Product requests: scoped list + default createdAt sort
CREATE INDEX IF NOT EXISTS "product_requests_isDeleted_status_createdAt_idx"
  ON "product_requests"("isDeleted", "status", "createdAt");

-- Document requirements: progress (REQUIRED) and public page (PUBLIC) filters
DROP INDEX IF EXISTS "product_document_requirements_productRequestId_idx";
CREATE INDEX IF NOT EXISTS "product_document_requirements_productRequestId_level_idx"
  ON "product_document_requirements"("productRequestId", "level");
CREATE INDEX IF NOT EXISTS "product_document_requirements_productRequestId_visibility_idx"
  ON "product_document_requirements"("productRequestId", "visibility");

-- Field requirements: same hot paths as documents
DROP INDEX IF EXISTS "product_field_requirements_productRequestId_idx";
CREATE INDEX IF NOT EXISTS "product_field_requirements_productRequestId_level_idx"
  ON "product_field_requirements"("productRequestId", "level");
CREATE INDEX IF NOT EXISTS "product_field_requirements_productRequestId_visibility_idx"
  ON "product_field_requirements"("productRequestId", "visibility");

-- Notifications: inbox without unread filter + creator lookups
CREATE INDEX IF NOT EXISTS "notifications_receiverId_createdAt_idx"
  ON "notifications"("receiverId", "createdAt");
CREATE INDEX IF NOT EXISTS "notifications_creatorId_idx"
  ON "notifications"("creatorId");
