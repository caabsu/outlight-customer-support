import { google } from "googleapis";
import { prisma } from "./db";
import type { Request, Response } from "express";

function oauth2() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  );
  return oAuth2Client;
}

// Cache the authenticated client to avoid refreshing tokens on every request
let cachedGmailClient: any = null;
let cacheExpiry: number = 0;

export async function googleAuthStart(_req: Request, res: Response) {
  const oAuth2Client = oauth2();
  const scopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
  ];
  const url = oAuth2Client.generateAuthUrl({ access_type: "offline", scope: scopes, prompt: "consent" });
  res.redirect(url);
}

export async function googleAuthCallback(req: Request, res: Response) {
  const code = req.query.code as string;
  const oAuth2Client = oauth2();
  const { tokens } = await oAuth2Client.getToken(code);
  if (!tokens.refresh_token || !tokens.access_token || !tokens.expiry_date) {
    return res.status(400).send("Missing tokens from Google");
  }
  await prisma.oAuthToken.upsert({
    where: { accountEmail: process.env.GMAIL_ACCOUNT_EMAIL! },
    update: {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiry: new Date(tokens.expiry_date!),
    },
    create: {
      provider: "gmail",
      accountEmail: process.env.GMAIL_ACCOUNT_EMAIL!,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiry: new Date(tokens.expiry_date!),
    },
  });
  res.send("Gmail connected. You can close this window.");
}

async function getAuthedClient() {
  // Return cached client if still valid (expires in 5 minutes)
  const now = Date.now();
  if (cachedGmailClient && now < cacheExpiry) {
    return cachedGmailClient;
  }

  const row = await prisma.oAuthToken.findFirst({ where: { accountEmail: process.env.GMAIL_ACCOUNT_EMAIL! } });
  if (!row) throw new Error("No OAuth tokens saved. Hit /oauth/google first.");

  const oAuth2Client = oauth2();
  oAuth2Client.setCredentials({
    access_token: row.accessToken,
    refresh_token: row.refreshToken,
  });

  // Only refresh if token is expired or about to expire
  const tokenExpiry = row.expiry.getTime();
  if (now >= tokenExpiry - 60000) { // Refresh if expires in < 1 minute
    const { credentials } = await oAuth2Client.refreshAccessToken();
    await prisma.oAuthToken.update({
      where: { accountEmail: process.env.GMAIL_ACCOUNT_EMAIL! },
      data: { accessToken: credentials.access_token!, expiry: new Date(credentials.expiry_date!) },
    });
  }

  cachedGmailClient = google.gmail({ version: "v1", auth: oAuth2Client });
  cacheExpiry = now + 5 * 60 * 1000; // Cache for 5 minutes
  return cachedGmailClient;
}

