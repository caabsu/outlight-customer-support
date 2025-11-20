import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
// Load from .env.local first, fallback to .env
dotenv.config({ path: ".env.local" });
dotenv.config(); // This will load .env if .env.local doesn't exist
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

import { googleAuthStart, googleAuthCallback, pollOnce } from "./gmail";
import * as gmailMulti from "./gmail-multi";
import { prisma } from "./db";
import * as shopify from "./shopify";

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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
      limit,
      includeArchived
    } = req.query;

    // Workspace is required
    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    // Log all active filters for debugging
    console.log(`[Filter Debug] Request filters: workspace=${workspaceId}, excludeNonSupport=${excludeNonSupport}, adminOnly=${adminOnly}, needsReply=${needsReply}, resolved=${resolved}, archived=${archived}, includeArchived=${includeArchived}, starred=${starred}, showSent=${showSent}`);

    const where: any = {
      workspaceId: workspaceId as string
    };

    if (starred === "true") {
      where.starred = true;
    }

    if (archived === "true") {
      where.archived = true;
    } else if (includeArchived === "true") {
      // Show both archived and unarchived - do nothing to where.archived
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

// Get training emails
app.get("/conversations/training/all", async (req: Request, res: Response) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { isTraining: true },
      include: {
        customer: true,
        messages: {
          orderBy: { sentAt: "asc" }
        },
        trainingByUser: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: { lastMessageAt: "desc" }
    });
    res.json(conversations);
  } catch (error) {
    console.error("Error fetching training conversations:", error);
    res.status(500).json({ error: "Failed to fetch training conversations" });
  }
});

