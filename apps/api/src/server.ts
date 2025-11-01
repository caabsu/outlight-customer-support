import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
// Load from .env.local first, fallback to .env
dotenv.config({ path: ".env.local" });
dotenv.config(); // This will load .env if .env.local doesn't exist
import OpenAI from "openai";

import { googleAuthStart, googleAuthCallback, pollOnce, sendReply, sendNewEmail } from "./gmail";
import { prisma } from "./db";
import * as shopify from "./shopify";

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.use(cors());
app.use(express.json());

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

app.get("/oauth/google", googleAuthStart);
app.get("/oauth/google/callback", googleAuthCallback);
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
      page,
      limit
    } = req.query;

    const where: any = {};

    if (starred === "true") {
      where.starred = true;
    }

    if (archived === "true") {
      where.archived = true;
    } else {
      // By default, don't show archived
      where.archived = false;
    }

    // Build NOT conditions array for proper filtering
    const notConditions: any[] = [];

    if (excludeNonSupport === "true") {
      notConditions.push({
        tags: {
          has: "non-customer-support"
        }
      });
    }

    if (unreadOnly === "true") {
      where.unreadAgent = true;
    }

    // Needs reply filter (has needs-reply tag)
    if (needsReply === "true") {
      where.tags = {
        has: "needs-reply"
      };
    }

    // Resolved filter (does NOT have needs-reply tag)
    if (resolved === "true") {
      notConditions.push({
        tags: {
          has: "needs-reply"
        }
      });
    }

    // Apply NOT conditions if any exist
    if (notConditions.length > 0) {
      where.NOT = notConditions.length === 1 ? notConditions[0] : notConditions;
    }

    // Specific tags filter (must have ALL specified tags)
    if (tags && typeof tags === 'string' && tags.length > 0) {
      const tagArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
      if (tagArray.length > 0) {
        where.AND = tagArray.map(tag => ({
          tags: { has: tag }
        }));
      }
    }

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

    // Apply showSent filter (requires checking messages)
    if (showSent === "true") {
      conversations = conversations.filter(conv =>
        conv.messages.some(msg => msg.direction === "outbound")
      );
    }

    // Apply hybrid needs-reply filter for conversations without tags (backward compatibility)
    // This handles conversations created before the tag system was implemented
    if (needsReply === "true") {
      conversations = conversations.filter(conv => {
        // Already filtered by tag above, but also check last message for old conversations
        if (conv.tags?.includes("needs-reply")) return true;

        // Fallback: check last message direction for conversations without tags
        if (!conv.tags || conv.tags.length === 0) {
          if (conv.messages.length === 0) return false;
          const lastMessage = conv.messages[conv.messages.length - 1];
          return lastMessage.direction === "inbound";
        }

        return false;
      });
    }

    // Apply hybrid resolved filter
    if (resolved === "true") {
      conversations = conversations.filter(conv => {
        // If has needs-reply tag, it's not resolved
        if (conv.tags?.includes("needs-reply")) return false;

        // For conversations without tags, check last message direction
        if (!conv.tags || conv.tags.length === 0) {
          if (conv.messages.length === 0) return true; // No messages = resolved
          const lastMessage = conv.messages[conv.messages.length - 1];
          return lastMessage.direction === "outbound";
        }

        return true;
      });
    }

    // Get total count after all filters
    const totalCount = conversations.length;

    // Apply pagination AFTER all filters
    const paginatedConversations = conversations.slice(skip, skip + limitNum);

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
app.get("/conversations/next-unreplied", async (_req: Request, res: Response) => {
  try {
    const unreplied = await getUnrepliedConversations();
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
    const unreplied = await getUnrepliedConversations();

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
    const whereClause = replyToEmail
      ? {
          // Has reply-to: match only conversations with same reply-to
          messages: {
            some: {
              replyToEmail: replyToEmail
            }
          },
          id: { not: req.params.id },
          archived: false,
        }
      : fromEmail
      ? {
          // No reply-to but has fromEmail: match by fromEmail
          messages: {
            some: {
              fromEmail: fromEmail,
              direction: "inbound"
            }
          },
          id: { not: req.params.id },
          archived: false,
        }
      : {
          // Fallback: match by customer ID
          customerId: conversation.customerId,
          id: { not: req.params.id },
          archived: false,
        };

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
async function getUnrepliedConversations() {
  const conversations = await prisma.conversation.findMany({
    where: {
      archived: false,
      NOT: {
        tags: { has: "non-customer-support" }
      }
    },
    include: {
      messages: {
        orderBy: { sentAt: "desc" },
        take: 1,
      },
    },
    orderBy: { lastMessageAt: "asc" }, // Oldest first
  });

  // Filter to only those where last message is inbound
  return conversations.filter(c =>
    c.messages.length > 0 && c.messages[0].direction === "inbound"
  );
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

      // If archiving, also remove needs-reply tag
      if (archived === true) {
        const conversation = await prisma.conversation.findUnique({
          where: { id: req.params.id },
        });

        if (conversation) {
          const updatedTags = (conversation.tags || []).filter(t => t !== "needs-reply");
          data.tags = updatedTags;
        }
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

// Archive conversation (with optional tag)
app.patch("/conversations/:id/archive", async (req: Request, res: Response) => {
  try {
    const { tag } = req.body;

    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
    });

    const data: any = { archived: true };

    if (conversation) {
      let updatedTags = conversation.tags || [];

      // Add the tag if provided
      if (tag) {
        updatedTags = [...updatedTags, tag];
      }

      // Remove "needs-reply" tag when archiving (resolved conversations shouldn't need reply)
      updatedTags = updatedTags.filter(t => t !== "needs-reply");

      data.tags = updatedTags;
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
app.patch("/conversations/:id/tags", async (req: Request, res: Response) => {
  try {
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: "Tags must be an array" });
    }

    // If "non-customer-support" tag is being added, also remove "needs-reply" tag
    let finalTags = tags;
    if (tags.includes("non-customer-support")) {
      finalTags = tags.filter(tag => tag !== "needs-reply");
    }

    const updated = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { tags: finalTags },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating tags:", error);
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
    const { conversationId, to, body, subject } = req.body;

    if (!to || !body) {
      return res.status(400).json({ error: "Missing required fields: to and body" });
    }

    let result;
    if (conversationId) {
      // Send as reply in existing thread
      result = await sendReply(conversationId, to, body);

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
      result = await sendNewEmail(to, subject || "No Subject", body);
    }

    res.json({ success: true, messageId: result.id });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
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
 *   amount?: string,
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

    const { refundLineItems, amount, reason, notify, note } = req.body;

    if (!refundLineItems || !Array.isArray(refundLineItems)) {
      return res.status(400).json({ error: "refundLineItems array is required" });
    }

    const refund = await shopify.createRefund(orderId, refundLineItems, {
      amount,
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
            usedCustomContext: false // Cached drafts didn't use custom context
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
      }
    ];

    // Build system prompt with optional additional context
    let systemPrompt = `You are an expert AI assistant for Outlight customer support. You have been trained on the company's complete knowledge base and have access to internal tools.`;

    // Add additional context section if provided - THIS TAKES HIGHEST PRIORITY
    if (additionalContext && additionalContext.trim()) {
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
${additionalContext}

═══════════════════════════════════════════════════════════
END OF CUSTOM CONTEXT
═══════════════════════════════════════════════════════════

Remember: The above is GUIDANCE. Craft a professional email using this information as your source of truth.
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
1. search_customer_and_orders(query): Search Shopify by email, name, or order number. Returns customer details and order history.
2. get_tracking_info(tracking_number): Get package tracking from 17track. Returns current status and location.

═══════════════════════════════════════════════════════════
⚡ WORKFLOW - EXECUTE IN THIS EXACT ORDER
═══════════════════════════════════════════════════════════

Step 1: READ THE EMAIL THREAD AND IDENTIFY LATEST MESSAGE
- ⚠️  CRITICAL: Your draft must RESPOND TO THE LATEST INBOUND MESSAGE (the most recent customer email)
- Read the full thread for context, but your response addresses the LATEST message
- Understand the customer's issue, tone, and urgency in their MOST RECENT message
- Extract: customer email, order numbers, tracking numbers, dates mentioned

Step 2: GATHER DATA USING TOOLS
- ALWAYS call search_customer_and_orders first with customer email or order number
- If tracking numbers exist in the order data, call get_tracking_info
- Collect ALL necessary information before proceeding

Step 3: ANALYZE WITH KNOWLEDGE BASE
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

      const completion = await openai.chat.completions.create(completionParams);
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
      console.log(`[Draft] Max tool calls reached, requesting final JSON response`);
      messages.push({
        role: "user",
        content: "Please provide the final response in the required JSON format."
      });

      const finalCompletion = await openai.chat.completions.create({
        model: "gpt-5-mini-2025-08-07", // Faster, more cost-efficient version of GPT-5
        messages,
        response_format: { type: "json_object" }
      });

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
          orderInfo: finalResult.orderInfo || null
        },
        update: {
          internalReasoning: finalResult.internalReasoning || null,
          tags: finalResult.tags || [],
          category: finalResult.category || null,
          reasoning: finalResult.reasoning || null,
          shouldDraft: finalResult.shouldDraft || false,
          draft: finalResult.draft || null,
          actionSteps: finalResult.actionSteps || null,
          orderInfo: finalResult.orderInfo || null
        }
      });
      console.log(`[Draft] Saved draft to database for conversation ${conversationId}`);
    } catch (error) {
      console.error("[Draft] Error saving draft to database:", error);
      // Don't fail the request if draft save fails
    }

    res.json({
      ...finalResult,
      conversationId,
      processingTime: new Date().toISOString(),
      toolCallsMade: toolCallCount,
      fromDatabase: false,
      usedCustomContext: !!(additionalContext && additionalContext.trim())
    });
  } catch (error) {
    console.error("Error generating draft:", error);
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