import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding onboarding content...');

  // Clear existing onboarding sections
  await prisma.onboardingSection.deleteMany({});
  console.log('✅ Cleared existing sections');

  // CUSTOMER SUPPORT TOOL SOP SECTIONS
  const toolSopSections = [
    {
      title: "Overview",
      slug: "overview",
      category: "tool-sop",
      order: 1,
      icon: "📖",
      content: `## What This Tool Does

This customer support platform helps you manage customer emails efficiently by:
- Organizing all customer emails in one inbox
- Using AI to draft responses automatically
- Storing company policies and product information
- Tracking order details and shipping information
- Suggesting related conversations for context

## Key Components

1. **Email Inbox** - View and manage all customer conversations
2. **AI Draft Generator** - Automatically creates reply drafts
3. **Knowledge Base** - Company policies, procedures, and guidelines
4. **Product Knowledge Base** - Product details, pricing, specs, and FAQs
5. **AI Assistant** - Quick lookup tool for policies and product info
6. **Related Conversations** - See similar past customer emails`
    },
    {
      title: "Getting Started",
      slug: "getting-started",
      category: "tool-sop",
      order: 2,
      icon: "🚀",
      content: `## Accessing the Tool

1. Open your browser and navigate to the platform URL
2. You'll see the main dashboard with several cards:
   - **Emails** - Your main workspace
   - **Knowledge Base** - Company policies
   - **Product Knowledge Base** - Product information

## Understanding Workspaces

**IMPORTANT:** You will be managing **TWO workspaces simultaneously**. Each workspace represents a different email account or brand.

### How to Switch Between Workspaces:
1. Look for the workspace selector (usually in the top navigation)
2. Click to see available workspaces
3. Select the workspace you want to view

### Example Setup:
- Tab 1: Workspace A (email 1)
- Tab 2: Workspace B (email 2)

This allows you to monitor both inboxes simultaneously and respond quickly to all customers.`
    },
    {
      title: "Daily Workflow",
      slug: "daily-workflow",
      category: "tool-sop",
      order: 3,
      icon: "📋",
      content: `## Routine (Start of Shift)

1. **Open Both Workspaces**
   - Use separate tabs or windows for each workspace

2. **Check Filter Settings**
   - Click "Needs Reply" filter to see unanswered emails
   - This shows only emails that require your response

3. **Sync Emails with the Sync Button**
   - Use the sync button on the conversations column to sync all emails
   - After syncing, the filter may not work. Uncheck all the filters, then check 1 filter at a time slowly to get a correct view

4. **Review Email Queue**
   - First in, first out -- Go to the "Oldest Unreplied" email, and work from there
   - Note the number of pending emails in each workspace

## Processing Each Email

Follow this workflow for **EVERY** email:

### Step 1: Open the Conversation
- Click on the email in the inbox
- Read the entire email thread (not just the latest message)
- Understand the customer's issue and tone

### Step 2: Check Related Conversations ⭐ **CRITICAL**
- Look at the "Related Conversations" section on the right side
- This shows previous emails from the same customer or about similar issues
- **Why This Matters:**
  - See if the customer has contacted you before
  - Check if there's an ongoing issue
  - Find relevant solutions used in the past
  - Maintain consistency in your responses

### Step 3: Generate AI Draft
- Click the **"Draft"** button in the top right
- Wait for the AI to generate a response (usually 10-30 seconds)
- The AI will:
  - Search for customer and order information
  - Look up product details if mentioned
  - Check company policies
  - Create a complete draft response

### Step 4: Review the Draft ⭐ **CRITICAL**

**DO NOT blindly send the AI draft!** Always review it carefully.

**IMPORTANT**: Some simple inquiries require little to no inspection after the draft completes. However, for more complex tasks, the draft may produce a completely unusable response. In this case, use the **"CUSTOM INSTRUCTIONS"** to get the reply we want. Feed all information, direction, and guidance for the AI to create a response much more tailored and complete.

### Step 5: Edit the Draft
- Add a personal touch (use your first name)
- Adjust the tone if needed (more formal or casual)
- Add specific details the AI might have missed
- Remove any awkward phrasing
- Add empathy if the customer is frustrated

### Step 6: Send the Reply
1. Review your edited draft one final time
2. Click **"Send"** or **"Reply"**
3. The conversation will move out of "Needs Reply"
4. Move on to the next email`
    },
    {
      title: "Using the Draft AI Tool",
      slug: "draft-ai-tool",
      category: "tool-sop",
      order: 4,
      icon: "🤖",
      content: `## How the Draft AI Works

The AI Draft tool is your primary assistant. Here's what it does behind the scenes:

### 1. Reads the Email Thread
- Analyzes the entire conversation history
- Identifies the customer's main question
- Detects the tone and urgency

### 2. Gathers Information
- **Searches Shopify:** Looks up the customer's orders, email, and purchase history
- **Checks Product KB:** Finds product-specific details (shipping, warranty, specs)
- **Reviews Knowledge Base:** Applies company policies and procedures
- **Gets Tracking Info:** If there's a tracking number, it checks the shipping status

### 3. Generates a Draft
- Creates a complete email response
- Includes relevant order details
- Applies appropriate policies
- Suggests action steps if needed

## When the Draft is GOOD

✅ The AI draft is usually accurate for:
- Standard return/exchange requests
- Order status inquiries
- Shipping time questions
- Product information requests
- General policy questions

## When You MUST Edit

⚠️ Always review and edit when:
- Customer is upset or frustrated (add more empathy)
- Complex issues involving multiple orders
- Special exceptions or edge cases
- Product not in the Product KB
- Custom requests or negotiations

## Draft Features

### Custom Instructions
Each draft can have custom instructions added before generation:
- "Use a more casual tone"
- "Offer a discount code: OUTLIGHTSALE3030, which takes 30% off the order price"
- "Explain the warranty in detail"
- "The order number this customer ordered is #1000"
- "The product [PRODUCT-NAME] has these specifications: [...]"
- "We cannot provide free returns. Mention this, and sincerely apologize"`
    },
    {
      title: "Knowledge Base Management",
      slug: "knowledge-base",
      category: "tool-sop",
      order: 5,
      icon: "📚",
      content: `## General Knowledge Base

**Location:** Click "Knowledge Base" from the main dashboard

### What's Stored Here:
- Company return/refund policies
- Shipping policies and timelines
- Warranty information
- General procedures and guidelines
- Standard responses to common questions

### How AI Uses It:
- The Draft AI reads EVERYTHING in the Knowledge Base
- It applies policies automatically to draft responses
- Example: If the KB says "30-day return window from delivery date", the AI will calculate if the customer is within that window

## Your Role with Knowledge Base

**You typically DON'T need to edit the General KB** - that's managed by administrators. However:

### ✅ You CAN (and should):
- Read it to understand policies
- Reference it when answering questions
- Suggest updates to management if you notice outdated info

### ❌ You DON'T:
- Add new articles without approval
- Change existing policies
- Delete content`
    },
    {
      title: "Product Knowledge Base",
      slug: "product-knowledge-base",
      category: "tool-sop",
      order: 6,
      icon: "📦",
      content: `## What is the Product Knowledge Base?

A separate database of all your products with detailed information:
- Product names and SKUs
- Descriptions and specifications
- Pricing (including variant pricing)
- Shipping times (product-specific)
- Warranty information
- Care instructions
- Common questions and answers

**Location:** Click "Product Knowledge Base" from the main dashboard

## Why Product KB Matters

**The Draft AI prioritizes Product KB over Shopify data** for product information.

**Example:**
- Shopify might say a product ships in "3-5 days" (generic)
- Product KB says "LED Desk Lamp ships in 5-7 business days" (specific)
- **AI will use the Product KB data** because it's more accurate

## Adding Products to the KB

### Method 1: Individual Products

1. Click **"+ Add Product"** button
2. Fill in the description/details (most important field!)
3. Add shipping time, warranty info, FAQs
4. Click **"Save Product"**

### Method 2: Bulk Add Products

Use this for adding multiple products quickly:

1. Click **"Bulk Add"** button
2. Paste product names (one per line)
3. Select category and status
4. Click **"Create Products"**
5. Go back and edit each one to add full details

## Editing Product KB for FAQs

**You CAN and SHOULD add commonly asked questions to products!**

When you notice customers repeatedly asking the same question about a product:

1. Go to Product Knowledge Base
2. Find the product
3. Click **"Edit"**
4. Scroll to **"Description / Details"**
5. Add the FAQ to the description
6. Click **"Save"**

**Why This Helps:**
- The AI will see these FAQs
- It will answer these questions automatically in future drafts
- Reduces your workload over time
- Ensures consistent answers`
    },
    {
      title: "AI Assistant Chatbot",
      slug: "ai-assistant",
      category: "tool-sop",
      order: 7,
      icon: "💬",
      content: `## What is the AI Assistant?

A floating chatbot (bottom-right corner) that helps you quickly look up information.

### Where to Find It:
- Available on Knowledge Base page
- Available on Product Knowledge Base page
- Look for the blue/purple floating button with a sparkle icon
- Available on emails page, under Drafts

### What It Does:
- Answers questions about products
- Looks up policy information
- Searches both Knowledge Bases
- Helps you find information quickly

## When to Use AI Assistant

Use the AI Assistant when:
- You need to quickly check a policy
- You want to look up product details before drafting
- You're unsure about how to respond to certain inquiries
- You need to verify information

## AI Assistant vs Draft AI

**AI Assistant:**
- For YOUR quick reference
- Doesn't draft emails
- Just answers questions
- Fast lookups

**Draft AI:**
- For customer email responses
- Creates complete draft replies
- Uses all available data
- Takes longer (10-30 seconds)`
    },
    {
      title: "Best Practices",
      slug: "best-practices",
      category: "tool-sop",
      order: 8,
      icon: "⭐",
      content: `## Email Response Quality

### ✅ DO:

1. **Always Use the Customer's Name**
   - "Hi Sarah!" is better than "Hi there!"
   - Makes it personal and friendly

2. **Be Empathetic**
   - If a customer is upset: "I completely understand your frustration..."
   - If there's a problem: "I'm so sorry this happened..."
   - Show you care about their experience

3. **Be Specific**
   - Don't say: "Your order will ship soon"
   - Say: "Your order will ship within 3-5 business days"

4. **Provide Next Steps**
   - Tell them what to expect next
   - Example: "You'll receive a tracking number within 24 hours"

5. **End with an Offer to Help**
   - "Please let me know if you have any other questions!"
   - "I'm here to help if you need anything else!"

### ❌ DON'T:

1. **Send Generic Responses**
   - Each customer is unique
   - Customize the draft to their situation

2. **Ignore the Customer's Tone**
   - If they're frustrated, acknowledge it
   - If they're friendly, match that energy

3. **Leave Questions Unanswered**
   - Read the email carefully
   - Make sure you addressed EVERYTHING they asked

4. **Use Technical Jargon**
   - Keep it simple and clear
   - Explain things in plain language

5. **Rush Through Responses**
   - Quality over quantity
   - Take the extra 30 seconds to review

## Managing Multiple Workspaces

### Time Management Tips:

1. **Leverage the fact that Draft tool takes time**
   - Use two monitors if available
   - Or split-screen on one monitor
   - Keep both workspaces visible

2. **Batch Process by Workspace**
   - Spend 30 minutes on Workspace A
   - Then 30 minutes on Workspace B
   - Alternate throughout the day

3. **Prioritize Urgency, Not Workspace**
   - If Workspace A has a shipping emergency, handle it first
   - Don't feel obligated to finish all of Workspace A before checking Workspace B

4. **Use Filters Effectively**
   - "Needs Reply" filter shows what requires attention
   - Don't waste time on already-answered emails`
    },
    {
      title: "Common Issues & Solutions",
      slug: "troubleshooting",
      category: "tool-sop",
      order: 9,
      icon: "🔧",
      content: `## Issue 1: Draft AI Isn't Working

**Symptoms:**
- "Generate Draft" button doesn't respond
- Error message appears
- Draft takes too long to generate

**Solutions:**
1. Refresh the page
2. Check your internet connection
3. Try again in a different browser
4. If it persists, manually draft the response and notify your supervisor

## Issue 2: Product Info Missing

**Symptoms:**
- AI draft says "No product information available"
- Product details are generic or wrong

**Solutions:**
1. Check if the product exists in Product Knowledge Base
2. If missing, add it yourself (see Product KB section)
3. Manually look up the product on the website or Shopify
4. Add the correct info to your draft response

## Issue 3: Can't Find Related Conversations

**Symptoms:**
- Related Conversations panel is empty
- No suggestions appear

**Solutions:**
1. This is normal for new customers or unique issues
2. Use the search function to manually find similar emails
3. Proceed with drafting based on available information

## Issue 4: Customer Info Not Found

**Symptoms:**
- AI says "Customer not found in Shopify"
- No order history appears

**Solutions:**
1. Customer might have used a different email address
2. Ask the customer for their order number
3. Search Shopify manually using their name
4. They might be a new customer who hasn't ordered yet

## Issue 5: Draft is Generic or Unhelpful

**Symptoms:**
- AI draft doesn't answer the question
- Response is too vague
- Important details are missing

**Solutions:**
1. Use Custom Instructions before generating draft
2. Edit the draft heavily
3. Add specific details manually
4. Check if product/policy info is in the Knowledge Base`
    }
  ];

  // GENERAL CUSTOMER SUPPORT SOP SECTIONS
  const generalSopSections = [
    {
      title: "Core Principles & Tone",
      slug: "core-principles",
      category: "general-sop",
      order: 1,
      icon: "🎯",
      content: `## Primary Goal

The primary goal is to resolve the customer's issue clearly and efficiently while adhering to policy.

## Tone Guidelines

- **Professional, sincere, and clear**
- **Empathy First:** Always start with a sincere apology for the customer's frustration, delay, or the inconvenience of them having to contact support
  - Examples: "I'm truly sorry for the delay" or "I want to start with a sincere apology for the frustration this has caused"
- **Acknowledge Fully:** Address all parts of the customer's email. If they mention a missed prior message, apologize for that and their primary issue
- **Be Factual:** Use concrete data from the order (Order #, Order Date, Tracking Status, Delivery Date) to build trust and provide a complete answer

## Important Policies

- **No False Promises:** Never promise specific delivery dates, expedited shipping, or follow-up actions that are not explicitly authorized by policy
- **No Phone Support:** We do not offer live phone support at the moment. If a customer asks, state: "We don't offer phone support. The fastest way to get help is by replying to this email"

## Standard Signature

All emails must end with:

\`\`\`
Warm regards,
[YOUR NAME]
Customer Support Team
Outlight
\`\`\``
    },
    {
      title: "Standard Tools & Links",
      slug: "standard-tools",
      category: "general-sop",
      order: 2,
      icon: "🔗",
      content: `## Important Links

Use only these approved, internal portals. **Do not send customers external tracking links** (e.g., 17TRACK, YunExpress).

### Tracking Portal
**URL:** https://outlight.us/apps/tracking

**Use for:** All "Where is my order?" (WISMO) inquiries and status checks

### Returns Portal
**URL:** https://outlight.us/apps/tracking/returnpage

**Use for:** All returns, exchanges, "not as described" claims, and damaged-on-arrival (DOA) reports`
    },
    {
      title: "Handling 'Where Is My Order?' (WISMO)",
      slug: "wismo-handling",
      category: "general-sop",
      order: 3,
      icon: "📍",
      content: `## Standard Delivery Window

The **Standard Delivery Window is 4–5 weeks from the order date**. This is the baseline for all shipping replies.

## Status: Unfulfilled (Within 4-5 Week Window)

**Action:** Confirm order details, state the 4-5 week window, and provide the tracking portal link.

**Key Info:**
- Confirm Order # and Order Date
- State the standard 4–5 week window and the expected date range
- Confirm status: "Not yet fulfilled (no tracking number generated yet)"
- Explain tracking will be sent upon shipment
- Provide the Tracking Portal link
- If near the end of the window: Apologize for the wait and offer a choice: "Proceed to ship" or "Cancel for a full refund"

## Status: Unfulfilled (PAST 4-5 Week Window)

**Action:** Apologize, acknowledge the delay, and offer a clear choice.

**Key Info:**
- Apologize sincerely for the delay and for being past the standard window
- State the facts: Order #, Order Date, Status (Not yet fulfilled)
- Acknowledge the delay: "We're running behind that window, and I understand how concerning that feels"
- Provide the Tracking Portal link
- Offer a clear choice: "Proceed to ship" or "Cancel for a full refund"

## Status: Fulfilled (In Transit - "Label Created")

**Context:** This status ("Shipper created a label; UPS has not received the package yet") is normal.

**Action:** Explain that this status means the shipment is in its international transit phase.

**Key Info:**
- Provide all details: Order #, Order Date, Tracking #, and Last Tracking Event
- Explain why there are no further scans (it's in international transit)
- Restate the 4–5 week delivery window from the order date
- Provide the Tracking Portal link

## Status: Fulfilled (In Transit - Moving)

**Action:** Provide all available tracking data.

**Key Info:**
- Provide all facts: Order #, Date, Status (Fulfilled), Carrier, Tracking #, Last Event, and ETA (if available)
- Provide the Tracking Portal link
- **Note:** If an order is "partially fulfilled" but only a $0 free gift remains unfulfilled, treat the main order as Fulfilled. Do not mention the gift.

## Status: Fulfilled (Delivered)

**Action:** Confirm delivery and direct to the Returns Portal if needed.

**Key Info:**
- State the "Delivered" status clearly, including date, city, and any carrier notes
- If the customer claims non-delivery, first ask them to check porches, with neighbors, or in mailrooms
- If they want a refund, direct them to the Returns Portal and state the 30-day return policy (window starts from the delivery date)

## Status: Severe Delay (Past 4-5 Weeks + Missed Emails)

**Context:** For high-frustration customers (especially those threatening a chargeback) where support has failed.

**Action:** Offer compensation or cancellation upon arrival.

**Key Info:**
- Apologize sincerely for both the severe delay and the missed messages ("You shouldn't have had to chase us...")
- Acknowledge the failure: "...we're past that, and that's on us"
- Offer two explicit resolution paths:
  1. Cancel & full refund, if the order is unfulfilled
  2. Free & Full refund upon package arrival, if the order is fulfilled
  3. Keep the order + $50 apology refund
- If a chargeback is mentioned, respectfully note that a direct refund (Option 1) is typically faster`
    },
    {
      title: "Returns, Damages & Quality Issues",
      slug: "returns-damages",
      category: "general-sop",
      order: 4,
      icon: "↩️",
      content: `## Standard Return Window

The **Standard Return Window is 30 days from the delivery date**.

## Standard Returns & "Not as Described"

**Action:** Apologize and direct to the Returns Portal.

**Key Info:**
- Apologize for the issue (e.g., "I'm truly sorry your Fira didn't match the description...")
- Do not debate the customer's claim (e.g., "misleading," "cheap")
- Direct the customer to the Returns Portal (.../returnpage)
- Explain the process: Submit the request and attach clear photos (especially for "not as described" or damage)
- State the policy: 30 days from delivery. A 20% restocking fee applies unless the item is damaged, not working, or the wrong item was sent

## Damaged on Arrival (DOA)

**Action:** Apologize and direct to the Returns Portal for a DOA claim.

**Key Info:**
- Apologize sincerely for the item arriving in that condition
- Direct to the Returns Portal to submit a claim
- Emphasize that they must upload clear photos of the damage and the packaging
- Reassure them the 20% restocking fee does not apply to damaged items

## Out of Policy (OOW) Request

**Action:** Politely but firmly decline the request, citing policy.

**Key Info:**
- Confirm the order facts (Order #, variant, delivery date)
- Politely state the 30-day return policy
- State that the order is "well past that window" and "we can't make an exception"
- Offer general product guidance as a goodwill gesture, but do not concede to the request`
    },
    {
      title: "Edits & Cancellations",
      slug: "edits-cancellations",
      category: "general-sop",
      order: 5,
      icon: "✏️",
      content: `## Cancel Request (Order is Unfulfilled)

**Action:** Process the cancellation and refund immediately.

**Key Info:**
- Confirm the cancellation in your reply
- State the exact refund amount and the 3–10 business day bank posting time

## Cancel Request (Order is Fulfilled/In Transit)

**Action:** Do not cancel.

**Key Info:**
- Explain: "The shipment is already in transit, so we're not able to cancel it at this stage"
- Instruct them to use the Returns Portal to make a standard return after the item arrives

## Address or Size/Variant Change Request

### If Unfulfilled:
- Confirm the order is unfulfilled
- **For Size/Variant Change:** If there is a price difference, update the order and email an invoice for the difference. The order proceeds after the invoice is paid
- **For Address Change:** Make the change and confirm the new address in your reply

### If Fulfilled/In Transit:
- Not possible
- Explain: "Because the package has already been fulfilled and is currently in transit, we're unable to update the delivery address"
- Direct them to the Tracking Portal and the Returns Portal (for post-delivery)`
    },
    {
      title: "Other Common Inquiries",
      slug: "other-inquiries",
      category: "general-sop",
      order: 6,
      icon: "❓",
      content: `## Discount Code Issues

### Case 1: Customer forgot a code at checkout
**Action:** If it was a valid code, apply it retroactively. Issue a partial refund for the discount amount.
- State the amount and 3–10 day timeline

### Case 2: A new sale (e.g., Black Friday) started after purchase
**Action:** Apply the authorized partial discount (e.g., 5%) as a refund.
- State the exact refund amount and 3–10 day timeline

## Missing Free Promotional Gift

**Action:** Do not reship the free gift.

**Key Info:**
- Apologize for the missing item
- Explain: "...we are unable to provide replacement shipping for just the free gift"
- Offer a $25 gift code for a future purchase as an apology: **WGJATJQM1KS0**

## Product Installation & Spec Questions

### Country of Origin:
- Be direct: "Our lamps are designed here in the U.S. and manufactured in partnership with a trusted overseas factory"
- Add brief context about quality checks to build credibility

### Outdoor Use:
- If the model is unknown, give general advice (check for an IP rating, use a GFCI-protected outlet)
- State that "indoor use only" items should not be used outdoors
- Ask for the specific product name to confirm`
    }
  ];

  // Insert all sections
  const allSections = [...toolSopSections, ...generalSopSections];

  for (const section of allSections) {
    await prisma.onboardingSection.create({
      data: section
    });
    console.log(`✅ Created section: ${section.title} (${section.category})`);
  }

  console.log(`\n🎉 Successfully seeded ${allSections.length} onboarding sections!`);
  console.log(`   - Tool SOP: ${toolSopSections.length} sections`);
  console.log(`   - General SOP: ${generalSopSections.length} sections`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
