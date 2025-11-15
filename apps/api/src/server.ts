import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
// Load from .env.local first, fallback to .env
dotenv.config({ path: ".env.local" });
dotenv.config(); // This will load .env if .env.local doesn't exist
import OpenAI from "openai";

import { googleAuthStart, googleAuthCallback, pollOnce } from "./gmail";
import * as gmailMulti from "./gmail-multi";
import { prisma } from "./db";
import * as shopify from "./shopify";

// Initialize OpenAI with timeout configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 240000, // 4 minutes max per API call (to fit within Railway's 5min limit)
  maxRetries: 0, // Don't retry on timeout - fail fast
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "Outlight Customer Support API",
    version: "1.0.0",
    endpoints: {
      health: "GET /health",
      oauth: "GET /oauth/google",
      oauthCallback: "GET /oauth/google/callback",
      pollEmails: "POST /gmail/poll",
      conversations: "GET /conversations",
      sendMessage: "POST /messages",
    },
    docs: {
      web: "http://localhost:3000",
      setupGmail: "Visit /oauth/google to connect Gmail",
      pollEmails: "POST to /gmail/poll to sync emails",
    },
  });
});

app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

// ==================== AUTHENTICATION ENDPOINTS ====================
// Login
app.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        name: true,
        username: true,
        password: true,
        role: true,
        email: true,
        active: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    if (!user.active) {
      return res.status(403).json({ error: "Account is inactive" });
    }

    // Simple password comparison (plain text as requested)
    if (user.password !== password) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Return user data (excluding password)
    const { password: _, ...userData } = user;
    res.json({ user: userData, message: "Login successful" });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Create account (requires admin password)
app.post("/auth/create-account", async (req: Request, res: Response) => {
  try {
    const { adminPassword, name, username, password, email, role } = req.body;

    // Verify admin password
    if (adminPassword !== "gmltn123") {
      return res.status(403).json({ error: "Invalid admin password" });
    }

    if (!name || !username || !password) {
      return res.status(400).json({ error: "Name, username, and password are required" });
    }

    // Check if username already exists
    const existing = await prisma.user.findUnique({
      where: { username },
    });

    if (existing) {
      return res.status(409).json({ error: "Username already exists" });
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        username,
        password, // Plain text as requested
        email: email || null,
        role: role || "agent",
        active: true,
      },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        email: true,
        active: true,
      },
    });

    res.json({ user, message: "Account created successfully" });
  } catch (error) {
    console.error("Error creating account:", error);
    res.status(500).json({ error: "Failed to create account" });
  }
});

// Get all users (for user selection on login)
app.get("/auth/users", async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
      },
      orderBy: { name: "asc" },
    });

    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Get user by ID
app.get("/auth/user/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        email: true,
        active: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// ==================== WORKSPACE ENDPOINTS ====================
// Get all workspaces
app.get("/workspaces", async (req: Request, res: Response) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      select: {
        id: true,
        name: true,
        gmailAccountEmail: true,
        createdAt: true
      }
    });

    // Check OAuth tokens for each workspace separately
    const workspacesWithAuth = await Promise.all(
      workspaces.map(async (w) => {
        const token = await prisma.oAuthToken.findUnique({
          where: { workspaceId: w.id }
        });
        return {
          ...w,
          isAuthorized: !!token
        };
      })
    );

    console.log('[Workspaces] Returning workspaces:', workspacesWithAuth);
    res.json(workspacesWithAuth);
  } catch (error) {
    console.error("Error fetching workspaces:", error);
    res.status(500).json({ error: "Failed to fetch workspaces" });
  }
});

// OAuth for specific workspace
app.get("/oauth/google/workspace/:workspaceId", gmailMulti.googleAuthStart);

// OAuth callback (workspace-aware)
app.get("/oauth/google/callback", gmailMulti.googleAuthCallback);

// Poll emails for specific workspace
app.post("/gmail/poll/workspace/:workspaceId", async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId;
  console.log('[Server] Poll request for workspace:', workspaceId);

  if (!workspaceId) {
    return res.status(400).json({ error: "Missing workspaceId in URL" });
  }

  // Pass workspaceId through body for gmailMulti.pollOnce
  req.body = req.body || {};
  req.body.workspaceId = workspaceId;

  await gmailMulti.pollOnce(req, res);
});

// Re-sync all workspaces
app.post("/gmail/resync-all", async (req: Request, res: Response) => {
  try {
    console.log('[Server] Re-syncing all workspaces...');

    const workspaces = await prisma.workspace.findMany();
    const results = [];

    for (const workspace of workspaces) {
      console.log(`[Server] Re-syncing workspace: ${workspace.name} (${workspace.id})`);

      try {
        // Create a mock request/response for each workspace
        const mockReq = {
          params: { workspaceId: workspace.id },
          body: { workspaceId: workspace.id }
        } as any;

        let syncResult: any = null;
        const mockRes = {
          json: (data: any) => { syncResult = data; },
          status: (code: number) => ({
            json: (data: any) => { syncResult = { error: data, statusCode: code }; }
          })
        } as any;

        await gmailMulti.pollOnce(mockReq, mockRes);

        results.push({
          workspace: workspace.name,
          workspaceId: workspace.id,
          success: true,
          result: syncResult
        });
      } catch (error: any) {
        console.error(`[Server] Error syncing workspace ${workspace.name}:`, error);
        results.push({
          workspace: workspace.name,
          workspaceId: workspace.id,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      totalWorkspaces: workspaces.length,
      results
    });
  } catch (error: any) {
    console.error('[Server] Error in resync-all:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== LEGACY ENDPOINTS (Keep for backward compatibility) ====================
app.get("/oauth/google", googleAuthStart);
app.post("/gmail/poll", pollOnce);

// Get all conversations with messages (with filters)
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
      workspaceId,
      page,
      limit
    } = req.query;

    // Workspace is required
    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    // Log all active filters for debugging
    console.log(`[Filter Debug] Request filters: workspace=${workspaceId}, excludeNonSupport=${excludeNonSupport}, adminOnly=${adminOnly}, needsReply=${needsReply}, resolved=${resolved}, archived=${archived}, starred=${starred}, showSent=${showSent}`);

    const where: any = {
      workspaceId: workspaceId as string
    };

    if (starred === "true") {
      where.starred = true;
    }

    if (archived === "true") {
      where.archived = true;
    } else {
      // By default, don't show archived
      where.archived = false;
    }

    // NEW TAGGING SYSTEM V2: Clean separation between system and user tags
    // System manages: needsReply (boolean), lastMessageDirection (string)
    // Users manage: userTags (array of strings)
    const andConditions: any[] = [];
    const notConditions: any[] = [];

    console.log(`[Filter V2] Processing filters: adminOnly=${adminOnly}, excludeNonSupport=${excludeNonSupport}, needsReply=${needsReply}, resolved=${resolved}`);

    // Admin filter: requires "admin" in userTags array
    if (adminOnly === "true") {
      andConditions.push({
        userTags: {
          has: "admin"
        }
      });
      console.log(`[Filter V2] ✓ Admin filter: userTags must contain "admin"`);
    }

    // CS-only filter: exclude "non-customer-support" from userTags
    // Also exclude "admin" UNLESS adminOnly is specifically enabled
    if (excludeNonSupport === "true") {
      // Always exclude non-customer-support emails
      notConditions.push({
        userTags: {
          has: "non-customer-support"
        }
      });

      // Only exclude admin emails when NOT specifically filtering for admin
      if (adminOnly !== "true") {
        notConditions.push({
          userTags: {
            has: "admin"
          }
        });
      }
      console.log(`[Filter V2] ✓ CS-only filter: excluding non-customer-support${adminOnly !== "true" ? " and admin" : ""}`);
    }

    if (unreadOnly === "true") {
      where.unreadAgent = true;
      console.log(`[Filter V2] ✓ Unread filter: unreadAgent=true`);
    }

    // Needs reply filter: system-managed boolean field
    // This is the KEY fix - needsReply is independent from userTags!
    if (needsReply === "true") {
      where.needsReply = true;
      console.log(`[Filter V2] ✓ Needs-reply filter: needsReply=true (works with all other filters)`);
    }

    // Resolved filter: opposite of needs reply
    if (resolved === "true") {
      where.needsReply = false;
      console.log(`[Filter V2] ✓ Resolved filter: needsReply=false`);
    }

    // Custom tags filter: must have ALL specified tags in userTags
    if (tags && typeof tags === 'string' && tags.length > 0) {
      const tagArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
      if (tagArray.length > 0) {
        tagArray.forEach(tag => {
          andConditions.push({
            userTags: { has: tag }
          });
        });
        console.log(`[Filter V2] ✓ Custom tags filter: userTags must contain ${tagArray.join(', ')}`);
      }
    }

    // Apply AND conditions
    if (andConditions.length > 0) {
      where.AND = andConditions;
      console.log(`[Filter V2] WHERE.AND conditions:`, JSON.stringify(andConditions, null, 2));
    }

    // Apply NOT conditions (wrapped in OR to exclude ANY match)
    if (notConditions.length > 0) {
      where.NOT = {
        OR: notConditions
      };
      console.log(`[Filter V2] WHERE.NOT.OR conditions:`, JSON.stringify(notConditions, null, 2));
    }

    console.log(`[Filter V2] Final WHERE object:`, JSON.stringify(where, null, 2));

    // Date range filter
    if (dateRange && dateRange !== "all") {
      const now = new Date();
      let hoursAgo = 0;

      if (dateRange === "today") hoursAgo = 24;
      else if (dateRange === "week") hoursAgo = 168;
      else if (dateRange === "month") hoursAgo = 720;

      if (hoursAgo > 0) {
        const cutoffDate = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
        where.lastMessageAt = {
          gte: cutoffDate
        };
      }
    }

    // Pagination
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;
    const skip = (pageNum - 1) * limitNum;

    // Fetch conversations with all filters applied
    let conversations = await prisma.conversation.findMany({
      where,
      include: {
        customer: true,
        messages: {
          orderBy: { sentAt: "asc" },
        },
      },
      orderBy: { lastMessageAt: "desc" },
    });

    console.log(`[Filter] Database returned ${conversations.length} conversations`);
    if (conversations.length > 0 && (adminOnly === "true" || needsReply === "true")) {
      console.log(`[Filter] First few conversations tags:`, conversations.slice(0, 3).map(c => ({ id: c.id, subject: c.subject?.substring(0, 50), tags: c.tags })));
    }

    // Apply showSent filter (requires checking messages)
    if (showSent === "true") {
      const beforeShowSent = conversations.length;
      conversations = conversations.filter(conv =>
        conv.messages.some(msg => msg.direction === "outbound")
      );
      console.log(`[Filter] After showSent filter: ${beforeShowSent} -> ${conversations.length}`);
    }

    // NEW V2: No hybrid filter needed - database query handles everything
    // The needsReply boolean is always up-to-date from Gmail sync
    console.log(`[Filter V2] Skipping hybrid filters - using clean database query results`);

    // NEW V2 SAFETY CHECK: Verify database query results match filter criteria
    // This catches any edge cases or bugs in the database query
    const beforeSafety = conversations.length;
    conversations = conversations.filter(conv => {
      // Check userTags-based filters
      if (excludeNonSupport === "true") {
        if (conv.userTags?.includes("non-customer-support")) {
          console.log(`[Filter V2 Safety] BLOCKING non-customer-support: ${conv.id} "${conv.subject}"`);
          return false;
        }
        if (conv.userTags?.includes("admin") && adminOnly !== "true") {
          console.log(`[Filter V2 Safety] BLOCKING admin in default view: ${conv.id} "${conv.subject}"`);
          return false;
        }
      }

      if (adminOnly === "true") {
        if (!conv.userTags?.includes("admin")) {
          console.log(`[Filter V2 Safety] BLOCKING non-admin in admin view: ${conv.id} "${conv.subject}"`);
          return false;
        }
      }

      // Check archived filter
      if (archived !== "true" && conv.archived) {
        console.log(`[Filter V2 Safety] BLOCKING archived: ${conv.id} "${conv.subject}"`);
        return false;
      }

      // Check needsReply boolean (not tags!)
      if (needsReply === "true") {
        if (!conv.needsReply) {
          console.log(`[Filter V2 Safety] BLOCKING needsReply=false when filter requires true: ${conv.id} "${conv.subject}"`);
          return false;
        }
      }

      if (resolved === "true") {
        if (conv.needsReply) {
          console.log(`[Filter V2 Safety] BLOCKING needsReply=true in resolved view: ${conv.id} "${conv.subject}"`);
          return false;
        }
      }

      return true;
    });
    console.log(`[Filter V2] After safety filter: ${beforeSafety} -> ${conversations.length}`);

    // Get total count after ALL filters including safety check
    const totalCount = conversations.length;

    // Apply pagination AFTER all filters
    const paginatedConversations = conversations.slice(skip, skip + limitNum);

    // Log final result for debugging
    console.log(`[Filter Debug] Results: Total conversations after ALL filters: ${totalCount} | Returning page ${pageNum}/${Math.ceil(totalCount / limitNum)} (${paginatedConversations.length} conversations)`);

    res.json({
      conversations: paginatedConversations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      }
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// IMPORTANT: Specific routes must come BEFORE parameterized routes in Express
// Get oldest unreplied conversation (no ID parameter)
app.get("/conversations/next-unreplied", async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    const unreplied = await getUnrepliedConversations(workspaceId as string);
    res.json(unreplied[0] || null);
  } catch (error) {
    console.error("Error fetching next unreplied:", error);
    res.status(500).json({ error: "Failed to fetch next unreplied" });
  }
});

// Get next unreplied conversation after a specific one
app.get("/conversations/next-unreplied/:currentId", async (req: Request, res: Response) => {
  try {
    const { currentId } = req.params;
    const { workspaceId } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    const unreplied = await getUnrepliedConversations(workspaceId as string);

    // Find the next one after current
    const currentIndex = unreplied.findIndex(c => c.id === currentId);

    if (currentIndex >= 0) {
      // Current conversation is in unreplied list - get next one
      const next = unreplied[currentIndex + 1] || unreplied[0];
      res.json(next || null);
    } else {
      // Current conversation not in unreplied list (e.g., just marked as non-support)
      // Fetch the current conversation to get its timestamp
      const current = await prisma.conversation.findUnique({
        where: { id: currentId }
      });

      if (!current) {
        // Current conversation doesn't exist, return oldest unreplied
        res.json(unreplied[0] || null);
        return;
      }

      // Find next unreplied chronologically after current conversation
      const currentTime = current.lastMessageAt ? new Date(current.lastMessageAt).getTime() : 0;
      const next = unreplied.find(c => {
        const messageTime = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0;
        return messageTime > currentTime;
      });

      // If found, return it; otherwise wrap to oldest
      res.json(next || unreplied[0] || null);
    }
  } catch (error) {
    console.error("Error fetching next unreplied:", error);
    res.status(500).json({ error: "Failed to fetch next unreplied" });
  }
});

// Get a single conversation (parameterized route - must come AFTER specific routes)
app.get("/conversations/:id", async (req: Request, res: Response) => {
  try {
    const { excludeNonSupport, adminOnly, includeArchived } = req.query;

    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        messages: {
          orderBy: { sentAt: "asc" },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // CRITICAL: Validate conversation against active filters to prevent bypass
    // This prevents non-support/admin/archived conversations from being fetched when filters are active

    if (excludeNonSupport === "true") {
      if (conversation.tags?.includes("non-customer-support")) {
        console.log(`[Filter Validation] BLOCKED fetch of non-customer-support conversation: ${req.params.id}`);
        return res.status(403).json({
          error: "Conversation filtered out",
          reason: "non-customer-support tag (CS-only view active)"
        });
      }
      if (conversation.tags?.includes("admin") && adminOnly !== "true") {
        console.log(`[Filter Validation] BLOCKED fetch of admin conversation in CS view: ${req.params.id}`);
        return res.status(403).json({
          error: "Conversation filtered out",
          reason: "admin tag (CS-only view active)"
        });
      }
    }

    if (adminOnly === "true" && !conversation.tags?.includes("admin")) {
      console.log(`[Filter Validation] BLOCKED fetch of non-admin conversation in admin view: ${req.params.id}`);
      return res.status(403).json({
        error: "Conversation filtered out",
        reason: "not admin (admin-only view active)"
      });
    }

    if (includeArchived !== "true" && conversation.archived) {
      console.log(`[Filter Validation] BLOCKED fetch of archived conversation: ${req.params.id}`);
      return res.status(403).json({
        error: "Conversation filtered out",
        reason: "archived (show archived not enabled)"
      });
    }

    console.log(`[Filter Validation] ✅ Conversation ${req.params.id} passed filter validation`);
    res.json(conversation);
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

// Get conversation history for a customer
app.get("/conversations/:id/history", async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        messages: {
          where: { direction: "inbound" },
          orderBy: { sentAt: "desc" },
          take: 1,
        }
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Get the reply-to email and from email from the most recent inbound message
    const lastInbound = conversation.messages[0];
    const replyToEmail = lastInbound?.replyToEmail;
    const fromEmail = lastInbound?.fromEmail;

    // NEW LOGIC:
    // - If reply-to exists: match ONLY by reply-to
    // - If NO reply-to but has fromEmail: match by fromEmail (for mailer@shopify.com, etc)
    // - Otherwise: match by customer ID
    // - Always exclude archived (resolved) conversations
        // Build base where clause
    const baseWhere: any = replyToEmail
      ? {
          messages: {
            some: { replyToEmail: replyToEmail }
          },
        }
      : fromEmail
      ? {
          messages: {
            some: {
              fromEmail: fromEmail,
              direction: "inbound"
            }
          },
        }
      : {
          customerId: conversation.customerId,
        };

    // CRITICAL FIX: Apply tag filters to related conversations
    // Exclude non-support and admin conversations from related history
    const whereClause = {
      ...baseWhere,
      id: { not: req.params.id },
      archived: false,
      workspaceId: conversation.workspaceId,
      NOT: [
        { tags: { has: "non-customer-support" } },
        { tags: { has: "admin" } }
      ]
    };
    console.log(`[History] Fetching related conversations with tag filters applied`);

    // Find all other conversations matching the criteria
    const history = await prisma.conversation.findMany({
      where: whereClause,
      include: {
        messages: {
          orderBy: { sentAt: "asc" },
        },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 10, // Limit to 10 most recent
    });

    res.json(history);
  } catch (error) {
    console.error("Error fetching conversation history:", error);
    res.status(500).json({ error: "Failed to fetch conversation history" });
  }
});

// Helper function to get unreplied conversations
async function getUnrepliedConversations(workspaceId?: string) {
  const whereClause: any = {
    archived: false,
    needsReply: true, // Only unresolved conversations should be considered unreplied
    NOT: [
      { tags: { has: "non-customer-support" } },
      { tags: { has: "admin" } },
      { userTags: { has: "non-customer-support" } },
      { userTags: { has: "admin" } }
    ]
  };

  // Add workspace filter if provided
  if (workspaceId) {
    whereClause.workspaceId = workspaceId;
  }

  console.log('[UNREPLIED] Query where clause:', JSON.stringify(whereClause));

  const conversations = await prisma.conversation.findMany({
    where: whereClause,
    include: {
      messages: {
        orderBy: { sentAt: "desc" },
        take: 1,
      },
    },
    orderBy: { lastMessageAt: "asc" }, // Oldest first
  });

  console.log(`[UNREPLIED] Found ${conversations.length} non-archived, non-special conversations`);

  // Filter to only those where last message is inbound
  const unreplied = conversations.filter(c =>
    c.messages.length > 0 && c.messages[0].direction === "inbound"
  );

  console.log(`[UNREPLIED] Filtered to ${unreplied.length} unreplied conversations`);

  return unreplied;
}

// Toggle starred
app.patch("/conversations/:id/star", async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const updated = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { starred: !conversation.starred },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error toggling star:", error);
    res.status(500).json({ error: "Failed to toggle star" });
  }
});

// Update conversation
app.patch("/conversations/:id", async (req: Request, res: Response) => {
  try {
    const { archived, starred } = req.body;
    const data: any = {};

    if (archived !== undefined) {
      data.archived = archived;

      // NEW V2: If archiving, set needsReply = false (archived conversations are considered resolved)
      if (archived === true) {
        data.needsReply = false;
        console.log(`[PATCH V2] Setting needsReply=false for archived conversation`);
      }
    }

    if (starred !== undefined) data.starred = starred;

    const updated = await prisma.conversation.update({
      where: { id: req.params.id },
      data,
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating conversation:", error);
    res.status(500).json({ error: "Failed to update conversation" });
  }
});

// NEW V2: Archive conversation (with optional user tag)
app.patch("/conversations/:id/archive", async (req: Request, res: Response) => {
  try {
    const { tag } = req.body;

    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
    });

    const data: any = {
      archived: true,
      needsReply: false  // NEW V2: Archived conversations are considered resolved
    };

    if (conversation && tag) {
      // Add the user tag if provided (e.g., "non-customer-support")
      const updatedUserTags = [...(conversation.userTags || []), tag];
      data.userTags = updatedUserTags;
      console.log(`[ARCHIVE V2] Adding userTag "${tag}" and setting needsReply=false`);
    } else {
      console.log(`[ARCHIVE V2] Setting needsReply=false (no tag added)`);
    }

    const updated = await prisma.conversation.update({
      where: { id: req.params.id },
      data,
    });

    res.json(updated);
  } catch (error) {
    console.error("Error archiving conversation:", error);
    res.status(500).json({ error: "Failed to archive conversation" });
  }
});

// Add/remove tags
// NEW V2: Update user tags (does NOT affect needsReply system tag)
app.patch("/conversations/:id/tags", async (req: Request, res: Response) => {
  try {
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: "Tags must be an array" });
    }

    // Get current conversation state for logging
    const current = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      select: { userTags: true, needsReply: true, subject: true, gmailThreadId: true }
    });

    console.log(`[TAGS V2 UPDATE] 📝 Conversation ${req.params.id} | Subject: "${current?.subject}" | Thread: ${current?.gmailThreadId?.substring(0, 8)}...`);
    console.log(`[TAGS V2 UPDATE] 🏷️  Current userTags: ${JSON.stringify(current?.userTags || [])}`);
    console.log(`[TAGS V2 UPDATE] 🔔 Current needsReply (unchanged): ${current?.needsReply}`);
    console.log(`[TAGS V2 UPDATE] 🎯 Requested userTags: ${JSON.stringify(tags)}`);

    // NEW V2: Update userTags without touching needsReply
    // User can add "admin" or "non-customer-support" and KEEP needsReply status
    const updated = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { userTags: tags },
      // Return both fields so frontend gets complete state
      select: {
        id: true,
        subject: true,
        userTags: true,
        needsReply: true,
        lastMessageDirection: true,
        archived: true,
        starred: true,
        lastMessageAt: true,
        // Also return old 'tags' field for backward compatibility during migration
        tags: true,
      }
    });

    console.log(`[TAGS V2 UPDATE] ✅ Saved userTags to DB: ${JSON.stringify(updated.userTags)}`);
    console.log(`[TAGS V2 UPDATE] ✅ needsReply unchanged: ${updated.needsReply}`);

    res.json(updated);
  } catch (error) {
    console.error("[TAGS V2 UPDATE] ❌ Error:", error);
    res.status(500).json({ error: "Failed to update tags" });
  }
});

