/**
 * Full Re-sync Script (No Timeout Limits)
 *
 * Run this locally to sync ALL emails without Vercel timeout restrictions.
 * This script can process hundreds of threads without timing out.
 */

import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

async function fullResync() {
  console.log('\n🔄 FULL RE-SYNC (No Timeout Limits)');
  console.log('='.repeat(80));

  try {
    // Only sync info@outlight.us (Info Support workspace)
    const workspaces = await prisma.workspace.findMany({
      where: {
        gmailAccountEmail: 'info@outlight.us'
      },
      select: { id: true, name: true, gmailAccountEmail: true }
    });

    if (workspaces.length === 0) {
      console.log('\n❌ Info Support workspace not found!');
      return;
    }

    console.log(`\n📋 Syncing: ${workspaces[0].name} (${workspaces[0].gmailAccountEmail})\n`);

    for (const workspace of workspaces) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🔄 Syncing: ${workspace.name}`);
      console.log('='.repeat(80));

      let round = 1;
      let hasMore = true;

      while (hasMore) {
        console.log(`\n📧 Round ${round}: Fetching and processing threads...`);

        try {
          const response = await fetch(`http://localhost:3001/gmail/poll/workspace/${workspace.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });

          const result: any = await response.json();

          console.log(`✅ Round ${round} complete:`);
          console.log(`   - Total: ${result.total}`);
          console.log(`   - New: ${result.new}`);
          console.log(`   - Existing: ${result.existing}`);
          console.log(`   - Failed: ${result.failed || 0}`);

          if (result.errors && result.errors.length > 0) {
            console.log(`   ⚠️  Errors: ${result.errors.length}`);
          }

          // Since we fetch up to 1000 threads per round, one round should be enough
          // If we got 1000 threads, there might be more
          if (result.total >= 1000) {
            console.log(`\n⏭️  Processed 1000 threads, checking for more...`);
            round++;
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.log(`\n✅ Sync complete for ${workspace.name} (processed ${result.total} threads)`);
            hasMore = false;
          }

        } catch (error: any) {
          console.error(`\n❌ Error in round ${round}:`, error.message);
          hasMore = false;
        }
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ SYNC COMPLETE FOR INFO@OUTLIGHT.US');
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

console.log('\n⚠️  IMPORTANT: Make sure your development server is running!');
console.log('   Run this in another terminal: npm run dev');
console.log('\n   Then press Enter to continue...\n');

process.stdin.once('data', () => {
  fullResync();
});
