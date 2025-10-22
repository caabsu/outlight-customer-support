import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
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
    const { starred, archived, excludeNonSupport, unreadOnly, page, limit } = req.query;

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

    if (excludeNonSupport === "true") {
      where.NOT = {
        tags: {
          has: "non-customer-support"
        }
      };
    }

    if (unreadOnly === "true") {
      where.unreadAgent = true;
    }

    // Pagination
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination
    const totalCount = await prisma.conversation.count({ where });

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        customer: true,
        messages: {
          orderBy: { sentAt: "asc" },
        },
      },
      orderBy: { lastMessageAt: "desc" },
      skip,
      take: limitNum,
    });

    res.json({
      conversations,
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

// Get a single conversation
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
    const whereClause = replyToEmail
      ? {
          // Has reply-to: match only conversations with same reply-to
          messages: {
            some: {
              replyToEmail: replyToEmail
            }
          },
          id: { not: req.params.id },
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
        }
      : {
          // Fallback: match by customer ID
          customerId: conversation.customerId,
          id: { not: req.params.id },
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

// Get oldest unreplied conversation
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
    const next = unreplied[currentIndex + 1] || unreplied[0];
    res.json(next || null);
  } catch (error) {
    console.error("Error fetching next unreplied:", error);
    res.status(500).json({ error: "Failed to fetch next unreplied" });
  }
});

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

    if (archived !== undefined) data.archived = archived;
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

    const data: any = { archived: true };

    if (tag) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: req.params.id },
      });

      if (conversation) {
        data.tags = [...(conversation.tags || []), tag];
      }
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

    const updated = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { tags },
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

    // Fetch ALL conversations in the time period (for total count)
    const allConversationsInPeriod = await prisma.conversation.findMany({
      where: {
        lastMessageAt: {
          gte: startDate
        }
      },
      include: {
        messages: {
          orderBy: { sentAt: "asc" }
        }
      }
    });

    // Count non-customer-support conversations
    const nonCustomerSupportConversations = allConversationsInPeriod.filter(conv =>
      conv.tags?.includes("non-customer-support")
    );

    // Get customer support conversations only (exclude non-customer-support)
    const conversations = allConversationsInPeriod.filter(conv =>
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

    // Unreplied conversations (needs reply)
    const unrepliedConversations = conversations.filter(conv => {
      if (conv.messages.length === 0) return false;
      const lastMessage = conv.messages[conv.messages.length - 1];
      return lastMessage.direction === "inbound";
    });

    // Resolved conversations (last message is outbound)
    const resolvedConversations = conversations.filter(conv => {
      if (conv.messages.length === 0) return false;
      const lastMessage = conv.messages[conv.messages.length - 1];
      return lastMessage.direction === "outbound";
    });

    const resolutionRate = totalConversations > 0
      ? (resolvedConversations.length / totalConversations) * 100
      : 0;

    // Volume trends (daily breakdown)
    const dailyVolume: { [key: string]: { inbound: number; outbound: number; total: number } } = {};

    allMessages.forEach(msg => {
      const dateKey = new Date(msg.sentAt).toISOString().split('T')[0];
      if (!dailyVolume[dateKey]) {
        dailyVolume[dateKey] = { inbound: 0, outbound: 0, total: 0 };
      }
      dailyVolume[dateKey].total++;
      if (msg.direction === "inbound") {
        dailyVolume[dateKey].inbound++;
      } else {
        dailyVolume[dateKey].outbound++;
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

    // Tag distribution
    const tagCounts: { [key: string]: number } = {};
    conversations.forEach(conv => {
      conv.tags?.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
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
        totalConversationsIncludingNonSupport: allConversationsInPeriod.length,
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
      volumeTrends: dailyVolume,
      tagDistribution: tagCounts
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

const port = process.env.PORT || 3001;
app.listen(port, () => console.log("API listening on", port));