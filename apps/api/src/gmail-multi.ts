import { google } from "googleapis";
import { prisma } from "./db";
import type { Request, Response } from "express";

export type OutboundAttachment = {
  filename?: string;
  mimeType?: string;
  data: string;
  inline?: boolean;
  contentId?: string;
  size?: number;
};

// Get OAuth2 client for a specific workspace
function getOAuth2Client(workspace: { googleClientId: string; googleClientSecret: string }) {
  const oAuth2Client = new google.auth.OAuth2(
    workspace.googleClientId,
    workspace.googleClientSecret,
    process.env.GOOGLE_REDIRECT_URI!
  );
  return oAuth2Client;
}

// Start OAuth for specific workspace
export async function googleAuthStart(req: Request, res: Response) {
  const workspaceId = req.params.workspaceId as string;

  if (!workspaceId) {
    return res.status(400).send("Missing workspace ID");
  }

  console.log('[OAuth] Starting OAuth for workspace:', workspaceId);

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId }
  });

  if (!workspace) {
    return res.status(404).send("Workspace not found");
  }

  const oAuth2Client = getOAuth2Client(workspace);
  const scopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
  ];

  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    state: workspaceId // Pass workspace ID through OAuth flow
  });

  res.redirect(url);
}

// OAuth callback
export async function googleAuthCallback(req: Request, res: Response) {
  const code = req.query.code as string;
  const workspaceId = req.query.state as string;

  if (!workspaceId) {
    return res.status(400).send("Missing workspace ID");
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId }
  });

  if (!workspace) {
    return res.status(404).send("Workspace not found");
  }

  const oAuth2Client = getOAuth2Client(workspace);
  const { tokens } = await oAuth2Client.getToken(code);

  if (!tokens.refresh_token || !tokens.access_token || !tokens.expiry_date) {
    return res.status(400).send("Missing tokens from Google");
  }

  await prisma.oAuthToken.upsert({
    where: { workspaceId: workspace.id },
    update: {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiry: new Date(tokens.expiry_date!),
    },
    create: {
      workspaceId: workspace.id,
      provider: "gmail",
      accountEmail: workspace.gmailAccountEmail,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiry: new Date(tokens.expiry_date!),
    },
  });

  res.send(`<html><body><h1>✅ Authentication successful for ${workspace.name}!</h1><p>You can close this window and return to the app.</p></body></html>`);
}

// Get authenticated Gmail client for workspace
export async function getAuthedClient(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { oauthTokens: true }
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  // oauthTokens is a one-to-one relation, so we need to get the first element
  const tokens = await prisma.oAuthToken.findUnique({
    where: { workspaceId: workspace.id }
  });

  if (!tokens || !tokens.accessToken || !tokens.refreshToken) {
    throw new Error(`No OAuth tokens for workspace ${workspace.name}. Authorize first.`);
  }

  const oAuth2Client = getOAuth2Client(workspace);
  oAuth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });

  const { credentials } = await oAuth2Client.refreshAccessToken();
  await prisma.oAuthToken.update({
    where: { workspaceId: workspace.id },
    data: {
      accessToken: credentials.access_token!,
      expiry: new Date(credentials.expiry_date!)
    },
  });

  return {
    gmail: google.gmail({ version: "v1", auth: oAuth2Client }),
    workspace
  };
}

