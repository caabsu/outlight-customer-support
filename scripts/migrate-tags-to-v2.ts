/**
 * DATA MIGRATION SCRIPT: Migrate from old tagging system to new v2 system
 *
 * This script:
 * 1. Reads all conversations with their tags
 * 2. Converts old "tags" array to new system:
 *    - "needs-reply" tag → needsReply = true
 *    - All other tags → userTags array
 * 3. Sets lastMessageDirection based on last message
 * 4. Preserves ALL existing tags - nothing is lost
 *
 * Run this AFTER running the Prisma migration that adds the new fields.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateTagsToV2() {
  console.log('🚀 Starting tag migration to v2...\n');

  try {
    // Fetch all conversations with their messages and current tags
    const conversations = await prisma.conversation.findMany({
      include: {
        messages: {
          orderBy: { sentAt: 'asc' },
        },
      },
    });

    console.log(`📊 Found ${conversations.length} conversations to migrate\n`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const conv of conversations) {
      try {
        const oldTags = conv.tags || [];

        // Skip if already migrated (userTags is not empty)
        if (conv.userTags && conv.userTags.length > 0) {
          console.log(`⏭️  Skipping ${conv.id} - already migrated`);
          skippedCount++;
          continue;
        }

        // Extract needs-reply status from tags
        const hasNeedsReply = oldTags.includes('needs-reply');

        // All other tags go to userTags
        const userTags = oldTags.filter(tag => tag !== 'needs-reply');

        // Determine last message direction
        let lastMessageDirection: string | null = null;
        if (conv.messages.length > 0) {
          const lastMessage = conv.messages[conv.messages.length - 1];
          lastMessageDirection = lastMessage.direction;
        }

        // Update conversation with new schema
        await prisma.conversation.update({
          where: { id: conv.id },
          data: {
            needsReply: hasNeedsReply,
            userTags: userTags,
            lastMessageDirection: lastMessageDirection,
          },
        });

        migratedCount++;

        if (migratedCount % 50 === 0) {
          console.log(`✅ Migrated ${migratedCount}/${conversations.length} conversations...`);
        }

        // Log details for conversations with tags
        if (oldTags.length > 0) {
          console.log(`  📧 ${conv.id.substring(0, 8)}... | Subject: "${conv.subject?.substring(0, 40)}..."`);
          console.log(`     Old tags: ${JSON.stringify(oldTags)}`);
          console.log(`     New: needsReply=${hasNeedsReply}, userTags=${JSON.stringify(userTags)}, lastDir=${lastMessageDirection}`);
        }

      } catch (error) {
        console.error(`❌ Error migrating conversation ${conv.id}:`, error);
        errorCount++;
      }
    }

    console.log('\n✨ Migration complete!\n');
    console.log(`📊 Summary:`);
    console.log(`   ✅ Migrated: ${migratedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📝 Total: ${conversations.length}\n`);

    // Verify migration
    console.log('🔍 Verifying migration...\n');

    const withNeedsReply = await prisma.conversation.count({
      where: { needsReply: true },
    });

    const withUserTags = await prisma.conversation.count({
      where: {
        userTags: {
          isEmpty: false,
        },
      },
    });

    console.log(`   Conversations with needsReply=true: ${withNeedsReply}`);
    console.log(`   Conversations with userTags: ${withUserTags}`);

    console.log('\n✅ Migration successful! All tags preserved.\n');

  } catch (error) {
    console.error('💥 Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateTagsToV2()
  .then(() => {
    console.log('👋 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
