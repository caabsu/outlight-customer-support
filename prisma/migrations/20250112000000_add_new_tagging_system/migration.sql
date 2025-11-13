-- AlterTable: Add new tagging system columns to Conversation
ALTER TABLE "Conversation"
ADD COLUMN "needsReply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastMessageDirection" TEXT,
ADD COLUMN "userTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Create indexes for performance
CREATE INDEX "Conversation_needsReply_idx" ON "Conversation"("needsReply");
CREATE INDEX "Conversation_userTags_idx" ON "Conversation" USING GIN("userTags");
