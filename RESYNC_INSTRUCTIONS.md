# Re-sync Instructions After Draft Fix Deployment

## What Was Done

1. **Fixed Gmail API queries** to exclude drafts using `-in:draft` filter
2. **Added safety check** to skip messages with DRAFT label during ingestion
3. **Created cleanup script** to remove existing draft messages from database

## Deployment Status

✅ Code pushed to GitHub: `mvp/supabase-gmail` branch
✅ Commits:
  - `5151322` - CRITICAL FIX: Exclude Gmail drafts from email sync
  - `79404d7` - Add cleanup script to remove draft messages and re-sync

## Steps to Complete Re-sync on Vercel

### 1. Wait for Vercel Deployment
Wait for Vercel to automatically deploy the latest changes from the `mvp/supabase-gmail` branch.

### 2. Run Cleanup Script (One-time Only)

**Option A: Run locally with production database**
```bash
npx tsx cleanup-and-resync.ts
```

**Option B: Create a temporary API endpoint** (if you can't access prod DB locally)

Add this to your `apps/api/src/server.ts`:
```typescript
app.post('/admin/cleanup-and-resync', async (req, res) => {
  try {
    // Delete all messages
    const deleteResult = await prisma.message.deleteMany({});

    // Reset needs-reply tags
    const conversations = await prisma.conversation.findMany({
      select: { id: true, tags: true }
    });

    let tagResetCount = 0;
    for (const convo of conversations) {
      const newTags = convo.tags.filter(tag => tag !== 'needs-reply');
      if (newTags.length !== convo.tags.length) {
        await prisma.conversation.update({
          where: { id: convo.id },
          data: { tags: newTags }
        });
        tagResetCount++;
      }
    }

    res.json({
      success: true,
      messagesDeleted: deleteResult.count,
      conversationsReset: tagResetCount
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

Then call:
```bash
curl -X POST https://your-vercel-domain.vercel.app/admin/cleanup-and-resync
```

### 3. Trigger Re-sync for Both Workspaces

**Workspace 1: Outlight Support (support@outlight.us)**
```bash
curl -X POST https://your-vercel-domain.vercel.app/gmail/poll/workspace/fa66cb41-0677-462f-b647-e910ef2c66e8
```

**Workspace 2: Info Support (info@outlight.us)**
```bash
curl -X POST https://your-vercel-domain.vercel.app/gmail/poll/workspace/f83e8c02-30d8-4ad3-a4e9-73f98fbca300
```

### 4. Verify Results

After re-sync completes:
- ✅ Draft messages should NOT appear in conversations
- ✅ Only actual sent/received messages should be stored
- ✅ "needs-reply" tags should be correctly applied based on last real message direction
- ✅ Emails requiring responses should stay in queue

## What the Re-sync Does

1. **Fetches threads from Gmail** (inbox and sent from last 7 days)
2. **Excludes drafts** using `-in:draft` in queries
3. **Skips DRAFT messages** during ingestion (labelIds check)
4. **Re-creates messages** with only real sent/received emails
5. **Re-applies tags** correctly based on actual last message direction

## Expected Results

- **Before cleanup**: 4564 messages (including drafts)
- **After cleanup**: 0 messages
- **After re-sync**: ~4000-4300 messages (only real emails, no drafts)
- **Conversations reset**: 455 conversations had needs-reply tag reset

## Important Notes

⚠️ The cleanup script deletes ALL messages but keeps conversations intact
⚠️ Re-sync is safe to run multiple times
⚠️ Draft messages in Gmail will be completely ignored going forward
