-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'DISTRIBUTOR', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('PENDING', 'SUBMITTED', 'REJECTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('TEST_REPORT', 'DECLARATION_OF_CONFORMITY', 'MANUAL_OR_INSTRUCTIONS', 'CERTIFICATE', 'PRODUCT_IMAGE', 'SAFETY_IMAGE', 'REGULATORY_DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "FieldKey" AS ENUM ('SAFETY_NOTICE_TEXT', 'WARNING_TEXT', 'AGE_GRADING', 'MATERIAL_INFORMATION', 'USAGE_RESTRICTIONS', 'SAFETY_INSTRUCTIONS', 'ADDITIONAL_NOTES', 'OTHER');

-- CreateEnum
CREATE TYPE "RequirementLevel" AS ENUM ('REQUIRED', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('REQUEST_CREATED', 'REQUEST_SUBMITTED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_MESSAGE', 'REQUEST_DELETED', 'REQUEST_REQUIREMENTS_UPDATED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "photo" TEXT,
    "createdById" TEXT,
    "distributorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "photo" TEXT,
    "price" DECIMAL(12,2),
    "status" "ProductStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "publicSlug" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "distributorId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productDocumentRequirements" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "customKey" TEXT NOT NULL DEFAULT '',
    "label" TEXT,
    "level" "RequirementLevel" NOT NULL,
    "visibility" "DocumentVisibility" NOT NULL,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productDocumentRequirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productFieldRequirements" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "field" "FieldKey" NOT NULL,
    "customKey" TEXT NOT NULL DEFAULT '',
    "label" TEXT,
    "level" "RequirementLevel" NOT NULL,
    "value" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productFieldRequirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "productId" TEXT,
    "creatorId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_distributorId_idx" ON "users"("distributorId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_publicSlug_key" ON "products"("publicSlug");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_distributorId_idx" ON "products"("distributorId");

-- CreateIndex
CREATE INDEX "products_supplierId_idx" ON "products"("supplierId");

-- CreateIndex
CREATE INDEX "productDocumentRequirements_productId_idx" ON "productDocumentRequirements"("productId");

-- CreateIndex
CREATE INDEX "productDocumentRequirements_visibility_idx" ON "productDocumentRequirements"("visibility");

-- CreateIndex
CREATE UNIQUE INDEX "productDocumentRequirements_productId_type_customKey_key" ON "productDocumentRequirements"("productId", "type", "customKey");

-- CreateIndex
CREATE INDEX "productFieldRequirements_productId_idx" ON "productFieldRequirements"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "productFieldRequirements_productId_field_customKey_key" ON "productFieldRequirements"("productId", "field", "customKey");

-- CreateIndex
CREATE INDEX "notifications_receiverId_read_idx" ON "notifications"("receiverId", "read");

-- CreateIndex
CREATE INDEX "notifications_productId_idx" ON "notifications"("productId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productDocumentRequirements" ADD CONSTRAINT "productDocumentRequirements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productFieldRequirements" ADD CONSTRAINT "productFieldRequirements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

