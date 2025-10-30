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

export async function getAuthedClient() {
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

  console.log("[Gmail Poll] Fetching ALL emails from Gmail with pagination (including archived)...");

  // ALWAYS fetch ALL emails (no time filters, includes archived emails)
  // Using "-in:trash -in:spam" fetches everything except deleted/spam emails
  // This includes inbox, sent, and archived emails
  // The upsert logic prevents duplicates, so this is safe and ensures we catch everything
  const allThreads = await fetchAllThreads(gmail, "-in:trash -in:spam");

  console.log(`[Gmail Poll] Found ${allThreads.length} total threads (including inbox, sent, and archived)`);

  // Process threads in parallel for much faster performance
  // Use Set to avoid processing same thread twice (if it's both inbox and sent)
  const uniqueThreadIds = new Set(allThreads.map(th => th.id!));
  console.log(`[Gmail Poll] Processing ${uniqueThreadIds.size} unique threads`);

  // Count how many are new vs existing
  const existingCount = await prisma.conversation.count({
    where: {
      gmailThreadId: {
        in: Array.from(uniqueThreadIds)
      }
    }
  });

  console.log(`[Gmail Poll] ${existingCount} threads already in database, ${uniqueThreadIds.size - existingCount} are new`);

  await Promise.all(Array.from(uniqueThreadIds).map(id => ingestThread(gmail, id)));

  res.json({
    totalThreads: uniqueThreadIds.size,
    existingThreads: existingCount,
    newThreads: uniqueThreadIds.size - existingCount
  });
}

/**
 * Fetch all threads matching a query using pagination
 * Recursively fetches all pages until no more results
 */
export async function fetchAllThreads(gmail: any, query: string): Promise<any[]> {
  const allThreads: any[] = [];
  let pageToken: string | undefined = undefined;
  let pageCount = 0;
  const MAX_RESULTS_PER_PAGE = 100; // Gmail API max is 500, but 100 is safer

  do {
    pageCount++;
    console.log(`[Gmail Fetch] Page ${pageCount} for query "${query}" ${pageToken ? `(token: ${pageToken.substring(0, 20)}...)` : '(first page)'}`);

    const response = await gmail.users.threads.list({
      userId: "me",
      q: query,
      maxResults: MAX_RESULTS_PER_PAGE,
      pageToken: pageToken
    });

    const threads = response.data.threads || [];
    allThreads.push(...threads);

    console.log(`[Gmail Fetch] Page ${pageCount} returned ${threads.length} threads. Total so far: ${allThreads.length}`);

    pageToken = response.data.nextPageToken;

    // Safety check: prevent infinite loops (max 50 pages = 5000 threads)
    if (pageCount >= 50) {
      console.warn(`[Gmail Fetch] WARNING: Hit maximum page limit (50 pages). Stopping pagination. Total threads: ${allThreads.length}`);
      break;
    }

  } while (pageToken);

  console.log(`[Gmail Fetch] Finished fetching "${query}". Total threads: ${allThreads.length} across ${pageCount} pages`);
  return allThreads;
}

export async function ingestThread(gmail: any, threadId: string) {
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
  await Promise.all(messages.map(async (m: any) => {
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
    include: {
      messages: { orderBy: { sentAt: "desc" } },
      customer: true
    }
  });

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // CRITICAL: Always use the explicitly provided 'to' address
  // Only fall back to Reply-To if no explicit address is provided
  const lastInboundMessage = conversation.messages.find(m => m.direction === "inbound");
  const recipientEmail = to || lastInboundMessage?.replyToEmail || conversation.customer?.primaryEmail;

  // Create email in RFC 2822 format with HTML content type
  const subject = conversation.subject;
  const emailLines = [
    `To: ${recipientEmail}`,
    `Subject: Re: ${subject}`,
    `Content-Type: text/html; charset=UTF-8`,
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

export async function sendNewEmail(to: string, subject: string, body: string) {
  const gmail = await getAuthedClient();

  // Create email in RFC 2822 format with HTML content type (not as a reply, so no threadId)
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    body,
  ];
  const email = emailLines.join("\r\n");
  const encodedMessage = Buffer.from(email)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // Send the email as a new thread (no threadId)
  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
      // No threadId - this creates a new email thread
    },
  });

  // Note: We don't store this in the database as it's not part of any conversation
  // It will be picked up on the next poll if the recipient replies

  return result.data;
}
