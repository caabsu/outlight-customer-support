-- Run this in Supabase SQL Editor to verify data was inserted

-- Check if tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('OnboardingSection', 'TrainingVideo');

-- Count sections by category
SELECT
    category,
    COUNT(*) as count,
    array_agg(title ORDER BY "order") as titles
FROM "OnboardingSection"
GROUP BY category;

-- Show all sections
SELECT
    id,
    title,
    slug,
    category,
    "order",
    active,
    LENGTH(content) as content_length
FROM "OnboardingSection"
ORDER BY category, "order";
