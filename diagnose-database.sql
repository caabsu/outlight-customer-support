-- Diagnose and fix the 'trainingReadBy' column in the 'Conversation' table

-- 1. Check if the column exists (informational)
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Conversation' AND column_name = 'trainingReadBy') THEN
        RAISE NOTICE 'Column trainingReadBy exists.';
    ELSE
        RAISE NOTICE 'Column trainingReadBy does NOT exist.';
    END IF;
END $$;

-- 2. Add the column if it doesn't exist (Safe to run multiple times)
ALTER TABLE "Conversation" 
ADD COLUMN IF NOT EXISTS "trainingReadBy" TEXT[] DEFAULT '{}';

-- 3. Verify the column type is correct (informational)
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'Conversation' AND column_name = 'trainingReadBy';

-- 4. (Optional) Set default value for existing rows if null
UPDATE "Conversation" 
SET "trainingReadBy" = '{}' 
WHERE "trainingReadBy" IS NULL;
