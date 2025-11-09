/**
 * Cleanup and Re-sync Script
 *
 * This script:
 * 1. Deletes all existing messages from the database (to remove draft messages)
 * 2. Keeps conversations intact
 * 3. Re-syncs will re-ingest threads with the new draft-excluding logic
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupAndPrepareResync() {
  console.log('🧹 Starting cleanup process...\n');

  try {
    // Step 1: Count existing messages
    const messageCount = await prisma.message.count();
    console.log(`📊 Found ${messageCount} messages in database`);

    // Step 2: Delete all messages
    console.log('\n🗑️  Deleting all messages to remove draft messages...');
    const deleteResult = await prisma.message.deleteMany({});
    console.log(`✅ Deleted ${deleteResult.count} messages`);

    // Step 3: Reset needs-reply tags on all conversations
    // We'll let the re-sync re-apply them correctly
    console.log('\n🏷️  Resetting conversation tags...');
    const conversations = await prisma.conversation.findMany({
      select: { id: true, tags: true }
    });

    let tagResetCount = 0;
    for (const convo of conversations) {
      // Remove needs-reply tag, will be re-applied during re-sync
      const newTags = convo.tags.filter(tag => tag !== 'needs-reply');
      if (newTags.length !== convo.tags.length) {
        await prisma.conversation.update({
          where: { id: convo.id },
          data: { tags: newTags }
        });
        tagResetCount++;
      }
    }
    console.log(`✅ Reset needs-reply tag on ${tagResetCount} conversations`);

    console.log('\n✨ Cleanup complete! Now run a Gmail poll to re-sync all emails.');
    console.log('   The re-sync will:');
    console.log('   - Skip all draft messages (new logic)');
    console.log('   - Re-create only actual sent/received messages');
    console.log('   - Re-apply needs-reply tags correctly\n');

    console.log('📝 To re-sync, call: POST /gmail/poll/workspace/{workspaceId}');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupAndPrepareResync()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