// Poll emails for specific workspace
export async function pollOnce(req: Request, res: Response) {
  const workspaceId = req.body.workspaceId || req.params.workspaceId as string;

  if (!workspaceId) {
    console.error('[Poll] Missing workspaceId in request');
    return res.status(400).json({ error: "Missing workspaceId" });
  }

  console.log('[Poll] Polling emails for workspace:', workspaceId);

  try {
    const { gmail, workspace } = await getAuthedClient(workspaceId);
    console.log('[Poll] Got authenticated client for workspace:', workspace.name);

    let newCount = 0;
    let existingCount = 0;
    const allThreadIds = new Set<string>();

    // Fetch threads sorted by most recent activity (Gmail's default)
    // No date filter - this ensures threads with recent replies are included
    // even if they were originally created a long time ago
    console.log(`[SYNC] ${workspace.name}: Fetching most recently active threads...`);

    let pageToken: string | undefined;
    let pageCount = 0;
    const MAX_PAGES = 15; // Increased to handle 1500 threads (1100+ emails + buffer)

    do {
      try {
        const allEmailsRes = await gmail.users.threads.list({
          userId: "me",
          q: `-in:spam -in:trash -in:draft`,
          maxResults: 100,
          pageToken,
        });

        const threads = allEmailsRes.data.threads || [];
        console.log(`[SYNC] ${workspace.name}: Page ${pageCount + 1}/${MAX_PAGES}: Found ${threads.length} threads`);
        threads.forEach((t) => t.id && allThreadIds.add(t.id));

        pageToken = allEmailsRes.data.nextPageToken || undefined;
        pageCount++;

        // Process up to MAX_PAGES to handle larger inboxes
        if (pageCount >= MAX_PAGES) {
          console.log(`[SYNC] ${workspace.name}: Reached ${MAX_PAGES} page limit (${allThreadIds.size} threads total)`);
          break;
        }
      } catch (err) {
        console.error(`[SYNC] Error fetching page ${pageCount + 1}:`, err instanceof Error ? err.message : String(err));
        // Continue with what we have so far instead of failing completely
        break;
      }
    } while (pageToken);

    console.log(`[SYNC] Total threads: ${allThreadIds.size}`);

    const threadIds = Array.from(allThreadIds);

    console.log(`[SYNC] Processing ${threadIds.length} threads...`);

    const errors: any[] = [];

    for (let i = 0; i < threadIds.length; i++) {
      const threadId = threadIds[i];

      if (i % 25 === 0 && i > 0) {
        console.log(`[SYNC] Progress: ${i}/${threadIds.length}`);
      }

      try {
        const existing = await prisma.conversation.findUnique({
          where: {
            workspaceId_gmailThreadId: {
              workspaceId: workspace.id,
              gmailThreadId: threadId
            }
          }
        });

        if (existing) {
          existingCount++;
        } else {
          newCount++;
        }

        await ingestThread(gmail, workspace, threadId);
      } catch (err) {
        console.error(`[SYNC] Error on thread ${threadId}:`, err instanceof Error ? err.message : String(err));
        errors.push({ threadId, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const failedCount = errors.length;

    res.json({
      success: true,
      workspace: workspace.name,
      total: threadIds.length,
      new: newCount,
      existing: existingCount,
      failed: failedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    console.error("Error polling Gmail:", error);
    res.status(500).json({ error: error.message });
  }
}

// Ingest a single thread
async function ingestThread(gmail: any, workspace: any, threadId: string): Promise<void> {
  const tr = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
  const messages = tr.data.messages ?? [];
  if (!messages.length) return;

  const first = messages[0];
  const subject = getHeader(first, "subject") || "";
  const fromEmail = parseEmail(getHeader(first, "from") || "");

  // Get or create customer (sequential processing = no race conditions)
  const customer = await prisma.customer.upsert({
    where: {
      workspaceId_primaryEmail: {
        workspaceId: workspace.id,
        primaryEmail: fromEmail
      }
    },
    update: { lastSeenAt: new Date() },
    create: {
      workspaceId: workspace.id,
      primaryEmail: fromEmail,
      name: null
    }
  });

  const lastInternal = messages[messages.length - 1].internalDate!;
  const convo = await prisma.conversation.upsert({
    where: {
      workspaceId_gmailThreadId: {
        workspaceId: workspace.id,
        gmailThreadId: threadId
      }
    },
    update: { subject, customerId: customer.id, lastMessageAt: new Date(Number(lastInternal)) },
    create: {
      workspaceId: workspace.id,
      gmailThreadId: threadId,
      subject,
      customerId: customer.id,
      status: "open",
      firstMessageAt: new Date(Number(first.internalDate!)),
      lastMessageAt: new Date(Number(lastInternal)),
    },
  });

  // Process all messages in parallel
  let draftCount = 0;
  let ingestedCount = 0;

  await Promise.all(messages.map(async (m: any) => {
    // CRITICAL: Skip draft messages - they should not be treated as sent/received emails
    const labelIds = m.labelIds || [];
    if (labelIds.includes("DRAFT")) {
      draftCount++;
      console.log(`[INGEST] ⏭️  Skipping draft message ${m.id} in thread ${threadId}`);
      return;
    }

    const dir = (getHeader(m, "from") || "").includes(workspace.gmailAccountEmail) ? "outbound" : "inbound";
    const sentAt = new Date(Number(m.internalDate!));
    const { html, text } = flattenParts(m.payload);
    const attachments = extractAttachments(m.payload);
    const replyTo = getHeader(m, "reply-to");

    await prisma.message.upsert({
      where: { gmailMessageId: m.id! },
      update: {
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
        attachments: attachments as any,
        replyToEmail: replyTo ? parseEmail(replyTo) : null,
      },
    });
    ingestedCount++;
  }));

  if (draftCount > 0) {
    console.log(`[INGEST] Thread ${threadId}: Skipped ${draftCount} draft(s), ingested ${ingestedCount} message(s)`);
  }

  // If all messages were drafts, delete the empty conversation
  if (ingestedCount === 0) {
    console.log(`[INGEST] ⚠️  Thread ${threadId} had only draft messages, deleting conversation ${convo.id}`);
    await prisma.conversation.delete({ where: { id: convo.id } });
    return;
  }

  // Auto-tag based on last message direction
  const conversationMessages = await prisma.message.findMany({
    where: { conversationId: convo.id },
    orderBy: { sentAt: "desc" },
    take: 1
  });

  if (conversationMessages.length === 0) {
    console.log(`[INGEST] ⚠️  No messages found for conversation ${convo.id}, skipping auto-tag`);
    return;
  }

  const lastMessage = conversationMessages[0];
  if (lastMessage) {

    // CRITICAL: Always fetch fresh conversation data to avoid race conditions
    // This ensures we have the absolute latest tags before making auto-tag decisions
    const freshConvo = await prisma.conversation.findUnique({
      where: { id: convo.id },
      select: {
        tags: true,
        archived: true,
        gmailThreadId: true,
        subject: true,
        // NEW V2 FIELDS
        needsReply: true,
        lastMessageDirection: true,
        userTags: true
      }
    });

    if (!freshConvo) {
      console.error(`[INGEST] Conversation ${convo.id} not found during auto-tag check`);
      return;
    }

    // NEW TAGGING SYSTEM V2: System manages needsReply, users manage userTags
    const isArchived = freshConvo.archived || false;
    const currentNeedsReply = freshConvo.needsReply || false;
    const currentDirection = freshConvo.lastMessageDirection;
    const userTags = freshConvo.userTags || [];

    console.log(`[INGEST V2] ${workspace.name} | ${freshConvo.subject?.substring(0, 40)}... | Thread: ${freshConvo.gmailThreadId.substring(0, 8)}... | LastMsg: ${lastMessage.direction} | needsReply: ${currentNeedsReply} | UserTags: ${JSON.stringify(userTags)}`);

    // RULE: Skip archived conversations entirely
    if (isArchived) {
      console.log(`[INGEST V2] ⏭️  Skipping auto-tag (archived)`);
      return;
    }

    // Determine what needsReply should be based on last message direction
    const shouldNeedReply = lastMessage.direction === "inbound";
    const newDirection = lastMessage.direction;

    // Only update if something changed
    if (currentNeedsReply !== shouldNeedReply || currentDirection !== newDirection) {
      console.log(`[INGEST V2] 🔄 Updating system tags: needsReply ${currentNeedsReply} → ${shouldNeedReply}, direction "${currentDirection}" → "${newDirection}"`);
      try {
        await prisma.conversation.update({
          where: { id: convo.id },
          data: {
            needsReply: shouldNeedReply,
            lastMessageDirection: newDirection,
          }
        });
        console.log(`[INGEST V2] ✅ Successfully updated system tags`);
      } catch (error) {
        console.error(`[INGEST V2] ❌ Failed to update system tags:`, error);
      }
    } else {
      console.log(`[INGEST V2] ✓ System tags already correct (needsReply=${shouldNeedReply}, direction="${newDirection}")`);
    }
  }
}

// Send reply
export async function sendReply(
  workspaceId: string,
  conversationId: string,
  to: string,
  body: string,
  attachments: OutboundAttachment[] = []
) {
  const { gmail, workspace } = await getAuthedClient(workspaceId);

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

  const threadId = conversation.gmailThreadId;
  const lastMessage = conversation.messages[0];

  const baseSubject = conversation.subject || "";
  const subjectLine = baseSubject.toLowerCase().startsWith("re:") ? baseSubject : `Re: ${baseSubject}`.trim();

  const raw = buildRawEmail({
    to,
    subject: subjectLine || "Re:",
    body,
    attachments,
    headers: [
      `In-Reply-To: ${lastMessage.gmailMessageId}`,
      `References: ${lastMessage.gmailMessageId}`,
    ],
  });

  const encodedMessage = Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
      threadId: threadId,
    },
  });

  const now = new Date();
  const storedAttachments = attachments.map(att => ({
    filename: att.filename || "attachment",
    mimeType: att.mimeType || "application/octet-stream",
    size: att.size,
    inline: att.inline || false,
    contentId: att.contentId,
    data: att.data,
  }));
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      gmailMessageId: result.data.id!,
      direction: "outbound",
      fromEmail: workspace.gmailAccountEmail,
      toEmails: [to] as any,
      ccEmails: [] as any,
      sentAt: now,
      bodyHtml: body,
      bodyText: body,
      attachments: storedAttachments as any,
    },
  });

  // NEW TAGGING SYSTEM V2: Update system tags after sending reply
  // needsReply = false (we just replied), lastMessageDirection = "outbound"
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: now,
      needsReply: false,              // System tag: we just replied
      lastMessageDirection: "outbound" // Track last message direction
      // userTags remain unchanged - user manages those
    },
  });

  console.log(`[Send Email V2] ✅ Updated system tags: needsReply=false, lastMessageDirection=outbound`);

  return result.data;
}

