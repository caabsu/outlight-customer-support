# AI Customization Guide

## Overview

This document explains how the AI functionality works in the customer support system and how to customize each AI action with specific instructions, output formats, and knowledge base integration.

---

## Knowledge Base System

### How It Works

The knowledge base allows you to give the AI specific context about your business, products, policies, and procedures. This information is automatically included in AI prompts to provide more accurate and relevant responses.

### Database Schema

```sql
CREATE TABLE "KnowledgeBase" (
    "id" TEXT PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Adding Knowledge Base Entries

You can add knowledge base entries directly in Supabase SQL Editor:

```sql
-- Example: Add return policy
INSERT INTO "KnowledgeBase" (id, title, content, category, tags, active)
VALUES (
    gen_random_uuid(),
    'Return Policy',
    'Customers can return items within 30 days of purchase. Items must be unopened and in original packaging. Refunds are processed within 5-7 business days.',
    'policies',
    ARRAY['returns', 'refunds'],
    true
);

-- Example: Add product information
INSERT INTO "KnowledgeBase" (id, title, content, category, tags, active)
VALUES (
    gen_random_uuid(),
    'Shipping Information',
    'We ship worldwide within 3-5 business days. Free shipping on orders over $50. Express shipping available for $15.',
    'shipping',
    ARRAY['shipping', 'delivery'],
    true
);

-- Example: Add troubleshooting steps
INSERT INTO "KnowledgeBase" (id, title, content, category, tags, active)
VALUES (
    gen_random_uuid(),
    'Account Login Issues',
    'If customer cannot login: 1) Check email spelling, 2) Use "Forgot Password" link, 3) Clear browser cache, 4) Try incognito mode. If still failing, reset their password manually in admin panel.',
    'troubleshooting',
    ARRAY['account', 'login', 'password'],
    true
);
```

### Filtering Knowledge Base by Category

The AI endpoint can filter knowledge base entries by category or tags:

```typescript
// In apps/api/src/server.ts
const knowledgeBase = await prisma.knowledgeBase.findMany({
  where: {
    active: true,
    category: 'policies'  // Filter by category
  },
  select: { content: true, title: true }
});
```

---

## Customizing AI Actions

### Current Implementation: Email Summary

**Location:** `apps/api/src/server.ts` (lines 582-665)

**Endpoint:** `POST /conversations/:id/summary`

**Current Configuration:**

```typescript
const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    {
      role: "system",
      content: `You are a helpful customer support assistant. Summarize email conversations concisely, highlighting:
1. Main issue/question
2. Key points discussed
3. Current status
4. Suggested next steps (if applicable)

Keep summaries under 150 words.${knowledgeBaseContext}`
    },
    {
      role: "user",
      content: `Summarize this email conversation:\n\nSubject: ${conversation.subject}\n\n${emailThread}`
    }
  ],
  temperature: 0.7,
  max_tokens: 300
});
```

---

## Customization Options

### 1. **System Prompt (Instructions)**

Customize the `content` field in the system message to change how the AI behaves:

```typescript
{
  role: "system",
  content: `You are a customer support AI for an e-commerce company.

TONE: Professional, empathetic, solution-oriented
FORMAT: Use bullet points and emojis
STYLE: Keep summaries under 100 words
FOCUS: Highlight customer sentiment and urgency level

Include:
- 🎯 Main issue
- 😊/😐/😞 Customer sentiment
- ⚡ Urgency (High/Medium/Low)
- ✅ Next steps

${knowledgeBaseContext}`
}
```

### 2. **Output Format**

Control the structure of AI responses:

**JSON Output:**
```typescript
content: `Output your summary as JSON with this structure:
{
  "issue": "Brief description",
  "sentiment": "positive/neutral/negative",
  "urgency": "high/medium/low",
  "nextSteps": ["step 1", "step 2"],
  "tags": ["tag1", "tag2"]
}`
```

**Markdown Output:**
```typescript
content: `Format your summary in markdown:

## Issue
Brief description here

## Status
Current state of conversation

## Recommended Actions
- Action 1
- Action 2`
```

### 3. **Temperature (Creativity)**

Adjust the `temperature` parameter (0.0 - 2.0):
- `0.0-0.3`: Very focused and deterministic (good for factual summaries)
- `0.4-0.7`: Balanced (default, good for most tasks)
- `0.8-1.2`: More creative (good for drafting replies)
- `1.3-2.0`: Very creative (rarely needed)

```typescript
temperature: 0.3  // More consistent, less creative
```

### 4. **Max Tokens (Length)**

Control response length with `max_tokens`:
- 100 tokens ≈ 75 words
- 300 tokens ≈ 225 words
- 500 tokens ≈ 375 words

```typescript
max_tokens: 500  // Longer summaries
```

### 5. **Model Selection**

Choose different GPT models based on needs:

```typescript
model: "gpt-4o-mini"      // Fast, cheap, good for summaries
model: "gpt-4o"           // More capable, better reasoning
model: "gpt-3.5-turbo"    // Fastest, cheapest, basic tasks
```

### 6. **Knowledge Base Filtering**

Load specific knowledge based on AI action:

```typescript
// Summary: Load all active knowledge
const knowledgeBase = await prisma.knowledgeBase.findMany({
  where: { active: true }
});

// Draft Reply: Load only policy and support knowledge
const knowledgeBase = await prisma.knowledgeBase.findMany({
  where: {
    active: true,
    category: { in: ['policies', 'support'] }
  }
});

