-- CreateTable
CREATE TABLE "StandaloneDraft" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "emailBody" TEXT NOT NULL,
    "contextNotes" TEXT,
    "customInstructions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "internalReasoning" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "reasoning" TEXT,
    "shouldDraft" BOOLEAN NOT NULL DEFAULT true,
    "draft" TEXT,
    "actionSteps" JSONB,
    "orderInfo" JSONB,
    "processingTime" TEXT,
    "toolCallsMade" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StandaloneDraft_pkey" PRIMARY KEY ("id")
);
