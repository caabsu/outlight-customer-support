-- AlterTable
ALTER TABLE "public"."Conversation" ADD COLUMN "isTraining" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "public"."Conversation" ADD COLUMN "trainingNotes" TEXT;
