import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { googleAuthStart, googleAuthCallback, pollOnce, sendReply } from "./gmail";
import { prisma } from "./db";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

app.get("/oauth/google", googleAuthStart);
app.get("/oauth/google/callback", googleAuthCallback);
app.post("/gmail/poll", pollOnce);

// Get all conversations with messages
app.get("/conversations", async (_req: Request, res: Response) => {
  try {
    const conversations = await prisma.conversation.findMany({
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