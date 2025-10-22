-- CreateTable
CREATE TABLE "DraftResponse" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "internalReasoning" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "reasoning" TEXT,
    "shouldDraft" BOOLEAN NOT NULL DEFAULT false,
    "draft" TEXT,
    "actionSteps" TEXT,
    "orderInfo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftResponse_conversationId_key" ON "DraftResponse"("conversationId");

-- AddForeignKey
ALTER TABLE "DraftResponse" ADD CONSTRAINT "DraftResponse_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
