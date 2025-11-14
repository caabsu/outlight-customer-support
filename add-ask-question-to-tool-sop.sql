-- =====================================================
-- ADD "ASK A QUESTION" FEATURE TO TOOL SOP
-- Run this in Supabase SQL Editor
-- =====================================================

-- First, check if there's an existing section about collaboration/team features
SELECT title, slug FROM "OnboardingSection" WHERE category = 'tool-sop' ORDER BY "order";

-- If there's a "features" or "collaboration" section, we'll update it
-- Otherwise, we'll create a new section

-- Option 1: Add to an existing features section (if it exists)
UPDATE "OnboardingSection"
SET content = content || E'

## Ask a Question Feature

When you encounter an email or situation you\'re unsure about, use the **Ask a Question** feature to get help from your team.

### How to Use:

1. **While viewing an email**, look for the orange **"Ask Question"** button in the AI Assistant section (right side panel)

2. **Click the button** to open the question modal

3. **Fill in your question:**
   - Write your question clearly
   - The referenced email content is automatically pre-populated
   - You can edit the referenced email if needed

4. **Submit the question:**
   - Your question goes to the internal Questions KB
   - Team members and admins can see it
   - Someone will provide an answer
   - You\'ll be notified when answered

### When to Use Ask a Question:

- **Unsure about policy** - "Can we offer a refund after 60 days?"
- **Complex situation** - "Customer claims product caused damage, what do we do?"
- **Need escalation** - "Customer is threatening legal action"
- **Unclear instructions** - "How do I process a partial refund?"
- **Customer asking about something new** - "Customer wants to know about upcoming product"

### Best Practices:

✅ **Be specific** - Include details about the situation
✅ **Include context** - Reference the customer email
✅ **Ask before acting** - Don\'t send a response until you get guidance
✅ **Check Questions KB first** - Your question might already be answered

❌ **Don\'t guess** - If unsure, always ask
❌ **Don\'t delay unnecessarily** - Ask the question promptly so you can respond to the customer

### Accessing Questions KB:

- Click **"Questions KB"** in the left sidebar (orange icon)
- View all questions and answers
- Filter by answered/unanswered
- Search for similar questions before asking
'
WHERE slug LIKE '%feature%' OR slug LIKE '%tool-overview%'
  AND category = 'tool-sop';

-- Option 2: Create a new dedicated section if update didn't work
INSERT INTO "OnboardingSection" (
  id,
  title,
  slug,
  content,
  "order",
  category,
  icon,
  active
)
SELECT
  gen_random_uuid()::text,
  'Team Collaboration & Questions',
  'team-collaboration',
  E'## Ask a Question Feature

When you encounter an email or situation you\'re unsure about, use the **Ask a Question** feature to get help from your team.

### How to Use:

1. **While viewing an email**, look for the orange **"Ask Question"** button in the AI Assistant section (right side panel)

2. **Click the button** to open the question modal

3. **Fill in your question:**
   - Write your question clearly
   - The referenced email content is automatically pre-populated
   - You can edit the referenced email if needed

4. **Submit the question:**
   - Your question goes to the internal Questions KB
   - Team members and admins can see it
   - Someone will provide an answer
   - You\'ll be notified when answered

### When to Use Ask a Question:

- **Unsure about policy** - "Can we offer a refund after 60 days?"
- **Complex situation** - "Customer claims product caused damage, what do we do?"
- **Need escalation** - "Customer is threatening legal action"
- **Unclear instructions** - "How do I process a partial refund?"
- **Customer asking about something new** - "Customer wants to know about upcoming product"

### Best Practices:

✅ **Be specific** - Include details about the situation
✅ **Include context** - Reference the customer email
✅ **Ask before acting** - Don\'t send a response until you get guidance
✅ **Check Questions KB first** - Your question might already be answered

❌ **Don\'t guess** - If unsure, always ask
❌ **Don\'t delay unnecessarily** - Ask the question promptly so you can respond to the customer

### Accessing Questions KB:

You can access the Questions KB in two ways:

1. **From the sidebar** - Click "Questions KB" (orange icon) in the left navigation
2. **From the dashboard** - Click the "Questions KB" card on the main dashboard

In the Questions KB page, you can:
- View all questions and answers
- Filter by answered/unanswered/all
- Ask new questions
- Answer questions from teammates
- Delete questions (if needed)
- Search through past Q&A',
  (SELECT COALESCE(MAX("order"), 0) + 1 FROM "OnboardingSection" WHERE category = 'tool-sop'),
  'tool-sop',
  '❓',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "OnboardingSection"
  WHERE slug = 'team-collaboration'
    AND category = 'tool-sop'
);

-- Verify the changes
SELECT title, slug, category, "order", LENGTH(content) as content_length
FROM "OnboardingSection"
WHERE category = 'tool-sop'
ORDER BY "order";
