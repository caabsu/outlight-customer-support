/**
 * Fix Customer Constraint
 *
 * Drops the old unique constraint on just primaryEmail
 * and ensures the composite constraint exists
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixConstraint() {
  console.log('\n🔧 FIXING CUSTOMER CONSTRAINT');
  console.log('='.repeat(80));

  try {
    // Drop the old constraint
    console.log('\n1. Dropping old primaryEmail unique constraint...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_primaryEmail_key"
    `);
    console.log('✅ Old constraint dropped (if it existed)');

    // Verify composite constraint exists
    console.log('\n2. Checking composite constraint...');
    const result: any = await prisma.$queryRawUnsafe(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'Customer'
      AND constraint_type = 'UNIQUE'
    `);

    console.log('\nCurrent unique constraints on Customer table:');
    result.forEach((row: any) => {
      console.log(`  - ${row.constraint_name}`);
    });

    const hasComposite = result.some((row: any) =>
      row.constraint_name === 'Customer_workspaceId_primaryEmail_key'
    );

    if (!hasComposite) {
      console.log('\n⚠️  Composite constraint missing! Creating it...');
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX "Customer_workspaceId_primaryEmail_key"
        ON "Customer"("workspaceId", "primaryEmail")
      `);
      console.log('✅ Composite constraint created');
    } else {
      console.log('\n✅ Composite constraint exists');
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ CONSTRAINT FIX COMPLETE');
    console.log('='.repeat(80));
    console.log('\nYou can now run the sync again without P2002 errors.\n');

  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixConstraint();
