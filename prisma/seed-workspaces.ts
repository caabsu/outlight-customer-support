import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding workspaces...');

  // Create Workspace 1
  const workspace1 = await prisma.workspace.upsert({
    where: { gmailAccountEmail: process.env.WORKSPACE_1_GMAIL! },
    update: {},
    create: {
      name: process.env.WORKSPACE_1_NAME!,
      gmailAccountEmail: process.env.WORKSPACE_1_GMAIL!,
      googleClientId: process.env.WORKSPACE_1_GOOGLE_CLIENT_ID!,
      googleClientSecret: process.env.WORKSPACE_1_GOOGLE_CLIENT_SECRET!,
    },
  });
  console.log('✅ Workspace 1 created:', workspace1.name);

  // Create Workspace 2
  const workspace2 = await prisma.workspace.upsert({
    where: { gmailAccountEmail: process.env.WORKSPACE_2_GMAIL! },
    update: {},
    create: {
      name: process.env.WORKSPACE_2_NAME!,
      gmailAccountEmail: process.env.WORKSPACE_2_GMAIL!,
      googleClientId: process.env.WORKSPACE_2_GOOGLE_CLIENT_ID!,
      googleClientSecret: process.env.WORKSPACE_2_GOOGLE_CLIENT_SECRET!,
    },
  });
  console.log('✅ Workspace 2 created:', workspace2.name);

  console.log('\n✅ Seeding complete!');
  console.log('Workspace IDs:');
  console.log('- Workspace 1:', workspace1.id);
  console.log('- Workspace 2:', workspace2.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