// Update conversation status
app.patch("/conversations/:id/status", async (req: Request, res: Response) => {
  try {
    const { status } = req.body;

    if (!["open", "resolved", "pending"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const updated = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { status },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// DEBUG: Check reply-to email values in database
app.get("/debug/reply-to", async (req: Request, res: Response) => {
  try {
    const messages = await prisma.message.findMany({
      where: { direction: "inbound" },
      select: {
        id: true,
        fromEmail: true,
        replyToEmail: true,
        sentAt: true,
        conversation: {
          select: {
            id: true,
            subject: true,
          }
        }
      },
      orderBy: { sentAt: "desc" },
      take: 20,
    });

    const summary = {
      total: messages.length,
      withReplyTo: messages.filter(m => m.replyToEmail).length,
      withoutReplyTo: messages.filter(m => !m.replyToEmail).length,
      messages: messages.map(m => ({
        conversationId: m.conversation.id,
        subject: m.conversation.subject,
        fromEmail: m.fromEmail,
        replyToEmail: m.replyToEmail || "NULL",
        sentAt: m.sentAt,
      }))
    };

    res.json(summary);
  } catch (error) {
    console.error("Error checking reply-to:", error);
    res.status(500).json({ error: "Failed to check reply-to values" });
  }
});

// Send a reply to a conversation or send a new email
app.post("/messages", async (req: Request, res: Response) => {
  try {
    const { conversationId, to, body, subject, workspaceId, userId, attachments } = req.body;

    if (!to || !body) {
      return res.status(400).json({ error: "Missing required fields: to and body" });
    }

    const attachmentPayload = Array.isArray(attachments)
      ? attachments
          .filter((att: any) => att && typeof att.data === "string" && att.data.length > 0)
          .map((att: any) => ({
            filename: att.filename || "attachment",
            mimeType: att.mimeType || "application/octet-stream",
            data: att.data,
            size: typeof att.size === "number" ? att.size : undefined,
            inline: att.inline ? true : false,
            contentId: att.contentId || undefined,
          }))
      : [];

    let result;
    let actualWorkspaceId = workspaceId;

    if (conversationId) {
      // Get conversation to find workspace
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { workspaceId: true }
      });

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      actualWorkspaceId = conversation.workspaceId;

      // Send as reply in existing thread using multi-workspace service
      result = await gmailMulti.sendReply(actualWorkspaceId, conversationId, to, body, attachmentPayload);

      // Delete draft for this conversation since we sent a message
      try {
        await prisma.draftResponse.delete({
          where: { conversationId }
        });
        console.log(`[Messages] Deleted draft for conversation ${conversationId} after sending message`);
      } catch (error) {
        // Draft might not exist, which is fine
        console.log(`[Messages] No draft to delete for conversation ${conversationId}`);
      }
    } else {
      // Send as new standalone email (not part of a thread)
      if (!actualWorkspaceId) {
        return res.status(400).json({ error: "workspaceId is required for new emails" });
      }
      result = await gmailMulti.sendNewEmail(actualWorkspaceId, to, subject || "No Subject", body, attachmentPayload);
    }

    // Record user activity for analytics
    if (userId && actualWorkspaceId) {
      try {
        await prisma.userActivity.create({
          data: {
            userId,
            workspaceId: actualWorkspaceId,
            conversationId: conversationId || null,
            actionType: "email_sent",
            metadata: {
              to,
              conversationId: conversationId || null,
              messageId: result.id || null,
              hasAttachments: attachmentPayload.length > 0,
              attachmentCount: attachmentPayload.length,
            }
          }
        });

        // Track who replied last on the conversation
        if (conversationId) {
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { lastRepliedBy: userId }
          });
        }
      } catch (activityError) {
        console.error("[Analytics] Failed to record user activity:", activityError);
      }
    }

    res.json({ success: true, messageId: result.id });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Download or view a message attachment
app.get("/messages/:id/attachments/:index", async (req: Request, res: Response) => {
  try {
    const { id, index } = req.params;
    const inline = req.query.inline === "true";
    const attachmentIndex = Number(index);

    if (Number.isNaN(attachmentIndex)) {
      return res.status(400).json({ error: "Invalid attachment index" });
    }

    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        conversation: {
          select: { workspaceId: true },
        },
      },
    });

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const attachments: any[] = (message as any).attachments || [];
    const attachment = attachments[attachmentIndex];

    if (!attachment) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    // If we already stored the data inline, return it directly
    if (attachment.data) {
      const buffer = Buffer.from(attachment.data, "base64");
      res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
      if (!inline) {
        res.setHeader("Content-Disposition", `attachment; filename="${attachment.filename || "attachment"}"`);
      }
      return res.send(buffer);
    }

    if (!attachment.attachmentId) {
      return res.status(404).json({ error: "Attachment content unavailable" });
    }

    // Fetch from Gmail on demand
    const { gmail } = await gmailMulti.getAuthedClient(message.conversation.workspaceId);
    const attRes = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId: message.gmailMessageId,
      id: attachment.attachmentId,
    });

    const data = attRes.data?.data;
    if (!data) {
      return res.status(404).json({ error: "Attachment data not found" });
    }

    const buffer = Buffer.from(data, "base64");
    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    if (!inline) {
      res.setHeader("Content-Disposition", `attachment; filename="${attachment.filename || "attachment"}"`);
    }

    res.send(buffer);
  } catch (error) {
    console.error("Error fetching attachment:", error);
    res.status(500).json({ error: "Failed to fetch attachment" });
  }
});

