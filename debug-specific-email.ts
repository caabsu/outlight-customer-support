/**
 * Debug Script for Specific Email
 *
 * This script fetches a specific Gmail thread and shows all its details
 * to help identify why it's being skipped during sync
 */

import { PrismaClient } from '@prisma/client';
import { getAuthedClient } from './apps/api/src/gmail-multi';

const prisma = new PrismaClient();

async function debugEmail(threadId: string, workspaceId: string) {
  console.log('\n🔍 DEBUGGING SPECIFIC EMAIL');
  console.log('='.repeat(60));
  console.log(`Thread ID: ${threadId}`);
  console.log(`Workspace ID: ${workspaceId}\n`);

  try {
    // Get authenticated Gmail client
    const { gmail, workspace } = await getAuthedClient(workspaceId);
    console.log(`✅ Authenticated as: ${workspace.gmailAccountEmail}\n`);

    // Fetch the specific thread
    console.log('📧 Fetching thread from Gmail...');
    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full'
    });

    const messages = thread.data.messages || [];
    console.log(`✅ Found ${messages.length} message(s) in thread\n`);

    // Analyze each message
    messages.forEach((msg: any, index: number) => {
      console.log(`\n--- Message ${index + 1} ---`);
      console.log(`Message ID: ${msg.id}`);
      console.log(`Labels: ${JSON.stringify(msg.labelIds || [])}`);
      console.log(`Internal Date: ${new Date(Number(msg.internalDate)).toISOString()}`);

      const headers = msg.payload.headers || [];
      const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      console.log(`From: ${getHeader('from')}`);
      console.log(`To: ${getHeader('to')}`);
      console.log(`Subject: ${getHeader('subject')}`);
      console.log(`Date: ${getHeader('date')}`);

      // Check if it's a draft
      const isDraft = (msg.labelIds || []).includes('DRAFT');
      console.log(`Is Draft: ${isDraft ? '⚠️  YES' : '✅ NO'}`);

      // Check if it's spam
      const isSpam = (msg.labelIds || []).includes('SPAM');
      console.log(`Is Spam: ${isSpam ? '⚠️  YES' : '✅ NO'}`);

      // Check if it's in trash
      const isTrash = (msg.labelIds || []).includes('TRASH');
      console.log(`Is Trash: ${isTrash ? '⚠️  YES' : '✅ NO'}`);
    });

    // Check if this conversation exists in database
    console.log('\n\n📊 DATABASE STATUS');
    console.log('='.repeat(60));

    const conversation = await prisma.conversation.findUnique({
      where: {
        workspaceId_gmailThreadId: {
          workspaceId: workspaceId,
          gmailThreadId: threadId
        }
      },
      include: {
        messages: {
          orderBy: { sentAt: 'desc' }
        }
      }
    });

    if (conversation) {
      console.log(`✅ Conversation exists in database`);
      console.log(`Conversation ID: ${conversation.id}`);
      console.log(`Subject: ${conversation.subject}`);
      console.log(`Tags: ${JSON.stringify(conversation.tags)}`);
      console.log(`Messages in DB: ${conversation.messages.length}`);

      if (conversation.messages.length > 0) {
        console.log(`\nLast message:`);
        const last = conversation.messages[0];
        console.log(`  Direction: ${last.direction}`);
        console.log(`  From: ${last.fromEmail}`);
        console.log(`  Sent At: ${last.sentAt.toISOString()}`);
      }
    } else {
      console.log(`❌ Conversation NOT found in database`);
      console.log(`\n⚠️  This thread has not been synced yet!`);
    }

    console.log('\n\n💡 RECOMMENDATIONS');
    console.log('='.repeat(60));

    const hasSpam = messages.some((m: any) => (m.labelIds || []).includes('SPAM'));
    const hasTrash = messages.some((m: any) => (m.labelIds || []).includes('TRASH'));
    const hasDraft = messages.some((m: any) => (m.labelIds || []).includes('DRAFT'));
    const allDrafts = messages.every((m: any) => (m.labelIds || []).includes('DRAFT'));

    if (hasSpam) {
      console.log('⚠️  Thread contains SPAM messages - excluded from sync query');
    }
    if (hasTrash) {
      console.log('⚠️  Thread contains TRASH messages - excluded from sync query');
    }
    if (allDrafts) {
      console.log('⚠️  ALL messages are DRAFTs - thread should be excluded');
    } else if (hasDraft) {
      console.log('ℹ️  Thread contains some DRAFT messages - they should be skipped');
    }

    if (!hasSpam && !hasTrash && !allDrafts) {
      console.log('✅ This thread SHOULD be synced');
      if (!conversation) {
        console.log('❌ But it is NOT in the database - there may be an ingestion error');
        console.log('\n🔧 Try running the sync again and check server logs for errors');
      }
    }

  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
    if (error.code === 404) {
      console.log('\n⚠️  Thread not found. Please verify the thread ID is correct.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Get arguments from command line
const threadId = process.argv[2];
const workspaceId = process.argv[3];

if (!threadId || !workspaceId) {
  console.log('\n📋 USAGE:');
  console.log('  npx tsx debug-specific-email.ts <THREAD_ID> <WORKSPACE_ID>');
  console.log('\n📝 HOW TO GET THREAD ID:');
  console.log('  1. Open the email in Gmail web interface');
  console.log('  2. Look at the URL - it will contain the thread ID');
  console.log('  3. URL format: https://mail.google.com/mail/u/0/#inbox/THREAD_ID_HERE');
  console.log('  4. Copy the long string after #inbox/ or #label/');
  console.log('\n🔑 WORKSPACE IDs:');
  console.log('  Outlight Support: fa66cb41-0677-462f-b647-e910ef2c66e8');
  console.log('  Info Support: f83e8c02-30d8-4ad3-a4e9-73f98fbca300');
  console.log('\n📌 EXAMPLE:');
  console.log('  npx tsx debug-specific-email.ts 18f1234567890abc fa66cb41-0677-462f-b647-e910ef2c66e8\n');
  process.exit(1);
}

debugEmail(threadId, workspaceId);
