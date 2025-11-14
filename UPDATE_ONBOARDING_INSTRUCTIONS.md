# Onboarding Content Update Instructions

This update adds important content about email classification, decision-making, and the "Ask a Question" feature to your training materials.

## What's Being Added

### 1. Daily Workflow Section Updates
- **Email Classification** - How to identify email types (simple inquiry, order issue, complex problem, non-support, requires admin)
- **Decision-Making Process** - Clear action options for each email type:
  - ✅ Resolve with AI Draft (standard support)
  - 🚫 Mark as Non-CS (sales, spam, partnerships)
  - ⬆️ Escalate to Admin (legal, complex issues)
  - ❓ Ask a Question First (when unsure)
- **Decision Tree** - Visual summary of the workflow
- **Emphasis on reading and understanding context** before taking action

### 2. Tool SOP - Ask a Question Feature
- Complete guide on using the "Ask Question" button
- When to use it (policy questions, escalations, complex situations)
- How to use it (step-by-step)
- Best practices (be specific, check KB first, don't guess)
- How to access Questions KB

## How to Apply These Updates

### Option 1: Run SQL Scripts in Supabase (Recommended)

1. Log in to your Supabase dashboard
2. Navigate to the SQL Editor
3. Run these scripts **in order**:

   **First, update Daily Workflow:**
   ```bash
   # File: update-daily-workflow-with-classification.sql
   ```

   **Then, add Ask a Question feature to Tool SOP:**
   ```bash
   # File: add-ask-question-to-tool-sop.sql
   ```

4. Refresh your onboarding page to see the changes

### Option 2: Manual Edit in UI

1. Navigate to `/onboarding` in your application
2. Click "Tool SOP" tab
3. Find the "Daily Workflow" section
4. Click "Edit" button
5. Copy the new content from `update-daily-workflow-with-classification.sql` (the part between the E'...')
6. Paste and save
7. Repeat for adding the new "Team Collaboration & Questions" section

## Files Created

1. **update-daily-workflow-with-classification.sql**
   - Updates the Daily Workflow section
   - Adds email classification and decision-making content

2. **add-ask-question-to-tool-sop.sql**
   - Adds "Ask a Question" feature documentation
   - Creates a new "Team Collaboration & Questions" section in Tool SOP

3. **UPDATE_ONBOARDING_INSTRUCTIONS.md** (this file)
   - Instructions for applying the updates

## Verification

After running the SQL scripts, verify the changes:

1. Go to `/onboarding`
2. Switch to "General SOP" tab
3. Check "Daily Workflow" section - should include:
   - "Step 1: Read & Understand the Email" with email classification
   - "Step 3: Decide on Course of Action" with all options
   - Decision tree at the bottom

4. Switch to "Tool SOP" tab
5. Look for "Team Collaboration & Questions" section
6. Verify it includes "Ask a Question Feature" content

## Important Notes

- These updates are **additive** - they don't remove existing content
- The numbered list formatting has been fixed to properly increment (1, 2, 3, 4...)
- All new content emphasizes critical thinking before action
- The "Ask a Question" feature is highlighted as a key escalation tool

## Support

If you encounter any issues applying these updates:
1. Check that the onboarding sections exist in your database
2. Verify you have proper permissions in Supabase
3. Try refreshing the page after running the SQL
4. Check browser console for any errors
