-- AlterTable
ALTER TABLE "productDocumentRequirements" DROP COLUMN IF EXISTS "fileUrl",
DROP COLUMN IF EXISTS "fileName";

-- AlterTable
ALTER TABLE "productFieldRequirements" DROP COLUMN IF EXISTS "value";

-- CreateTable
CREATE TABLE "productDocuments" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "customKey" TEXT NOT NULL DEFAULT '',
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "visibility" "DocumentVisibility" NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productDocuments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productFieldValues" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "field" "FieldKey" NOT NULL,
    "customKey" TEXT NOT NULL DEFAULT '',
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productFieldValues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "productDocuments_productId_idx" ON "productDocuments"("productId");

-- CreateIndex
CREATE INDEX "productDocuments_visibility_idx" ON "productDocuments"("visibility");

-- CreateIndex
CREATE UNIQUE INDEX "productDocuments_productId_type_customKey_key" ON "productDocuments"("productId", "type", "customKey");

-- CreateIndex
CREATE INDEX "productFieldValues_productId_idx" ON "productFieldValues"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "productFieldValues_productId_field_customKey_key" ON "productFieldValues"("productId", "field", "customKey");

-- AddForeignKey
ALTER TABLE "productDocuments" ADD CONSTRAINT "productDocuments_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productFieldValues" ADD CONSTRAINT "productFieldValues_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
