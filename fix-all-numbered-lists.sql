-- =====================================================
-- FIX ALL NUMBERED LISTS - Add explicit newlines
-- Run this in Supabase SQL Editor
-- =====================================================

-- Overview section
UPDATE "OnboardingSection"
SET content = E'## What This Tool Does

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

-- Getting Started section
UPDATE "OnboardingSection"
SET content = E'## Accessing the Tool

1. Open your browser and navigate to the platform URL

2. You''ll see the main dashboard with several cards:
   - **Emails** - Your main workspace
   - **Knowledge Base** - Company policies
   - **Product Knowledge Base** - Product information

## Understanding Workspaces

**IMPORTANT:** You will be managing **TWO workspaces simultaneously**. Each workspace represents a different email account or brand.

### How to Switch Between Workspaces:

1. Look for the workspace selector (usually in the top navigation)

2. Click to see available workspaces

3. Select the workspace you want to view

### Example Setup:
- Tab 1: Workspace A (email 1)
- Tab 2: Workspace B (email 2)

This allows you to monitor both inboxes simultaneously and respond quickly to all customers.'
WHERE slug = 'getting-started';

-- Daily Workflow section
UPDATE "OnboardingSection"
SET content = E'## Routine (Start of Shift)

1. **Open Both Workspaces**
   - Use separate tabs or windows for each workspace

2. **Check Filter Settings**
   - Click "Needs Reply" filter to see unanswered emails
   - This shows only emails that require your response

3. **Sync Emails with the Sync Button**
   - Use the sync button on the conversations column to sync all emails
   - After syncing, the filter may not work. Uncheck all the filters, then check 1 filter at a time slowly to get a correct view

4. **Review Email Queue**
   - First in, first out -- Go to the "Oldest Unreplied" email, and work from there
   - Note the number of pending emails in each workspace

## Processing Each Email

Follow this workflow for **EVERY** email:

### Step 1: Open the Conversation
- Click on the email in the inbox
- Read the entire email thread (not just the latest message)
- Understand the customer''s issue and tone

### Step 2: Check Related Conversations ⭐ **CRITICAL**
- Look at the "Related Conversations" section on the right side
- This shows previous emails from the same customer or about similar issues
- **Why This Matters:**
  - See if the customer has contacted you before
  - Check if there''s an ongoing issue
  - Find relevant solutions used in the past
  - Maintain consistency in your responses

### Step 3: Generate AI Draft
- Click the **"Draft"** button in the top right
- Wait for the AI to generate a response (usually 10-30 seconds)
- The AI will:
  - Search for customer and order information
  - Look up product details if mentioned
  - Check company policies
  - Create a complete draft response

### Step 4: Review the Draft ⭐ **CRITICAL**

**DO NOT blindly send the AI draft!** Always review it carefully.

**IMPORTANT**: Some simple inquiries require little to no inspection after the draft completes. However, for more complex tasks, the draft may produce a completely unusable response. In this case, use the **"CUSTOM INSTRUCTIONS"** to get the reply we want. Feed all information, direction, and guidance for the AI to create a response much more tailored and complete.

### Step 5: Edit the Draft
- Add a personal touch (use your first name)
- Adjust the tone if needed (more formal or casual)
- Add specific details the AI might have missed
- Remove any awkward phrasing
- Add empathy if the customer is frustrated

### Step 6: Send the Reply

1. Review your edited draft one final time

2. Click **"Send"** or **"Reply"**

3. The conversation will move out of "Needs Reply"

4. Move on to the next email'
WHERE slug = 'daily-workflow';

-- Verify the changes
SELECT
    title,
    slug,
    LENGTH(content) as content_length,
    SUBSTRING(content, POSITION('1. ' IN content), 150) as list_preview
FROM "OnboardingSection"
WHERE slug IN ('overview', 'getting-started', 'daily-workflow')
ORDER BY "order";

-- If you see proper newlines in the list_preview, the fix worked!
