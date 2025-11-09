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

    // Fetch a reasonable window of threads (45 days)
    // We'll filter by last INBOUND message date during ingestion
    // 45 days balances catching old threads with new replies vs. timeout limits
    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
    const afterDate = Math.floor(fortyFiveDaysAgo.getTime() / 1000);

    // We only want threads with inbound messages from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    console.log(`[SYNC] ${workspace.name}: Fetching threads from last 45 days, filtering for inbound activity within 30 days...`);

    // Fetch ALL emails (not just inbox/sent) excluding spam, trash, and drafts
    // This ensures we get emails even if they've been archived or have special labels
    let pageToken: string | undefined;
    let pageCount = 0;
    const maxPages = 10; // Limit to 1000 threads max (10 pages × 100 per page) to avoid timeouts

    do {
      const allEmailsRes = await gmail.users.threads.list({
        userId: "me",
        // Get ALL emails from last 45 days, excluding spam, trash, and drafts
        q: `-in:spam -in:trash -in:draft after:${afterDate}`,
        maxResults: 100,
        pageToken,
      });

      const threads = allEmailsRes.data.threads || [];
      console.log(`[SYNC] ${workspace.name}: Page ${pageCount + 1}: Found ${threads.length} threads`);
      threads.forEach((t) => t.id && allThreadIds.add(t.id));

      pageToken = allEmailsRes.data.nextPageToken || undefined;
      pageCount++;
    } while (pageToken && pageCount < maxPages);

    console.log(`[Poll] Total threads fetched from last 45 days: ${allThreadIds.size}`);

    // Ingest each thread (limit to 500 to avoid timeouts)
    const allThreadIds_array = Array.from(allThreadIds);
    const threadIds = allThreadIds_array.slice(0, 500);

    if (allThreadIds_array.length > 500) {
      console.log(`[POLL] ⚠️  Limiting to 500 most recent threads (found ${allThreadIds_array.length})`);
    }

    console.log(`[POLL] Workspace ${workspace.name}: Processing ${threadIds.length} threads`);

    const errors: any[] = [];
    let skippedCount = 0;

    const results = await Promise.allSettled(
      threadIds.map(async (threadId) => {
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

          // Pass the 30-day threshold to filter by last inbound message
          const wasSkipped = await ingestThread(gmail, workspace, threadId, thirtyDaysAgo);
          if (wasSkipped) {
            skippedCount++;
          }
        } catch (err) {
          console.error(`[POLL] ❌ Failed to ingest thread ${threadId}:`, err);
          errors.push({ threadId, error: err instanceof Error ? err.message : String(err) });
          throw err;
        }
      })
    );

    // Log summary of failed threads
    const failedCount = results.filter(r => r.status === 'rejected').length;
    if (failedCount > 0) {
      console.error(`[POLL] ⚠️  ${failedCount} threads failed to ingest out of ${threadIds.length}`);
      console.error(`[POLL] Failed threads:`, errors);
    }

    if (skippedCount > 0) {
      console.log(`[POLL] ⏭️  Skipped ${skippedCount} threads (no recent inbound activity)`);
    }

    res.json({
      success: true,
      workspace: workspace.name,
      total: threadIds.length,
      new: newCount,
      existing: existingCount,
      skipped: skippedCount,
      failed: failedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    console.error("Error polling Gmail:", error);
    res.status(500).json({ error: error.message });
  }
}

// Ingest a single thread
// Returns true if thread was skipped (no recent inbound activity), false otherwise
async function ingestThread(gmail: any, workspace: any, threadId: string, inboundThreshold?: Date): Promise<boolean> {
  const tr = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
  const messages = tr.data.messages ?? [];
  if (!messages.length) return false;

  // If threshold is provided, check if last inbound message is recent enough
  if (inboundThreshold) {
    let lastInboundDate: Date | null = null;

    // Find the most recent inbound message
    for (const m of messages) {
      const from = getHeader(m, "from") || "";
      const isInbound = !from.includes(workspace.gmailAccountEmail);

      if (isInbound) {
        const messageDate = new Date(Number(m.internalDate));
        if (!lastInboundDate || messageDate > lastInboundDate) {
          lastInboundDate = messageDate;
        }
      }
    }

    // Skip thread if no inbound messages or last inbound is too old
    if (!lastInboundDate || lastInboundDate < inboundThreshold) {
      const first = messages[0];
      const subject = getHeader(first, "subject") || "";
      console.log(`[INGEST] ⏭️  Skipping thread ${threadId} - last inbound: ${lastInboundDate?.toISOString() || 'never'}, subject: ${subject.substring(0, 50)}`);

      // Delete conversation if it exists (it's now too old)
      await prisma.conversation.deleteMany({
        where: {
          workspaceId: workspace.id,
          gmailThreadId: threadId
        }
      });

      return true; // Thread was skipped
    }
  }

  const first = messages[0];
  const subject = getHeader(first, "subject") || "";
  const fromEmail = parseEmail(getHeader(first, "from") || "");

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
    },
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
    return false;
  }

  // Auto-tag based on last message direction
  const conversationMessages = await prisma.message.findMany({
    where: { conversationId: convo.id },
    orderBy: { sentAt: "desc" },
    take: 1
  });

  if (conversationMessages.length === 0) {
    console.log(`[INGEST] ⚠️  No messages found for conversation ${convo.id}, skipping auto-tag`);
    return false;
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
      return false;
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
      return false;
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

  return false; // Thread was successfully ingested
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
function getHeader(msg: any, name: string): string | undefined {
  const h = msg.payload?.headers?.find((x: any) => (x.name || "").toLowerCase() === name.toLowerCase());
  return h?.value;
}

function parseEmail(from: string): string {
  const m = from.match(/<(.+?)>/);
  return m ? m[1] : from;
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
