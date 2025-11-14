-- Update Daily Workflow section with efficient batching strategy
UPDATE "OnboardingSection"
SET content = E'## Your Workflow, Your Way

You have complete freedom in how you work through emails. The tips below are **guidance for efficiency**, not strict rules. Find what works best for you.

## Start of Shift - Recommended Routine

1. **Choose a Workspace**
   - Focus on one workspace at a time for better efficiency
   - Switch between workspaces as needed based on priority

2. **Sync Emails**
   - Use the sync button on the conversations column to fetch all new emails
   - After syncing, filters may need resetting: Uncheck all filters, then check them one at a time slowly to get an accurate view

3. **Check Filter Settings**
   - Click "Needs Reply" filter to see unanswered emails
   - This shows only emails that require your response
   - Sort by "Oldest Unreplied" to work first-in, first-out

4. **Note Your Queue**
   - Check how many pending emails you have in each workspace
   - Plan your time accordingly

## Efficient Batch Processing ⚡ **RECOMMENDED**

The AI Draft tool is powerful but takes 10-30 seconds per email. Use this to your advantage:

### The Batching Strategy:

1. **Draft Phase** (5-10 emails at once)
   - Open an email and click the **"Draft"** button
   - While the AI generates that draft, open the next email in a new tab
   - Click **"Draft"** on the second email
   - Continue opening emails and triggering drafts
   - Let the AI work in the background on multiple emails simultaneously

2. **Review & Send Phase**
   - Go back to your first tab where the draft is ready
   - Review, edit, and send
   - Move to the next tab, review, edit, send
   - Work through all your drafted emails

**Why This Works:**
- Maximizes your time while AI processes drafts
- You stay productive instead of waiting 30 seconds between each email
- Reduces context-switching and improves focus

## Processing Each Email

Follow this workflow for **EVERY** email:

### Step 1: Open the Conversation
- Click on the email in the inbox
- Read the entire email thread (not just the latest message)
- Understand the customer\'s issue and tone

### Step 2: Check Related Conversations ⭐ **CRITICAL**
- Look at the "Related Conversations" section on the right side
- This shows previous emails from the same customer or about similar issues
- **Why This Matters:**
  - See if the customer has contacted you before
  - Check if there\'s an ongoing issue
  - Find relevant solutions used in the past
  - Maintain consistency in your responses

### Step 3: Generate AI Draft
- Click the **"Draft"** button in the top right
- The AI will work for 10-30 seconds generating a response
- The AI will:
  - Search for customer and order information
  - Look up product details if mentioned
  - Check company policies
  - Create a complete draft response
- **TIP:** While this draft is processing, you can open another email and start its draft (see Batching Strategy above)

### Step 4: Review the Draft ⭐ **CRITICAL**

**DO NOT blindly send the AI draft!** Always review it carefully.

**IMPORTANT**: Simple inquiries may need little to no editing after the draft completes. However, for complex issues, the draft may produce an incomplete or unusable response. In this case, use the **"CUSTOM INSTRUCTIONS"** field to guide the AI. Provide all necessary information, direction, and context for the AI to create a response that is tailored and complete.

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

4. Move on to the next email

## Workspace Management Tips

- **One workspace at a time** - Complete a batch of emails in one workspace before switching to another
- **Set priorities** - If one workspace has urgent emails, handle those first
- **Take breaks** - Don\'t burn out. Take short breaks between large batches
- **Track your progress** - Keep mental notes of how many emails you\'ve cleared per hour to stay motivated'
WHERE slug = 'daily-workflow';

-- Verify the update
SELECT title, slug, LENGTH(content) as content_length
FROM "OnboardingSection"
WHERE slug = 'daily-workflow';