// Analytics endpoint
app.get("/analytics", async (req: Request, res: Response) => {
  try {
    const { period = "7d" } = req.query;

    // Calculate time range
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case "24h":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Fetch ALL active (non-archived) conversations for current state metrics
    // We want to show the CURRENT state of needs-reply/resolved, not historical data
    const allActiveConversations = await prisma.conversation.findMany({
      where: {
        archived: false  // Only non-archived conversations
      },
      include: {
        messages: {
          orderBy: { sentAt: "asc" }
        }
      }
    });

    // Count non-customer-support conversations
    const nonCustomerSupportConversations = allActiveConversations.filter(conv =>
      conv.tags?.includes("non-customer-support")
    );

    // Get customer support conversations only (exclude non-customer-support)
    const conversations = allActiveConversations.filter(conv =>
      !conv.tags?.includes("non-customer-support")
    );

    // Get conversation IDs for filtering messages
    const conversationIds = conversations.map(c => c.id);

    const allMessages = await prisma.message.findMany({
      where: {
        sentAt: {
          gte: startDate
        },
        conversationId: {
          in: conversationIds
        }
      },
      orderBy: { sentAt: "asc" }
    });

    // Calculate metrics
    const totalConversations = conversations.length;
    const totalMessages = allMessages.length;
    const inboundMessages = allMessages.filter(m => m.direction === "inbound");
    const outboundMessages = allMessages.filter(m => m.direction === "outbound");

    // Email velocity (emails per day)
    const periodInDays = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const emailVelocity = {
      total: totalMessages / periodInDays,
      inbound: inboundMessages.length / periodInDays,
      outbound: outboundMessages.length / periodInDays
    };

    // Response time calculation
    const responseTimes: number[] = [];

    conversations.forEach(conv => {
      const messages = conv.messages;
      for (let i = 0; i < messages.length - 1; i++) {
        const current = messages[i];
        const next = messages[i + 1];

        // If current is inbound and next is outbound, calculate response time
        if (current.direction === "inbound" && next.direction === "outbound") {
          const responseTime = new Date(next.sentAt).getTime() - new Date(current.sentAt).getTime();
          responseTimes.push(responseTime);
        }
      }
    });

    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    const medianResponseTime = responseTimes.length > 0
      ? responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length / 2)]
      : 0;

    // Unreplied conversations (needs reply) - hybrid approach for backward compatibility
    // Check both the tag (for new conversations) and last message direction (for old conversations)
    const unrepliedConversations = conversations.filter(conv => {
      // First check if has needs-reply tag (new system)
      if (conv.tags?.includes("needs-reply")) {
        return true;
      }

      // Fallback to last message direction check (for conversations without tags yet)
      if (conv.messages.length === 0) return false;
      const lastMessage = conv.messages[conv.messages.length - 1];
      return lastMessage.direction === "inbound";
    });

    // Resolved conversations (replied to, no needs-reply tag)
    const resolvedConversations = conversations.filter(conv => {
      // First check if has needs-reply tag (new system) - if it has the tag, it's NOT resolved
      if (conv.tags?.includes("needs-reply")) {
        return false;
      }

      // Fallback to last message direction check (for conversations without tags yet)
      if (conv.messages.length === 0) return false;
      const lastMessage = conv.messages[conv.messages.length - 1];
      return lastMessage.direction === "outbound";
    });

    const resolutionRate = totalConversations > 0
      ? (resolvedConversations.length / totalConversations) * 100
      : 0;

    // Volume trends (daily breakdown) - enhanced with more detail
    const dailyVolume: { [key: string]: {
      inbound: number;
      outbound: number;
      total: number;
      newConversations: number;
      resolved: number;
    } } = {};

    // Initialize all dates in range with 0 values
    const currentDate = new Date(startDate);
    while (currentDate <= now) {
      const dateKey = currentDate.toISOString().split('T')[0];
      dailyVolume[dateKey] = { inbound: 0, outbound: 0, total: 0, newConversations: 0, resolved: 0 };
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Count messages per day
    allMessages.forEach(msg => {
      const dateKey = new Date(msg.sentAt).toISOString().split('T')[0];
      if (dailyVolume[dateKey]) {
        dailyVolume[dateKey].total++;
        if (msg.direction === "inbound") {
          dailyVolume[dateKey].inbound++;
        } else {
          dailyVolume[dateKey].outbound++;
        }
      }
    });

    // Count new conversations per day
    conversations.forEach(conv => {
      if (conv.firstMessageAt) {
        const dateKey = new Date(conv.firstMessageAt).toISOString().split('T')[0];
        if (dailyVolume[dateKey]) {
          dailyVolume[dateKey].newConversations++;
        }
      }
    });

    // First response time (time to first reply in a conversation)
    const firstResponseTimes: number[] = [];

    conversations.forEach(conv => {
      const messages = conv.messages;
      if (messages.length < 2) return;

      const firstInbound = messages.find(m => m.direction === "inbound");
      const firstOutboundAfter = messages.find((m, idx) => {
        if (m.direction !== "outbound") return false;
        const firstInboundIdx = messages.indexOf(firstInbound!);
        return idx > firstInboundIdx;
      });

      if (firstInbound && firstOutboundAfter) {
        const responseTime = new Date(firstOutboundAfter.sentAt).getTime() - new Date(firstInbound.sentAt).getTime();
        firstResponseTimes.push(responseTime);
      }
    });

    const avgFirstResponseTime = firstResponseTimes.length > 0
      ? firstResponseTimes.reduce((a, b) => a + b, 0) / firstResponseTimes.length
      : 0;

    // SLA metrics - percentage of responses within time thresholds
    const slaMetrics = {
      within2Hours: responseTimes.filter(rt => rt <= 2 * 60 * 60 * 1000).length,
      within8Hours: responseTimes.filter(rt => rt <= 8 * 60 * 60 * 1000).length,
      within24Hours: responseTimes.filter(rt => rt <= 24 * 60 * 60 * 1000).length,
      total: responseTimes.length
    };

    // Customer engagement metrics
    const customerMetrics = {
      totalUniqueCustomers: new Set(conversations.map(c => c.customerId)).size,
      multiMessageConversations: conversations.filter(c => c.messages.length > 2).length,
      avgMessagesPerConversation: totalConversations > 0 ? totalMessages / totalConversations : 0
    };

    // Tag distribution
    const tagCounts: { [key: string]: number } = {};
    conversations.forEach(conv => {
      conv.tags?.forEach(tag => {
        // Exclude needs-reply from tag distribution as it's a special tag
        if (tag !== "needs-reply") {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      });
    });

    // Hourly distribution for workload analysis
    const hourlyDistribution: { [hour: number]: number } = {};
    for (let i = 0; i < 24; i++) {
      hourlyDistribution[i] = 0;
    }
    inboundMessages.forEach(msg => {
      const hour = new Date(msg.sentAt).getHours();
      hourlyDistribution[hour]++;
    });

    res.json({
      period: period as string,
      periodInDays: Math.round(periodInDays * 10) / 10,
      overview: {
        totalConversations,
        totalMessages,
        inboundMessages: inboundMessages.length,
        outboundMessages: outboundMessages.length,
        unrepliedCount: unrepliedConversations.length,
        resolvedCount: resolvedConversations.length,
        resolutionRate: Math.round(resolutionRate * 10) / 10,
        totalConversationsIncludingNonSupport: allActiveConversations.length,
        nonCustomerSupportCount: nonCustomerSupportConversations.length
      },
      emailVelocity: {
        total: Math.round(emailVelocity.total * 10) / 10,
        inbound: Math.round(emailVelocity.inbound * 10) / 10,
        outbound: Math.round(emailVelocity.outbound * 10) / 10
      },
      responseTime: {
        average: avgResponseTime,
        median: medianResponseTime,
        averageHours: Math.round((avgResponseTime / (1000 * 60 * 60)) * 10) / 10,
        medianHours: Math.round((medianResponseTime / (1000 * 60 * 60)) * 10) / 10,
        firstResponseAverage: avgFirstResponseTime,
        firstResponseAverageHours: Math.round((avgFirstResponseTime / (1000 * 60 * 60)) * 10) / 10,
        sampleSize: responseTimes.length
      },
      sla: {
        within2Hours: slaMetrics.total > 0 ? Math.round((slaMetrics.within2Hours / slaMetrics.total) * 100) : 0,
        within8Hours: slaMetrics.total > 0 ? Math.round((slaMetrics.within8Hours / slaMetrics.total) * 100) : 0,
        within24Hours: slaMetrics.total > 0 ? Math.round((slaMetrics.within24Hours / slaMetrics.total) * 100) : 0,
        sampleSize: slaMetrics.total
      },
      customerMetrics: {
        totalUniqueCustomers: customerMetrics.totalUniqueCustomers,
        multiMessageConversations: customerMetrics.multiMessageConversations,
        avgMessagesPerConversation: Math.round(customerMetrics.avgMessagesPerConversation * 10) / 10
      },
      volumeTrends: dailyVolume,
      tagDistribution: tagCounts,
      hourlyDistribution
    });
  } catch (error) {
    console.error("Error generating analytics:", error);
    res.status(500).json({ error: "Failed to generate analytics" });
  }
});

// Email Summary Endpoint using GPT
app.post("/conversations/:id/summary", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch conversation with messages
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { sentAt: "asc" }
        },
        customer: true
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Build email thread context for GPT
    const emailThread = conversation.messages.map((msg: any) => {
      const direction = msg.direction === "inbound" ? "Customer" : "Agent";
      const content = msg.bodyText || msg.bodyHtml?.replace(/<[^>]*>/g, '') || '';
      return `${direction}: ${content.substring(0, 1000)}`;
    }).join('\n\n');

    // Load knowledge base (if exists)
    // Load both general knowledge and summary-specific knowledge
    let knowledgeBaseContext = "";
    try {
      const knowledgeBase = await prisma.knowledgeBase.findMany({
        where: {
          active: true,
          category: {
            in: ["general", "summary"]
          }
        },
        select: { content: true, title: true }
      });

      if (knowledgeBase.length > 0) {
        knowledgeBaseContext = "\n\nKnowledge Base:\n" +
          knowledgeBase.map(kb => `- ${kb.title}: ${kb.content}`).join('\n');
      }
    } catch (error) {
      // Knowledge base table might not exist yet, continue without it
      console.log("Knowledge base not available yet");
    }

    // Generate summary using GPT-4o-mini
    // Note: Will upgrade to GPT-5 when Responses API SDK support is available
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful customer support assistant. Summarize email conversations concisely, highlighting:
1. Main issue/question
2. Key points discussed
3. Current status
4. Suggested next steps (if applicable)

Keep summaries under 150 words.${knowledgeBaseContext}`
        },
        {
          role: "user",
          content: `Summarize this email conversation:\n\nSubject: ${conversation.subject}\n\n${emailThread}`
        }
      ],
      temperature: 0.5,
      max_tokens: 300
    });

    const summary = completion.choices[0].message.content;

    // Save summary to database (optional - can cache it)
    await prisma.conversation.update({
      where: { id },
      data: {
        aiSummary: summary,
        aiSummaryGeneratedAt: new Date()
      }
    });

    res.json({ summary });
  } catch (error) {
    console.error("Error generating summary:", error);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

// Knowledge Base CRUD Endpoints
app.get("/knowledge-base", async (req: Request, res: Response) => {
  try {
    const entries = await prisma.knowledgeBase.findMany({
      orderBy: { updatedAt: "desc" }
    });
    res.json(entries);
  } catch (error) {
    console.error("Error fetching knowledge base:", error);
    res.status(500).json({ error: "Failed to fetch knowledge base" });
  }
});

app.post("/knowledge-base", async (req: Request, res: Response) => {
  try {
    const { title, content, category, tags, active } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    const entry = await prisma.knowledgeBase.create({
      data: {
        title,
        content,
        category: category || "general",
        tags: tags || [],
        active: active !== undefined ? active : true
      }
    });

    res.json(entry);
  } catch (error) {
    console.error("Error creating knowledge base entry:", error);
    res.status(500).json({ error: "Failed to create entry" });
  }
});

app.patch("/knowledge-base/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, content, category, tags, active } = req.body;

    const entry = await prisma.knowledgeBase.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(category !== undefined && { category }),
        ...(tags !== undefined && { tags }),
        ...(active !== undefined && { active })
      }
    });

    res.json(entry);
  } catch (error) {
    console.error("Error updating knowledge base entry:", error);
    res.status(500).json({ error: "Failed to update entry" });
  }
});

app.delete("/knowledge-base/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.knowledgeBase.delete({
      where: { id }
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting knowledge base entry:", error);
    res.status(500).json({ error: "Failed to delete entry" });
  }
});

/**
 * Get knowledge base access for AI tools
 * GET /knowledge-base/tool-access
 * Returns what knowledge each AI tool has access to
 */
app.get("/knowledge-base/tool-access", async (req: Request, res: Response) => {
  console.log("[Tool Access] Request received for knowledge base tool access");
  try {
    // Fetch all active knowledge base entries
    const allEntries = await prisma.knowledgeBase.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        category: true,
        tags: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Organize by tool
    const toolAccess = {
      draft: {
        name: "Draft Response Generator",
        description: "AI tool that generates email draft responses to customer inquiries",
        model: "gpt-5-mini-2025-08-07",
        categories: ["general", "draft-reply"],
        entries: allEntries.filter(e =>
          e.category === "general" || e.category === "draft-reply"
        ),
        capabilities: [
          "Search customer orders via Shopify",
          "Get package tracking from 17track",
          "Calculate return windows from delivery dates",
          "Generate personalized email responses"
        ]
      },
      summary: {
        name: "Conversation Summarizer",
        description: "AI tool that generates concise summaries of email conversations",
        model: "gpt-4o-mini",
        categories: ["general", "summary"],
        entries: allEntries.filter(e =>
          e.category === "general" || e.category === "summary"
        ),
        capabilities: [
          "Summarize long email threads",
          "Extract key issues and resolutions",
          "Provide 150-word maximum summaries"
        ]
      },
      emailExtractor: {
        name: "Email Extractor",
        description: "AI tool that extracts customer emails from forwarded messages",
        model: "gpt-4",
        categories: [],
        entries: [],
        capabilities: [
          "Extract customer email addresses from message content",
          "Handle Shopify notification formats",
          "Identify primary customer contact"
        ]
      },
      kbWriter: {
        name: "Knowledge Base Writer",
        description: "AI assistant for creating new knowledge base content",
        model: "gpt-4",
        categories: [],
        entries: [],
        capabilities: [
          "Generate professional knowledge base articles",
          "Create category-specific content",
          "Follow company tone and style"
        ]
      },
      kbEditor: {
        name: "Knowledge Base Editor",
        description: "AI assistant for improving existing knowledge base content",
        model: "gpt-4",
        categories: [],
        entries: [],
        capabilities: [
          "Improve clarity and grammar",
          "Maintain professional tone",
          "Preserve original meaning"
        ]
      }
    };

    console.log(`[Tool Access] Returning tool access data with ${allEntries.length} total KB entries`);
    res.json(toolAccess);
  } catch (error) {
    console.error("[Tool Access] Error fetching tool access:", error);
    res.status(500).json({
      error: "Failed to fetch tool access information",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// ONBOARDING & TRAINING ENDPOINTS
// ============================================================================

// Get all onboarding sections
app.get("/onboarding/sections", async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const sections = await prisma.onboardingSection.findMany({
      where: {
        active: true,
        ...(category && { category })
      },
      orderBy: { order: "asc" }
    });
    res.json(sections);
  } catch (error) {
    console.error("Error fetching onboarding sections:", error);
    res.status(500).json({ error: "Failed to fetch onboarding sections" });
  }
});

// Create onboarding section
app.post("/onboarding/sections", async (req: Request, res: Response) => {
  try {
    const { title, slug, content, order, category, icon, active } = req.body;

    if (!title || !slug || !content) {
      return res.status(400).json({ error: "Title, slug, and content are required" });
    }

    const section = await prisma.onboardingSection.create({
      data: {
        title,
        slug,
        content,
        order: order || 0,
        category: category || "tool-sop",
        icon,
        active: active !== undefined ? active : true
      }
    });

    res.json(section);
  } catch (error) {
    console.error("Error creating onboarding section:", error);
    res.status(500).json({ error: "Failed to create section" });
  }
});

// Update onboarding section
app.patch("/onboarding/sections/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, slug, content, order, category, icon, active } = req.body;

    const section = await prisma.onboardingSection.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(slug !== undefined && { slug }),
        ...(content !== undefined && { content }),
        ...(order !== undefined && { order }),
        ...(category !== undefined && { category }),
        ...(icon !== undefined && { icon }),
        ...(active !== undefined && { active })
      }
    });

    res.json(section);
  } catch (error) {
    console.error("Error updating onboarding section:", error);
    res.status(500).json({ error: "Failed to update section" });
  }
});

// Delete onboarding section
app.delete("/onboarding/sections/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.onboardingSection.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting onboarding section:", error);
    res.status(500).json({ error: "Failed to delete section" });
  }
});

// Get all training videos
app.get("/training/videos", async (req: Request, res: Response) => {
  try {
    const videos = await prisma.trainingVideo.findMany({
      where: { active: true },
      orderBy: { order: "asc" }
    });
    res.json(videos);
  } catch (error) {
    console.error("Error fetching training videos:", error);
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

// Verify password for video management
app.post("/training/videos/verify-password", async (req: Request, res: Response) => {
  const { password } = req.body;
  const correctPassword = "gmltn123";

  if (password === correctPassword) {
    res.json({ verified: true });
  } else {
    res.json({ verified: false });
  }
});

// Create training video
app.post("/training/videos", async (req: Request, res: Response) => {
  try {
    const { password, title, description, videoUrl, thumbnailUrl, duration, category, order, active } = req.body;

    // Verify password
    if (password !== "gmltn123") {
      return res.status(401).json({ error: "Invalid password" });
    }

    if (!title || !videoUrl) {
      return res.status(400).json({ error: "Title and video URL are required" });
    }

    const video = await prisma.trainingVideo.create({
      data: {
        title,
        description,
        videoUrl,
        thumbnailUrl,
        duration,
        category,
        order: order || 0,
        active: active !== undefined ? active : true
      }
    });

    res.json(video);
  } catch (error) {
    console.error("Error creating training video:", error);
    res.status(500).json({ error: "Failed to create video" });
  }
});

// Update training video
app.patch("/training/videos/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, title, description, videoUrl, thumbnailUrl, duration, category, order, active } = req.body;

    // Verify password
    if (password !== "gmltn123") {
      return res.status(401).json({ error: "Invalid password" });
    }

    const video = await prisma.trainingVideo.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(videoUrl !== undefined && { videoUrl }),
        ...(thumbnailUrl !== undefined && { thumbnailUrl }),
        ...(duration !== undefined && { duration }),
        ...(category !== undefined && { category }),
        ...(order !== undefined && { order }),
        ...(active !== undefined && { active })
      }
    });

    res.json(video);
  } catch (error) {
    console.error("Error updating training video:", error);
    res.status(500).json({ error: "Failed to update video" });
  }
});

// Delete training video
app.delete("/training/videos/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    // Verify password
    if (password !== "gmltn123") {
      return res.status(401).json({ error: "Invalid password" });
    }

    await prisma.trainingVideo.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting training video:", error);
    res.status(500).json({ error: "Failed to delete video" });
  }
});

// ==================== QUESTIONS KB ENDPOINTS ====================
// Get all questions
app.get("/questions", async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;

    const questions = await prisma.questionsKB.findMany({
      where: status ? { status } : undefined,
      include: {
        askedByUser: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        answeredByUser: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(questions);
  } catch (error) {
    console.error("Error fetching questions:", error);
    res.status(500).json({ error: "Failed to fetch questions" });
  }
});

// Get single question by ID
app.get("/questions/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const question = await prisma.questionsKB.findUnique({
      where: { id },
      include: {
        askedByUser: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        answeredByUser: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        conversation: {
          select: {
            id: true,
            subject: true,
            customer: {
              select: {
                primaryEmail: true,
              },
            },
          },
        },
      },
    });

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    res.json(question);
  } catch (error) {
    console.error("Error fetching question:", error);
    res.status(500).json({ error: "Failed to fetch question" });
  }
});

// Create new question
app.post("/questions", async (req: Request, res: Response) => {
  try {
    const { question, askedBy, referencedEmail, conversationId, tags } = req.body;

    if (!question || !askedBy) {
      return res.status(400).json({ error: "Question and askedBy are required" });
    }

    const newQuestion = await prisma.questionsKB.create({
      data: {
        question,
        askedBy,
        referencedEmail: referencedEmail || null,
        conversationId: conversationId || null,
        tags: tags || [],
        status: "unanswered",
      },
      include: {
        askedByUser: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    });

    res.json(newQuestion);
  } catch (error) {
    console.error("Error creating question:", error);
    res.status(500).json({ error: "Failed to create question" });
  }
});

// Answer a question
app.patch("/questions/:id/answer", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { answer, answeredBy } = req.body;

    if (!answer || !answeredBy) {
      return res.status(400).json({ error: "Answer and answeredBy are required" });
    }

    const updatedQuestion = await prisma.questionsKB.update({
      where: { id },
      data: {
        answer,
        answeredBy,
        status: "answered",
        answeredAt: new Date(),
        updatedAt: new Date(),
      },
      include: {
        askedByUser: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        answeredByUser: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    });

    res.json(updatedQuestion);
  } catch (error) {
    console.error("Error answering question:", error);
    res.status(500).json({ error: "Failed to answer question" });
  }
});

// Delete a question
app.delete("/questions/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.questionsKB.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting question:", error);
    res.status(500).json({ error: "Failed to delete question" });
  }
});

// ==================== ANALYTICS ENDPOINTS ====================
// General analytics (overall stats)
app.get("/analytics/general", async (req: Request, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string | undefined;
    const timeRange = req.query.timeRange as string || "7d"; // 7d, 30d, 90d, all

    // Calculate date filter based on time range
    let dateFilter: Date | undefined;
    const now = new Date();
    if (timeRange === "7d") {
      dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "30d") {
      dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "90d") {
      dateFilter = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }

    const whereClause = {
      ...(workspaceId && { workspaceId }),
      ...(dateFilter && { createdAt: { gte: dateFilter } }),
    };

    // Total incoming tickets
    const totalIncoming = await prisma.conversation.count({
      where: whereClause,
    });

    // Tickets (non-CS) - conversations tagged with "non-customer-support"
    const nonCSTickets = await prisma.conversation.count({
      where: {
        ...whereClause,
        userTags: { has: "non-customer-support" },
      },
    });

    // Tickets (CS) - all others
    const csTickets = totalIncoming - nonCSTickets;

    // Average response time (calculate from first inbound to first outbound)
    const conversationsWithMessages = await prisma.conversation.findMany({
      where: whereClause,
      include: {
        messages: {
          orderBy: { sentAt: "asc" },
          select: {
            direction: true,
            sentAt: true,
          },
        },
      },
    });

    let totalResponseTime = 0;
    let responsesCount = 0;

    conversationsWithMessages.forEach((conv) => {
      const firstInbound = conv.messages.find((m) => m.direction === "inbound");
      const firstOutbound = conv.messages.find((m) => m.direction === "outbound");

      if (firstInbound && firstOutbound && firstOutbound.sentAt > firstInbound.sentAt) {
        const responseTime = firstOutbound.sentAt.getTime() - firstInbound.sentAt.getTime();
        totalResponseTime += responseTime;
        responsesCount++;
      }
    });

    const avgResponseTimeMs = responsesCount > 0 ? totalResponseTime / responsesCount : 0;
    const avgResponseTimeHours = avgResponseTimeMs / (1000 * 60 * 60);

    res.json({
      totalIncoming,
      nonCSTickets,
      csTickets,
      avgResponseTimeHours: Math.round(avgResponseTimeHours * 100) / 100,
      avgResponseTimeMs,
      timeRange,
    });
  } catch (error) {
    console.error("Error fetching general analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// User-specific analytics
app.get("/analytics/user/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const workspaceId = req.query.workspaceId as string | undefined;
    const timeRange = req.query.timeRange as string || "7d";

    // Calculate date filter
    let dateFilter: Date | undefined;
    const now = new Date();
    if (timeRange === "7d") {
      dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "30d") {
      dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "90d") {
      dateFilter = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }

    // Total outbound emails (from UserActivity)
    const totalOutbound = await prisma.userActivity.count({
      where: {
        userId,
        actionType: "email_sent",
        ...(workspaceId && { workspaceId }),
        ...(dateFilter && { timestamp: { gte: dateFilter } }),
      },
    });

    // Outbound emails per day (for the time range)
    const outboundActivities = await prisma.userActivity.findMany({
      where: {
        userId,
        actionType: "email_sent",
        ...(workspaceId && { workspaceId }),
        ...(dateFilter && { timestamp: { gte: dateFilter } }),
      },
      select: {
        timestamp: true,
      },
    });

    // Group by day
    const emailsByDay: Record<string, number> = {};
    outboundActivities.forEach((activity) => {
      const day = activity.timestamp.toISOString().split("T")[0];
      emailsByDay[day] = (emailsByDay[day] || 0) + 1;
    });

    // Group by hour (last 24 hours)
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const emailsByHour: Record<number, number> = {};
    outboundActivities
      .filter((a) => a.timestamp >= last24Hours)
      .forEach((activity) => {
        const hour = activity.timestamp.getHours();
        emailsByHour[hour] = (emailsByHour[hour] || 0) + 1;
      });

    // Assigned conversations
    const assignedConversations = await prisma.conversation.count({
      where: {
        assignedTo: userId,
        ...(workspaceId && { workspaceId }),
        ...(dateFilter && { createdAt: { gte: dateFilter } }),
      },
    });

    // Drafted conversations
    const draftedConversations = await prisma.conversation.count({
      where: {
        lastDraftedBy: userId,
        ...(workspaceId && { workspaceId }),
        ...(dateFilter && { createdAt: { gte: dateFilter } }),
      },
    });

    res.json({
      userId,
      totalOutbound,
      emailsByDay,
      emailsByHour,
      assignedConversations,
      draftedConversations,
      timeRange,
    });
  } catch (error) {
    console.error("Error fetching user analytics:", error);
    res.status(500).json({ error: "Failed to fetch user analytics" });
  }
});

// All users analytics (summary)
app.get("/analytics/users", async (req: Request, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string | undefined;
    const timeRange = req.query.timeRange as string || "7d";

    // Calculate date filter
    let dateFilter: Date | undefined;
    const now = new Date();
    if (timeRange === "7d") {
      dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "30d") {
      dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "90d") {
      dateFilter = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }

    const users = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
      },
    });

    const userStats = await Promise.all(
      users.map(async (user) => {
        const emailsSent = await prisma.userActivity.count({
          where: {
            userId: user.id,
            actionType: "email_sent",
            ...(workspaceId && { workspaceId }),
            ...(dateFilter && { timestamp: { gte: dateFilter } }),
          },
        });

        const assignedCount = await prisma.conversation.count({
          where: {
            assignedTo: user.id,
            ...(workspaceId && { workspaceId }),
            ...(dateFilter && { createdAt: { gte: dateFilter } }),
          },
        });

        return {
          ...user,
          emailsSent,
          assignedCount,
        };
      })
    );

    res.json({ users: userStats, timeRange });
  } catch (error) {
    console.error("Error fetching users analytics:", error);
    res.status(500).json({ error: "Failed to fetch users analytics" });
  }
});

// ============================================================================
// AI ENDPOINTS
// ============================================================================

/**
 * Extract customer email from email content using AI
 * POST /ai/extract-email
 * Body: { fromEmail: string, subject: string, emailBody: string }
 */
app.post("/ai/extract-email", async (req: Request, res: Response) => {
  try {
    const { fromEmail, subject, emailBody } = req.body;

    if (!fromEmail || !emailBody) {
      return res.status(400).json({ error: "fromEmail and emailBody are required" });
    }

    // System prompt for email extraction
    const systemPrompt = `You are an email extraction specialist. Your ONLY job is to extract a customer email address from the provided email content.

