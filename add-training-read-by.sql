-- Add 'trainingReadBy' array field to Conversation model
ALTER TABLE "Conversation" ADD COLUMN "trainingReadBy" TEXT[] DEFAULT '{}';
