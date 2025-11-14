-- =====================================================
-- DEBUG SCRIPT FOR ONBOARDING TABLES
-- Run this in Supabase SQL Editor to diagnose issues
-- =====================================================

-- Step 1: Check if tables exist
-- =====================================================
SELECT
    table_name,
    table_schema
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('OnboardingSection', 'TrainingVideo')
ORDER BY table_name;

-- Expected: Should return 2 rows (OnboardingSection, TrainingVideo)
-- If returns 0 rows: Tables weren't created

-- Step 2: Check table structure
-- =====================================================
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'OnboardingSection'
ORDER BY ordinal_position;

-- Expected: Should show columns: id, title, slug, content, order, category, icon, active, createdAt, updatedAt

-- Step 3: Count total sections
-- =====================================================
SELECT COUNT(*) as total_sections
FROM "OnboardingSection";

-- Expected: 15 (9 tool-sop + 6 general-sop)
-- If returns 0: Data wasn't inserted

-- Step 4: Count by category
-- =====================================================
SELECT
    category,
    COUNT(*) as count
FROM "OnboardingSection"
GROUP BY category
ORDER BY category;

-- Expected:
--   general-sop: 6
--   tool-sop: 9

-- Step 5: List all sections with details
-- =====================================================
SELECT
    id,
    title,
    slug,
    category,
    "order",
    active,
    LENGTH(content) as content_length,
    icon
FROM "OnboardingSection"
ORDER BY category, "order";

-- Expected: Should show 15 rows with content_length > 0

-- Step 6: Check for duplicate slugs (should be unique)
-- =====================================================
SELECT
    slug,
    COUNT(*) as count
FROM "OnboardingSection"
GROUP BY slug
HAVING COUNT(*) > 1;

-- Expected: No rows (each slug should be unique)

-- Step 7: Sample content from first section
-- =====================================================
SELECT
    title,
    slug,
    SUBSTRING(content, 1, 200) as content_preview
FROM "OnboardingSection"
WHERE slug = 'overview'
LIMIT 1;

-- Expected: Should show content starting with "## What This Tool Does"

-- Step 8: Check if any sections are inactive
-- =====================================================
SELECT
    title,
    slug,
    active
FROM "OnboardingSection"
WHERE active = false;

-- Expected: No rows (all should be active)

-- Step 9: Verify indexes exist
-- =====================================================
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'OnboardingSection'
ORDER BY indexname;

-- Expected: Should show indexes for slug (unique), category, and order

-- Step 10: Test the exact query the API uses
-- =====================================================
SELECT
    id,
    title,
    slug,
    content,
    "order",
    category,
    icon,
    active,
    "createdAt",
    "updatedAt"
FROM "OnboardingSection"
WHERE active = true
ORDER BY "order" ASC;

-- Expected: 15 rows in order
-- This is EXACTLY what the API endpoint returns

-- =====================================================
-- DIAGNOSTIC RESULTS SUMMARY
-- =====================================================

-- If Step 1 returns 0 rows:
--   Problem: Tables don't exist
--   Solution: Run the CREATE TABLE statements from supabase-migration-and-seed.sql

-- If Step 3 returns 0:
--   Problem: Tables exist but no data
--   Solution: Run the INSERT statements from supabase-migration-and-seed.sql

-- If Step 10 returns rows but frontend shows "No content":
--   Problem: Frontend can't reach API or wrong API URL
--   Solution: Check browser console for exact error, verify NEXT_PUBLIC_API_URL

-- If Step 10 returns 0 rows but Step 3 shows data exists:
--   Problem: All sections are marked as inactive
--   Solution: Run: UPDATE "OnboardingSection" SET active = true;

-- =====================================================
-- QUICK FIX: If data is missing, re-insert all sections
-- =====================================================

-- Uncomment below to clear and re-insert (WARNING: Deletes all existing data)
-- DELETE FROM "OnboardingSection";
-- Then run the INSERT statements from supabase-migration-and-seed.sql
