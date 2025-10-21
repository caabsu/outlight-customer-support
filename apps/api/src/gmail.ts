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
  const row = await prisma.oAuthToken.findFirst({ where: { accountEmail: process.env.GMAIL_ACCOUNT_EMAIL! } });
  if (!row) throw new Error("No OAuth tokens saved. Hit /oauth/google first.");

  const oAuth2Client = oauth2();
  oAuth2Client.setCredentials({
    access_token: row.accessToken,
    refresh_token: row.refreshToken,
  });

  const { credentials } = await oAuth2Client.refreshAccessToken();
  await prisma.oAuthToken.update({
    where: { accountEmail: process.env.GMAIL_ACCOUNT_EMAIL! },
    data: { accessToken: credentials.access_token!, expiry: new Date(credentials.expiry_date!) },
  });
  return google.gmail({ version: "v1", auth: oAuth2Client });
}

export async function pollOnce(_req: Request, res: Response) {
  const gmail = await getAuthedClient();

  const existing = await prisma.conversation.findFirst();
  if (!existing) {
    const t = await gmail.users.threads.list({ userId: "me", q: "in:inbox", maxResults: 50 });
    const threads = t.data.threads ?? [];
    for (const th of threads) await ingestThread(gmail, th.id!);
    return res.json({ ingestedThreads: threads.length });
  }

  const t = await gmail.users.threads.list({ userId: "me", q: "in:inbox newer_than:2d", maxResults: 20 });
  const threads = t.data.threads ?? [];
  for (const th of threads) await ingestThread(gmail, th.id!);
  res.json({ updatedThreads: threads.length });
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

  // Process all messages in parallel for better performance
  await Promise.all(messages.map(async (m) => {
    const dir = (getHeader(m, "from") || "").includes(process.env.GMAIL_ACCOUNT_EMAIL!) ? "outbound" : "inbound";
    const sentAt = new Date(Number(m.internalDate!));
    const { html, text } = flattenParts(m.payload);
    const replyTo = getHeader(m, "reply-to");

    await prisma.message.upsert({
      where: { gmailMessageId: m.id! },
      update: {
        // Update replyToEmail for existing messages on re-poll
        replyToEmail: replyTo ? parseEmail(replyTo) : null,
      },
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
        replyToEmail: replyTo ? parseEmail(replyTo) : null,
      },
    });
  }));
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
    include: { messages: { orderBy: { sentAt: "desc" } } }
  });

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // Find the most recent inbound message to check for Reply-To
  const lastInboundMessage = conversation.messages.find(m => m.direction === "inbound");
  const recipientEmail = lastInboundMessage?.replyToEmail || to;

  // Create email in RFC 2822 format
  const subject = conversation.subject;
  const emailLines = [
    `To: ${recipientEmail}`,
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
      toEmails: [recipientEmail] as any,
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