// Send new email
export async function sendNewEmail(
  workspaceId: string,
  to: string,
  subject: string,
  body: string,
  attachments: OutboundAttachment[] = []
) {
  const { gmail, workspace } = await getAuthedClient(workspaceId);

  const raw = buildRawEmail({
    to,
    subject,
    body,
    attachments,
  });

  const encodedMessage = Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
    },
  });

  return result.data;
}

// Helper functions
function getHeader(msg: any, name: string): string | undefined {
  const h = msg.payload?.headers?.find((x: any) => (x.name || "").toLowerCase() === name.toLowerCase());
  return h?.value;
}

function parseEmail(from: string): string {
  const m = from.match(/<(.+?)>/);
  const email = m ? m[1] : from;
  return email.trim().toLowerCase();
}

function flattenParts(payload: any): { html?: string[]; text?: string[] } {
  const out: { html?: string[]; text?: string[] } = {};
  const walk = (p: any) => {
    if (!p) return;
    if (p.mimeType === "text/html" && p.body?.data) {
      out.html = out.html || [];
      out.html.push(Buffer.from(p.body.data, "base64").toString("utf8"));
    }
    if (p.mimeType === "text/plain" && p.body?.data) {
      out.text = out.text || [];
      out.text.push(Buffer.from(p.body.data, "base64").toString("utf8"));
    }
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return out;
}

const chunkBase64 = (data: string) => data.replace(/(.{76})/g, "$1\r\n");

function buildRawEmail(options: {
  to: string;
  subject: string;
  body: string;
  attachments?: OutboundAttachment[];
  headers?: string[];
}): string {
  const { to, subject, body, attachments = [], headers = [] } = options;
  const baseHeaders = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    ...headers,
  ];

  if (!attachments.length) {
    return [...baseHeaders, 'Content-Type: text/html; charset="utf-8"', "", body].join("\r\n");
  }

  const boundary = `mixed_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const parts: string[] = [
    ...baseHeaders,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    body,
    "",
  ];

  attachments.forEach((attachment) => {
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${attachment.mimeType || "application/octet-stream"}`);
    parts.push("Content-Transfer-Encoding: base64");
    const disposition = attachment.inline ? "inline" : "attachment";
    parts.push(`Content-Disposition: ${disposition}; filename="${attachment.filename || "attachment"}"`);
    if (attachment.contentId) {
      parts.push(`Content-ID: <${attachment.contentId}>`);
    }
    parts.push("");
    parts.push(chunkBase64(attachment.data || ""));
    parts.push("");
  });

  parts.push(`--${boundary}--`);
  return parts.join("\r\n");
}

