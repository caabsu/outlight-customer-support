-- Fix stuck migrations in _prisma_migrations table
-- Run this directly in Supabase SQL Editor

-- 1. Mark all failed migrations as rolled back
UPDATE "_prisma_migrations"
SET finished_at = started_at + INTERVAL '1 second',
    applied_steps_count = 0,
    logs = 'Manually rolled back due to pgbouncer transaction mode issue'
WHERE finished_at IS NULL;

-- 2. Delete the rollback records (clean slate)
DELETE FROM "_prisma_migrations"
WHERE finished_at IS NULL OR applied_steps_count = 0;

-- 3. Verify tables exist - if not, create them
-- Check if StandaloneDraft exists
CREATE TABLE IF NOT EXISTS "StandaloneDraft" (
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

-- 4. Check if Conversation has new columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='Conversation' AND column_name='starred') THEN
        ALTER TABLE "Conversation" ADD COLUMN "starred" BOOLEAN NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='Conversation' AND column_name='archived') THEN
        ALTER TABLE "Conversation" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='Conversation' AND column_name='tags') THEN
        ALTER TABLE "Conversation" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
    END IF;
END $$;

-- 5. Check if Message has new columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='Message' AND column_name='replyToEmail') THEN
        ALTER TABLE "Message" ADD COLUMN "replyToEmail" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='Message' AND column_name='isRead') THEN
        ALTER TABLE "Message" ADD COLUMN "isRead" BOOLEAN NOT NULL DEFAULT true;
    END IF;
END $$;

-- 6. Verify all is clean
SELECT migration_name, finished_at, applied_steps_count
FROM "_prisma_migrations"
ORDER BY started_at DESC;
