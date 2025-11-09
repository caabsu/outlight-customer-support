import { google } from "googleapis";
import { prisma } from "./db";
import type { Request, Response } from "express";

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

    // Sync ALL threads (no date filtering)

    console.log(`[SYNC] ${workspace.name}: Fetching most recent threads (NO DATE FILTER - sorted by recent activity)...`);

    // Fetch ALL threads (no limits, no date filters)
    // Gmail returns threads sorted by most recent activity
    let pageToken: string | undefined;
    let pageCount = 0;

    do {
      const allEmailsRes = await gmail.users.threads.list({
        userId: "me",
        // NO DATE FILTER - just exclude spam, trash, and drafts
        // Gmail returns threads sorted by most recent activity
        q: `-in:spam -in:trash -in:draft`,
        maxResults: 100,
        pageToken,
      });

      const threads = allEmailsRes.data.threads || [];
      console.log(`[SYNC] ${workspace.name}: Page ${pageCount + 1}: Found ${threads.length} threads`);
      threads.forEach((t) => t.id && allThreadIds.add(t.id));

      pageToken = allEmailsRes.data.nextPageToken || undefined;
      pageCount++;

      // Safety limit: stop at 10 pages (1000 threads) to avoid extreme timeouts
      if (pageCount >= 10) {
        console.log(`[SYNC] Reached 10 page limit, stopping fetch`);
        break;
      }
    } while (pageToken);

    console.log(`[SYNC] Total threads fetched: ${allThreadIds.size}`);

    // Process ALL threads (no limit)
    const allThreadIds_array = Array.from(allThreadIds);
    const threadIds = allThreadIds_array;

    console.log(`[POLL] Processing ${threadIds.length} threads in BATCHES (faster with retry logic)...`);

    const errors: any[] = [];
    const BATCH_SIZE = 10; // Process 10 threads at a time in parallel

    // Process threads in parallel batches
    for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
      const batch = threadIds.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(threadIds.length / BATCH_SIZE);

      console.log(`[POLL] Batch ${batchNum}/${totalBatches} (${batch.length} threads)...`);

      const batchPromises = batch.map(async (threadId) => {
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
          console.error(`[POLL] ❌ Failed to ingest thread ${threadId}:`, err);
          errors.push({ threadId, error: err instanceof Error ? err.message : String(err) });
          throw err;
        }
      });

      await Promise.allSettled(batchPromises);
    }

    const failedCount = errors.length;
    if (failedCount > 0) {
      console.error(`[POLL] ⚠️  ${failedCount} threads failed to ingest out of ${threadIds.length}`);
      console.error(`[POLL] Failed threads:`, errors);
    }

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

  // Get or create customer with retry logic
  const customer = await upsertCustomerWithRetry(workspace.id, fromEmail);

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
        attachments: [] as any,
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
      select: { tags: true, archived: true, gmailThreadId: true, subject: true }
    });

    if (!freshConvo) {
      console.error(`[INGEST] Conversation ${convo.id} not found during auto-tag check`);
      return;
    }

    const currentTags = freshConvo.tags || [];
    const isNonSupport = currentTags.includes("non-customer-support");
    const isArchived = freshConvo.archived || false;
    const isAdmin = currentTags.includes("admin");
    const hasNeedsReply = currentTags.includes("needs-reply");

    console.log(`[INGEST] ${workspace.name} | ${freshConvo.subject} | Thread: ${freshConvo.gmailThreadId.substring(0, 8)}... | Tags: ${JSON.stringify(currentTags)} | LastMsg: ${lastMessage.direction} | NonSupport: ${isNonSupport} | Archived: ${isArchived} | Admin: ${isAdmin}`);

    // RULE: Never auto-tag if conversation has special tags or is archived
    if (isNonSupport || isArchived || isAdmin) {
      console.log(`[INGEST] ⏭️  Skipping auto-tag (special status)`);
      return;
    }

    // RULE: Add "needs-reply" if last message is inbound
    if (lastMessage.direction === "inbound") {
      if (!hasNeedsReply) {
        console.log(`[INGEST] ➕ Adding needs-reply tag to conversation ${convo.id}`);
        try {
          await prisma.conversation.update({
            where: { id: convo.id },
            data: { tags: [...currentTags, "needs-reply"] }
          });
          console.log(`[INGEST] ✅ Successfully added needs-reply tag`);
        } catch (error) {
          console.error(`[INGEST] ❌ Failed to add needs-reply tag:`, error);
        }
      } else {
        console.log(`[INGEST] ✓ Already has needs-reply tag`);
      }
    }
    // RULE: Remove "needs-reply" if last message is outbound
    else if (lastMessage.direction === "outbound") {
      if (hasNeedsReply) {
        console.log(`[INGEST] ➖ Removing needs-reply tag from conversation ${convo.id} (replied)`);
        try {
          await prisma.conversation.update({
            where: { id: convo.id },
            data: { tags: currentTags.filter(tag => tag !== "needs-reply") }
          });
          console.log(`[INGEST] ✅ Successfully removed needs-reply tag`);
        } catch (error) {
          console.error(`[INGEST] ❌ Failed to remove needs-reply tag:`, error);
        }
      } else {
        console.log(`[INGEST] ✓ No needs-reply tag to remove`);
      }
    }
  }
}

// Send reply
export async function sendReply(workspaceId: string, conversationId: string, to: string, body: string) {
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

  const raw = [
    `To: ${to}`,
    `Subject: Re: ${conversation.subject || ""}`,
    `In-Reply-To: ${lastMessage.gmailMessageId}`,
    `References: ${lastMessage.gmailMessageId}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    body,
  ].join("\r\n");

  const encodedMessage = Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
      threadId: threadId,
    },
  });

  const now = new Date();
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
      attachments: [] as any,
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: now,
      tags: (conversation.tags || []).filter(tag => tag !== "needs-reply")
    },
  });

  return result.data;
}

// Send new email
export async function sendNewEmail(workspaceId: string, to: string, subject: string, body: string) {
  const { gmail, workspace } = await getAuthedClient(workspaceId);

  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    body,
  ].join("\r\n");

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
async function upsertCustomerWithRetry(workspaceId: string, email: string, maxRetries = 5): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Try to find existing customer first
      let customer = await prisma.customer.findUnique({
        where: {
          workspaceId_primaryEmail: {
            workspaceId: workspaceId,
            primaryEmail: email
          }
        }
      });

      if (customer) {
        // Customer exists, update lastSeenAt
        return await prisma.customer.update({
          where: { id: customer.id },
          data: { lastSeenAt: new Date() }
        });
      }

      // Customer doesn't exist, try to create
      return await prisma.customer.create({
        data: {
          workspaceId: workspaceId,
          primaryEmail: email,
          name: null,
          lastSeenAt: new Date()
        }
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Race condition - another thread created it
        if (attempt < maxRetries) {
          console.log(`[RETRY] Customer race condition for ${email}, attempt ${attempt}/${maxRetries}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
          continue;
        }
        // Last attempt - just fetch the customer
        const customer = await prisma.customer.findUnique({
          where: {
            workspaceId_primaryEmail: {
              workspaceId: workspaceId,
              primaryEmail: email
            }
          }
        });
        if (customer) return customer;
      }
      throw error;
    }
  }
  throw new Error(`Failed to get/create customer ${email} after ${maxRetries} attempts`);
}

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
