-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gmailAccountEmail" TEXT NOT NULL,
    "googleClientId" TEXT NOT NULL,
    "googleClientSecret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- AlterTable Customer - Add workspace support
ALTER TABLE "Customer" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_primaryEmail_key";

-- AlterTable Conversation - Add workspace support
ALTER TABLE "Conversation" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_gmailThreadId_key";

-- AlterTable OAuthToken - Add workspace support
ALTER TABLE "OAuthToken" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "OAuthToken" DROP CONSTRAINT IF EXISTS "OAuthToken_accountEmail_key";

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_gmailAccountEmail_key" ON "Workspace"("gmailAccountEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_workspaceId_primaryEmail_key" ON "Customer"("workspaceId", "primaryEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_workspaceId_gmailThreadId_key" ON "Conversation"("workspaceId", "gmailThreadId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_workspaceId_key" ON "OAuthToken"("workspaceId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
