-- =============================================================================
-- CRITICAL DATABASE UPDATE
-- =============================================================================
-- The application is currently crashing because these columns are missing.
-- Please copy and paste this entire block into your Supabase SQL Editor and run it.
-- =============================================================================

-- 1. Add the 'isTraining' flag and notes field
ALTER TABLE "public"."Conversation" ADD COLUMN IF NOT EXISTS "isTraining" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "public"."Conversation" ADD COLUMN IF NOT EXISTS "trainingNotes" TEXT;

-- 2. Add fields to track WHO marked it and WHEN
ALTER TABLE "public"."Conversation" ADD COLUMN IF NOT EXISTS "trainingAt" TIMESTAMP(3);
ALTER TABLE "public"."Conversation" ADD COLUMN IF NOT EXISTS "trainingBy" TEXT;

-- 3. Add the relationship to the User table (so we can show the admin's name)
ALTER TABLE "public"."Conversation" 
ADD CONSTRAINT "Conversation_trainingBy_fkey" 
FOREIGN KEY ("trainingBy") 
REFERENCES "public"."User"("id") 
ON DELETE SET NULL ON UPDATE CASCADE;