CRITICAL RULES:
1. Return ONLY the email address - no other text, no explanation, no quotes
2. Return exactly one email address
3. Do not return system emails (mailer@shopify.com, noreply@, support@, etc.)
4. If multiple customer emails exist, return the first one found
5. If NO customer email is found, return: NONE

SPECIAL CASES:
- For emails FROM mailer@shopify.com: Look for customer email in the body text
- For order confirmations: Find the customer's email in "Customer email:" or similar fields

OUTPUT FORMAT: customer@example.com (Just the email, nothing else)`;

    // Prepare user message
    const userMessage = `Extract the customer email from this email:

From: ${fromEmail}
Subject: ${subject}

Body:
${emailBody}`;

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0,
      max_tokens: 50
    });

    const extractedEmail = response.choices[0].message.content?.trim() || 'NONE';

    res.json({ email: extractedEmail });
  } catch (error) {
    console.error("Error extracting email with AI:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to extract email"
    });
  }
});

/**
 * AI Writing Assistant for Knowledge Base
 * POST /ai/write-kb
 * Body: { prompt: string, category: string, existingContent?: string }
 */
app.post("/ai/write-kb", async (req: Request, res: Response) => {
  try {
    const { prompt, category, existingContent } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    // System prompt tailored for KB writing
    const systemPrompt = `You are a professional knowledge base content writer for Outlight, a lighting products company. Your role is to create clear, accurate, and helpful knowledge base articles for customer support.

WRITING GUIDELINES:
1. Write in a professional but friendly tone
2. Be specific and actionable
3. Include relevant examples when helpful
4. Format with clear paragraphs and bullet points
5. Focus on accuracy and completeness
6. Consider the category: ${category}

CATEGORY GUIDANCE:
- General: Information useful across all customer support scenarios
- Summary: Guidelines for summarizing customer emails
- Draft Reply: Templates and policies for drafting responses
- Suggest Tags: Rules for categorizing and tagging conversations
- Find Similar: Criteria for identifying similar conversations

OUTPUT:
Return ONLY the knowledge base content itself - no meta-commentary, no "here is...", no quotes around it. Just the content that will be saved to the knowledge base.`;

    let userMessage = `Write knowledge base content based on this request:\n\n${prompt}`;

    if (existingContent) {
      userMessage += `\n\nExisting content to build upon or reference:\n${existingContent}`;
    }

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    const content = response.choices[0].message.content?.trim() || '';

    res.json({ content });
  } catch (error) {
    console.error("Error in AI write-kb:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to generate content"
    });
  }
});

/**
 * AI Editing Assistant for Knowledge Base
 * POST /ai/edit-kb
 * Body: { content: string, title: string, category: string, instructions?: string }
 */
app.post("/ai/edit-kb", async (req: Request, res: Response) => {
  try {
    const { content, title, category, instructions } = req.body;

    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }

    const editingInstructions = instructions || "Improve clarity, grammar, and professional tone";

    // System prompt tailored for KB editing
    const systemPrompt = `You are a professional editor for Outlight's customer support knowledge base. Your role is to improve existing knowledge base content while maintaining accuracy and intent.

EDITING PRINCIPLES:
1. Preserve the original meaning and facts
2. Improve clarity and readability
3. Fix grammar, spelling, and punctuation errors
4. Enhance professional tone while staying friendly
5. Improve structure and formatting
6. Remove redundancy and verbosity
7. Ensure consistency with Outlight's brand (lighting products company)

CONTEXT:
- Title: ${title || 'Untitled'}
- Category: ${category}
- Editing goal: ${editingInstructions}

