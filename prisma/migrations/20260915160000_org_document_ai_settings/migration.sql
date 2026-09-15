-- CreateEnum
CREATE TYPE "DocumentAiProvider" AS ENUM ('NONE', 'GEMINI', 'OPENAI');

-- AlterTable
ALTER TABLE "organization_settings"
ADD COLUMN "documentAiProvider" "DocumentAiProvider" NOT NULL DEFAULT 'NONE',
ADD COLUMN "documentAiModel" TEXT,
ADD COLUMN "geminiApiKeyEncrypted" TEXT,
ADD COLUMN "openaiApiKeyEncrypted" TEXT;