// Update training status and notes
app.patch("/conversations/:id/training", async (req: Request, res: Response) => {
  try {
    const { isTraining, trainingNotes, userId } = req.body;
    const data: any = {};
    
    if (isTraining !== undefined) {
      data.isTraining = isTraining;
      if (isTraining) {
        data.trainingAt = new Date();
        if (userId) data.trainingBy = userId;
      }
    }
    if (trainingNotes !== undefined) data.trainingNotes = trainingNotes;

    const updated = await prisma.conversation.update({
      where: { id: req.params.id },
      data,
    });
    res.json(updated);
  } catch (error) {
    console.error("Error updating training status:", error);
    res.status(500).json({ error: "Failed to update training status" });
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
        { userTags: { has: "non-customer-support" } },
        { userTags: { has: "admin" } }
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

// Merge conversations into a single thread
app.post("/conversations/:id/merge", async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id;
    const { conversationIds } = req.body as { conversationIds?: string[] };

    if (!Array.isArray(conversationIds)) {
      return res.status(400).json({ error: "conversationIds array is required" });
    }

    const idsToMerge = Array.from(
      new Set(
        conversationIds.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0 && id !== targetId
        )
      )
    );

    if (idsToMerge.length === 0) {
      return res.status(400).json({ error: "Provide at least one conversation to merge" });
    }

    const mergedConversation = await prisma.$transaction(async tx => {
      const targetConversation = await tx.conversation.findUnique({
        where: { id: targetId },
      });

      if (!targetConversation) {
        throw new Error("TARGET_NOT_FOUND");
      }

      const conversationsToMerge = await tx.conversation.findMany({
        where: { id: { in: idsToMerge } },
      });

      if (conversationsToMerge.length !== idsToMerge.length) {
        throw new Error("MERGE_CONVERSATION_NOT_FOUND");
      }

      for (const conv of conversationsToMerge) {
        if (conv.workspaceId !== targetConversation.workspaceId) {
          throw new Error("WORKSPACE_MISMATCH");
        }
      }

      for (const conv of conversationsToMerge) {
        await tx.message.updateMany({
          where: { conversationId: conv.id },
          data: { conversationId: targetConversation.id },
        });

        await tx.conversation.delete({
          where: { id: conv.id },
        });
      }

      const firstMessage = await tx.message.findFirst({
        where: { conversationId: targetConversation.id },
        orderBy: { sentAt: "asc" },
      });

      const lastMessage = await tx.message.findFirst({
        where: { conversationId: targetConversation.id },
        orderBy: { sentAt: "desc" },
      });

      const combinedTags = Array.from(
        new Set([
          ...(targetConversation.tags || []),
          ...conversationsToMerge.flatMap(conv => conv.tags || []),
        ])
      );

      const combinedUserTags = Array.from(
        new Set([
          ...(targetConversation.userTags || []),
          ...conversationsToMerge.flatMap(conv => conv.userTags || []),
        ])
      );

      await tx.conversation.update({
        where: { id: targetConversation.id },
        data: {
          firstMessageAt: firstMessage?.sentAt || targetConversation.firstMessageAt,
          lastMessageAt: lastMessage?.sentAt || targetConversation.lastMessageAt,
          needsReply: lastMessage ? lastMessage.direction === "inbound" : targetConversation.needsReply,
          lastMessageDirection: lastMessage?.direction || targetConversation.lastMessageDirection,
          tags: combinedTags,
          userTags: combinedUserTags,
        },
      });

      return tx.conversation.findUnique({
        where: { id: targetConversation.id },
        include: {
          customer: true,
          messages: {
            orderBy: { sentAt: "asc" },
          },
        },
      });
    });

    if (!mergedConversation) {
      return res.status(404).json({ error: "Target conversation not found after merge" });
    }

    res.json(mergedConversation);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "TARGET_NOT_FOUND") {
        return res.status(404).json({ error: "Target conversation not found" });
      }
      if (error.message === "MERGE_CONVERSATION_NOT_FOUND") {
        return res.status(404).json({ error: "One or more conversations to merge were not found" });
      }
      if (error.message === "WORKSPACE_MISMATCH") {
        return res.status(400).json({ error: "Conversations must belong to the same workspace" });
      }
    }
    console.error("Error merging conversations:", error);
    res.status(500).json({ error: "Failed to merge conversations" });
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
        res.setHeader("Content-Disposition", `attachment; filename="${attachment.filename || "attachment"}"`)
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
      res.setHeader("Content-Disposition", `attachment; filename="${attachment.filename || "attachment"}"`)
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

// Email Summary Endpoint using Gemini
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

    // Build email thread context
    const emailThread = conversation.messages.map((msg: any) => {
      const direction = msg.direction === "inbound" ? "Customer" : "Agent";
      const content = msg.bodyText || msg.bodyHtml?.replace(/<[^>]*>/g, '') || '';
      return `${direction}: ${content.substring(0, 1000)}`;
    }).join('\n\n');

    // Load knowledge base (if exists)
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
      console.log("Knowledge base not available yet");
    }

    // Generate summary using Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });
    
    const prompt = `You are a helpful customer support assistant. Summarize email conversations concisely, highlighting:
1. Main issue/question
2. Key points discussed
3. Current status
4. Suggested next steps (if applicable)

Keep summaries under 150 words.${knowledgeBaseContext}

Summarize this email conversation:
Subject: ${conversation.subject}

${emailThread}`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text();

    // Save summary to database
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
 */
