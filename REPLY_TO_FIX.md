# Reply-To Email Fix Guide

## Current Status
- Database has NULL replyToEmail for all existing messages
- Code is updated to extract and store reply-to headers
- Need to trigger a poll to populate existing messages

## Option 1: Run Email Poll (RECOMMENDED)

### Step 1: Check current server logs
Your API server should be running. Watch the terminal for diagnostic logs.

### Step 2: Trigger the poll
```bash
curl -X POST http://localhost:3001/api/gmail/poll
```

### Step 3: Watch the logs
You should see output like:
```
[GMAIL POLL] Message 123abc: from="Shopify <mailer@shopify.com>" replyTo="customer@example.com" parsed="customer@example.com"
```

If you see `replyTo="undefined"` or `replyTo=""`, that means those emails genuinely don't have Reply-To headers.

### Step 4: Verify the fix
```bash
curl http://localhost:3001/debug/reply-to
```

Should now show `withReplyTo > 0`.

## Option 2: Manual Database Fix (if poll doesn't work)

If the poll isn't working or you want to manually test, connect to your Supabase database:

### Check current state:
```sql
SELECT
  id,
  "fromEmail",
  "replyToEmail",
  direction,
  "sentAt"
FROM "Message"
WHERE direction = 'inbound'
ORDER BY "sentAt" DESC
LIMIT 10;
```

### Manual fix (DO NOT RUN - just for reference):
If you need to manually set a reply-to for testing:
```sql
UPDATE "Message"
SET "replyToEmail" = 'test@example.com'
WHERE id = 'YOUR_MESSAGE_ID';
```

## Troubleshooting

### Issue: withReplyTo still 0 after poll

**Possible causes:**
1. Gmail emails genuinely don't have Reply-To headers
2. getHeader() function not finding the header
3. parseEmail() function failing to parse

**Debug steps:**
1. Check server logs for `[GMAIL POLL]` messages
2. Look at raw email headers in Gmail to verify Reply-To exists
3. Check if the header name is case-sensitive

### Issue: Poll returns error

**Check:**
- Gmail credentials are valid
- Database connection is working
- No rate limiting from Gmail API

## Expected Behavior

**Before fix:**
- UI shows: "Replying to mailer@shopify.com"
- Database: replyToEmail = NULL

**After fix:**
- UI shows: "Replying to actual-customer@example.com"
- Database: replyToEmail = "actual-customer@example.com"

## Need More Help?

1. Share the output of `/debug/reply-to` endpoint
2. Share server logs when running the poll
3. Check a raw email in Gmail to verify Reply-To header exists
