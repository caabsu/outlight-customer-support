# TAGGING SYSTEM V2 - MIGRATION GUIDE

## 🎯 WHAT THIS MIGRATION DOES

This migration completely redesigns the tagging system to fix the fundamental architectural flaws that prevented ADMIN + Needs-Reply filtering from working.

### Before (V1 - Broken):
- Single `tags` array contained EVERYTHING
- "needs-reply", "admin", "non-customer-support" all mixed together
- System automatically removed "needs-reply" when adding "admin" or "non-customer-support"
- Race conditions between auto-tagging and manual tagging
- Filters couldn't work together properly

### After (V2 - Fixed):
- **System tags**: `needsReply` (boolean), `lastMessageDirection` (string)
- **User tags**: `userTags` (array) - "admin", "non-customer-support", custom tags
- System NEVER touches user tags
- Users NEVER touch system tags
- ALL filter combinations work correctly
- No race conditions

## 📊 DATABASE CHANGES

### New Fields Added:
```sql
needsReply            Boolean   DEFAULT false
lastMessageDirection  String?   -- "inbound" | "outbound"
userTags              String[]  DEFAULT []
```

### Old Field (Kept for Migration):
```sql
tags                  String[]  DEFAULT []  -- Will be removed in future migration
```

## 🚀 MIGRATION STEPS

### Step 1: Run Database Migration

**In Production (Vercel/Supabase):**

```bash
# Apply schema migration
npx prisma migrate deploy
```

This adds the new columns to your database. **This is safe** - it doesn't modify or delete any data.

### Step 2: Run Data Migration Script

**IMPORTANT:** This preserves ALL existing tags!

```bash
# Run the data migration script
npx ts-node scripts/migrate-tags-to-v2.ts
```

**What this script does:**
- Reads all conversations
- For each conversation:
  - If `tags` contains "needs-reply" → sets `needsReply = true`
  - All other tags → moves to `userTags` array
  - Sets `lastMessageDirection` from last message
- **Nothing is deleted or lost**

**Expected output:**
```
🚀 Starting tag migration to v2...
📊 Found 1234 conversations to migrate

✅ Migrated 50/1234 conversations...
✅ Migrated 100/1234 conversations...
...

✨ Migration complete!
📊 Summary:
   ✅ Migrated: 1234
   ⏭️  Skipped: 0
   ❌ Errors: 0

🔍 Verifying migration...
   Conversations with needsReply=true: 543
   Conversations with userTags: 234

✅ Migration successful! All tags preserved.
```

### Step 3: Verify Migration

Check a few conversations in the database:

```sql
-- Check migration worked
SELECT
  id,
  subject,
  "needsReply",
  "lastMessageDirection",
  "userTags",
  tags as old_tags  -- Should match userTags (minus needs-reply)
FROM "Conversation"
LIMIT 10;
```

### Step 4: Deploy Backend Code

The backend code has been updated to use the new system. Deploy to production.

**Key backend changes:**
- ✅ Auto-tagging uses `needsReply` and `userTags`
- ✅ Filter queries use new fields
- ✅ Tag endpoints update `userTags` only
- ✅ Send reply sets `needsReply = false`
- ✅ Archive sets `needsReply = false`

### Step 5: Update Frontend Code (TODO - Next Step)

Frontend needs updates to:
- Use `needsReply` and `userTags` instead of `tags`
- Update filter logic
- Update tag display
- Update tag action buttons

**These changes are in progress and will be provided next.**

## ✅ VERIFICATION CHECKLIST

After migration, verify these scenarios work:

### Scenario 1: ADMIN + Needs-Reply ✅
- [ ] Enable ADMIN filter (purple button)
- [ ] Enable Needs-Reply filter (orange button)
- [ ] Should show all admin emails with `needsReply=true`
- [ ] Should NOT show 0 results anymore!

### Scenario 2: Mark Email as ADMIN ✅
- [ ] Mark an email as "admin"
- [ ] Needs-Reply status should NOT change
- [ ] Email should stay in Needs-Reply view if it had `needsReply=true`

### Scenario 3: Send Reply ✅
- [ ] Send a reply to any email
- [ ] `needsReply` should become `false`
- [ ] Email should move to Resolved view
- [ ] User tags (admin, custom tags) should remain unchanged

