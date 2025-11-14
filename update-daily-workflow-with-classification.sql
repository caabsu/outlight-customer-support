-- =====================================================
-- UPDATE DAILY WORKFLOW - Add Email Classification & Decision Making
-- Run this in Supabase SQL Editor
-- =====================================================

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

### Step 1: Read & Understand the Email ⭐ **CRITICAL**

**Before doing anything else, READ and UNDERSTAND the email:**

1. **Read the entire email thread** (not just the latest message)
2. **Identify the type of email** at a broad perspective:
   - **Simple inquiry** - Product question, shipping status, general info
   - **Order issue** - Refund request, missing item, damaged product
   - **Complex problem** - Multiple issues, escalated situation, angry customer
   - **Non-support** - Sales inquiry, partnership request, spam
   - **Requires admin** - Legal issue, payment dispute, policy exception

3. **Understand the customer\'s tone and urgency**
   - Is the customer frustrated or calm?
   - Is this time-sensitive?
   - Have they contacted us multiple times?

**This initial assessment determines your entire approach to the email.**

### Step 2: Check Related Conversations ⭐ **CRITICAL**

- Look at the "Related Conversations" section on the right side
- This shows previous emails from the same customer or about similar issues
- **Why This Matters:**
  - See if the customer has contacted you before
  - Check if there\'s an ongoing issue
  - Find relevant solutions used in the past
  - Maintain consistency in your responses

### Step 3: Decide on Course of Action

Based on your email classification, choose the appropriate action:

**Option A: Resolve with AI Draft (Most Common)**
- For standard support inquiries
- Customer questions about products, orders, shipping
- Follow Steps 4-7 below

**Option B: Mark as Non-CS**
- Sales inquiries (wholesale, bulk orders)
- Partnership/collaboration requests
- Job applications
- Media inquiries
- Spam or irrelevant emails
- **How to mark:** Use the "Mark as Non-CS" button or tag

**Option C: Escalate to Admin**
- Legal threats or issues
- Payment disputes beyond standard refunds
- Policy exceptions requiring approval
- Complex cases you\'re unsure how to handle
- Angry customers demanding to speak to management
- **How to escalate:** Use the "Ask a Question" feature (orange button in email view) to ask admin for guidance, or tag for admin review

**Option D: Ask a Question First**
- If you\'re unsure how to proceed
- If you need clarification on policy
- If the situation is unusual
- **How to ask:** Click the orange "Ask Question" button in the email view
- Reference the email content in your question
- Wait for team response before proceeding

### Step 4: Generate AI Draft (For Resolved Cases)

- Click the **"Draft"** button in the top right
- Wait for the AI to generate a response (usually 10-30 seconds)
- The AI will:
  - Search for customer and order information
  - Look up product details if mentioned
  - Check company policies
  - Create a complete draft response

### Step 5: Review the Draft ⭐ **CRITICAL**

**DO NOT blindly send the AI draft!** Always review it carefully.

**IMPORTANT**: Some simple inquiries require little to no inspection after the draft completes. However, for more complex tasks, the draft may produce a completely unusable response. In this case, use the **"CUSTOM INSTRUCTIONS"** to get the reply we want. Feed all information, direction, and guidance for the AI to create a response much more tailored and complete.

### Step 6: Edit the Draft

- Add a personal touch (use your first name)
- Adjust the tone if needed (more formal or casual)
- Add specific details the AI might have missed
- Remove any awkward phrasing
- Add empathy if the customer is frustrated

### Step 7: Send the Reply

1. Review your edited draft one final time

2. Click **"Send"** or **"Reply"**

3. The conversation will move out of "Needs Reply"

4. Move on to the next email

## Summary: Email Action Decision Tree

```
Read Email → Identify Type → Choose Action:

├─ Standard Support → Generate Draft → Review → Edit → Send
├─ Non-Support → Mark as Non-CS
├─ Needs Admin → Ask Question / Escalate
└─ Unsure → Ask Question First
```'
WHERE slug = 'daily-workflow';

-- Verify the update
SELECT
    title,
    slug,
    LENGTH(content) as content_length
FROM "OnboardingSection"
WHERE slug = 'daily-workflow';
