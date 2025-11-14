-- =====================================================
-- FIX NUMBERED LISTS - Use explicit \n for newlines
-- Run this ENTIRE script in Supabase SQL Editor
-- =====================================================

-- Overview - with explicit newlines between list items
UPDATE "OnboardingSection"
SET content = '## What This Tool Does

This customer support platform helps you manage customer emails efficiently by:
- Organizing all customer emails in one inbox
- Using AI to draft responses automatically
- Storing company policies and product information
- Tracking order details and shipping information
- Suggesting related conversations for context

## Key Components

1. **Email Inbox** - View and manage all customer conversations
2. **AI Draft Generator** - Automatically creates reply drafts
3. **Knowledge Base** - Company policies, procedures, and guidelines
4. **Product Knowledge Base** - Product details, pricing, specs, and FAQs
5. **AI Assistant** - Quick lookup tool for policies and product info
6. **Related Conversations** - See similar past customer emails'
WHERE slug = 'overview';

-- Verify it worked - you should see each numbered item
SELECT title, content FROM "OnboardingSection" WHERE slug = 'overview';
