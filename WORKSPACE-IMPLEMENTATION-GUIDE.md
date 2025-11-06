# Multi-Workspace Implementation Guide

## Overview
This guide provides step-by-step instructions to add multi-workspace support to the Outlight Customer Support system.

---

## PART 1: BACKEND SETUP (Already Done)

### ✅ Step 1: Database Schema Updated
- Added `Workspace` model
- Added `workspaceId` to `Customer`, `Conversation`, and `OAuthToken`
- Added unique constraints for workspace isolation

### ✅ Step 2: Environment Variables Updated
- `.env.local` now has credentials for both workspaces
- Workspace 1: support@outlight.us (original)
- Workspace 2: your new Gmail account

### ✅ Step 3: Multi-Workspace Gmail Service Created
- New file: `apps/api/src/gmail-multi.ts`
- Supports workspace-specific OAuth
- All Gmail operations now workspace-aware

---

## PART 2: COMPLETE THE BACKEND (Do This Now)

### Step 4: Run Database Migration

```bash
cd C:\Users\caabs\outlight-customer-support

# Generate Prisma client with new schema
npx prisma generate

# Create and run migration
npx prisma migrate dev --name add_workspace_support

# Seed the workspaces
npx tsx prisma/seed-workspaces.ts
```

**IMPORTANT**: Before running the migration, you need to update `WORKSPACE_2_GMAIL` in `.env.local` with the actual email address for workspace 2!

### Step 5: Update Server.ts to Add Workspace Endpoints

Add these imports at the top of `apps/api/src/server.ts`:

```typescript
import * as gmailMulti from "./gmail-multi";
```

Add these new endpoints BEFORE the existing `/oauth/google` routes:

```typescript
// ==================== WORKSPACE ENDPOINTS ====================

// Get all workspaces
app.get("/workspaces", async (req: Request, res: Response) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      select: {
        id: true,
        name: true,
        gmailAccountEmail: true,
        createdAt: true,
        oauthTokens: {
          select: {
            id: true,
            expiry: true
          }
        }
      }
    });

    res.json(workspaces.map(w => ({
      ...w,
      isAuthorized: !!w.oauthTokens
    })));
  } catch (error) {
    console.error("Error fetching workspaces:", error);
    res.status(500).json({ error: "Failed to fetch workspaces" });
  }
});

// OAuth start for specific workspace
app.get("/oauth/google/workspace/:workspaceId", gmailMulti.googleAuthStart);

// OAuth callback (now workspace-aware)
app.get("/oauth/google/callback", gmailMulti.googleAuthCallback);

// Poll emails for specific workspace
app.post("/gmail/poll/workspace/:workspaceId", async (req: Request, res: Response) => {
  req.body.workspaceId = req.params.workspaceId;
  await gmailMulti.pollOnce(req, res);
});
```

### Step 6: Update GET /conversations to Filter by Workspace

Find the `app.get("/conversations"` endpoint and update it:

```typescript
app.get("/conversations", async (req: Request, res: Response) => {
  try {
    const {
      starred,
      archived,
      excludeNonSupport,
      unreadOnly,
      needsReply,
      resolved,
      tags,
      dateRange,
      showSent,
      adminOnly,
      workspaceId,  // ADD THIS
      page,
      limit
    } = req.query;

    // REQUIRE workspace ID
    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    const where: any = {
      workspaceId: workspaceId as string  // ADD THIS
    };

    // ... rest of the filtering logic stays the same
```

### Step 7: Update POST /messages to Be Workspace-Aware

Find the `app.post("/messages"` endpoint and update it:

```typescript
app.post("/messages", async (req: Request, res: Response) => {
  try {
    const { conversationId, to, body } = req.body;

    // Get conversation to find workspace
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { workspaceId: true }
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    await gmailMulti.sendReply(conversation.workspaceId, conversationId, to, body);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: error.message });
  }
});
```

### Step 8: Update POST /compose to Be Workspace-Aware

Find the `app.post("/compose"` endpoint and update it:

```typescript
app.post("/compose", async (req: Request, res: Response) => {
  try {
    const { workspaceId, to, subject, body } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    await gmailMulti.sendNewEmail(workspaceId, to, subject, body);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: error.message });
  }
});
```

---

## PART 3: FRONTEND SETUP

### Step 9: Update ConversationContext to Track Workspace

Add to `apps/web/lib/ConversationContext.tsx`:

**1. Add workspace to the type:**

```typescript
type ConversationContextType = {
  // ... existing fields
  currentWorkspaceId: string | null;
  setCurrentWorkspaceId: (id: string) => void;
  workspaces: Workspace[];
  loadWorkspaces: () => Promise<void>;
  // ... rest of fields
};

type Workspace = {
  id: string;
  name: string;
  gmailAccountEmail: string;
  isAuthorized: boolean;
};
```

**2. Add state:**

```typescript
const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
```

**3. Add loadWorkspaces function:**

```typescript
const loadWorkspaces = async () => {
  try {
    const res = await fetch('/api/workspaces');
    const data = await res.json();
    setWorkspaces(data);

    // Auto-select first workspace if none selected
    if (!currentWorkspaceId && data.length > 0) {
      setCurrentWorkspaceId(data[0].id);
    }
  } catch (error) {
    console.error('Failed to load workspaces:', error);
  }
};
```

**4. Load workspaces on mount:**

```typescript
useEffect(() => {
  loadWorkspaces();
}, []);
```

**5. Update fetchConversations to include workspaceId:**

