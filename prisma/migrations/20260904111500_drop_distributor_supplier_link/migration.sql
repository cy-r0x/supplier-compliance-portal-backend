-- DropForeignKey
ALTER TABLE "product_requests" DROP CONSTRAINT IF EXISTS "product_requests_distributorSupplierId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "product_requests_distributorSupplierId_idx";

-- AlterTable
ALTER TABLE "product_requests" DROP COLUMN IF EXISTS "distributorSupplierId";

-- DropTable
DROP TABLE IF EXISTS "distributor_suppliers";
