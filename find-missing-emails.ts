/**
 * Find Missing Emails
 *
 * Lists all emails from Gmail and shows which ones are missing from the database
 */

import { PrismaClient } from '@prisma/client';
import { getAuthedClient } from './apps/api/src/gmail-multi';

const prisma = new PrismaClient();

async function findMissingEmails(workspaceId: string) {
  console.log('\n🔍 FINDING MISSING EMAILS');
  console.log('='.repeat(80));

  try {
    const { gmail, workspace } = await getAuthedClient(workspaceId);
    console.log(`✅ Authenticated as: ${workspace.gmailAccountEmail}\n`);

    // Fetch last 3 days of emails
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const afterDate = Math.floor(threeDaysAgo.getTime() / 1000);

    console.log(`📧 Fetching emails from last 3 days (after ${threeDaysAgo.toISOString()})...\n`);

    // Fetch all emails
    const response = await gmail.users.threads.list({
      userId: 'me',
      q: `-in:spam -in:trash -in:draft after:${afterDate}`,
      maxResults: 50
    });

    const threads = response.data.threads || [];
    console.log(`Found ${threads.length} threads in Gmail\n`);

    const missingThreads: any[] = [];
    const existingThreads: any[] = [];

    for (const thread of threads) {
      // Fetch full thread details
      const fullThread = await gmail.users.threads.get({
        userId: 'me',
        id: thread.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date']
      });

      const messages = fullThread.data.messages || [];
      const firstMsg = messages[0];
      const headers = firstMsg?.payload?.headers || [];

      const getHeader = (name: string) =>
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      const subject = getHeader('Subject');
      const from = getHeader('From');
      const date = getHeader('Date');
      const labels = firstMsg?.labelIds || [];

      // Check if in database
      const inDb = await prisma.conversation.findUnique({
        where: {
          workspaceId_gmailThreadId: {
            workspaceId: workspaceId,
            gmailThreadId: thread.id!
          }
        }
      });

      const threadInfo = {
        threadId: thread.id,
        subject: subject.substring(0, 60) + (subject.length > 60 ? '...' : ''),
        from: from.substring(0, 40) + (from.length > 40 ? '...' : ''),
        date,
        labels,
        messageCount: messages.length,
        inDatabase: !!inDb
      };

      if (!inDb) {
        missingThreads.push(threadInfo);
      } else {
        existingThreads.push(threadInfo);
      }
    }

    console.log(`\n✅ THREADS IN DATABASE: ${existingThreads.length}`);
    console.log(`❌ MISSING FROM DATABASE: ${missingThreads.length}\n`);

    if (missingThreads.length > 0) {
      console.log('='.repeat(80));
      console.log('❌ MISSING THREADS:\n');

      missingThreads.forEach((t, i) => {
        console.log(`${i + 1}. Thread ID: ${t.threadId}`);
        console.log(`   Subject: ${t.subject}`);
        console.log(`   From: ${t.from}`);
        console.log(`   Date: ${t.date}`);
        console.log(`   Labels: ${t.labels.join(', ')}`);
        console.log(`   Messages: ${t.messageCount}`);

        // Check for issues
        const issues = [];
        if (t.labels.includes('SPAM')) issues.push('⚠️  SPAM');
        if (t.labels.includes('TRASH')) issues.push('⚠️  TRASH');
        if (t.labels.includes('DRAFT')) issues.push('⚠️  DRAFT');

        if (issues.length > 0) {
          console.log(`   Issues: ${issues.join(', ')}`);
        }
        console.log('');
      });

      console.log('\n💡 TO DEBUG A SPECIFIC THREAD:');
      console.log('   npx tsx debug-specific-email.ts <THREAD_ID> <WORKSPACE_ID>');
      console.log('\n   Example:');
      console.log(`   npx tsx debug-specific-email.ts ${missingThreads[0].threadId} ${workspaceId}\n`);
    } else {
      console.log('✅ All threads are synced!\n');
    }

  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

const workspaceId = process.argv[2];

if (!workspaceId) {
  console.log('\n📋 USAGE:');
  console.log('  npx tsx find-missing-emails.ts <WORKSPACE_ID>');
  console.log('\n🔑 WORKSPACE IDs:');
  console.log('  Outlight Support: fa66cb41-0677-462f-b647-e910ef2c66e8');
  console.log('  Info Support: f83e8c02-30d8-4ad3-a4e9-73f98fbca300');
  console.log('\n📌 EXAMPLE:');
  console.log('  npx tsx find-missing-emails.ts fa66cb41-0677-462f-b647-e910ef2c66e8\n');
  process.exit(1);
}

findMissingEmails(workspaceId);
