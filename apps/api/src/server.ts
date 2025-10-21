import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { googleAuthStart, googleAuthCallback, pollOnce, sendReply } from "./gmail";
import { prisma } from "./db";

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
    const { starred, archived, excludeNonSupport, unreadOnly } = req.query;

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

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        customer: true,
        messages: {
          orderBy: { sentAt: "asc" },
        },
      },
      orderBy: { lastMessageAt: "desc" },
    });
    res.json(conversations);
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

    // Get the reply-to email from the most recent inbound message
    const replyToEmail = conversation.messages[0]?.replyToEmail;

    // CRITICAL FIX: If reply-to exists, ONLY match conversations with that EXACT reply-to
    // Do NOT match by customer ID, do NOT match by sent-from address
    // ONLY match messages where replyToEmail field equals our target
    const whereClause = replyToEmail
      ? {
          messages: {
            some: {
              replyToEmail: replyToEmail
            }
          },
          id: { not: req.params.id },
        }
      : {
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

// Send a reply to a conversation
app.post("/messages", async (req: Request, res: Response) => {
  try {
    const { conversationId, to, body } = req.body;

    if (!conversationId || !to || !body) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await sendReply(conversationId, to, body);
    res.json({ success: true, messageId: result.id });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log("API listening on", port));