OUTPUT:
Return ONLY the improved knowledge base content - no meta-commentary, no explanations of changes, no "here is the edited version". Just the edited content itself.`;

    const userMessage = `Edit this knowledge base content:\n\n${content}`;

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.3,  // Lower temperature for editing to stay closer to original
      max_tokens: 1500
    });

    const improvedContent = response.choices[0].message.content?.trim() || '';

    res.json({ content: improvedContent });
  } catch (error) {
    console.error("Error in AI edit-kb:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to edit content"
    });
  }
});

// ============================================================================
// SHOPIFY API ENDPOINTS
// ============================================================================

/**
 * Test Shopify connection
 * GET /shopify/test
 */
app.get("/shopify/test", async (_req: Request, res: Response) => {
  try {
    const result = await shopify.testShopifyConnection();
    res.json(result);
  } catch (error) {
    console.error("Error testing Shopify connection:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * Find customer by email
 * GET /shopify/customer?email=customer@example.com
 */
app.get("/shopify/customer", async (req: Request, res: Response) => {
  try {
    const { email } = req.query;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email parameter is required" });
    }

    const customer = await shopify.findCustomerByEmail(email);

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json(customer);
  } catch (error) {
    console.error("Error finding customer:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to find customer"
    });
  }
});

/**
 * Get customer details by ID
 * GET /shopify/customer/:customerId
 */
app.get("/shopify/customer/:customerId", async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const customer = await shopify.getCustomer(customerId);
    res.json(customer);
  } catch (error) {
    console.error("Error getting customer:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get customer"
    });
  }
});

/**
 * Get customer orders
 * GET /shopify/customer/:customerId/orders?limit=50
 */
app.get("/shopify/customer/:customerId/orders", async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const orders = await shopify.getCustomerOrders(customerId, limit);
    res.json(orders);
  } catch (error) {
    console.error("Error getting customer orders:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get customer orders"
    });
  }
});

/**
 * Get order details
 * GET /shopify/order/:orderId
 */
app.get("/shopify/order/:orderId", async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Invalid order ID" });
    }

    const order = await shopify.getOrder(orderId);
    res.json(order);
  } catch (error) {
    console.error("Error getting order:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get order"
    });
  }
});

/**
 * Search for order by order number
 * GET /shopify/order/search?number=#1234
 */
app.get("/shopify/order/search", async (req: Request, res: Response) => {
  try {
    const { number } = req.query;

    if (!number || typeof number !== "string") {
      return res.status(400).json({ error: "Order number parameter is required" });
    }

    const order = await shopify.findOrderByNumber(number);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    console.error("Error searching for order:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to search for order"
    });
  }
});

/**
 * Calculate refund (preview)
 * POST /shopify/order/:orderId/refund/calculate
 * Body: { refundLineItems: [{ line_item_id: number, quantity: number }] }
 */
app.post("/shopify/order/:orderId/refund/calculate", async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Invalid order ID" });
    }

    const { refundLineItems } = req.body;

    if (!refundLineItems || !Array.isArray(refundLineItems)) {
      return res.status(400).json({ error: "refundLineItems array is required" });
    }

    const calculation = await shopify.calculateRefund(orderId, refundLineItems);
    res.json(calculation);
  } catch (error) {
    console.error("Error calculating refund:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to calculate refund"
    });
  }
});

/**
 * Create refund
 * POST /shopify/order/:orderId/refund
 * Body: {
 *   refundLineItems: [{ line_item_id: number, quantity: number, restock_type?: string }],
 *   reason?: string,
 *   notify?: boolean,
 *   note?: string
 * }
 */
app.post("/shopify/order/:orderId/refund", async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Invalid order ID" });
    }

    const { refundLineItems, reason, notify, note } = req.body;

    if (!refundLineItems || !Array.isArray(refundLineItems)) {
      return res.status(400).json({ error: "refundLineItems array is required" });
    }

    const refund = await shopify.createRefund(orderId, refundLineItems, {
      reason,
      notify,
      note
    });

    res.json(refund);
  } catch (error) {
    console.error("Error creating refund:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to create refund"
    });
  }
});

/**
 * Get order refunds
 * GET /shopify/order/:orderId/refunds
 */
app.get("/shopify/order/:orderId/refunds", async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Invalid order ID" });
    }

    const refunds = await shopify.getOrderRefunds(orderId);
    res.json(refunds);
  } catch (error) {
    console.error("Error getting order refunds:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get order refunds"
    });
  }
});

/**
 * Cancel an order
 * POST /shopify/order/:orderId/cancel
 * Body: {
 *   amount?: string,
 *   currency?: string,
 *   reason?: 'customer' | 'fraud' | 'inventory' | 'declined' | 'other',
 *   email?: boolean,
 *   refund?: boolean
 * }
 */
app.post("/shopify/order/:orderId/cancel", async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Invalid order ID" });
    }

    const { amount, currency, reason, email, refund } = req.body;

    const cancelledOrder = await shopify.cancelOrder(orderId, {
      amount,
      currency,
      reason,
      email,
      refund
    });

    res.json(cancelledOrder);
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to cancel order"
    });
  }
});

/**
 * 17track API Integration
 * Docs: https://asset.17track.net/api/document/v2_en/index.html
 */

/**
 * Get tracking information for a package
 * GET /tracking/:trackingNumber
 */
app.get("/tracking/:trackingNumber", async (req: Request, res: Response) => {
  try {
    const { trackingNumber } = req.params;
    const apiKey = process.env.SEVENTEENTRACK_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "17track API key not configured" });
    }

    if (!trackingNumber) {
      return res.status(400).json({ error: "Tracking number is required" });
    }

    // Step 1: Register the tracking number first
    const registerResponse = await fetch("https://api.17track.net/track/v2.2/register", {
      method: "POST",
      headers: {
        "17token": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{
        number: trackingNumber
      }]),
    });

    if (!registerResponse.ok) {
      const registerError = await registerResponse.text();
      console.error("17track registration HTTP error:", registerResponse.status, registerError);
      return res.status(registerResponse.status).json({
        error: "Failed to register tracking number",
        details: registerError
      });
    }

    const registerData = await registerResponse.json();
    console.log("17track registration response:", JSON.stringify(registerData, null, 2));

    // Check if registration was rejected (API returns 200 but with rejection in data)
    if (registerData.data?.rejected && registerData.data.rejected.length > 0) {
      const rejection = registerData.data.rejected[0];
      console.log("Tracking number rejected:", rejection);

      // Provide user-friendly error message
      let userMessage = "Invalid tracking number";
      if (rejection.error?.message?.toLowerCase().includes("carrier")) {
        userMessage = "Invalid tracking number - carrier not recognized";
      } else if (rejection.error?.message) {
        userMessage = `Invalid tracking number - ${rejection.error.message.toLowerCase()}`;
      }

      return res.status(400).json({
        error: userMessage,
        isInvalidTracking: true,
        details: rejection.error?.message || "Registration rejected",
        errorCode: rejection.error?.code
      });
    }

    // Wait a moment for 17track to process the registration
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Step 2: Fetch tracking info
    const response = await fetch("https://api.17track.net/track/v2.2/gettrackinfo", {
      method: "POST",
      headers: {
        "17token": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{
        number: trackingNumber
      }]),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("17track API error:", response.status, errorText);
      return res.status(response.status).json({
        error: "Failed to fetch tracking information",
        details: errorText
      });
    }

    const data = await response.json();

    // Log the response for debugging
    console.log("17track API response:", JSON.stringify(data, null, 2));

    res.json(data);
  } catch (error) {
    console.error("Error fetching tracking info:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch tracking information"
    });
  }
});

/**
 * Register a tracking number with 17track
 * POST /tracking/register
 * Body: { trackingNumber: string, carrier?: number }
 */
app.post("/tracking/register", async (req: Request, res: Response) => {
  try {
    const { trackingNumber, carrier } = req.body;
    const apiKey = process.env.SEVENTEENTRACK_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "17track API key not configured" });
    }

    if (!trackingNumber) {
      return res.status(400).json({ error: "Tracking number is required" });
    }

    const payload: any = { number: trackingNumber };
    if (carrier) {
      payload.carrier = carrier;
    }

    // Register tracking number with 17track
    const response = await fetch("https://api.17track.net/track/v2.2/register", {
      method: "POST",
      headers: {
        "17token": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([payload]),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("17track register API error:", response.status, errorText);
      return res.status(response.status).json({
        error: "Failed to register tracking number",
        details: errorText
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error registering tracking number:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to register tracking number"
    });
  }
});

/**
 * Get tracking info for multiple packages
 * POST /tracking/batch
 * Body: { trackingNumbers: string[] }
 */
app.post("/tracking/batch", async (req: Request, res: Response) => {
  try {
    const { trackingNumbers } = req.body;
    const apiKey = process.env.SEVENTEENTRACK_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "17track API key not configured" });
    }

    if (!trackingNumbers || !Array.isArray(trackingNumbers)) {
      return res.status(400).json({ error: "trackingNumbers array is required" });
    }

    const payload = trackingNumbers.map(number => ({ number }));

    // Call 17track API for batch tracking
    const response = await fetch("https://api.17track.net/track/v2.2/gettrackinfo", {
      method: "POST",
      headers: {
        "17token": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("17track batch API error:", response.status, errorText);
      return res.status(response.status).json({
        error: "Failed to fetch batch tracking information",
        details: errorText
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching batch tracking info:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch batch tracking information"
    });
  }
});

/**
 * AI Draft Functionality with Tool Access
 * POST /conversations/:id/draft
 *
 * NOTE: Knowledge base is now loaded dynamically from the database
 * Categories used: 'general' and 'draft-reply'
 * Only active entries are included
 */

app.post("/conversations/:id/draft", async (req: Request, res: Response) => {
  // Increase timeout to 5 minutes for AI processing
  req.setTimeout(300000); // 5 minutes
  res.setTimeout(300000);

  const startTime = Date.now();

  try {
    const conversationId = req.params.id;
    const forceRegenerate = req.body?.forceRegenerate === true;
    const additionalContext = req.body?.additionalContext || null;
    console.log(`[Draft] Starting draft generation for conversation ${conversationId} (forceRegenerate: ${forceRegenerate}, hasAdditionalContext: ${!!additionalContext})`);

    // Check if draft already exists and return it unless forceRegenerate is true OR custom context is provided
    // IMPORTANT: If custom context is provided, we must always regenerate to include that context
    if (!forceRegenerate && !additionalContext) {
      const existingDraft = await prisma.draftResponse.findUnique({
        where: { conversationId }
      });

      if (existingDraft) {
        // Detect old drafts with URL filtering artifacts and force regeneration
        const hasOldUrlFiltering = existingDraft.draft && (
          existingDraft.draft.includes('[URL removed') ||
          existingDraft.draft.includes('[url removed') ||
          existingDraft.draft.includes('not in knowledge base')
        );

        if (hasOldUrlFiltering) {
          console.log(`[Draft] Detected old draft with URL filtering artifacts, forcing regeneration`);
          // Skip cache and continue to generate new draft
        } else {
          console.log(`[Draft] Returning existing draft for conversation ${conversationId}`);

          // Handle old data format: convert string actionSteps to array if needed
          let actionSteps = existingDraft.actionSteps;
          if (actionSteps && typeof actionSteps === 'string') {
            // Old format: string with newlines - convert to array
            actionSteps = (actionSteps as string).split('\n').filter(s => s.trim());
            console.log(`[Draft] Converted old string actionSteps to array format`);
          }

          return res.json({
            internalReasoning: existingDraft.internalReasoning,
            tags: existingDraft.tags,
            category: existingDraft.category,
            reasoning: existingDraft.reasoning,
            shouldDraft: existingDraft.shouldDraft,
            draft: existingDraft.draft,
            actionSteps: actionSteps,
            orderInfo: existingDraft.orderInfo,
            conversationId,
            fromDatabase: true,
            createdAt: existingDraft.createdAt,
            updatedAt: existingDraft.updatedAt,
            customInstructions: (existingDraft as any).customInstructions || null,
            usedCustomContext: !!((existingDraft as any).customInstructions)
          });
        }
      }
    }

    // Load knowledge base from database (general + draft-reply categories, active only)
    let knowledgeBaseText = "";
    try {
      const knowledgeBase = await prisma.knowledgeBase.findMany({
        where: {
          active: true,
          OR: [
            { category: "general" },
            { category: "draft-reply" }
          ]
        },
        orderBy: { createdAt: "asc" }
      });

      if (knowledgeBase.length > 0) {
        knowledgeBaseText = knowledgeBase
          .map(kb => {
            const categoryLabel = kb.category === "general" ? "[GENERAL]" : "[DRAFT-SPECIFIC]";
            return `${categoryLabel} ${kb.title}\n\n${kb.content}`;
          })
          .join("\n\n---\n\n");
        console.log(`[Draft] Loaded ${knowledgeBase.length} knowledge base entries from database`);
      } else {
        console.log(`[Draft] No active knowledge base entries found, using fallback`);
        // Fallback to basic knowledge if database is empty
        knowledgeBaseText = "No knowledge base entries configured. Please add entries in the Knowledge Base management page.";
      }
    } catch (error) {
      console.error("[Draft] Error loading knowledge base:", error);
      knowledgeBaseText = "Error loading knowledge base. Using basic guidelines.";
    }

    // Fetch conversation with all messages
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: true,
        messages: {
          orderBy: { sentAt: "asc" },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Build email thread context
    const emailThread = conversation.messages.map((msg: any) => {
      // Use bodyText (plain text) if it has content, otherwise fall back to bodyHtml
      // Check for empty/whitespace-only strings, not just falsy values
      const bodyText = msg.bodyText?.trim();
      const bodyHtml = msg.bodyHtml?.trim();
      const body = bodyText || bodyHtml || "[No message body]";

      return {
        from: msg.direction === "inbound" ? conversation.customer?.primaryEmail : "support@outlight.us",
        direction: msg.direction,
        date: msg.sentAt,
        subject: msg.subject || conversation.subject,
        body: body,
      };
    });

    // Identify the LATEST inbound message (the one we need to respond to)
    const inboundMessages = emailThread.filter(msg => msg.direction === "inbound");
    const latestInboundMessage = inboundMessages.length > 0 ? inboundMessages[inboundMessages.length - 1] : null;

    // Define tools for AI to use
    const tools = [
      {
        type: "function",
        function: {
          name: "search_customer_and_orders",
          description: "Search for a Shopify customer and their orders by email, name, or order number. Returns customer details and all their orders. Use this FIRST before analyzing the email.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Email address, customer name, or order number (e.g., 'john@example.com', 'John Smith', '1001', or '#1001')"
              }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_tracking_info",
          description: "Get detailed tracking information for a package using 17track. Returns tracking status, location, and timeline.",
          parameters: {
            type: "object",
            properties: {
              tracking_number: {
                type: "string",
                description: "The tracking number from the order fulfillment"
              }
            },
            required: ["tracking_number"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_product",
          description: "Search the Product Knowledge Base for detailed product information. CRITICAL: Use this tool in TWO scenarios: (1) When a customer mentions a product name, SKU, or asks product-specific questions, and (2) AFTER calling search_customer_and_orders, ALWAYS search for EVERY product found in the order's line_items to get product-specific shipping times, care instructions, warranties, specifications, and FAQs. Returns comprehensive product data that OVERRIDES general policies.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Product name, SKU, or search keywords. Examples: 'Widget Pro', 'WGT001', 'blue widget'. IMPORTANT: After getting order data, search for each product title from line_items (e.g., if line_items contains 'York Pendant Light', search for 'York' or 'York Pendant Light')."
              }
            },
            required: ["query"]
          }
        }
      }
    ];

    // Build system prompt with optional additional context
    let systemPrompt = `You are an expert AI assistant for Outlight customer support. You have been trained on the company's complete knowledge base and have access to internal tools.`;

    // Add additional context section if provided - THIS TAKES HIGHEST PRIORITY
    if (additionalContext && additionalContext.trim()) {
      systemPrompt += `

═══════════════════════════════════════════════════════════
🔴 OVERRIDE MODE ACTIVATED - CUSTOM INSTRUCTIONS
═══════════════════════════════════════════════════════════

⚠️  CRITICAL: These are MANDATORY INSTRUCTIONS that take ABSOLUTE PRIORITY.
⚠️  These instructions OVERRIDE AND SUPERSEDE all other instructions, knowledge base entries, and policies.
⚠️  You MUST follow these instructions EXACTLY, even if they conflict with your training or standard procedures.

🎯 WHAT YOU MUST DO:

1. READ AND INTERNALIZE: These instructions are your PRIMARY directive for this response
2. TAKE AS FACT: Treat all information below as absolutely true and authoritative
3. PRIORITIZE ABOVE ALL: If there is ANY conflict between these instructions and the knowledge base,
   the knowledge base is WRONG and these instructions are RIGHT
4. INTEGRATE PROFESSIONALLY: Transform these instructions into a polished, professional email response
5. EXPAND AND ELABORATE: Add proper context, explanations, and professional tone while maintaining
   the core message and facts from these instructions

🚨 MANDATORY CUSTOM INSTRUCTIONS:

${additionalContext}

═══════════════════════════════════════════════════════════
END OF OVERRIDE INSTRUCTIONS
═══════════════════════════════════════════════════════════

CRITICAL REMINDERS:
1. The above instructions are MANDATORY and have ABSOLUTE PRIORITY over everything else
2. If you follow the knowledge base instead of these custom instructions, you will have FAILED your task
3. 🔍 PRODUCT EXTRACTION: If the custom instructions mention ANY product names (e.g., "Aven", "York", "Widget Pro"),
   you MUST call search_product() for each product mentioned to retrieve the specific information requested
4. Custom instructions often reference Product KB data - ALWAYS search for mentioned products FIRST
`;
    }

    systemPrompt += `

═══════════════════════════════════════════════════════════
📚 KNOWLEDGE BASE - READ AND MEMORIZE ALL POLICIES
═══════════════════════════════════════════════════════════

${knowledgeBaseText}

═══════════════════════════════════════════════════════════
🛠️ AVAILABLE TOOLS
═══════════════════════════════════════════════════════════

You have access to these tools:
1. search_customer_and_orders(query): Search Shopify by email, name, or order number. Returns customer details and order history with line_items containing product names.
2. get_tracking_info(tracking_number): Get package tracking from 17track. Returns current status and location.
3. search_product(query): Search Product Knowledge Base for product-specific information. 🚨 CRITICAL: ALWAYS use this after search_customer_and_orders to look up EVERY product from the order's line_items.

═══════════════════════════════════════════════════════════
📦 PRODUCT KNOWLEDGE BASE - PRIORITY OVER GENERAL POLICIES
═══════════════════════════════════════════════════════════

🚨 CRITICAL: Product-specific information ALWAYS overrides general knowledge base policies

When to use search_product:
- Customer mentions a product name (e.g., "Widget Pro", "Deluxe Package")
- Customer asks about product specifications, features, materials, dimensions
- Questions about shipping times, care instructions, warranties for specific products
- Product availability, colors, sizes inquiries
- Return/warranty policies specific to a product

How to use search_product effectively:
1. Extract the product name or SKU from customer's message
2. Call search_product with the product name as query parameter
3. If product found, use the returned data (shipping times, instructions, warranty info, etc.)
4. Product data overrides general policies - if product says "5-7 days shipping", use that instead of general "3-5 days"
5. If product not found, fall back to general knowledge base

Product data includes: name, SKU, description, specifications, features, price, availability, shipping times, care instructions, warranty info, return policy, FAQs, and more.

═══════════════════════════════════════════════════════════
⚡ WORKFLOW - EXECUTE IN THIS EXACT ORDER
═══════════════════════════════════════════════════════════

Step 1: READ THE EMAIL THREAD AND IDENTIFY LATEST MESSAGE
- ⚠️  CRITICAL: Your draft must RESPOND TO THE LATEST INBOUND MESSAGE (the most recent customer email)
- Read the full thread for context, but your response addresses the LATEST message
- Understand the customer's issue, tone, and urgency in their MOST RECENT message
- Extract: customer email, order numbers, tracking numbers, dates mentioned, PRODUCT NAMES

Step 2: GATHER DATA USING TOOLS (CRITICAL - FOLLOW EXACTLY)
- FIRST: Call search_customer_and_orders with customer email or order number
- SECOND: 🚨 MANDATORY: Extract ALL product names from the order's line_items (each item has a "title" field)
- THIRD: 🚨 MANDATORY: For EVERY product found in line_items, call search_product(product_name)
  * Example: If line_items contains [{"title": "York Pendant Light"}, {"title": "Aven Wall Sconce"}]
  * You MUST call: search_product("York") AND search_product("Aven")
  * Do NOT skip this step - product-specific data is CRITICAL for accurate responses
- FOURTH: If customer mentions a product name in their email, also call search_product for that
- FIFTH: If tracking numbers exist in the order data, call get_tracking_info
- Collect ALL necessary information before proceeding to analysis

Step 3: ANALYZE WITH KNOWLEDGE BASE AND PRODUCT DATA
- 🚨 PRIORITY ORDER - USE DATA IN THIS EXACT ORDER:
  1. FIRST: Product Knowledge Base data (from search_product tool) - HIGHEST PRIORITY
  2. SECOND: General Knowledge Base policies
  3. THIRD: Shopify order data (only for order details, NOT for product info)

- Product KB ALWAYS overrides everything else for product-specific information
- If Product KB has shipping time, warranty, care instructions, etc. - use ONLY that data, ignore Shopify
- Match the issue to knowledge base categories
- Apply ALL relevant policies (return windows, refund timelines, etc.)
- Calculate dates carefully (30 days from DELIVERY, not order date)

Step 4: DECIDE: DRAFT or ACTION STEPS
- shouldDraft = true: Customer needs an email response (returns, order status, damaged items, etc.)
- shouldDraft = false: Internal action needed (chargebacks, non-support, escalations)

Step 5: GENERATE RESPONSE
- For drafts: Write complete, ready-to-send email using customer's first name
  * CRITICAL: ANSWER THE CUSTOMER'S SPECIFIC QUESTION
  * If they ask "when will it be delivered?", provide delivery date or estimate
  * If they ask about tracking, provide tracking status and link
  * Don't give generic responses - address their exact question directly
- For action steps: Provide clear numbered steps for the support agent
- Include ALL relevant order info (order ID, dates, return window status)

═══════════════════════════════════════════════════════════
🚨 CRITICAL REQUIREMENTS
═══════════════════════════════════════════════════════════

✅ USE TOOLS FIRST: Always gather data before drafting
✅ FOLLOW POLICIES: Apply knowledge base rules exactly
✅ LINK POLICY - CRITICAL ENFORCEMENT:
   ❌ NEVER hardcode or invent URLs
   ❌ NEVER guess URL patterns or formats
   ❌ ONLY use URLs that appear EXACTLY as written in the knowledge base articles
   ❌ If a URL is not explicitly mentioned in the knowledge base, DO NOT use it
   ❌ If you need tracking links, ONLY use the format specified in knowledge base
   ❌ NEVER include generic domain links, contact pages, or other URLs not in KB

   ✅ If you need to reference something without a KB-approved URL, use text only: "visit our website" or "contact support"
✅ DATE MATH: For returns, count 30 days from DELIVERY date
✅ PERSONALIZE: Use customer's first name in drafts
✅ BE SPECIFIC: Include exact order numbers (#1234), dates (YYYY-MM-DD)
✅ JSON ONLY: Your final response must be PURE JSON - no markdown, no code blocks, no explanations

═══════════════════════════════════════════════════════════
📋 OUTPUT FORMAT (STRICT JSON)
═══════════════════════════════════════════════════════════

When drafting an email (shouldDraft = true):
{
  "internalReasoning": "Step-by-step internal analysis",
  "tags": ["order-status", "return"],
  "category": "order-status",
  "reasoning": "Customer asking about delayed shipment on order #4025",
  "shouldDraft": true,
  "draft": "Hi [FirstName],\\n\\nThank you for reaching out...\\n\\nBest regards,\\nOutlight Support",
  "actionSteps": null,
  "orderInfo": {
    "orderId": "#4025",
    "orderDate": "2025-10-04",
    "deliveryDate": "2025-10-15",
    "isWithinReturnWindow": true
  }
}

When providing action steps (shouldDraft = false):
{
  "internalReasoning": "Chargeback detected, requires admin escalation",
  "tags": ["chargeback"],
  "category": "chargeback",
  "reasoning": "Bank dispute - DO NOT respond to customer",
  "shouldDraft": false,
  "draft": null,
  "actionSteps": [
    "Tag conversation as 'chargeback'",
    "Escalate to admin immediately",
    "Gather order documentation for dispute",
    "DO NOT contact customer directly"
  ],
  "orderInfo": {
    "orderId": "#3891",
    "orderDate": "2025-09-20",
    "deliveryDate": "2025-09-28",
    "isWithinReturnWindow": false
  }
}`;

    // Initial AI call with function calling
    const messages: any[] = [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `You are now analyzing a customer support email thread. Follow the workflow exactly:
${additionalContext && additionalContext.trim() ? `

═══════════════════════════════════════════════════════════
🚨 REMINDER: CUSTOM INSTRUCTIONS ARE IN EFFECT
═══════════════════════════════════════════════════════════

BEFORE YOU PROCEED: Remember that custom instructions have been provided in the system prompt
that OVERRIDE all knowledge base policies and standard procedures. You MUST follow those
custom instructions as your PRIMARY directive when drafting your response.

Custom Instructions Summary: Present and active - prioritize above all else
═══════════════════════════════════════════════════════════

` : ''}
${latestInboundMessage ? `
═══════════════════════════════════════════════════════════
🎯 LATEST MESSAGE TO RESPOND TO (MOST RECENT FROM CUSTOMER):
═══════════════════════════════════════════════════════════
From: ${latestInboundMessage.from}
Date: ${latestInboundMessage.date}
Subject: ${latestInboundMessage.subject}

${latestInboundMessage.body}

⚠️  YOUR DRAFT MUST RESPOND TO THIS LATEST MESSAGE ABOVE ⚠️
` : ''}

═══════════════════════════════════════════════════════════
📧 FULL EMAIL THREAD (FOR CONTEXT):
═══════════════════════════════════════════════════════════
${JSON.stringify(emailThread, null, 2)}

═══════════════════════════════════════════════════════════
👤 CUSTOMER INFO:
═══════════════════════════════════════════════════════════
${conversation.customer ? `Name: ${conversation.customer.name}, Email: ${conversation.customer.primaryEmail}` : 'Unknown customer'}

Remember:
1. ${latestInboundMessage ? '⚠️  RESPOND TO THE LATEST MESSAGE SHOWN ABOVE - not the first message in the thread' : 'Read all messages'}
2. Use search_customer_and_orders to get order data
3. Use get_tracking_info if needed
4. Apply knowledge base policies
5. Return ONLY pure JSON (no markdown, no code blocks)`
      }
    ];

    let finalResult: any = null;
    let toolCallCount = 0;
    const MAX_TOOL_CALLS = 5;

    // Tool calling loop
    while (toolCallCount < MAX_TOOL_CALLS) {
      console.log(`[Draft] Tool call iteration ${toolCallCount + 1}/${MAX_TOOL_CALLS}`);

      // Use tools parameter for function calling phase
      const completionParams: any = {
        model: "gpt-5-mini-2025-08-07", // Faster, more cost-efficient version of GPT-5
        messages,
        // Note: GPT-5 mini supports default temperature (1)
      };

      // Only add tools if we haven't finished calling them
      if (toolCallCount < MAX_TOOL_CALLS) {
        completionParams.tools = tools;
        completionParams.tool_choice = "auto";
      } else {
        // Force JSON output on final response
        completionParams.response_format = { type: "json_object" };
      }

      const apiCallStart = Date.now();
      console.log(`[Draft] Making OpenAI API call (attempt ${toolCallCount + 1}, elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
      const completion = await openai.chat.completions.create(completionParams);
      console.log(`[Draft] API call completed in ${((Date.now() - apiCallStart) / 1000).toFixed(1)}s`);
      const assistantMessage = completion.choices[0].message;
      messages.push(assistantMessage);

      // Check if AI wants to call a tool
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        toolCallCount++;
        console.log(`[Draft] Executing ${assistantMessage.tool_calls.length} tool call(s)`);

        // Execute each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          const functionName = (toolCall as any).function.name;
          const functionArgs = JSON.parse((toolCall as any).function.arguments);
          console.log(`[Draft] Calling function: ${functionName}`, functionArgs);

          let toolResult: any = null;

          if (functionName === "search_customer_and_orders") {
            try {
              toolResult = await shopify.searchCustomerAndOrders(functionArgs.query);
              console.log(`[Draft] Shopify search result:`, toolResult.searchType);
            } catch (error) {
              console.error(`[Draft] Shopify search error:`, error);
              toolResult = { error: "Failed to search Shopify", details: String(error) };
            }
          } else if (functionName === "get_tracking_info") {
            try {
              // Register and fetch tracking from 17track
              const registerResponse = await fetch("https://api.17track.net/track/v2.2/register", {
                method: "POST",
                headers: {
                  "17token": process.env.SEVENTEENTRACK_API_KEY || "",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify([{ number: functionArgs.tracking_number }]),
              });

              // Wait a moment then fetch tracking info
              await new Promise(resolve => setTimeout(resolve, 1000));

              const trackResponse = await fetch("https://api.17track.net/track/v2.2/gettrackinfo", {
                method: "POST",
                headers: {
                  "17token": process.env.SEVENTEENTRACK_API_KEY || "",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify([{ number: functionArgs.tracking_number }]),
              });

              toolResult = await trackResponse.json();
              console.log(`[Draft] 17track result received`);
            } catch (error) {
              console.error(`[Draft] 17track error:`, error);
              toolResult = { error: "Failed to fetch tracking", details: String(error) };
            }
          } else if (functionName === "search_product") {
            try {
              // Search Product Knowledge Base with multiple strategies
              const queryLower = functionArgs.query.toLowerCase().trim();
              const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2); // Extract significant words

              // Strategy 1: Try exact and partial name/SKU matching first
              let products = await prisma.product.findMany({
                where: {
                  workspaceId: conversation.workspaceId,
                  status: 'active',
                  OR: [
                    { name: { contains: functionArgs.query, mode: 'insensitive' } },
                    { sku: { contains: functionArgs.query, mode: 'insensitive' } },
                    { aiSearchKeywords: { has: queryLower } },
                    { tags: { has: queryLower } },
                    { description: { contains: functionArgs.query, mode: 'insensitive' } },
                    // Also try matching variant titles if they exist
                    { variants: { array_contains: [{ title: queryLower }] } }
                  ]
                },
                take: 5,
                orderBy: { name: 'asc' }
              });

              // Strategy 2: If no results and query has multiple words, try searching by individual words
              if (products.length === 0 && queryWords.length > 0) {
                console.log(`[Draft] Product search: No exact matches for "${functionArgs.query}", trying word-based search with words:`, queryWords);

                // Build OR conditions for each significant word
                const wordConditions = queryWords.flatMap(word => [
                  { name: { contains: word, mode: 'insensitive' as const } },
                  { description: { contains: word, mode: 'insensitive' as const } },
                  { aiSearchKeywords: { has: word } },
                  { tags: { has: word } }
                ]);

                products = await prisma.product.findMany({
                  where: {
                    workspaceId: conversation.workspaceId,
                    status: 'active',
                    OR: wordConditions
                  },
                  take: 5,
                  orderBy: { name: 'asc' }
                });
              }

              if (products.length === 0) {
                toolResult = {
                  found: false,
                  message: `No products found matching "${functionArgs.query}". This product may not be in the Product Knowledge Base yet. IMPORTANT: You should still help the customer using the Shopify order data and general knowledge base. If the customer is asking for product specifications (bulb type, voltage, dimensions, etc.), acknowledge that specific product documentation is not available and ask the customer to provide any details from their order confirmation or product packaging, OR offer to send detailed specifications separately.`,
                  query: functionArgs.query,
                  searchedWords: queryWords
                };
                console.log(`[Draft] Product search: No results for "${functionArgs.query}" (searched words: ${queryWords.join(', ')})`);
              } else {
                // Format for AI consumption - only include relevant fields
                const formattedProducts = products.map(p => ({
                  name: p.name,
                  sku: p.sku,
                  category: p.category,
                  description: p.description,
                  specifications: p.specifications,
                  features: p.features,
                  price: p.price,
                  variants: p.variants, // Include variants with different prices
                  availabilityStatus: p.availabilityStatus,
                  shippingTime: p.shippingTime,
                  shippingRestrictions: p.shippingRestrictions,
                  instructions: p.instructions,
                  careInstructions: p.careInstructions,
                  warrantyInfo: p.warrantyInfo,
                  returnPolicy: p.returnPolicy,
                  faqs: p.faqs
                }));

                toolResult = {
                  found: true,
                  products: formattedProducts,
                  count: products.length,
                  message: `Found ${products.length} product(s) matching "${functionArgs.query}". SUCCESS! Use this product-specific data (shipping times, instructions, specifications, warranty, FAQs) - it OVERRIDES general knowledge base policies. Product names found: ${products.map(p => p.name).join(', ')}`
                };
                console.log(`[Draft] Product search: ✅ Found ${products.length} product(s) for "${functionArgs.query}":`, products.map(p => p.name).join(', '));
              }
            } catch (error) {
              console.error(`[Draft] Product search error:`, error);
              toolResult = {
                error: "Failed to search products",
                details: String(error),
                message: "Product search failed. Use general knowledge base."
              };
            }
          }

          // Add tool result to messages
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult)
          });
        }

        // Continue loop to get next response
        continue;
      } else {
        // No more tool calls - AI is done, parse the final response
        console.log(`[Draft] AI finished, parsing final response`);
        try {
          finalResult = JSON.parse(assistantMessage.content || "{}");
          console.log(`[Draft] Successfully parsed JSON result`);
        } catch (error) {
          console.error(`[Draft] JSON parse error:`, error);
          console.error(`[Draft] Raw content:`, assistantMessage.content);
          // If not JSON, wrap it
          finalResult = {
            reasoning: assistantMessage.content,
            error: "AI did not return valid JSON"
          };
        }
        break;
      }
    }

    // If we hit max iterations without getting a final result, make one more call with JSON mode
    if (!finalResult && toolCallCount >= MAX_TOOL_CALLS) {
      console.log(`[Draft] Max tool calls reached (elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s), requesting final JSON response`);
      messages.push({
        role: "user",
        content: "Please provide the final response in the required JSON format."
      });

      const finalApiCallStart = Date.now();
      const finalCompletion = await openai.chat.completions.create({
        model: "gpt-5-mini-2025-08-07", // Faster, more cost-efficient version of GPT-5
        messages,
        response_format: { type: "json_object" }
      });
      console.log(`[Draft] Final API call completed in ${((Date.now() - finalApiCallStart) / 1000).toFixed(1)}s`);

      try {
        finalResult = JSON.parse(finalCompletion.choices[0].message.content || "{}");
      } catch (error) {
        console.error(`[Draft] Final JSON parse error:`, error);
        finalResult = {
          reasoning: "Failed to generate proper response",
          error: "Maximum iterations reached without valid JSON"
        };
      }
    }

    // Update conversation tags if new tags were added
    if (finalResult.tags && finalResult.tags.length > 0) {
      const uniqueTags = Array.from(new Set([...(conversation.tags || []), ...finalResult.tags]));
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { tags: uniqueTags },
      });
    }

    // Save draft to database for persistence
    try {
      await prisma.draftResponse.upsert({
        where: { conversationId },
        create: {
          conversationId,
          internalReasoning: finalResult.internalReasoning || null,
          tags: finalResult.tags || [],
          category: finalResult.category || null,
          reasoning: finalResult.reasoning || null,
          shouldDraft: finalResult.shouldDraft || false,
          draft: finalResult.draft || null,
          actionSteps: finalResult.actionSteps || null,
          orderInfo: finalResult.orderInfo || null,
          customInstructions: additionalContext || null
        },
        update: {
          internalReasoning: finalResult.internalReasoning || null,
          tags: finalResult.tags || [],
          category: finalResult.category || null,
          reasoning: finalResult.reasoning || null,
          shouldDraft: finalResult.shouldDraft || false,
          draft: finalResult.draft || null,
          actionSteps: finalResult.actionSteps || null,
          orderInfo: finalResult.orderInfo || null,
          customInstructions: additionalContext || null
        }
      });
      console.log(`[Draft] Saved draft to database for conversation ${conversationId}${additionalContext ? ' (with custom instructions)' : ''}`);
    } catch (error) {
      console.error("[Draft] Error saving draft to database:", error);
      // Don't fail the request if draft save fails
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Draft] ✅ Draft generation completed in ${totalTime}s (${toolCallCount} tool calls)`);

    res.json({
      ...finalResult,
      conversationId,
      processingTime: new Date().toISOString(),
      toolCallsMade: toolCallCount,
      fromDatabase: false,
      usedCustomContext: !!(additionalContext && additionalContext.trim())
    });
  } catch (error) {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[Draft] ❌ Error generating draft after ${totalTime}s:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to generate draft"
    });
  }
});