app.get("/knowledge-base/tool-access", async (req: Request, res: Response) => {
  console.log("[Tool Access] Request received for knowledge base tool access");
  try {
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

    const toolAccess = {
      draft: {
        name: "Draft Response Generator",
        description: "AI tool that generates email draft responses to customer inquiries",
        model: "gemini-3-pro-preview",
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
        model: "gemini-3-pro-preview",
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
        model: "gemini-3-pro-preview",
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
        model: "gemini-3-pro-preview",
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
        model: "gemini-3-pro-preview",
        categories: [],
        entries: [],
        capabilities: [
          "Improve clarity and grammar",
          "Maintain professional tone",
          "Preserve original meaning"
        ]
      }
    };

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

    const periodDays = timeRange === "30d" ? 30 : timeRange === "90d" ? 90 : 7;

    const userStats = await Promise.all(
      users.map(async (user) => {
        const [emailsSent, assignedCount, draftedCount] = await Promise.all([
          prisma.userActivity.count({
            where: {
              userId: user.id,
              actionType: "email_sent",
              ...(workspaceId && { workspaceId }),
              ...(dateFilter && { timestamp: { gte: dateFilter } }),
            },
          }),
          prisma.conversation.count({
            where: {
              assignedTo: user.id,
              ...(workspaceId && { workspaceId }),
              ...(dateFilter && { createdAt: { gte: dateFilter } }),
            },
          }),
          prisma.conversation.count({
            where: {
              lastDraftedBy: user.id,
              ...(workspaceId && { workspaceId }),
              ...(dateFilter && { createdAt: { gte: dateFilter } }),
            },
          }),
        ]);

        return {
          ...user,
          totalOutbound: emailsSent,
          assignedConversations: assignedCount,
          draftedConversations: draftedCount,
          avgDailyOutbound: periodDays > 0 ? emailsSent / periodDays : emailsSent,
        };
      })
    );

    res.json({ users: userStats, timeRange, periodDays });
  } catch (error) {
    console.error("Error fetching users analytics:", error);
    res.status(500).json({ error: "Failed to fetch users analytics" });
  }
});

