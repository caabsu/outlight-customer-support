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
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, name: true, gmailAccountEmail: true }
    });

    console.log(`\n📋 Found ${workspaces.length} workspaces to sync:\n`);
    workspaces.forEach((w, i) => {
      console.log(`${i + 1}. ${w.name} (${w.gmailAccountEmail})`);
    });

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
          console.log(`   - Skipped: ${result.skipped}`);
          console.log(`   - Failed: ${result.failed || 0}`);

          if (result.errors && result.errors.length > 0) {
            console.log(`   ⚠️  Errors: ${result.errors.length}`);
          }

          // If we processed fewer than 30 threads, we're done
          if (result.total < 30) {
            console.log(`\n✅ Sync complete for ${workspace.name} (processed ${result.total} threads in final round)`);
            hasMore = false;
          } else {
            console.log(`\n⏭️  More threads available, continuing...`);
            round++;

            // Small delay between rounds
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

        } catch (error: any) {
          console.error(`\n❌ Error in round ${round}:`, error.message);
          hasMore = false;
        }
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ FULL RE-SYNC COMPLETE FOR ALL WORKSPACES');
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