// Extract attachment metadata (and inline data when provided) from Gmail message parts
function extractAttachments(payload: any): any[] {
  const attachments: any[] = [];

  const normalizeBase64 = (data: string) => {
    // Gmail returns URL-safe base64; convert to standard for embedding
    return Buffer.from(data, "base64").toString("base64");
  };

  const walk = (part: any) => {
    if (!part) return;
    const filename = part.filename;
    const body = part.body || {};
    const headers = part.headers || [];
    const dispositionHeader = headers.find((h: any) => (h.name || "").toLowerCase() === "content-disposition");
    const contentIdHeader = headers.find((h: any) => (h.name || "").toLowerCase() === "content-id");

    const inline = (dispositionHeader?.value || "").toLowerCase().includes("inline");
    const contentId = contentIdHeader?.value ? contentIdHeader.value.replace(/[<>]/g, "") : undefined;

    if (filename && body) {
      const attachment: any = {
        filename,
        mimeType: part.mimeType,
        size: body.size || 0,
        attachmentId: body.attachmentId,
        inline,
        contentId,
      };

      // Some inline parts are fully inlined (no attachmentId) but carry data directly
      if (body.data) {
        attachment.data = normalizeBase64(body.data);
        attachment.inline = true;
      }

      attachments.push(attachment);
    }

    (part.parts || []).forEach(walk);
  };

  walk(payload);
  return attachments;
}
