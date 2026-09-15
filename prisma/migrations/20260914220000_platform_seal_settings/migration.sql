-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL,
    "sealApprovedUrl" TEXT,
    "sealSubmittedUrl" TEXT,
    "sealRejectedUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- Seed singleton row
INSERT INTO "platform_settings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
