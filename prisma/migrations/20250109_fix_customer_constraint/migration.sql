-- Drop the old unique constraint on primaryEmail if it still exists
-- This constraint should not exist - only the composite (workspaceId, primaryEmail) should be unique

ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_primaryEmail_key";

-- Verify the correct composite unique constraint exists
-- This is idempotent - won't fail if it already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Customer_workspaceId_primaryEmail_key'
    ) THEN
        CREATE UNIQUE INDEX "Customer_workspaceId_primaryEmail_key" ON "Customer"("workspaceId", "primaryEmail");
    END IF;
END $$;