```typescript
const fetchConversations = async (silent = false, retryCount = 0, suppressErrors = false, page = currentPage) => {
  if (!currentWorkspaceId) return; // Don't fetch without workspace

  try {
    if (!silent) setLoading(true);

    const params = new URLSearchParams();
    params.set('workspaceId', currentWorkspaceId); // ADD THIS
    params.set('page', page.toString());
    // ... rest of params
```

**6. Update pollAndRefresh:**

```typescript
const pollAndRefresh = async () => {
  if (!currentWorkspaceId) return;

  setRefreshing(true);
  setRefreshProgress(30);

  try {
    const response = await fetch(`/api/gmail/poll/workspace/${currentWorkspaceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    // ... rest of logic
```

**7. Add to provider value:**

```typescript
value={{
  // ... existing values
  currentWorkspaceId,
  setCurrentWorkspaceId,
  workspaces,
  loadWorkspaces,
  // ... rest
}}
```

**8. Refetch when workspace changes:**

```typescript
useEffect(() => {
  if (currentWorkspaceId) {
    fetchConversations(true, 0, false, 1);
  }
}, [currentWorkspaceId]);
```

### Step 10: Add Workspace Switcher UI

Create new file `apps/web/components/WorkspaceSwitcher.tsx`:

```typescript
"use client";

import { useConversations } from "@/lib/ConversationContext";

export default function WorkspaceSwitcher() {
  const {
    workspaces,
    currentWorkspaceId,
    setCurrentWorkspaceId,
    loadWorkspaces
  } = useConversations();

  return (
    <div className="px-4 py-3 border-b border-gray-200 bg-white">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
        Workspace
      </label>
      <select
        value={currentWorkspaceId || ""}
        onChange={(e) => setCurrentWorkspaceId(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name} ({workspace.gmailAccountEmail})
            {!workspace.isAuthorized && " - Not Authorized"}
          </option>
        ))}
      </select>

      {workspaces.find(w => w.id === currentWorkspaceId && !w.isAuthorized) && (
        <a
          href={`/api/oauth/google/workspace/${currentWorkspaceId}`}
          className="mt-2 block w-full px-3 py-2 bg-blue-600 text-white text-center rounded-md text-sm font-medium hover:bg-blue-700"
        >
          Authorize Gmail Access
        </a>
      )}
    </div>
  );
}
```

### Step 11: Add WorkspaceSwitcher to ConversationList

In `apps/web/components/ConversationList.tsx`, import and add at the top:

```typescript
import WorkspaceSwitcher from "./WorkspaceSwitcher";

export default function ConversationList() {
  // ... existing code

  return (
    <div className={/* ... */}>
      <WorkspaceSwitcher />  {/* ADD THIS */}

      {/* Rest of the conversation list */}
```

### Step 12: Update Email Composer to Include Workspace

In `apps/web/components/ConversationView.tsx`, update the compose email handler:

```typescript
const handleComposeEmail = async () => {
  if (!currentWorkspaceId) {
    alert('Please select a workspace first');
    return;
  }

  try {
    const response = await fetch("/api/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: currentWorkspaceId,  // ADD THIS
        to: composerTo,
        subject: composerSubject,
        body: composerBody,
      }),
    });
    // ... rest of logic
```

---

## PART 4: TESTING

### Step 13: Test the Implementation

1. **Start the backend:**
   ```bash
   cd apps/api
   npm run dev
   ```

2. **Start the frontend:**
   ```bash
   cd apps/web
   npm run dev
   ```

3. **Test Workspace 1 (Existing):**
   - Open http://localhost:3000
   - Select "Outlight Support" workspace
   - Should see existing emails
   - Try refreshing emails

4. **Test Workspace 2 (New):**
   - Select "Workspace 2" from dropdown
   - Click "Authorize Gmail Access"
   - Complete OAuth flow
   - Click refresh to fetch emails
   - Emails should be completely separate from Workspace 1

5. **Test Switching:**
   - Switch between workspaces
   - Verify emails, tags, filters are all isolated
   - Verify ADMIN tags are workspace-specific

---

## TROUBLESHOOTING

### Issue: "workspaceId is required" error
**Solution**: Make sure `currentWorkspaceId` is set before fetching conversations

### Issue: OAuth callback fails
**Solution**: Verify the Google Cloud Console redirect URI includes: `http://localhost:3001/oauth/google/callback`

### Issue: Emails not appearing in new workspace
**Solution**:
1. Check workspace is authorized
2. Click refresh/poll button
3. Check backend logs for errors

### Issue: Migration fails
**Solution**:
1. Backup your database first
2. If you have existing data, you may need to manually assign conversations to a workspace
3. Run: `npx prisma migrate reset` (WARNING: This will delete all data)

---

## IMPORTANT NOTES

1. **Knowledge Base is Shared**: As requested, KnowledgeBase remains shared across workspaces
2. **Complete Isolation**: Conversations, customers, and OAuth tokens are completely isolated by workspace
3. **No Cross-Workspace Contamination**: Tags, filters, and ADMIN escalations are workspace-specific
4. **Easy Switching**: Simple dropdown to switch between workspaces instantly
5. **Same Codebase**: No code duplication - same functionality in both workspaces

---

## NEXT STEPS

After completing the frontend setup:

1. Test thoroughly with both workspaces
2. Commit all changes to git
3. Deploy to production
4. Update OAuth redirect URIs in Google Cloud Console for production URL

Good luck! 🚀