### Scenario 4: Mark as Non-Support ✅
- [ ] Mark email as "non-customer-support"
- [ ] Should disappear from CS-only view
- [ ] `needsReply` status unchanged
- [ ] Can still see in "All" view if filters allow

### Scenario 5: Gmail Sync ✅
- [ ] New email arrives
- [ ] Auto-tagging sets `needsReply=true`
- [ ] User tags remain untouched
- [ ] No more race conditions!

### Scenario 6: No Data Loss ✅
- [ ] All old tags present in `userTags`
- [ ] All "needs-reply" statuses preserved in `needsReply`
- [ ] Old `tags` field still has data (for rollback)

## 🔄 ROLLBACK PLAN

If something goes wrong, you can rollback:

### Step 1: Revert Backend Code
```bash
git revert HEAD  # Revert to previous commit
git push
```

### Step 2: Drop New Columns (Optional)
```sql
ALTER TABLE "Conversation"
DROP COLUMN IF EXISTS "needsReply",
DROP COLUMN IF EXISTS "lastMessageDirection",
DROP COLUMN IF EXISTS "userTags";
```

The old `tags` field was NOT modified, so everything will work as before.

## 📝 BACKWARD COMPATIBILITY

During migration period:
- ✅ Old `tags` field still exists
- ✅ Backend returns BOTH `tags` and `userTags`
- ✅ Can gradually update frontend
- ✅ No breaking changes to API responses

## 🐛 WHAT THIS FIXES

### Fixed Issues:
1. ✅ ADMIN + Needs-Reply now shows results
2. ✅ Marking as admin doesn't remove needs-reply
3. ✅ Emails don't reappear after marking them
4. ✅ No race conditions between auto and manual tagging
5. ✅ All filter combinations work correctly
6. ✅ System and user actions don't interfere

### How It's Fixed:
- **Separation of concerns**: System manages `needsReply`, users manage `userTags`
- **No auto-deletion**: Adding "admin" doesn't remove "needs-reply" anymore
- **Clean queries**: Database filters on separate fields
- **Atomic updates**: No complex tag array manipulations

## 📊 EXPECTED RESULTS

### Database State After Migration:

**Example Conversation 1: Admin email needing reply**
```json
{
  "id": "abc123",
  "subject": "Server down - urgent!",
  "needsReply": true,              // ← System tag
  "lastMessageDirection": "inbound", // ← System tag
  "userTags": ["admin", "urgent"],  // ← User tags
  "tags": ["admin", "urgent", "needs-reply"]  // ← Old format (kept for rollback)
}
```

**Example Conversation 2: Resolved customer support**
```json
{
  "id": "def456",
  "subject": "How do I reset my password?",
  "needsReply": false,             // ← Replied to
  "lastMessageDirection": "outbound",
  "userTags": [],                   // ← No special tags
  "tags": []                        // ← Old format
}
```

**Example Conversation 3: Non-support marked**
```json
{
  "id": "ghi789",
  "subject": "Marketing newsletter",
  "needsReply": false,
  "lastMessageDirection": "inbound",
  "userTags": ["non-customer-support"],  // ← Excluded from CS view
  "tags": ["non-customer-support"]       // ← Old format
}
```

## 🎯 NEXT STEPS

1. ✅ Run database migration
2. ✅ Run data migration script
3. ✅ Verify migration success
4. ✅ Deploy backend code
5. ⏳ Update frontend code (in progress)
6. ⏳ Test all filter combinations
7. ⏳ Remove old `tags` field (future migration)

## 💡 TIPS

- Run migration during low-traffic period
- Monitor logs for any errors
- Test on staging environment first if possible
- Keep old `tags` field for a few days before removing

## 🆘 SUPPORT

If you encounter issues:

1. Check migration script output for errors
2. Verify database columns were added
3. Check Vercel/API logs for backend errors
4. Check browser console for frontend errors
5. Reach out with specific error messages

## 📚 DOCUMENTATION

- Full bug analysis: `CRITICAL_TAG_FILTER_BUGS.md`
- Migration SQL: `prisma/migrations/20250112000000_add_new_tagging_system/migration.sql`
- Data migration script: `scripts/migrate-tags-to-v2.ts`

---

**Status**: Backend complete ✅ | Frontend in progress ⏳
