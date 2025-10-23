# Migration Instructions for Knowledge Base & Draft Persistence Updates

## Overview

This update implements two major improvements:

1. **Dynamic Knowledge Base**: The draft AI now loads knowledge base entries from the database instead of using hard-coded text
2. **Draft Persistence**: AI-generated drafts are now saved to the database and persist across navigation

## Database Changes

### New Table: `DraftResponse`

A new table has been added to store AI-generated draft responses:

```sql
CREATE TABLE "DraftResponse" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "internalReasoning" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "reasoning" TEXT,
    "shouldDraft" BOOLEAN NOT NULL DEFAULT false,
    "draft" TEXT,
    "actionSteps" TEXT,
    "orderInfo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DraftResponse_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DraftResponse_conversationId_fkey" FOREIGN KEY ("conversationId")
        REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DraftResponse_conversationId_key"
    ON "DraftResponse"("conversationId");
```

## Migration Steps

### 1. Install Dependencies (if not already installed)

```bash
npm install
```

### 2. Apply Database Migration

#### Option A: Using Prisma Migrate (Recommended)

```bash
npx prisma migrate deploy
```

#### Option B: Manual SQL Execution

If Prisma migration fails, you can manually execute the SQL in the migration file:

```bash
# Connect to your PostgreSQL database and run:
psql $DATABASE_URL -f prisma/migrations/20251022223600_add_draft_response_model/migration.sql
```

### 3. Generate Prisma Client

```bash
npx prisma generate
```

### 4. Restart the API Server

```bash
npm run dev
# or
npm start
```

## What's Changed

### Backend Changes (`apps/api/src/server.ts`)

#### 1. Dynamic Knowledge Base Loading

**Before:**
- Knowledge base was hard-coded as a string constant
- Changes to knowledge base required code deployment

**After:**
- Knowledge base is loaded from the database at runtime
- Filters by category: `general` or `draft-reply`
- Only includes active entries
- Changes take effect immediately

#### 2. Draft Persistence

**Before:**
- Drafts were generated on-demand and returned
- No persistence - regenerated every time

**After:**
- First call: Generates draft and saves to database
- Subsequent calls: Returns cached draft from database
- Draft is deleted when a message is sent
- Force regeneration: Send `{ forceRegenerate: true }` in request body

#### 3. API Response Changes

Draft responses now include additional metadata:

```json
{
  "draft": "...",
  "fromDatabase": true,  // NEW: indicates if draft was cached
  "createdAt": "...",    // NEW: when draft was generated
  "updatedAt": "..."     // NEW: when draft was last updated
}
```

### Frontend Changes

No frontend code changes required! The existing implementation already works with the new backend:

- Drafts are stored in component state for current session
- When user navigates away and returns, clicking "Generate Draft" retrieves the cached version from database
- Draft is automatically cleared from state when message is sent

## Migrating Existing Knowledge Base Content

If you have existing knowledge base content that needs to be migrated to the database:

### 1. Access the Knowledge Base Management Page

Navigate to: `http://localhost:3000/knowledge-base`

### 2. Add Your Knowledge Base Entries

For the draft tool, create entries with the following structure:

#### General Knowledge (Category: `general`)

These entries are used by all AI actions (drafts, summaries, etc.):

- **Title**: Email Classification Tags
- **Category**: General (All AI Actions)
- **Content**: Your email tag definitions
- **Active**: ✓ Checked

#### Draft-Specific Knowledge (Category: `draft-reply`)

These entries are only used for draft generation:

- **Title**: Return & Refund Policy
- **Category**: Draft Reply Only
- **Content**: Your return/refund policies
- **Active**: ✓ Checked

- **Title**: Order Processing & Shipping
- **Category**: Draft Reply Only
- **Content**: Your shipping/processing policies
- **Active**: ✓ Checked

- **Title**: Draft Decision Rules
- **Category**: Draft Reply Only
- **Content**: Your draft decision logic
- **Active**: ✓ Checked

### 3. Verify Knowledge Base is Loading

Check the API logs when generating a draft:

```
[Draft] Loaded 4 knowledge base entries from database
```

## Testing the Changes

### Test Draft Persistence

1. Navigate to an email conversation
2. Click "Generate Draft" - wait for completion
3. Navigate to another page (Analytics, Knowledge Base, etc.)
4. Return to the same email conversation
5. Click "Generate Draft" again
6. **Expected**: Draft loads instantly from database with `fromDatabase: true` flag

### Test Draft Deletion After Send

1. Generate a draft for a conversation
2. Send a reply (using the draft or custom text)
3. Generate a new draft for the same conversation
4. **Expected**: New draft is generated (not cached), as the old one was deleted

### Test Knowledge Base Integration

1. Create a new knowledge base entry (category: `draft-reply`)
2. Make it active
3. Generate a draft for any conversation
4. **Expected**: The new knowledge base content is included in the AI's context

## Rollback Instructions

If you need to rollback these changes:

### 1. Revert Code Changes

```bash
git revert <commit-hash>
```

### 2. Drop the DraftResponse Table (Optional)

```sql
DROP TABLE "DraftResponse" CASCADE;
```

**Note**: This will delete all saved drafts.

## Support

If you encounter issues:

1. Check that the migration was applied: `npx prisma migrate status`
2. Verify database connection: Check API logs for "Database connected successfully"
3. Check knowledge base entries: `SELECT COUNT(*) FROM "KnowledgeBase" WHERE active = true;`
4. Review API logs for draft generation: Look for `[Draft]` prefixed messages

## Environment Variables

Ensure these are set in your `.env` file:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
OPENAI_API_KEY="sk-proj-..."
```

---

**Date**: October 22, 2025
**Version**: 1.1.0
**Migration File**: `20251022223600_add_draft_response_model`
