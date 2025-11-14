-- =====================================================
-- DIAGNOSE LIST CONTENT
-- Run this to see exactly what's stored
-- =====================================================

-- Get the exact content with visible newline characters
SELECT
    title,
    slug,
    -- Show newlines as [NL] to make them visible
    REPLACE(
        SUBSTRING(content, POSITION('## Key Components' IN content), 300),
        E'\n',
        '[NL]'
    ) as content_with_visible_newlines
FROM "OnboardingSection"
WHERE slug = 'overview';

-- This will show you if there are [NL] characters between each numbered item
-- Expected: "1. **Email Inbox**[NL]2. **AI Draft Generator**[NL]3. **Knowledge Base**"
-- If you see: "1. **Email Inbox** 2. **AI Draft Generator** 3. **Knowledge Base**"
-- Then newlines are missing and need to be added
