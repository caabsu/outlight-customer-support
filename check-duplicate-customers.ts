import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDuplicates() {
  console.log('Checking for duplicate customer emails across workspaces...\n');

  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      primaryEmail: true,
      workspaceId: true,
      workspace: {
        select: {
          name: true
        }
      }
    }
  });

  // Group by email
  const emailMap = new Map<string, any[]>();
  for (const customer of customers) {
    if (!emailMap.has(customer.primaryEmail)) {
      emailMap.set(customer.primaryEmail, []);
    }
    emailMap.get(customer.primaryEmail)!.push(customer);
  }

  // Find duplicates
  const duplicates = Array.from(emailMap.entries())
    .filter(([email, customers]) => customers.length > 1);

  if (duplicates.length === 0) {
    console.log('✅ No duplicate emails found across workspaces');
  } else {
    console.log(`❌ Found ${duplicates.length} emails used across multiple workspaces:\n`);
    duplicates.forEach(([email, customers]) => {
      console.log(`Email: ${email}`);
      customers.forEach(c => {
        console.log(`  - Workspace: ${c.workspace.name} (${c.workspaceId})`);
      });
      console.log('');
    });
  }

  await prisma.$disconnect();
}

checkDuplicates();
