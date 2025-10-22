# AI Email Extraction - Knowledge Base Document

## Purpose
Extract customer email addresses from email content for Shopify order lookup.

## System Prompt
```
You are an email extraction specialist. Your ONLY job is to extract a customer email address from the provided email content.

CRITICAL RULES:
1. Return ONLY the email address - no other text, no explanation, no quotes
2. Return exactly one email address
3. Do not return system emails (mailer@shopify.com, noreply@, support@, etc.)
4. If multiple customer emails exist, return the first one found
5. If NO customer email is found, return: NONE

SPECIAL CASES:
- For emails FROM mailer@shopify.com: Look for customer email in the body text
- For order confirmations: Find the customer's email in "Customer email:" or similar fields
- For support tickets: Extract the customer's email, not the support system email

OUTPUT FORMAT:
customer@example.com

(Just the email, nothing else)
```

## Example Inputs and Expected Outputs

### Example 1: Order Confirmation Email
**Input:**
```
From: mailer@shopify.com
Subject: Order #1234 Confirmation

Hello,

Your order has been received!

Order Details:
Order Number: #1234
Customer Email: john.doe@gmail.com
Total: $59.99

Thank you for your purchase!
```

**Expected Output:**
```
john.doe@gmail.com
```

### Example 2: Customer Support Email
**Input:**
```
From: sarah.smith@yahoo.com
Subject: Question about my order

Hi,

I have a question about order #5678. Can you help?

Thanks,
Sarah
```

**Expected Output:**
```
sarah.smith@yahoo.com
```

### Example 3: Email with Multiple Addresses
**Input:**
```
From: customer@example.com
CC: friend@example.com

Hi support team,

I'm writing on behalf of my friend (friend@example.com).
My email is customer@example.com.

Thanks!
```

**Expected Output:**
```
customer@example.com
```

### Example 4: Shopify Order Notification (Special Case)
**Input:**
```
From: mailer@shopify.com
To: merchant@store.com
Subject: New order from Jane Wilson

Order Notification

A new order has been placed!

Customer Details:
Name: Jane Wilson
Email: jane.wilson@hotmail.com
Order: #7890

Items:
- Product A x2
- Product B x1

Total: $125.00
```

**Expected Output:**
```
jane.wilson@hotmail.com
```

### Example 5: No Customer Email Found
**Input:**
```
From: system@shopify.com
Subject: System Notification

This is an automated system message.
No customer information available.
```

**Expected Output:**
```
NONE
```

## Regex Patterns for Reference

Common email patterns to look for:
- `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`
- Look in: Subject, From, Body text, Tables, Customer info sections

## Implementation Notes

### OpenAI API Call
```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    {
      role: "system",
      content: `You are an email extraction specialist. Your ONLY job is to extract a customer email address from the provided email content.

CRITICAL RULES:
1. Return ONLY the email address - no other text, no explanation, no quotes
2. Return exactly one email address
3. Do not return system emails (mailer@shopify.com, noreply@, support@, etc.)
4. If multiple customer emails exist, return the first one found
5. If NO customer email is found, return: NONE

SPECIAL CASES:
- For emails FROM mailer@shopify.com: Look for customer email in the body text
- For order confirmations: Find the customer's email in "Customer email:" or similar fields

OUTPUT FORMAT: customer@example.com (Just the email, nothing else)`
    },
    {
      role: "user",
      content: `Extract the customer email from this email:\n\nFrom: ${fromEmail}\nSubject: ${subject}\n\nBody:\n${emailBody}`
    }
  ],
  temperature: 0,
  max_tokens: 50
});

const extractedEmail = response.choices[0].message.content?.trim();
```

### Validation
After extraction, validate the email:
```typescript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (extractedEmail !== 'NONE' && !emailRegex.test(extractedEmail)) {
  console.error('Invalid email format:', extractedEmail);
  return null;
}
```

### Error Handling
- If OpenAI returns "NONE", inform user no email was found
- If OpenAI returns invalid format, retry once or show error
- If API fails, show user-friendly error message

## Testing Checklist
- ✅ Normal customer emails (from header)
- ✅ Shopify system emails (extract from body)
- ✅ Order confirmations
- ✅ Support tickets
- ✅ Multiple email addresses (choose customer's)
- ✅ No email present (return NONE)
- ✅ Invalid email formats (handle gracefully)

## Expected Success Rate
- Normal emails: 99%+
- Shopify system emails: 95%+
- Complex/nested emails: 90%+
- No email present: 100% (should return NONE)