// ============================================================================ 
// AI ENDPOINTS (MIGRATED TO GEMINI)
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

    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });
    
    const prompt = `You are an email extraction specialist. Your ONLY job is to extract a customer email address from the provided email content.

CRITICAL RULES:
1. Return ONLY the email address - no other text, no explanation, no quotes
2. Return exactly one email address
3. Do not return system emails (mailer@shopify.com, noreply@, support@, etc.)
4. If multiple customer emails exist, return the first one found
5. If NO customer email is found, return: NONE

SPECIAL CASES:
- For emails FROM mailer@shopify.com: Look for customer email in the body text
- For order confirmations: Find the customer's email in "Customer email:" or similar fields

Extract the customer email from this email:

From: ${fromEmail}
Subject: ${subject}

Body:
${emailBody}`;

    const result = await model.generateContent(prompt);
    const extractedEmail = result.response.text().trim() || 'NONE';

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
    const { prompt: userPrompt, category, existingContent } = req.body;

    if (!userPrompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

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

    let fullPrompt = `${systemPrompt}\n\nWrite knowledge base content based on this request:\n\n${userPrompt}`;

    if (existingContent) {
      fullPrompt += `\n\nExisting content to build upon or reference:\n${existingContent}`;
    }

    const result = await model.generateContent(fullPrompt);
    const content = result.response.text().trim();

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
    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

    const prompt = `You are a professional editor for Outlight's customer support knowledge base. Your role is to improve existing knowledge base content while maintaining accuracy and intent.

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
Return ONLY the improved knowledge base content - no meta-commentary, no explanations of changes, no "here is the edited version". Just the edited content itself.

Edit this knowledge base content:

${content}`;

    const result = await model.generateContent(prompt);
    const improvedContent = result.response.text().trim();

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
 * AI Draft Functionality with Tool Access (Gemini Integration)
 */

// Get existing draft
app.get("/conversations/:id/draft", async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.id;
    const existingDraft = await prisma.draftResponse.findUnique({
      where: { conversationId }
    });

    if (!existingDraft) {
      return res.status(404).json({ error: "No draft found" });
    }

    // Handle old data format: convert string actionSteps to array if needed
    let actionSteps = existingDraft.actionSteps;
    if (actionSteps && typeof actionSteps === 'string') {
      actionSteps = (actionSteps as string).split('\n').filter(s => s.trim());
    }

    res.json({
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
      customInstructions: (existingDraft as any).customInstructions || null
    });
  } catch (error) {
    console.error("[Draft] Error fetching draft:", error);
    res.status(500).json({ error: "Failed to fetch draft" });
  }
});

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
    if (!forceRegenerate && !additionalContext) {
      const existingDraft = await prisma.draftResponse.findUnique({
        where: { conversationId }
      });

      if (existingDraft) {
          console.log(`[Draft] Returning existing draft for conversation ${conversationId}`);

          // Handle old data format: convert string actionSteps to array if needed
          let actionSteps = existingDraft.actionSteps;
          if (actionSteps && typeof actionSteps === 'string') {
            // Old format: string with newlines - convert to array
            actionSteps = (actionSteps as string).split('\n').filter(s => s.trim());
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

    // Load knowledge base from database
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
            const categoryLabel = kb.category === "general" ? "GENERAL" : "DRAFT-SPECIFIC";
            return `<article category="${categoryLabel}">
<title>${kb.title}</title>
<content>
${kb.content}
</content>
</article>`;
          })
          .join("\n\n");
        
        // Wrap in main tag
        knowledgeBaseText = `<knowledge_base>\n${knowledgeBaseText}\n</knowledge_base>`;
      } else {
        knowledgeBaseText = "<knowledge_base>No entries available.</knowledge_base>";
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

    const inboundMessages = emailThread.filter(msg => msg.direction === "inbound");
    const latestInboundMessage = inboundMessages.length > 0 ? inboundMessages[inboundMessages.length - 1] : null;

    // Define tools for Gemini
    const tools = [
      {
        name: "search_customer_and_orders",
        description: "Search for a Shopify customer and their orders by email, name, or order number.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: {
              type: SchemaType.STRING,
              description: "Email address, customer name, or order number (e.g., 'john@example.com', 'John Smith', '1001', or '#1001')"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "get_tracking_info",
        description: "Get detailed tracking information for a package using 17track.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            tracking_number: {
              type: SchemaType.STRING,
              description: "The tracking number from the order fulfillment"
            }
          },
          required: ["tracking_number"]
        }
      },
      {
        name: "search_product",
        description: "Search the Product Knowledge Base for detailed product information.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: {
              type: SchemaType.STRING,
              description: "Product name, SKU, or search keywords."
            }
          },
          required: ["query"]
        }
      }
    ];

    // Initialize Gemini model with tools
    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-preview",
      tools: [{ functionDeclarations: tools as any }]
    });

    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: `You are a Senior Customer Support Agent for Outlight. Your goal is to resolve tickets efficiently, empathetically, and accurately in a single interaction whenever possible.

SYSTEM CONTEXT:
${knowledgeBaseText}

${additionalContext ? `<custom_instructions>
${additionalContext}
</custom_instructions>` : ''}

You have access to tools to fetch real-time data. USE THEM. Never guess order details.` }]
        },
        {
          role: "model",
          parts: [{ text: "Understood. I am ready to act as a Senior Support Agent. I will use the available tools to gather facts before answering, adhere strictly to the Knowledge Base and Custom Instructions, and provide a structured JSON response." }]
        }
      ]
    });

    // Construct message to start processing
    const userMessage = `Draft a response for the following customer inquiry.

CUSTOMER: ${conversation.customer ? `${conversation.customer.name} (${conversation.customer.primaryEmail})` : 'Unknown'}

EMAIL THREAD:
${JSON.stringify(emailThread, null, 2)}

${latestInboundMessage ? `LATEST MESSAGE:
Subject: ${latestInboundMessage.subject}
Body: ${latestInboundMessage.body}` : ''}

EXECUTION PLAN (MENTAL SCRATCHPAD):
1. **ANALYZE**: Identify the customer's core intent and sentiment.
2. **GATHER FACTS**: 
   - If they mention an order, use 'search_customer_and_orders'.
   - If they mention a tracking number, use 'get_tracking_info'.
   - If they ask about a product, use 'search_product'.
   - *VERIFY* the data matches the customer's claim (e.g., is the order actually delayed?).
3. **CONSULT POLICIES**: Check <knowledge_base> for relevant return/shipping policies.
4. **APPLY INSTRUCTIONS**: Check <custom_instructions> for specific overrides or tone requirements.
5. **DRAFT**: Write the response.

OUTPUT FORMAT (JSON ONLY):
{
  "internalReasoning": "Step-by-step thought process: 1. Intent identified as... 2. Tool X found... 3. Policy Y says... 4. Decided to...",
  "tags": ["suggested", "tags"],
  "category": "email_category",
  "shouldDraft": true,
  "draft": "The plain text email body (use \\n\\n for new paragraphs). Do NOT use HTML tags. Ensure there are two newlines before the sign-off/signature.",
  "orderInfo": { "summary": "extracted data" }
}`;

    let result = await chat.sendMessage(userMessage);
    let response = result.response;
    let functionCalls = response.functionCalls();

    // Loop to handle function calls
    let toolCallCount = 0;
    const MAX_TOOL_CALLS = 5;

    while (functionCalls && functionCalls.length > 0 && toolCallCount < MAX_TOOL_CALLS) {
      toolCallCount++;
      console.log(`[Draft] Handling function calls (iteration ${toolCallCount})`);
      
      const functionResponses = [];

      for (const call of functionCalls) {
        const name = call.name;
        const args = call.args as any;
        let functionResult;

        console.log(`[Draft] Calling tool: ${name}`, args);

        try {
          if (name === "search_customer_and_orders") {
            functionResult = await shopify.searchCustomerAndOrders(args.query);
          } else if (name === "get_tracking_info") {
            // Register first
            await fetch("https://api.17track.net/track/v2.2/register", {
                method: "POST",
                headers: {
                  "17token": process.env.SEVENTEENTRACK_API_KEY || "",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify([{ number: args.tracking_number }]),
            });
            // Fetch info
            const trackResponse = await fetch("https://api.17track.net/track/v2.2/gettrackinfo", {
                method: "POST",
                headers: {
                  "17token": process.env.SEVENTEENTRACK_API_KEY || "",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify([{ number: args.tracking_number }]),
            });
            functionResult = await trackResponse.json();
          } else if (name === "search_product") {
            const query = args.query;
            const products = await prisma.product.findMany({
                where: {
                  workspaceId: conversation.workspaceId,
                  status: 'active',
                  OR: [
                    { name: { contains: query, mode: 'insensitive' } },
                    { sku: { contains: query, mode: 'insensitive' } },
                    { tags: { has: query } }
                  ]
                },
                take: 5
            });
            functionResult = { found: products.length > 0, products, count: products.length };
          }
        } catch (err) {
          console.error(`[Draft] Tool execution error:`, err);
          functionResult = { error: String(err) };
        }

        functionResponses.push({
          functionResponse: {
            name: name,
            response: functionResult
          }
        });
      }

      // Send function results back to model
      result = await chat.sendMessage(functionResponses);
      response = result.response;
      functionCalls = response.functionCalls();
    }

    // Get final text response
    const finalText = response.text();
    
    // Clean markdown code blocks if present
    const jsonString = finalText.replace(/^```json\n|\n```$/g, '').trim();
    
    let finalResult;
    try {
      finalResult = JSON.parse(jsonString);
    } catch (e) {
      console.error("[Draft] Failed to parse JSON response:", finalText);
      throw new Error("AI returned invalid JSON");
    }

    // Update conversation tags
    if (finalResult.tags && finalResult.tags.length > 0) {
      const uniqueTags = Array.from(new Set([...(conversation.tags || []), ...finalResult.tags]));
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { tags: uniqueTags },
      });
    }

    // Save draft to database
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

    res.json({
      ...finalResult,
      conversationId,
      processingTime: new Date().toISOString(),
      toolCallsMade: toolCallCount,
      fromDatabase: false,
      usedCustomContext: !!(additionalContext && additionalContext.trim())
    });

  } catch (error) {
    console.error(`[Draft] Error generating draft:`, error);
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
// STANDALONE DRAFT ENDPOINTS
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

    // Load knowledge base
    let knowledgeBaseText = "";
    try {
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

      if (knowledgeBase.length > 0) {
        knowledgeBaseText = knowledgeBase
          .map(kb => {
            const categoryLabel = kb.category === "general" ? "GENERAL" : "DRAFT-SPECIFIC";
            return `<article category="${categoryLabel}">
<title>${kb.title}</title>
<content>
${kb.content}
</content>
</article>`;
          })
          .join("\n\n");
          
        knowledgeBaseText = `<knowledge_base>\n${knowledgeBaseText}\n</knowledge_base>`;
      } else {
        knowledgeBaseText = "<knowledge_base>No entries available.</knowledge_base>";
      }
    } catch (error) {
      console.error(`[StandaloneDraft ${draftId}] Error loading knowledge base:`, error);
      knowledgeBaseText = "Error loading knowledge base. Using basic guidelines.";
    }

    // Build system prompt
    let systemPrompt = `You are a Senior Customer Support Agent for Outlight. Your goal is to resolve tickets efficiently, empathetically, and accurately.

SYSTEM CONTEXT:
${knowledgeBaseText}

${draft.contextNotes ? `ADDITIONAL CONTEXT:
${draft.contextNotes}
` : ''}
`;

    // Add custom instructions if provided
    if (draft.customInstructions && draft.customInstructions.trim()) {
      systemPrompt += `
<custom_instructions>
${draft.customInstructions}
</custom_instructions>
`;
    }

    // Initialize Gemini Model
    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

    // Prompt for JSON output
    const prompt = `${systemPrompt}

Draft a response for the following email.

SUBJECT: ${draft.subject}
BODY:
${draft.emailBody}

EXECUTION PLAN (MENTAL SCRATCHPAD):
1. **ANALYZE**: Identify the core intent.
2. **CONSULT POLICIES**: Check <knowledge_base>.
3. **APPLY INSTRUCTIONS**: Check <custom_instructions>.
4. **DRAFT**: Write the response.

OUTPUT FORMAT (JSON ONLY):
{ 
  "internalReasoning": "Step-by-step thought process...",
  "draft": "The plain text email body (use \\n\\n for new paragraphs). Do NOT use HTML tags. Ensure there are two newlines before the sign-off/signature.", 
  "reasoning": "Short summary of approach", 
  "tags": ["suggested", "tags"] 
}`;

    const result = await model.generateContent(prompt);
    const finalText = result.response.text();
    
    // Clean markdown code blocks if present
    const jsonString = finalText.replace(/^```json\n|\n```$/g, '').replace(/^```\n|\n```$/g, '').trim();
    
    let finalResult;
    try {
      finalResult = JSON.parse(jsonString);
    } catch (e) {
      console.error(`[StandaloneDraft ${draftId}] Failed to parse JSON response:`, finalText);
      // Fallback if not JSON
      finalResult = {
        draft: finalText,
        reasoning: "Generated without structured format due to parsing error.",
        tags: []
      };
    }

    // Update draft with results
    await prisma.standaloneDraft.update({
      where: { id: draftId },
      data: {
        status: "completed",
        draft: finalResult.draft,
        reasoning: finalResult.reasoning,
        tags: finalResult.tags || [],
        completedAt: new Date()
      }
    });

    console.log(`[StandaloneDraft ${draftId}] Completed successfully`);

  } catch (error) {
    console.error(`[StandaloneDraft ${draftId}] Failed:`, error);
    // Update draft with error
    await prisma.standaloneDraft.update({
      where: { id: draftId },
      data: {
        status: "failed",
        error: String(error)
      }
    });
  }
}


const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});