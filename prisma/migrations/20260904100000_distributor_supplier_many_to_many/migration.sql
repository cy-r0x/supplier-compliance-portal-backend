-- CreateTable
CREATE TABLE "distributorSuppliers" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributorSuppliers_pkey" PRIMARY KEY ("id")
);

-- Migrate existing one-to-many links (if any)
INSERT INTO "distributorSuppliers" ("id", "distributorId", "supplierId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "distributorId", "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
WHERE "distributorId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_distributorId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "users_distributorId_idx";

-- AlterTable
ALTER TABLE "users" DROP COLUMN IF EXISTS "distributorId";

-- CreateIndex
CREATE INDEX "distributorSuppliers_distributorId_idx" ON "distributorSuppliers"("distributorId");

-- CreateIndex
CREATE INDEX "distributorSuppliers_supplierId_idx" ON "distributorSuppliers"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "distributorSuppliers_distributorId_supplierId_key" ON "distributorSuppliers"("distributorId", "supplierId");

-- AddForeignKey
ALTER TABLE "distributorSuppliers" ADD CONSTRAINT "distributorSuppliers_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributorSuppliers" ADD CONSTRAINT "distributorSuppliers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