export async function pollOnce(_req: Request, res: Response) {
  // Set up Server-Sent Events for progress tracking
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Flush headers immediately

  const sendProgress = (stage: string, percent: number, message: string) => {
    const data = JSON.stringify({ stage, percent, message });
    res.write(`data: ${data}\n\n`);
  };

  try {
    // Step 1: Get Gmail client (15%)
    sendProgress('connecting', 15, 'Connecting to Gmail...');
    const gmail = await getAuthedClient();

    // Step 2: Check if initial sync needed (25%)
    sendProgress('checking', 25, 'Checking sync status...');
    const existing = await prisma.conversation.findFirst();
    const isInitialSync = !existing;

    // Step 3: Fetch thread lists in parallel (35%)
    sendProgress('fetching', 35, 'Fetching email threads...');
    const query = isInitialSync ? "" : "newer_than:2d";
    const maxResults = isInitialSync ? 50 : 20;

    const [inboxResponse, sentResponse] = await Promise.all([
      gmail.users.threads.list({
        userId: "me",
        q: query ? `in:inbox ${query}` : "in:inbox",
        maxResults
      }),
      gmail.users.threads.list({
        userId: "me",
        q: query ? `in:sent ${query}` : "in:sent",
        maxResults
      })
    ]);

    // Combine and deduplicate thread IDs
    const allThreadIds = new Set([
      ...(inboxResponse.data.threads || []).map(t => t.id!),
      ...(sentResponse.data.threads || []).map(t => t.id!)
    ]);

    const threadIds = Array.from(allThreadIds);
    const totalThreads = threadIds.length;

    if (totalThreads === 0) {
      sendProgress('complete', 100, 'No new emails to sync');
      res.write(`data: ${JSON.stringify({ done: true, totalThreads: 0 })}\n\n`);
      res.end();
      return;
    }

    // Step 4: Process threads in parallel batches (40-95%)
    sendProgress('processing', 40, `Processing ${totalThreads} threads...`);
    const BATCH_SIZE = 5; // Process 5 threads at a time
    let processed = 0;

    for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
      const batch = threadIds.slice(i, i + BATCH_SIZE);

      // Process batch in parallel
      await Promise.all(
        batch.map(threadId => ingestThread(gmail, threadId).catch(err => {
          console.error(`Failed to ingest thread ${threadId}:`, err);
          return null; // Continue even if one fails
        }))
      );

      processed += batch.length;
      const percent = 40 + Math.floor((processed / totalThreads) * 55);
      sendProgress('processing', percent, `Synced ${processed}/${totalThreads} threads`);
    }

    // Step 5: Complete (100%)
    sendProgress('complete', 100, `Synced ${totalThreads} threads successfully`);
    res.write(`data: ${JSON.stringify({ done: true, totalThreads })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Poll error:', error);
    sendProgress('error', 0, error instanceof Error ? error.message : 'Failed to sync emails');
    res.end();
  }
}

async function ingestThread(gmail: any, threadId: string) {
  const tr = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
  const messages = tr.data.messages ?? [];
  if (!messages.length) return;

  const first = messages[0];
  const subject = getHeader(first, "subject") || "";
  const fromEmail = parseEmail(getHeader(first, "from") || "");

  const customer = await prisma.customer.upsert({
    where: { primaryEmail: fromEmail },
    update: { lastSeenAt: new Date() },
    create: { primaryEmail: fromEmail, name: null },
  });

  const lastInternal = messages[messages.length - 1].internalDate!;
  const convo = await prisma.conversation.upsert({
    where: { gmailThreadId: threadId },
    update: { subject, customerId: customer.id, lastMessageAt: new Date(Number(lastInternal)) },
    create: {
      gmailThreadId: threadId,
      subject,
      customerId: customer.id,
      status: "open",
      firstMessageAt: new Date(Number(first.internalDate!)),
      lastMessageAt: new Date(Number(lastInternal)),
    },
  });

  for (const m of messages) {
    const dir = (getHeader(m, "from") || "").includes(process.env.GMAIL_ACCOUNT_EMAIL!) ? "outbound" : "inbound";
    const sentAt = new Date(Number(m.internalDate!));
    const { html, text } = flattenParts(m.payload);

    await prisma.message.upsert({
      where: { gmailMessageId: m.id! },
      update: {},
      create: {
        conversationId: convo.id,
        gmailMessageId: m.id!,
        direction: dir,
        fromEmail: getHeader(m, "from") || "",
        toEmails: (getHeader(m, "to") || "").split(",").map(s => s.trim()).filter(Boolean) as any,
        ccEmails: (getHeader(m, "cc") || "").split(",").map(s => s.trim()).filter(Boolean) as any,
        sentAt,
        bodyHtml: html?.join("\n") || null,
        bodyText: text?.join("\n") || null,
        attachments: [] as any,
      },
    });
  }
}

function getHeader(msg: any, name: string): string | undefined {
  const h = msg.payload?.headers?.find((x: any) => (x.name || "").toLowerCase() === name.toLowerCase());
  return h?.value;
}
function parseEmail(from: string): string { const m = from.match(/<(.+?)>/); return m ? m[1] : from; }
function flattenParts(payload: any): { html?: string[]; text?: string[] } {
  const out: { html?: string[]; text?: string[] } = {};
  const walk = (p: any) => {
    if (!p) return;
    if (p.mimeType === "text/html" && p.body?.data) { out.html = out.html || []; out.html.push(Buffer.from(p.body.data, "base64").toString("utf8")); }
    if (p.mimeType === "text/plain" && p.body?.data) { out.text = out.text || []; out.text.push(Buffer.from(p.body.data, "base64").toString("utf8")); }
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return out;
}

export async function sendReply(conversationId: string, to: string, body: string) {
  const gmail = await getAuthedClient();

  // Get the conversation to find the thread ID
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { sentAt: "asc" } } }
  });

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // Create email in RFC 2822 format
  const subject = conversation.subject;
  const emailLines = [
    `To: ${to}`,
    `Subject: Re: ${subject}`,
    ``,
    body,
  ];
  const email = emailLines.join("\r\n");
  const encodedMessage = Buffer.from(email)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // Send the email as part of the thread
  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
      threadId: conversation.gmailThreadId,
    },
  });

  // Store the sent message in the database
  const now = new Date();
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      gmailMessageId: result.data.id!,
      direction: "outbound",
      fromEmail: process.env.GMAIL_ACCOUNT_EMAIL!,
      toEmails: [to] as any,
      ccEmails: [] as any,
      sentAt: now,
      bodyHtml: null,
      bodyText: body,
      attachments: [] as any,
    },
  });

  // Update conversation last message time
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: now },
  });

  return result.data;
}
