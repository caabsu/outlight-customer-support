-- =====================================================
-- AUTHENTICATION & USER MANAGEMENT
-- Run this entire script in Supabase SQL Editor
-- =====================================================

-- Drop old User table if it exists (old schema)
DROP TABLE IF EXISTS "User" CASCADE;

-- Create User table with new schema
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "username" TEXT NOT NULL UNIQUE,
  "password" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'agent',
  "email" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS "User_username_idx" ON "User"("username");

-- Insert default admin user
INSERT INTO "User" ("id", "name", "username", "password", "role", "email", "active")
VALUES (
  gen_random_uuid()::text,
  'Heesu Chung',
  'caabsu',
  'gmltn123',
  'admin',
  null,
  true
)
ON CONFLICT ("username") DO NOTHING;

-- =====================================================
-- USER ACTIVITY TRACKING
-- =====================================================

-- Create UserActivity table to track email actions
CREATE TABLE IF NOT EXISTS "UserActivity" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "conversationId" TEXT REFERENCES "Conversation"("id") ON DELETE SET NULL,
  "actionType" TEXT NOT NULL, -- 'email_sent', 'draft_generated', 'email_viewed', etc.
  "metadata" JSONB,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS "UserActivity_userId_idx" ON "UserActivity"("userId");
CREATE INDEX IF NOT EXISTS "UserActivity_workspaceId_idx" ON "UserActivity"("workspaceId");
CREATE INDEX IF NOT EXISTS "UserActivity_timestamp_idx" ON "UserActivity"("timestamp");
CREATE INDEX IF NOT EXISTS "UserActivity_actionType_idx" ON "UserActivity"("actionType");

-- =====================================================
-- QUESTIONS KB
-- =====================================================

-- Create QuestionsKB table
CREATE TABLE IF NOT EXISTS "QuestionsKB" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "question" TEXT NOT NULL,
  "answer" TEXT,
  "askedBy" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "answeredBy" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "referencedEmail" TEXT, -- Copy/paste of email content
  "conversationId" TEXT REFERENCES "Conversation"("id") ON DELETE SET NULL,
  "status" TEXT NOT NULL DEFAULT 'unanswered', -- 'unanswered', 'answered'
  "tags" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt" TIMESTAMP(3)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "QuestionsKB_askedBy_idx" ON "QuestionsKB"("askedBy");
CREATE INDEX IF NOT EXISTS "QuestionsKB_answeredBy_idx" ON "QuestionsKB"("answeredBy");
CREATE INDEX IF NOT EXISTS "QuestionsKB_status_idx" ON "QuestionsKB"("status");
CREATE INDEX IF NOT EXISTS "QuestionsKB_createdAt_idx" ON "QuestionsKB"("createdAt");

-- =====================================================
-- ANALYTICS TRACKING
-- Add user tracking fields to Conversation table
-- =====================================================

-- Remove old user tracking fields if they exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Conversation' AND column_name = 'assignedUser'
  ) THEN
    ALTER TABLE "Conversation" DROP COLUMN "assignedUser";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Conversation' AND column_name = 'assignedUserId'
  ) THEN
    ALTER TABLE "Conversation" DROP COLUMN "assignedUserId";
  END IF;
END $$;

-- Add new userId tracking fields to Conversation table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Conversation' AND column_name = 'assignedTo'
  ) THEN
    ALTER TABLE "Conversation" ADD COLUMN "assignedTo" TEXT REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Add userId to draft tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Conversation' AND column_name = 'lastDraftedBy'
  ) THEN
    ALTER TABLE "Conversation" ADD COLUMN "lastDraftedBy" TEXT REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Conversation' AND column_name = 'lastRepliedBy'
  ) THEN
    ALTER TABLE "Conversation" ADD COLUMN "lastRepliedBy" TEXT REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================
-- VERIFY TABLES CREATED
-- =====================================================

SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('User', 'UserActivity', 'QuestionsKB')
ORDER BY table_name;

-- Verify default user exists
SELECT id, name, username, role, active FROM "User" WHERE username = 'caabsu';

-- Show summary
SELECT
  'Setup complete!' as status,
  (SELECT COUNT(*) FROM "User") as total_users,
  (SELECT COUNT(*) FROM "UserActivity") as total_activities,
  (SELECT COUNT(*) FROM "QuestionsKB") as total_questions;
