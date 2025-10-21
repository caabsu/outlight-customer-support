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

  const sendProgress = (stage: string, percent: number, message: string) => {
    res.write(`data: ${JSON.stringify({ stage, percent, message })}\n\n`);
  };

  try {
    sendProgress('connecting', 10, 'Connecting to Gmail...');
    const gmail = await getAuthedClient();

    sendProgress('checking', 20, 'Checking for new emails...');
    const existing = await prisma.conversation.findFirst();

    // Fetch both inbox and sent emails
    let inboxThreads: any[] = [];
    let sentThreads: any[] = [];

    if (!existing) {
      sendProgress('fetching', 30, 'Fetching inbox (initial sync)...');
      const t = await gmail.users.threads.list({ userId: "me", q: "in:inbox", maxResults: 50 });
      inboxThreads = t.data.threads ?? [];

      sendProgress('fetching_sent', 50, 'Fetching sent emails...');
      const s = await gmail.users.threads.list({ userId: "me", q: "in:sent", maxResults: 50 });
      sentThreads = s.data.threads ?? [];
    } else {
      sendProgress('fetching', 30, 'Fetching recent inbox...');
      const t = await gmail.users.threads.list({ userId: "me", q: "in:inbox newer_than:2d", maxResults: 20 });
      inboxThreads = t.data.threads ?? [];

      sendProgress('fetching_sent', 50, 'Fetching recent sent...');
      const s = await gmail.users.threads.list({ userId: "me", q: "in:sent newer_than:2d", maxResults: 20 });
      sentThreads = s.data.threads ?? [];
    }

    // Combine and deduplicate threads
    const allThreadIds = new Set([...inboxThreads.map(t => t.id), ...sentThreads.map(t => t.id)]);
    const totalThreads = allThreadIds.size;

    sendProgress('processing', 60, `Processing ${totalThreads} threads...`);
    let processed = 0;

    for (const threadId of allThreadIds) {
      await ingestThread(gmail, threadId as string);
      processed++;
      const percent = 60 + Math.floor((processed / totalThreads) * 30);
      sendProgress('processing', percent, `Processing thread ${processed}/${totalThreads}...`);
    }

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