// Delete draft endpoint
app.delete("/conversations/:id/draft", async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.id;
    console.log(`[Draft] Deleting draft for conversation ${conversationId}`);

    await prisma.draftResponse.delete({
      where: { conversationId }
    });

    console.log(`[Draft] Successfully deleted draft for conversation ${conversationId}`);
    res.json({ success: true, message: "Draft deleted successfully" });
  } catch (error) {
    // Draft might not exist, which is fine
    if ((error as any).code === 'P2025') {
      console.log(`[Draft] No draft found to delete for conversation ${req.params.id}`);
      res.json({ success: true, message: "No draft found to delete" });
    } else {
      console.error("Error deleting draft:", error);
      res.status(500).json({ error: "Failed to delete draft" });
    }
  }
});

// ============================================================================
// STANDALONE DRAFT ENDPOINTS - External Email Draft Tool
// ============================================================================

// Get all standalone drafts (with pagination and filtering)
app.get("/standalone-drafts", async (req: Request, res: Response) => {
  try {
    const { page = "1", limit = "50", status } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (status && typeof status === 'string') {
      where.status = status;
    }

    const [drafts, total] = await Promise.all([
      prisma.standaloneDraft.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.standaloneDraft.count({ where }),
    ]);

    res.json({
      drafts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching standalone drafts:", error);
    res.status(500).json({ error: "Failed to fetch drafts" });
  }
});

// Get single standalone draft
app.get("/standalone-drafts/:id", async (req: Request, res: Response) => {
  try {
    const draft = await prisma.standaloneDraft.findUnique({
      where: { id: req.params.id },
    });

    if (!draft) {
      return res.status(404).json({ error: "Draft not found" });
    }

    res.json(draft);
  } catch (error) {
    console.error("Error fetching standalone draft:", error);
    res.status(500).json({ error: "Failed to fetch draft" });
  }
});

// Create new standalone draft and generate AI response
app.post("/standalone-drafts", async (req: Request, res: Response) => {
  try {
    const { subject, emailBody, contextNotes, customInstructions } = req.body;

    if (!subject || !emailBody) {
      return res.status(400).json({ error: "Subject and emailBody are required" });
    }

    // Create draft record with pending status
    const draft = await prisma.standaloneDraft.create({
      data: {
        subject,
        emailBody,
        contextNotes: contextNotes || null,
        customInstructions: customInstructions || null,
        status: "pending",
      },
    });

    // Return immediately with pending status
    res.json(draft);

    // Process in background (don't await - allows concurrent processing)
    processStandaloneDraft(draft.id).catch(error => {
      console.error(`[StandaloneDraft ${draft.id}] Background processing failed:`, error);
    });

  } catch (error) {
    console.error("Error creating standalone draft:", error);
    res.status(500).json({ error: "Failed to create draft" });
  }
});

// Regenerate standalone draft
app.post("/standalone-drafts/:id/regenerate", async (req: Request, res: Response) => {
  try {
    const draft = await prisma.standaloneDraft.findUnique({
      where: { id: req.params.id },
    });

    if (!draft) {
      return res.status(404).json({ error: "Draft not found" });
    }

    // Reset to pending status
    const updated = await prisma.standaloneDraft.update({
      where: { id: draft.id },
      data: {
        status: "pending",
        error: null,
        draft: null,
        internalReasoning: null,
        tags: [],
        category: null,
        reasoning: null,
        actionSteps: null,
        orderInfo: null,
        processingTime: null,
        toolCallsMade: null,
        completedAt: null,
      },
    });

    res.json(updated);

    // Process in background
    processStandaloneDraft(draft.id).catch(error => {
      console.error(`[StandaloneDraft ${draft.id}] Regeneration failed:`, error);
    });

  } catch (error) {
    console.error("Error regenerating standalone draft:", error);
    res.status(500).json({ error: "Failed to regenerate draft" });
  }
});

// Delete standalone draft
app.delete("/standalone-drafts/:id", async (req: Request, res: Response) => {
  try {
    await prisma.standaloneDraft.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true, message: "Draft deleted successfully" });
  } catch (error) {
    if ((error as any).code === 'P2025') {
      return res.status(404).json({ error: "Draft not found" });
    }
    console.error("Error deleting standalone draft:", error);
    res.status(500).json({ error: "Failed to delete draft" });
  }
});

