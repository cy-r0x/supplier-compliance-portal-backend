-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'USER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "OrganizationMemberRole" AS ENUM ('MANAGER', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('PENDING', 'SUBMITTED', 'REJECTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('TEST_REPORT', 'DECLARATION_OF_CONFORMITY', 'MANUAL_OR_INSTRUCTIONS', 'CERTIFICATE', 'PRODUCT_IMAGE', 'SAFETY_IMAGE', 'REGULATORY_DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('SAFETY_NOTICE_TEXT', 'WARNING_TEXT', 'AGE_GRADING', 'MATERIAL_INFORMATION', 'USAGE_RESTRICTIONS', 'SAFETY_INSTRUCTIONS', 'ADDITIONAL_NOTES', 'OTHER');

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationMemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "autoApproveProductRequests" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "product_requests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "photo" TEXT,
    "price" DECIMAL(12,2),
    "status" "ProductStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "publicSlug" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "supplierId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "product_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirement_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_template_documents" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "customKey" TEXT NOT NULL DEFAULT '',
    "label" TEXT,
    "level" "RequirementLevel" NOT NULL,
    "visibility" "DocumentVisibility" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirement_template_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_template_fields" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "fieldType" "FieldType" NOT NULL,
    "customKey" TEXT NOT NULL DEFAULT '',
    "label" TEXT,
    "level" "RequirementLevel" NOT NULL,
    "visibility" "DocumentVisibility" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirement_template_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_document_answers" (
    "id" TEXT NOT NULL,
    "productRequestId" TEXT NOT NULL,
    "templateDocumentId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_document_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_field_answers" (
    "id" TEXT NOT NULL,
    "productRequestId" TEXT NOT NULL,
    "templateFieldId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_field_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_messages" (
    "id" TEXT NOT NULL,
    "productRequestId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "productRequestId" TEXT,
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
CREATE INDEX "users_createdById_idx" ON "users"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_name_key" ON "organizations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_userId_key" ON "organization_members"("userId");

-- CreateIndex
CREATE INDEX "organization_members_organizationId_role_idx" ON "organization_members"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "organization_settings_organizationId_key" ON "organization_settings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_requests_publicSlug_key" ON "product_requests"("publicSlug");

-- CreateIndex
CREATE INDEX "product_requests_supplierId_isDeleted_status_idx" ON "product_requests"("supplierId", "isDeleted", "status");

-- CreateIndex
CREATE INDEX "product_requests_organizationId_isDeleted_status_idx" ON "product_requests"("organizationId", "isDeleted", "status");

-- CreateIndex
CREATE INDEX "product_requests_isDeleted_deletedAt_idx" ON "product_requests"("isDeleted", "deletedAt");

-- CreateIndex
CREATE INDEX "product_requests_isDeleted_status_createdAt_idx" ON "product_requests"("isDeleted", "status", "createdAt");

-- CreateIndex
CREATE INDEX "product_requests_status_idx" ON "product_requests"("status");

-- CreateIndex
CREATE INDEX "product_requests_templateId_idx" ON "product_requests"("templateId");

-- CreateIndex
CREATE INDEX "product_requests_createdById_idx" ON "product_requests"("createdById");

-- CreateIndex
CREATE INDEX "requirement_templates_organizationId_idx" ON "requirement_templates"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_templates_organizationId_name_key" ON "requirement_templates"("organizationId", "name");

-- CreateIndex
CREATE INDEX "requirement_template_documents_templateId_idx" ON "requirement_template_documents"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_template_documents_templateId_type_customKey_key" ON "requirement_template_documents"("templateId", "type", "customKey");

-- CreateIndex
CREATE INDEX "requirement_template_fields_templateId_idx" ON "requirement_template_fields"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_template_fields_templateId_fieldType_customKey_key" ON "requirement_template_fields"("templateId", "fieldType", "customKey");

-- CreateIndex
CREATE INDEX "product_document_answers_productRequestId_templateDocumentI_idx" ON "product_document_answers"("productRequestId", "templateDocumentId");

-- CreateIndex
CREATE INDEX "product_document_answers_templateDocumentId_idx" ON "product_document_answers"("templateDocumentId");

-- CreateIndex
CREATE INDEX "product_field_answers_templateFieldId_idx" ON "product_field_answers"("templateFieldId");

-- CreateIndex
CREATE UNIQUE INDEX "product_field_answers_productRequestId_templateFieldId_key" ON "product_field_answers"("productRequestId", "templateFieldId");

-- CreateIndex
CREATE INDEX "product_messages_productRequestId_createdAt_idx" ON "product_messages"("productRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "product_messages_senderId_idx" ON "product_messages"("senderId");

-- CreateIndex
CREATE INDEX "notifications_receiverId_isRead_createdAt_idx" ON "notifications"("receiverId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_receiverId_createdAt_idx" ON "notifications"("receiverId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_productRequestId_idx" ON "notifications"("productRequestId");

-- CreateIndex
CREATE INDEX "notifications_creatorId_idx" ON "notifications"("creatorId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "requirement_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_templates" ADD CONSTRAINT "requirement_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_template_documents" ADD CONSTRAINT "requirement_template_documents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "requirement_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_template_fields" ADD CONSTRAINT "requirement_template_fields_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "requirement_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_document_answers" ADD CONSTRAINT "product_document_answers_productRequestId_fkey" FOREIGN KEY ("productRequestId") REFERENCES "product_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_document_answers" ADD CONSTRAINT "product_document_answers_templateDocumentId_fkey" FOREIGN KEY ("templateDocumentId") REFERENCES "requirement_template_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_field_answers" ADD CONSTRAINT "product_field_answers_productRequestId_fkey" FOREIGN KEY ("productRequestId") REFERENCES "product_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_field_answers" ADD CONSTRAINT "product_field_answers_templateFieldId_fkey" FOREIGN KEY ("templateFieldId") REFERENCES "requirement_template_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_messages" ADD CONSTRAINT "product_messages_productRequestId_fkey" FOREIGN KEY ("productRequestId") REFERENCES "product_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_messages" ADD CONSTRAINT "product_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_productRequestId_fkey" FOREIGN KEY ("productRequestId") REFERENCES "product_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

