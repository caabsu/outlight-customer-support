-- AlterTable
ALTER TABLE "public"."Conversation" ADD COLUMN "trainingAt" TIMESTAMP(3);
ALTER TABLE "public"."Conversation" ADD COLUMN "trainingBy" TEXT;

-- AddForeignKey
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_trainingBy_fkey" FOREIGN KEY ("trainingBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
