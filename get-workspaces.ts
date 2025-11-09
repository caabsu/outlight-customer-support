import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getWorkspaces() {
  const workspaces = await prisma.workspace.findMany();
  console.log(JSON.stringify(workspaces.map(w => ({
    id: w.id,
    name: w.name,
    email: w.gmailAccountEmail
  })), null, 2));
  await prisma.$disconnect();
}

getWorkspaces();