// Background processing function for standalone drafts
async function processStandaloneDraft(draftId: string) {
  const startTime = Date.now();
  let toolCallCount = 0;

  try {
    console.log(`[StandaloneDraft ${draftId}] Starting processing...`);

    // Mark as processing
    await prisma.standaloneDraft.update({
      where: { id: draftId },
      data: { status: "processing" },
    });

    // Get the draft
    const draft = await prisma.standaloneDraft.findUnique({
      where: { id: draftId },
    });

    if (!draft) {
      throw new Error("Draft not found");
    }

    // Load knowledge base (same as conversation drafts)
    const knowledgeBase = await prisma.knowledgeBase.findMany({
      where: {
        active: true,
        OR: [
          { category: "general" },
          { category: "draft-reply" },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    let knowledgeBaseText = "";
    if (knowledgeBase.length > 0) {
      knowledgeBaseText = knowledgeBase
        .map(kb => {
          const categoryLabel = kb.category === "general" ? "[GENERAL]" : "[DRAFT-SPECIFIC]";
          return `${categoryLabel} ${kb.title}\n\n${kb.content}`;
        })
        .join("\n\n---\n\n");
    }

    // Build system prompt (identical to conversation draft for consistency)
    let systemPrompt = `You are an expert AI assistant for Outlight customer support. You have been trained on the company's complete knowledge base and have access to internal tools.

═══════════════════════════════════════════════════════════
📧 EMAIL INFORMATION
═══════════════════════════════════════════════════════════

Subject: ${draft.subject}

Email Body:
${draft.emailBody}

${draft.contextNotes ? `Additional Context/Notes:\n${draft.contextNotes}\n` : ''}
`;

    // Add custom instructions if provided (HIGHEST PRIORITY)
    if (draft.customInstructions && draft.customInstructions.trim()) {
      systemPrompt += `

═══════════════════════════════════════════════════════════
🔴 CRITICAL: CUSTOM CONTEXT & GUIDANCE - HIGHEST PRIORITY
═══════════════════════════════════════════════════════════

⚠️  IMPORTANT: The information below is CONTEXTUAL GUIDANCE to help you craft a better response.
⚠️  DO NOT copy or insert this text directly into the email.
⚠️  USE this information to inform your response, expand on it, and integrate it professionally.
⚠️  This context OVERRIDES any conflicting knowledge base information.

WHAT TO DO WITH THIS INFORMATION:
• Read and understand the context provided below
• Use it to inform your draft response
• Expand on any brief points with full, professional explanations
• Integrate the information naturally into your email
• Add appropriate context, tone, and professionalism
• DO NOT treat this as raw email content to paste

CUSTOM CONTEXT PROVIDED:
${draft.customInstructions}

═══════════════════════════════════════════════════════════
END OF CUSTOM CONTEXT
═══════════════════════════════════════════════════════════

CRITICAL REMINDERS:
1. The above context is GUIDANCE - craft a professional email using this information as your source of truth
2. This context OVERRIDES any conflicting knowledge base information
3. 🔍 PRODUCT EXTRACTION: If the custom context mentions ANY product names (e.g., "Aven", "York", "Widget Pro"),
   you MUST call search_product() for each product mentioned to retrieve the specific information requested
4. Custom context often references Product KB data - ALWAYS search for mentioned products FIRST
`;
    }

    // Add knowledge base
    if (knowledgeBaseText) {
      systemPrompt += `

═══════════════════════════════════════════════════════════
📚 KNOWLEDGE BASE - READ AND MEMORIZE ALL POLICIES
═══════════════════════════════════════════════════════════

${knowledgeBaseText}

═══════════════════════════════════════════════════════════
END OF KNOWLEDGE BASE
═══════════════════════════════════════════════════════════
`;
    }

    // Add available tools section
    systemPrompt += `

═══════════════════════════════════════════════════════════
🛠️ AVAILABLE TOOLS
═══════════════════════════════════════════════════════════

You have access to these tools:
1. search_customer_and_orders(query): Search Shopify by email, name, or order number. Returns customer details and order history with line_items containing product names.
2. get_tracking_info(tracking_number): Get package tracking from 17track. Returns current status and location.
3. search_product(query): Search Product Knowledge Base for product-specific information. 🚨 CRITICAL: ALWAYS use this after search_customer_and_orders to look up EVERY product from the order's line_items.

═══════════════════════════════════════════════════════════
📦 PRODUCT KNOWLEDGE BASE - PRIORITY OVER GENERAL POLICIES
═══════════════════════════════════════════════════════════

🚨 CRITICAL: Product-specific information ALWAYS overrides general knowledge base policies

When to use search_product:
- Customer mentions a product name (e.g., "York", "Aven", "Deluxe Package")
- Customer asks about product specifications, features, materials, dimensions
- Questions about shipping times, care instructions, warranties for specific products
- Product availability, colors, sizes inquiries
- MANDATORY: After getting Shopify order data, search for EVERY product in line_items

How to use search_product effectively:
1. Extract product names from order line_items OR customer's email
2. Call search_product with the product name as query parameter
3. If product found, use the returned data (shipping times, instructions, warranty info, specifications, etc.)
4. Product data overrides general policies - if product says "5-7 days shipping", use that instead of general policy
5. If product not found, fall back to general knowledge base

═══════════════════════════════════════════════════════════
⚡ WORKFLOW - EXECUTE IN THIS EXACT ORDER
═══════════════════════════════════════════════════════════

Step 1: READ THE EMAIL
- ⚠️  CRITICAL: Understand what the customer is SPECIFICALLY asking
- Read the email carefully to identify their main question or issue
- Extract: customer email, order numbers, tracking numbers, dates mentioned, PRODUCT NAMES
- Identify the customer's tone and urgency

Step 2: GATHER DATA USING TOOLS (CRITICAL - FOLLOW EXACTLY)
- FIRST: Call search_customer_and_orders with customer email or order number
- SECOND: 🚨 MANDATORY: Extract ALL product names from the order's line_items (each item has a "title" field)
- THIRD: 🚨 MANDATORY: For EVERY product found in line_items, call search_product(product_name)
  * Example: If line_items contains [{"title": "York Pendant Light"}, {"title": "Aven Wall Sconce"}]
  * You MUST call: search_product("York") AND search_product("Aven")
  * Do NOT skip this step - product-specific data is CRITICAL for accurate responses
- FOURTH: If customer mentions a product name in their email, also call search_product for that
- FIFTH: If tracking numbers exist in the order data, call get_tracking_info
- Collect ALL necessary information before proceeding

Step 3: ANALYZE WITH KNOWLEDGE BASE AND PRODUCT DATA
- 🚨 PRIORITY ORDER - USE DATA IN THIS EXACT ORDER:
  1. FIRST: Product Knowledge Base data (from search_product tool) - HIGHEST PRIORITY
  2. SECOND: General Knowledge Base policies
  3. THIRD: Shopify order data (only for order details, NOT for product info)

- Product KB ALWAYS overrides everything else for product-specific information
- If Product KB has shipping time, warranty, care instructions, etc. - use ONLY that data, ignore Shopify
- Match the issue to knowledge base categories
- Apply ALL relevant policies (return windows, refund timelines, etc.)
- Calculate dates carefully (30 days from DELIVERY, not order date)

Step 4: DECIDE: DRAFT or ACTION STEPS
- shouldDraft = true: Customer needs an email response (returns, order status, damaged items, etc.)
- shouldDraft = false: Internal action needed (chargebacks, non-support, escalations)

Step 5: GENERATE RESPONSE
- For drafts: Write complete, ready-to-send email using customer's first name
  * CRITICAL: ANSWER THE CUSTOMER'S SPECIFIC QUESTION
  * If they ask "when will it be delivered?", provide delivery date or estimate
  * If they ask about tracking, provide tracking status and link
  * Don't give generic responses - address their exact question directly
- For action steps: Provide clear numbered steps for the support agent
- Include ALL relevant order info (order ID, dates, return window status)

═══════════════════════════════════════════════════════════
🚨 CRITICAL REQUIREMENTS
═══════════════════════════════════════════════════════════

✅ USE TOOLS FIRST: Always gather data before drafting
✅ FOLLOW POLICIES: Apply knowledge base rules exactly
✅ LINK POLICY - CRITICAL ENFORCEMENT:
   ❌ NEVER hardcode or invent URLs
   ❌ NEVER guess URL patterns or formats
   ❌ ONLY use URLs that appear EXACTLY as written in the knowledge base articles
   ❌ If a URL is not explicitly mentioned in the knowledge base, DO NOT use it
   ❌ If you need tracking links, ONLY use the format specified in knowledge base
   ❌ NEVER include generic domain links, contact pages, or other URLs not in KB

   ✅ If you need to reference something without a KB-approved URL, use text only: "visit our website" or "contact support"
✅ DATE MATH: For returns, count 30 days from DELIVERY date
✅ PERSONALIZE: Use customer's first name in drafts
✅ BE SPECIFIC: Include exact order numbers (#1234), dates (YYYY-MM-DD)
✅ JSON ONLY: Your final response must be PURE JSON - no markdown, no code blocks, no explanations

═══════════════════════════════════════════════════════════
📋 OUTPUT FORMAT (STRICT JSON)
═══════════════════════════════════════════════════════════

When drafting an email (shouldDraft = true):
{
  "internalReasoning": "Step-by-step internal analysis",
  "tags": ["order-status", "return"],
  "category": "order-status",
  "reasoning": "Customer asking about delayed shipment on order #4025",
  "shouldDraft": true,
  "draft": "Hi [FirstName],\\n\\nThank you for reaching out...\\n\\nBest regards,\\nOutlight Support",
  "actionSteps": null,
  "orderInfo": {
    "orderId": "#4025",
    "orderDate": "2025-10-04",
    "deliveryDate": "2025-10-15",
    "isWithinReturnWindow": true
  }
}

When providing action steps (shouldDraft = false):
{
  "internalReasoning": "Chargeback detected, requires admin escalation",
  "tags": ["chargeback"],
  "category": "chargeback",
  "reasoning": "Bank dispute - DO NOT respond to customer",
  "shouldDraft": false,
  "draft": null,
  "actionSteps": [
    "Tag conversation as 'chargeback'",
    "Escalate to admin immediately",
    "Gather order documentation for dispute",
    "DO NOT contact customer directly"
  ],
  "orderInfo": {
    "orderId": "#3891",
    "orderDate": "2025-09-20",
    "deliveryDate": "2025-09-28",
    "isWithinReturnWindow": false
  }
}

═══════════════════════════════════════════════════════════
`;

    // Define tools (same as conversation draft)
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "search_customer_and_orders",
          description: "Search for a Shopify customer and their orders using email, name, or order number. Returns customer details and all associated orders with tracking information.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Email address, customer name, or order number (e.g., 'john@example.com', 'John Smith', '1001', or '#1001')"
              }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "get_tracking_info",
          description: "Get detailed tracking information for a package using 17track. Provides current location, status, and estimated delivery.",
          parameters: {
            type: "object",
            properties: {
              tracking_number: {
                type: "string",
                description: "The tracking number from the order fulfillment"
              }
            },
            required: ["tracking_number"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "search_product",
          description: "Search the Product Knowledge Base for detailed product information. CRITICAL: Use this tool in TWO scenarios: (1) When a customer mentions a product name, SKU, or asks product-specific questions, and (2) AFTER calling search_customer_and_orders, ALWAYS search for EVERY product found in the order's line_items to get product-specific shipping times, care instructions, warranties, specifications, and FAQs. Returns comprehensive product data that OVERRIDES general policies.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Product name, SKU, or search keywords. Examples: 'Widget Pro', 'WGT001', 'blue widget'. IMPORTANT: After getting order data, search for each product title from line_items (e.g., if line_items contains 'York Pendant Light', search for 'York' or 'York Pendant Light')."
              }
            },
            required: ["query"]
          }
        }
      }
    ];

    // Prepare messages
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Please analyze this external email and generate an appropriate response draft." }
    ];

    // AI generation loop (max 5 iterations)
    const MAX_ITERATIONS = 5;
    let finalResponse: any = null;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      console.log(`[StandaloneDraft ${draftId}] AI iteration ${iteration + 1}/${MAX_ITERATIONS}`);

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools,
        temperature: 0.7,
        max_tokens: 2000,
      });

      const assistantMessage = completion.choices[0].message;
      messages.push(assistantMessage);

      // Check if AI wants to call tools
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log(`[StandaloneDraft ${draftId}] AI requested ${assistantMessage.tool_calls.length} tool call(s)`);
        toolCallCount += assistantMessage.tool_calls.length;

        // Execute each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          const functionName = (toolCall as any).function.name;
          const functionArgs = JSON.parse((toolCall as any).function.arguments);
          console.log(`[StandaloneDraft ${draftId}] Calling tool: ${functionName}`, functionArgs);

          let toolResult: any;

          if (functionName === "search_customer_and_orders") {
            try {
              toolResult = await shopify.searchCustomerAndOrders(functionArgs.query);
              console.log(`[StandaloneDraft ${draftId}] Shopify search result:`, toolResult.searchType);
            } catch (error) {
              toolResult = { error: "Failed to search Shopify", details: String(error) };
            }
          } else if (functionName === "get_tracking_info") {
            try {
              // Register with 17track
              const registerResponse = await fetch("https://api.17track.net/track/v2.2/register", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "17token": process.env.SEVENTEENTRACK_API_KEY || "",
                },
                body: JSON.stringify([{
                  number: functionArgs.tracking_number
                }]),
              });

              if (!registerResponse.ok) {
                throw new Error(`17track registration failed: ${registerResponse.statusText}`);
              }

              // Wait for processing
              await new Promise(resolve => setTimeout(resolve, 1000));

              // Fetch tracking info
              const trackResponse = await fetch("https://api.17track.net/track/v2.2/gettrackinfo", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "17token": process.env.SEVENTEENTRACK_API_KEY || "",
                },
                body: JSON.stringify([{
                  number: functionArgs.tracking_number
                }]),
              });

              if (!trackResponse.ok) {
                throw new Error(`17track fetch failed: ${trackResponse.statusText}`);
              }

              toolResult = await trackResponse.json();
            } catch (error) {
              toolResult = { error: "Failed to fetch tracking", details: String(error) };
            }
          } else if (functionName === "search_product") {
            try {
              // Search Product Knowledge Base (same logic as conversation drafts)
              const queryLower = functionArgs.query.toLowerCase().trim();
              const queryWords = queryLower.split(/\s+/).filter((w: string) => w.length > 2);

              // Strategy 1: Try exact and partial name/SKU matching first
              // NOTE: Standalone drafts don't have workspaceId, so we search all active products
              // TODO: Add workspaceId to StandaloneDraft model to filter by workspace
              let products = await prisma.product.findMany({
                where: {
                  // workspaceId not available for standalone drafts - search all workspaces
                  status: 'active',
                  OR: [
                    { name: { contains: functionArgs.query, mode: 'insensitive' } },
                    { sku: { contains: functionArgs.query, mode: 'insensitive' } },
                    { aiSearchKeywords: { has: queryLower } },
                    { tags: { has: queryLower } },
                    { description: { contains: functionArgs.query, mode: 'insensitive' } },
                    { variants: { array_contains: [{ title: queryLower }] } }
                  ]
                },
                take: 5,
                orderBy: { name: 'asc' }
              });

              // Strategy 2: If no results and query has multiple words, try word-based search
              if (products.length === 0 && queryWords.length > 0) {
                console.log(`[StandaloneDraft ${draftId}] Product search: No exact matches for "${functionArgs.query}", trying word-based search`);

                const wordConditions = queryWords.flatMap((word: string) => [
                  { name: { contains: word, mode: 'insensitive' as const } },
                  { description: { contains: word, mode: 'insensitive' as const } },
                  { aiSearchKeywords: { has: word } },
                  { tags: { has: word } }
                ]);

                products = await prisma.product.findMany({
                  where: {
                    status: 'active',
                    OR: wordConditions
                  },
                  take: 5,
                  orderBy: { name: 'asc' }
                });
              }

              if (products.length === 0) {
                toolResult = {
                  found: false,
                  message: `No products found matching "${functionArgs.query}". This product may not be in the Product Knowledge Base yet. IMPORTANT: You should still help the customer using the Shopify order data and general knowledge base. If the customer is asking for product specifications (bulb type, voltage, dimensions, etc.), acknowledge that specific product documentation is not available and ask the customer to provide any details from their order confirmation or product packaging, OR offer to send detailed specifications separately.`,
                  query: functionArgs.query,
                  searchedWords: queryWords
                };
                console.log(`[StandaloneDraft ${draftId}] Product search: No results for "${functionArgs.query}"`);
              } else {
                const formattedProducts = products.map((p: any) => ({
                  name: p.name,
                  sku: p.sku,
                  category: p.category,
                  description: p.description,
                  specifications: p.specifications,
                  features: p.features,
                  price: p.price,
                  variants: p.variants,
                  availabilityStatus: p.availabilityStatus,
                  shippingTime: p.shippingTime,
                  shippingRestrictions: p.shippingRestrictions,
                  instructions: p.instructions,
                  careInstructions: p.careInstructions,
                  warrantyInfo: p.warrantyInfo,
                  returnPolicy: p.returnPolicy,
                  faqs: p.faqs
                }));

                toolResult = {
                  found: true,
                  products: formattedProducts,
                  count: products.length,
                  message: `Found ${products.length} product(s) matching "${functionArgs.query}". SUCCESS! Use this product-specific data (shipping times, instructions, specifications, warranty, FAQs) - it OVERRIDES general knowledge base policies. Product names found: ${products.map((p: any) => p.name).join(', ')}`
                };
                console.log(`[StandaloneDraft ${draftId}] Product search: ✅ Found ${products.length} product(s) for "${functionArgs.query}":`, products.map((p: any) => p.name).join(', '));
              }
            } catch (error) {
              console.error(`[StandaloneDraft ${draftId}] Product search error:`, error);
              toolResult = {
                error: "Failed to search products",
                details: String(error),
                message: "Product search failed. Use general knowledge base."
              };
            }
          }

          // Add tool result to messages
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult)
          });
        }

        // Continue loop to get AI's next response
        continue;
      }

      // No tool calls - check if we have final JSON response
      if (assistantMessage.content) {
        try {
          // Try to parse as JSON
          const content = assistantMessage.content.trim();
          // Remove markdown code blocks if present
          const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
          const jsonText = jsonMatch ? jsonMatch[1] : content;
          finalResponse = JSON.parse(jsonText);
          console.log(`[StandaloneDraft ${draftId}] Got final JSON response`);
          break;
        } catch (e) {
          console.log(`[StandaloneDraft ${draftId}] Response not JSON, continuing...`);
        }
      }
    }

    // If we still don't have a response, make one final call requesting JSON
    if (!finalResponse) {
      console.log(`[StandaloneDraft ${draftId}] Making final JSON-only call`);
      messages.push({
        role: "user",
        content: "Please provide your final response in pure JSON format (no markdown, no code blocks) matching the structure specified."
      });

      const finalCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2000,
      });

      const content = finalCompletion.choices[0].message.content;
      if (content) {
        finalResponse = JSON.parse(content);
      }
    }

    if (!finalResponse) {
      throw new Error("Failed to get valid response from AI");
    }

    // Calculate processing time
    const processingTime = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;

    // Update draft with results
    await prisma.standaloneDraft.update({
      where: { id: draftId },
      data: {
        status: "completed",
        internalReasoning: finalResponse.internalReasoning || null,
        tags: finalResponse.tags || [],
        category: finalResponse.category || null,
        reasoning: finalResponse.reasoning || null,
        shouldDraft: finalResponse.shouldDraft !== false,
        draft: finalResponse.draft || null,
        actionSteps: finalResponse.actionSteps || null,
        orderInfo: finalResponse.orderInfo || null,
        processingTime,
        toolCallsMade: toolCallCount,
        completedAt: new Date(),
      },
    });

    console.log(`[StandaloneDraft ${draftId}] Completed successfully in ${processingTime}`);

  } catch (error) {
    console.error(`[StandaloneDraft ${draftId}] Processing failed:`, error);

    // Update draft with error
    await prisma.standaloneDraft.update({
      where: { id: draftId },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });
  }
}