// Suggest Tags: Load tag-related knowledge
const knowledgeBase = await prisma.knowledgeBase.findMany({
  where: {
    active: true,
    tags: { hasSome: ['categories', 'classification'] }
  }
});
```

---

## Example: Creating a New AI Action

Here's how to create a "Draft Reply" AI action:

### 1. Add Backend Endpoint

```typescript
// apps/api/src/server.ts
app.post("/conversations/:id/draft-reply", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tone = "professional" } = req.body;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { sentAt: "asc" } }, customer: true }
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Load support and policy knowledge
    const knowledgeBase = await prisma.knowledgeBase.findMany({
      where: {
        active: true,
        category: { in: ['policies', 'support', 'products'] }
      }
    });

    const knowledgeContext = knowledgeBase.length > 0
      ? "\n\nKnowledge Base:\n" + knowledgeBase.map(kb => `- ${kb.title}: ${kb.content}`).join('\n')
      : "";

    const emailThread = conversation.messages.map((msg: any) => {
      const direction = msg.direction === "inbound" ? "Customer" : "Agent";
      const content = msg.bodyText || msg.bodyHtml?.replace(/<[^>]*>/g, '') || '';
      return `${direction}: ${content}`;
    }).join('\n\n');

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are drafting a ${tone} email reply for customer support.

TONE: ${tone}
STYLE: Clear, concise, solution-focused
FORMAT: Professional email with greeting and sign-off

Guidelines:
- Address the customer by name if available
- Reference their specific issue
- Provide clear next steps or solutions
- Use knowledge base information when relevant
- Be empathetic and helpful
- Keep under 200 words

${knowledgeContext}`
        },
        {
          role: "user",
          content: `Draft a reply to this conversation:\n\n${emailThread}`
        }
      ],
      temperature: 0.8,
      max_tokens: 400
    });

    const draftReply = completion.choices[0].message.content;

    res.json({ draftReply });
  } catch (error) {
    console.error("Error generating draft reply:", error);
    res.status(500).json({ error: "Failed to generate draft reply" });
  }
});
```

### 2. Add Frontend Handler

```typescript
// apps/web/components/ConversationView.tsx
const [draftReply, setDraftReply] = useState<string | null>(null);
const [loadingDraft, setLoadingDraft] = useState(false);

const handleDraftReply = async () => {
  if (!selectedConversation?.id) return;

  setLoadingDraft(true);
  try {
    const res = await fetch(`/api/conversations/${selectedConversation.id}/draft-reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tone: "professional" })
    });
    const data = await res.json();
    setDraftReply(data.draftReply);
    // Optionally insert into reply textarea
    setReplyText(data.draftReply);
  } catch (err) {
    console.error("Failed to draft reply:", err);
  } finally {
    setLoadingDraft(false);
  }
};
```

### 3. Update UI Button

```tsx
<button
  onClick={handleDraftReply}
  disabled={loadingDraft}
  className="flex flex-col items-start p-4 bg-background border border-border rounded-lg hover:border-primary hover:bg-accent/50 transition-all disabled:opacity-50"
>
  <div className="text-2xl mb-2">✨</div>
  <div className="text-left">
    <p className="text-sm font-sans font-medium text-foreground">Draft Reply</p>
    <p className="text-xs font-sans text-muted-foreground mt-1">
      {loadingDraft ? "Drafting..." : "Generate AI reply"}
    </p>
  </div>
</button>
```

---

## Advanced Customization: Different Prompts per Customer Type

You can customize AI behavior based on customer data:

```typescript
// Check customer status
const customerTier = conversation.customer.tags?.includes('vip') ? 'VIP' : 'Standard';

const systemPrompt = customerTier === 'VIP'
  ? `You are assisting a VIP customer. Be extra attentive, offer priority solutions, and mention exclusive benefits when relevant.`
  : `You are assisting a customer. Be helpful, clear, and solution-oriented.`;

const completion = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: systemPrompt + knowledgeContext },
    { role: "user", content: emailThread }
  ],
  temperature: 0.7
});
```

---

## Best Practices

1. **Knowledge Base Management**
   - Keep entries concise (under 500 words each)
   - Use clear, specific titles
   - Tag entries for easy filtering
   - Update regularly as policies change
   - Disable outdated entries instead of deleting

2. **Prompt Engineering**
   - Be specific about desired output format
   - Provide examples in the system prompt when possible
   - Use bullet points for complex instructions
   - Test different temperatures for each use case

3. **Cost Optimization**
   - Use `gpt-4o-mini` for simple tasks (summaries, tags)
   - Use `gpt-4o` for complex tasks (drafting replies, analysis)
   - Limit `max_tokens` to what you actually need
   - Cache summaries in database to avoid regenerating

4. **Error Handling**
   - Always use try-catch blocks
   - Provide fallback messages when AI fails
   - Log errors for debugging
   - Show loading states in UI

---

## Testing AI Customization

```typescript
// Test different temperatures
const temperatures = [0.3, 0.7, 1.0];
for (const temp of temperatures) {
  const result = await testAIAction({ temperature: temp });
  console.log(`Temp ${temp}:`, result);
}

// Test with/without knowledge base
const withKB = await testAIAction({ useKnowledgeBase: true });
const withoutKB = await testAIAction({ useKnowledgeBase: false });
console.log('Difference:', compareResults(withKB, withoutKB));
```

---

## Monitoring AI Usage

Track AI costs and performance:

```typescript
// Log token usage
const completion = await openai.chat.completions.create({...});
console.log('Tokens used:', completion.usage);

// Calculate cost
const cost = (completion.usage.prompt_tokens * 0.000150 / 1000) +
             (completion.usage.completion_tokens * 0.000600 / 1000);
console.log('Cost:', cost);
```

---

## Summary

- ✅ Knowledge Base provides context to AI
- ✅ Each AI action can have custom prompts, temperature, and max_tokens
- ✅ Filter knowledge by category/tags for specific actions
- ✅ Use different models based on task complexity
- ✅ Customize output format (plain text, markdown, JSON)
- ✅ Test different configurations to find optimal settings
