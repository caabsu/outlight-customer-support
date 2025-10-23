-- AlterTable: Change actionSteps from TEXT to JSONB
ALTER TABLE "DraftResponse" ALTER COLUMN "actionSteps" TYPE JSONB USING
  CASE
    WHEN "actionSteps" IS NULL THEN NULL
    WHEN "actionSteps" = '' THEN NULL
    ELSE ("actionSteps"::text)::jsonb
  END;
