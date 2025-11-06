import { google } from "googleapis";
import { prisma } from "./db";
import type { Request, Response } from "express";
import * as gmailMulti from "./gmail-multi";

// Legacy endpoints that delegate to the first workspace for backward compatibility
async function getDefaultWorkspace() {
  const workspace = await prisma.workspace.findFirst({
    orderBy: { createdAt: 'asc' }
  });
  if (!workspace) {
    throw new Error("No workspace found. Please set up workspaces first.");
  }
  return workspace;
}

export async function googleAuthStart(_req: Request, res: Response) {
  try {
    const workspace = await getDefaultWorkspace();
    const req = { query: { workspace: workspace.id } } as any;
    await gmailMulti.googleAuthStart(req, res);
  } catch (error: any) {
    res.status(500).send(`Error: ${error.message}`);
  }
}

export async function googleAuthCallback(req: Request, res: Response) {
  // The callback is already workspace-aware via state parameter
  await gmailMulti.googleAuthCallback(req, res);
}

export async function getAuthedClient() {
  const workspace = await getDefaultWorkspace();
  const { gmail } = await gmailMulti.getAuthedClient(workspace.id);
  return gmail;
}

export async function pollOnce(_req: Request, res: Response) {
  try {
    const workspace = await getDefaultWorkspace();
    const req = { body: { workspaceId: workspace.id } } as any;
    await gmailMulti.pollOnce(req, res);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}


export async function sendReply(conversationId: string, to: string, body: string) {
  // Get conversation to find workspace
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { workspaceId: true }
  });

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  return await gmailMulti.sendReply(conversation.workspaceId, conversationId, to, body);
}

export async function sendNewEmail(to: string, subject: string, body: string) {
  const workspace = await getDefaultWorkspace();
  return await gmailMulti.sendNewEmail(workspace.id, to, subject, body);
}