// ==================== PRODUCT KNOWLEDGE BASE ENDPOINTS ====================

// Get all products for a workspace
app.get("/products", async (req: Request, res: Response) => {
  try {
    const { workspaceId, search, category, status } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    const where: any = {
      workspaceId: workspaceId as string
    };

    // Search filter
    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Category filter
    if (category && category !== 'all') {
      where.category = category as string;
    }

    // Status filter
    if (status && status !== 'all') {
      where.status = status as string;
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { name: 'asc' }
    });

    console.log(`[Products] Loaded ${products.length} products for workspace ${workspaceId}`);
    res.json({ products });
  } catch (error) {
    console.error("[Products] Error fetching products:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      error: "Failed to fetch products",
      details: errorMessage
    });
  }
});

// Get single product
app.get("/products/:id", async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id }
    });

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    console.error("[Products] Error fetching product:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// Create product
app.post("/products", async (req: Request, res: Response) => {
  try {
    const { workspaceId, ...productData } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    console.log("[Products] Creating product with data:", JSON.stringify({ workspaceId, ...productData }, null, 2));

    const product = await prisma.product.create({
      data: {
        workspaceId,
        ...productData
      }
    });

    console.log(`[Products] Created product: ${product.name} (${product.id})`);
    res.json(product);
  } catch (error) {
    console.error("[Products] Error creating product:", error);
    // Return more detailed error for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      error: "Failed to create product",
      details: errorMessage,
      data: req.body
    });
  }
});

// Update product
app.patch("/products/:id", async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: req.body
    });

    console.log(`[Products] Updated product: ${product.name} (${product.id})`);
    res.json(product);
  } catch (error) {
    console.error("[Products] Error updating product:", error);
    res.status(500).json({ error: "Failed to update product" });
  }
});

// Delete product
app.delete("/products/:id", async (req: Request, res: Response) => {
  try {
    await prisma.product.delete({
      where: { id: req.params.id }
    });

    console.log(`[Products] Deleted product: ${req.params.id}`);
    res.json({ success: true });
  } catch (error) {
    console.error("[Products] Error deleting product:", error);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// Bulk create products
app.post("/products/bulk-create", async (req: Request, res: Response) => {
  try {
    const { workspaceId, products } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: "products array is required" });
    }

    const createdProducts = await prisma.$transaction(
      products.map((product: any) =>
        prisma.product.create({
          data: {
            workspaceId,
            ...product
          }
        })
      )
    );

    console.log(`[Products] Bulk created ${createdProducts.length} products`);
    res.json({ products: createdProducts, count: createdProducts.length });
  } catch (error) {
    console.error("[Products] Error bulk creating products:", error);
    res.status(500).json({ error: "Failed to bulk create products" });
  }
});

// Get products statistics
app.get("/products/stats/:workspaceId", async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;

    const total = await prisma.product.count({
      where: { workspaceId }
    });

    const active = await prisma.product.count({
      where: { workspaceId, status: 'active' }
    });

    const incomplete = await prisma.product.count({
      where: {
        workspaceId,
        OR: [
          { description: null },
          { shippingTime: null },
          { price: null }
        ]
      }
    });

    const categories = await prisma.product.groupBy({
      by: ['category'],
      where: { workspaceId },
      _count: true
    });

    res.json({
      total,
      active,
      incomplete,
      categories: categories.map(c => ({
        name: c.category || 'Uncategorized',
        count: c._count
      }))
    });
  } catch (error) {
    console.error("[Products] Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch product statistics" });
  }
});

// Search products for AI (optimized for AI tool calling)
app.post("/products/search-for-ai", async (req: Request, res: Response) => {
  try {
    const { workspaceId, query } = req.body;

    if (!workspaceId || !query) {
      return res.status(400).json({ error: "workspaceId and query are required" });
    }

    const queryLower = query.toLowerCase();

    // Search by name, SKU, keywords, and tags
    const products = await prisma.product.findMany({
      where: {
        workspaceId,
        status: 'active',
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
          { aiSearchKeywords: { has: queryLower } },
          { tags: { has: queryLower } },
          { description: { contains: query, mode: 'insensitive' } }
        ]
      },
      take: 5,
      orderBy: { name: 'asc' }
    });

    if (products.length === 0) {
      console.log(`[Products AI Search] No products found for query: "${query}"`);
      return res.json({
        found: false,
        message: "No products found matching your search. Use general knowledge base.",
        query
      });
    }

    // Format for AI consumption - only include relevant fields
    const formattedProducts = products.map(p => ({
      name: p.name,
      sku: p.sku,
      category: p.category,
      description: p.description,
      specifications: p.specifications,
      features: p.features,
      price: p.price,
      availabilityStatus: p.availabilityStatus,
      shippingTime: p.shippingTime,
      shippingRestrictions: p.shippingRestrictions,
      instructions: p.instructions,
      careInstructions: p.careInstructions,
      warrantyInfo: p.warrantyInfo,
      returnPolicy: p.returnPolicy,
      faqs: p.faqs
    }));

    console.log(`[Products AI Search] Found ${products.length} products for query: "${query}"`);
    res.json({
      found: true,
      products: formattedProducts,
      count: products.length
    });
  } catch (error) {
    console.error("[Products AI Search] Error:", error);
    res.status(500).json({ error: "Failed to search products" });
  }
});

// ==========================================
// AI ASSISTANT CHATBOT
// ==========================================

app.post("/ai-assistant/chat", async (req: Request, res: Response) => {
  try {
    const { message, workspaceId, history } = req.body;

    console.log("[AI Assistant] Received chat request:", message);

    // Fetch Knowledge Base articles
    const kbEntries = await prisma.knowledgeBase.findMany({
      where: { active: true },
      select: { title: true, content: true, category: true, tags: true }
    });

    // Fetch Product Knowledge Base
    let products: any[] = [];
    if (workspaceId) {
      products = await prisma.product.findMany({
        where: {
          workspaceId,
          status: "active"
        },
        select: {
          name: true,
          sku: true,
          category: true,
          description: true,
          features: true,
          price: true,
          variants: true,
          availabilityStatus: true,
          shippingTime: true,
          instructions: true,
          careInstructions: true,
          warrantyInfo: true,
          returnPolicy: true,
          colors: true,
          sizes: true,
        },
        take: 50
      });
    }

    // Build context from knowledge bases
    const kbContext = kbEntries.map(entry =>
      `[${entry.category}] ${entry.title}\n${entry.content}`
    ).join("\n\n---\n\n");

    const productsContext = products.length > 0
      ? products.map(p =>
          `Product: ${p.name}${p.sku ? ` (SKU: ${p.sku})` : ""}\n` +
          `Category: ${p.category || "N/A"}\n` +
          `Description: ${p.description || "N/A"}\n` +
          (p.features && p.features.length > 0 ? `Features: ${p.features.join(", ")}\n` : "") +
          (p.price ? `Price: ${p.price}\n` : "") +
          (p.variants && Array.isArray(p.variants) && p.variants.length > 0
            ? `Variants:\n${p.variants.map((v: any) => `  - ${v.option}: ${v.price}${v.sku ? ` (SKU: ${v.sku})` : ""}`).join("\n")}\n`
            : "") +
          (p.availabilityStatus ? `Availability: ${p.availabilityStatus}\n` : "") +
          (p.shippingTime ? `Shipping: ${p.shippingTime}\n` : "") +
          (p.colors && p.colors.length > 0 ? `Colors: ${p.colors.join(", ")}\n` : "") +
          (p.sizes && p.sizes.length > 0 ? `Sizes: ${p.sizes.join(", ")}\n` : "") +
          (p.warrantyInfo ? `Warranty: ${p.warrantyInfo}\n` : "")
        ).join("\n---\n\n")
      : "No product data available.";

    // Build conversation history
    const conversationHistory = history && history.length > 0
      ? history.map((msg: any) => ({
          role: msg.role,
          content: msg.content
        }))
      : [];

    // Create AI Assistant prompt
    const messages: any[] = [
      {
        role: "system",
        content: `You are a helpful AI Assistant for customer support agents. Your role is to help agents quickly find information from the Knowledge Base and Product Knowledge Base.

📚 GENERAL KNOWLEDGE BASE:
${kbContext}

📦 PRODUCT KNOWLEDGE BASE (PRIMARY SOURCE FOR PRODUCT INFO):
${productsContext}

🚨 CRITICAL DATA SOURCE PRIORITY:

For PRODUCT INFORMATION (specs, features, shipping times, warranties, pricing, variants):
1. **PRODUCT KNOWLEDGE BASE** - ALWAYS PRIMARY AND MOST TRUSTED SOURCE
   - This is the single source of truth for all product details
   - ALWAYS use Product KB data when answering product questions
   - Product KB is manually curated and maintained by the team

2. **Shopify API** - ONLY for order/transaction data, NOT for product info
   - Use Shopify ONLY for: order status, tracking numbers, customer order history
   - NEVER use Shopify for product details, specs, or features
   - Product KB overrides any Shopify product data

For POLICY INFORMATION (returns, refunds, shipping policies):
- Use General Knowledge Base

Instructions:
- Answer questions clearly and concisely
- When asked about products, ALWAYS reference the Product KB as the authoritative source
- When asked about policies, reference the General KB
- If you don't know something, say so - don't make up information
- Format your responses with clear structure (bullet points, sections, etc.)
- Be helpful and friendly to support agents

You are NOT generating customer-facing email drafts. You are helping internal support agents find information quickly.`
      },
      ...conversationHistory,
      {
        role: "user",
        content: message
      }
    ];

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Fast and cost-effective
      messages,
      temperature: 0.7,
      max_tokens: 1000
    });

    const response = completion.choices[0].message.content;
    console.log("[AI Assistant] Response generated");

    res.json({ response });
  } catch (error) {
    console.error("[AI Assistant] Error:", error);
    res.status(500).json({ error: "AI Assistant failed" });
  }
});

const port = process.env.PORT || 3001;

// Start server immediately for fast startup
app.listen(port, () => {
  console.log(`✓ API server listening on http://localhost:${port}`);
  console.log(`✓ Ready to accept requests`);

  // Test database connection in background (don't block startup)
  prisma.$connect()
    .then(() => {
      console.log("✓ Database connected successfully");
    })
    .catch((error) => {
      console.error("✗ Warning: Database connection failed");
      if (error instanceof Error) {
        console.error(`  Error: ${error.message}`);
      }
      console.error("\nPlease check:");
      console.error("  1. .env or .env.local file exists with DATABASE_URL");
      console.error("  2. Database is accessible");
      console.error("  3. Run 'npx prisma generate' and 'npx prisma db push'");
    });
});
