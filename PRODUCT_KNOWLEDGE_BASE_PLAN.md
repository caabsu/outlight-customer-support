# Product Knowledge Base System - Comprehensive Implementation Plan

## 🎯 **EXECUTIVE SUMMARY**

This plan outlines a complete Product Knowledge Base system with AI integration, separate from the general knowledge base, designed to give AI tools structured, searchable product data for better customer support drafts.

---

## 📋 **PHASE 1: DATABASE DESIGN**

### **1.1 New Database Schema**

```prisma
// prisma/schema.prisma

model Product {
  id                  String   @id @default(uuid())
  workspaceId         String
  workspace           Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  // Basic Info
  name                String   // Product name (searchable by AI)
  sku                 String?  // SKU/Product code
  category            String?  // Product category
  status              String   @default("active") // active, discontinued, coming-soon

  // Product Details
  description         String?  @db.Text
  specifications      Json?    // Flexible JSON for custom specs
  features            String[] @default([])
  materials           String?
  dimensions          String?
  weight              String?
  colors              String[] @default([])
  sizes               String[] @default([])

  // Pricing & Availability
  price               String?
  msrp                String?
  availabilityStatus  String?  // in-stock, out-of-stock, preorder

  // Shipping & Logistics
  shippingTime        String?  // "3-5 business days"
  shippingRestrictions String?
  handlingTime        String?
  shipsFrom           String?

  // Instructions & Support
  instructions        String?  @db.Text // Usage instructions
  careInstructions    String?  @db.Text
  warrantyInfo        String?  @db.Text
  returnPolicy        String?  @db.Text // Product-specific return policy

  // Additional Info
  faqs                Json?    // Array of {question, answer}
  relatedProducts     String[] @default([]) // Array of product IDs
  tags                String[] @default([])
  imageUrl            String?

  // Metadata
  aiSearchKeywords    String[] @default([]) // Keywords AI should search for
  notes               String?  @db.Text // Internal notes for support agents

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([workspaceId])
  @@index([name])
  @@index([sku])
  @@index([status])
}
```

### **1.2 Why This Schema?**

✅ **AI-Friendly:**
- Structured fields AI can easily query
- JSON for flexible specifications
- Arrays for multi-value fields (colors, sizes, features)
- Dedicated `aiSearchKeywords` for better matching

✅ **Comprehensive:**
- All product info in one place
- Shipping, warranty, return info included
- FAQ support per product

✅ **Flexible:**
- JSON specs for custom fields per product type
- Tags and categories for organization
- Related products for cross-selling

---

## 🎨 **PHASE 2: UI/UX DESIGN**

### **2.1 Product Knowledge Base Page**

**Route:** `/products` (new page)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  🏢 Outlight                    [AI Assistant 🤖]       │
├─────────────────────────────────────────────────────────┤
│  📦 Product Knowledge Base                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Search: [________________] 🔍  [+ Add Product]   │  │
│  │ Filter: [All] [Active] [Discontinued] [Category] │  │
│  │ [Bulk Add Products]  [Export CSV]  [Import CSV]  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 📋 Products List (50 products)                  │   │
│  │ ┌──────────────────────────────────────────┐   │   │
│  │ │ Product Name  │ SKU    │ Category │ Status│   │   │
│  │ ├──────────────────────────────────────────┤   │   │
│  │ │ Widget Pro    │ WGT001 │ Widgets  │ ✓     │   │   │
│  │ │ Gadget Ultra  │ GAD100 │ Gadgets  │ ✓     │   │   │
│  │ │ Thingamajig   │ THG055 │ Things   │ ⚠️    │   │   │
│  │ └──────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### **2.2 Product Editor Modal**

**When clicking a product:**

```
┌─────────────────────────────────────────────────────────┐
│  Edit Product: Widget Pro                       [✕]    │
├─────────────────────────────────────────────────────────┤
│  Tabs: [Basic Info] [Specs] [Shipping] [Support]       │
│  ┌──────────────────────────────────────────────────┐  │
│  │ BASIC INFO                                       │  │
│  │ Product Name: [Widget Pro                    ]  │  │
│  │ SKU:          [WGT001                        ]  │  │
│  │ Category:     [Widgets ▼                     ]  │  │
│  │ Status:       [● Active  ○ Discontinued      ]  │  │
│  │ Description:  [Textarea...                    ]  │
│  │ Price:        [$99.99                        ]  │  │
│  │ Availability: [In Stock ▼                    ]  │  │
│  └──────────────────────────────────────────────────┘  │
│  [Cancel]                        [Save Changes]         │
└─────────────────────────────────────────────────────────┘
```

**Tabs:**
1. **Basic Info:** Name, SKU, category, description, price, availability
2. **Specifications:** Custom fields, features, materials, dimensions, colors, sizes
3. **Shipping:** Shipping time, restrictions, handling time, ships from
4. **Support:** Instructions, care info, warranty, return policy, FAQs

### **2.3 Bulk Add Products Modal**

```
┌─────────────────────────────────────────────────────────┐
│  Bulk Add Products                               [✕]    │
├─────────────────────────────────────────────────────────┤
│  Paste product names (one per line):                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Widget Pro                                       │  │
│  │ Gadget Ultra                                     │  │
│  │ Thingamajig Standard                            │  │
│  │ Doohickey Deluxe                                │  │
│  │                                                  │  │
│  └──────────────────────────────────────────────────┘  │
│  ☐ Auto-generate SKUs                                  │
│  Category: [Select category ▼]                         │
│  Status:   [Active ▼]                                  │
│                                                         │
│  [Cancel]                    [Create 4 Products]        │
└─────────────────────────────────────────────────────────┘
```

### **2.4 Spreadsheet-Style Editing**

**Grid View Option:**
- Click "Grid View" to show spreadsheet-style editor
- Inline editing like Excel/Google Sheets
- Columns: Name, SKU, Category, Price, Shipping Time, Status
- Quick edit mode for bulk changes

---

## 🤖 **PHASE 3: AI INTEGRATION**

### **3.1 AI System Prompt Enhancement**

**Add to Draft AI System Prompt (`server.ts`):**

```typescript
systemPrompt += `

═══════════════════════════════════════════════════════════
📦 PRODUCT KNOWLEDGE BASE - STRUCTURED PRODUCT DATA
═══════════════════════════════════════════════════════════

You have access to a comprehensive Product Knowledge Base with detailed
information about all products. This is SEPARATE from the general knowledge base.

🔍 HOW TO USE PRODUCT INFORMATION:

1. **IDENTIFY PRODUCT MENTIONS:**
   - Look for product names, SKUs, or descriptions in customer messages
   - Common patterns: "I ordered the [product]", "My [SKU] is...", "The [item]..."

2. **QUERY THE PRODUCT DATABASE:**
   - Use the search_product tool to find product information
   - Search by: product name, SKU, or keywords
   - The tool returns complete product details

3. **USE PRODUCT DATA IN RESPONSES:**
   - Include accurate shipping times from product data
   - Reference product specifications when relevant
   - Use product-specific return policies if they exist
   - Include care instructions for applicable products
   - Reference warranty information when customers ask

4. **PRIORITIZE PRODUCT DATA:**
   - Product-specific information OVERRIDES general policies
   - If a product has custom shipping time, use that instead of general estimate
   - If a product has special return policy, use that instead of general policy
   - Product FAQs should be referenced when answering common questions

📋 PRODUCT DATA STRUCTURE:
- Name, SKU, Category, Status
- Description, Specifications, Features
- Price, Availability
- Shipping Time, Restrictions, Handling Time
- Instructions, Care Info, Warranty, Return Policy
- FAQs (product-specific Q&A)
- Related Products (for recommendations)

⚠️  IMPORTANT:
- ALWAYS search for product info when product is mentioned
- Use actual product data, not generic information
- If product not found, use general knowledge base
- Include product-specific details to give accurate, helpful responses

EXAMPLES:

Customer: "When will my Widget Pro ship?"
AI Action: search_product("Widget Pro")
AI Response: "Your Widget Pro typically ships within 2-3 business days..."

Customer: "How do I care for my Deluxe Gadget?"
AI Action: search_product("Deluxe Gadget")
AI Response: "For your Deluxe Gadget, please follow these care instructions: [from product.careInstructions]"

Customer: "What's the warranty on order #123 (includes Super Thingamajig)?"
AI Action: search_product("Super Thingamajig")
AI Response: "The Super Thingamajig comes with [product.warrantyInfo]..."

═══════════════════════════════════════════════════════════
END OF PRODUCT KNOWLEDGE BASE INSTRUCTIONS
═══════════════════════════════════════════════════════════
`;
```

### **3.2 New AI Tool: search_product**

**Add to Draft AI Tools:**

```typescript
{
  type: "function",
  function: {
    name: "search_product",
    description: "Search the Product Knowledge Base for detailed product information. Use this when a customer mentions a product name, SKU, or asks product-specific questions. Returns comprehensive product data including specifications, shipping times, care instructions, warranty, and FAQs.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Product name, SKU, or search keywords. Examples: 'Widget Pro', 'WGT001', 'blue widget'"
        }
      },
      required: ["query"]
    }
  }
}
```

**Tool Implementation:**

```typescript
async function searchProduct(query: string, workspaceId: string) {
  // Search products by name, SKU, or keywords
  const products = await prisma.product.findMany({
    where: {
      workspaceId,
      status: "active",
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { sku: { contains: query, mode: "insensitive" } },
        { aiSearchKeywords: { has: query.toLowerCase() } },
        { tags: { has: query.toLowerCase() } }
      ]
    },
    take: 5 // Return top 5 matches
  });

  if (products.length === 0) {
    return {
      found: false,
      message: "No products found. Use general knowledge base.",
      query
    };
  }

  // Format product data for AI
  return {
    found: true,
    products: products.map(p => ({
      name: p.name,
      sku: p.sku,
      description: p.description,
      specifications: p.specifications,
      features: p.features,
      shippingTime: p.shippingTime,
      shippingRestrictions: p.shippingRestrictions,
      instructions: p.instructions,
      careInstructions: p.careInstructions,
      warrantyInfo: p.warrantyInfo,
      returnPolicy: p.returnPolicy,
      faqs: p.faqs,
      price: p.price,
      availabilityStatus: p.availabilityStatus
    }))
  };
}
```

---

## 💬 **PHASE 4: AI ASSISTANT CHATBOT**

### **4.1 AI Assistant Integration**

**Where it appears:**
1. **Product Knowledge Base page** - Floating button bottom-right
2. **Emails view** - New "AI Assistant" section in right sidebar
3. **General Knowledge Base page** - Also available there

**UI Design:**

```
┌─────────────────────────────────────┐
│  🤖 AI Assistant            [−] [✕] │
├─────────────────────────────────────┤
│  💬 Chat with AI                    │
│  ┌────────────────────────────────┐ │
│  │ You: Tell me about Widget Pro │ │
│  │                                │ │
│  │ 🤖: Widget Pro is a premium   │ │
│  │ widget with the following...  │ │
│  │                                │ │
│  │ You: What's its shipping time?│ │
│  │                                │ │
│  │ 🤖: Widget Pro ships within   │ │
│  │ 2-3 business days from...     │ │
│  └────────────────────────────────┘ │
│  [Type your question...      ] [→] │
│                                     │
│  Quick Actions:                     │
│  • List all products                │
│  • Products missing shipping info   │
│  • Search by category               │
│  • Export product data              │
└─────────────────────────────────────┘
```

### **4.2 AI Assistant Capabilities**

**What it can do:**

1. **Product Queries:**
   - "Tell me about [product name]"
   - "What products are in the [category] category?"
   - "Which products are out of stock?"
   - "Show me products with missing information"

2. **Information Lookup:**
   - "What's the shipping time for [product]?"
   - "What's the return policy for [product]?"
   - "Does [product] have a warranty?"
   - "What are the FAQs for [product]?"

3. **Data Analysis:**
   - "Which products are missing descriptions?"
   - "How many products need shipping info?"
   - "List all discontinued products"
   - "What products have been updated recently?"

4. **Bulk Operations:**
   - "Update shipping time for all widgets to 3-5 days"
   - "Add 'Made in USA' to all domestic products"
   - "Mark all [category] as discontinued"

5. **Suggestions:**
   - "What information is missing from [product]?"
   - "How can I improve the [product] description?"
   - "Suggest FAQs for [product] based on support tickets"

### **4.3 AI Assistant Implementation**

**API Endpoint:**

```typescript
// POST /api/ai-assistant/chat
app.post("/api/ai-assistant/chat", async (req, res) => {
  const { message, workspaceId, conversationHistory } = req.body;

  const systemPrompt = `You are an AI assistant helping customer support agents manage their Product Knowledge Base.

CAPABILITIES:
- Answer questions about products
- Search and retrieve product information
- Analyze product data for gaps or issues
- Suggest improvements to product information
- Help with bulk operations (with confirmation)

CONTEXT:
- You have access to the complete Product Knowledge Base
- You can search products, categories, and analyze data
- You provide helpful, concise answers
- When suggesting edits, be specific and actionable

AVAILABLE TOOLS:
- search_products: Search for products
- get_product_stats: Get statistics about products
- list_incomplete_products: Find products missing information
- suggest_improvements: Suggest how to improve product data

REMEMBER:
- Be helpful and concise
- Provide specific product information when asked
- Suggest actionable improvements
- Confirm before bulk operations`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: message }
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    tools: [/* AI Assistant tools */],
    temperature: 0.7
  });

  res.json({
    message: response.choices[0].message.content,
    toolCalls: response.choices[0].message.tool_calls
  });
});
```

---

## 🔧 **PHASE 5: TECHNICAL IMPLEMENTATION**

### **5.1 Backend API Endpoints**

```typescript
// Product CRUD
GET    /api/products                    // List all products
GET    /api/products/:id                // Get single product
POST   /api/products                    // Create product
PATCH  /api/products/:id                // Update product
DELETE /api/products/:id                // Delete product

// Bulk Operations
POST   /api/products/bulk-create        // Bulk create products
PATCH  /api/products/bulk-update        // Bulk update products
DELETE /api/products/bulk-delete        // Bulk delete products

// Search & Filter
GET    /api/products/search?q=...       // Search products
GET    /api/products/by-category/:cat   // Filter by category
GET    /api/products/incomplete         // Find incomplete products

// Import/Export
POST   /api/products/import/csv         // Import from CSV
GET    /api/products/export/csv         // Export to CSV

// AI Integration
POST   /api/products/search-for-ai      // Optimized search for AI tools
GET    /api/products/stats               // Product statistics

// AI Assistant
POST   /api/ai-assistant/chat           // Chat with AI assistant
POST   /api/ai-assistant/analyze        // Analyze product data
```

### **5.2 Frontend Components**

```
apps/web/app/products/
├── page.tsx                    # Main products page
├── components/
│   ├── ProductList.tsx        # Products grid/table
│   ├── ProductEditor.tsx      # Edit product modal
│   ├── BulkAddModal.tsx       # Bulk add products
│   ├── ProductFilters.tsx     # Search & filter controls
│   ├── GridView.tsx           # Spreadsheet-style view
│   └── AIAssistant.tsx        # AI chatbot component
├── hooks/
│   ├── useProducts.tsx        # Product data fetching
│   ├── useProductEditor.tsx   # Edit state management
│   └── useAIAssistant.tsx     # AI chat state
└── types/
    └── product.ts             # TypeScript types
```

### **5.3 AI Draft Tool Integration**

**In `server.ts` draft endpoint:**

```typescript
// Add search_product tool to tools array
const tools = [
  // ... existing tools (search_customer_and_orders, get_tracking_info)
  {
    type: "function",
    function: {
      name: "search_product",
      description: "Search Product Knowledge Base...",
      // ... (as defined in Phase 3.2)
    }
  }
];

// Handle tool call
if (functionName === "search_product") {
  const { query } = functionArgs;
  const result = await searchProduct(query, conversation.workspaceId);

  messages.push({
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify(result)
  });
}
```

---

## 📊 **PHASE 6: DATA STRUCTURE & EXAMPLES**

### **6.1 Example Product Record**

```json
{
  "id": "prod_123",
  "workspaceId": "ws_abc",
  "name": "Premium Widget Pro",
  "sku": "WGT-PRO-001",
  "category": "Widgets",
  "status": "active",
  "description": "Professional-grade widget with advanced features...",
  "specifications": {
    "material": "Aircraft-grade aluminum",
    "finish": "Anodized",
    "compatibility": ["Widget Base", "Widget Plus"],
    "power": "USB-C",
    "dimensions": "10x5x3 inches",
    "weight": "2.5 lbs"
  },
  "features": [
    "Advanced precision control",
    "Auto-calibration",
    "Bluetooth connectivity",
    "Mobile app support"
  ],
  "colors": ["Silver", "Black", "Blue"],
  "sizes": ["Standard", "Large"],
  "price": "$299.99",
  "msrp": "$349.99",
  "availabilityStatus": "in-stock",
  "shippingTime": "Ships within 2-3 business days",
  "shippingRestrictions": "Cannot ship to PO Boxes",
  "handlingTime": "1 business day",
  "shipsFrom": "California, USA",
  "instructions": "1. Remove from packaging\n2. Connect USB-C cable...",
  "careInstructions": "Wipe with soft, dry cloth. Avoid harsh chemicals.",
  "warrantyInfo": "2-year limited warranty covering manufacturing defects.",
  "returnPolicy": "30-day return window from delivery date. Must be unused.",
  "faqs": [
    {
      "question": "Is it compatible with Widget v1?",
      "answer": "Yes, fully compatible with all Widget v1 models."
    },
    {
      "question": "Can I use it internationally?",
      "answer": "Yes, supports 100-240V with included adapter."
    }
  ],
  "relatedProducts": ["prod_456", "prod_789"],
  "tags": ["premium", "bluetooth", "professional"],
  "aiSearchKeywords": ["widget pro", "premium widget", "wgt-pro", "professional widget"],
  "notes": "Popular item, frequently asked about shipping times",
  "createdAt": "2025-01-10T10:00:00Z",
  "updatedAt": "2025-01-10T10:00:00Z"
}
```

---

## 🎯 **PHASE 7: IMPLEMENTATION ROADMAP**

### **Phase 7.1: Foundation (Week 1)**
- ✅ Database schema design
- ✅ Migration creation
- ✅ Basic API endpoints (CRUD)
- ✅ TypeScript types

### **Phase 7.2: UI Development (Week 1-2)**
- ✅ Products list page
- ✅ Product editor modal
- ✅ Bulk add functionality
- ✅ Search and filters
- ✅ Basic styling and layout

### **Phase 7.3: AI Integration (Week 2)**
- ✅ search_product tool implementation
- ✅ System prompt updates
- ✅ Tool call handling in draft endpoint
- ✅ Testing with real product queries

### **Phase 7.4: AI Assistant (Week 2-3)**
- ✅ AI Assistant chatbot component
- ✅ Chat API endpoint
- ✅ Assistant tools (search, analyze, suggest)
- ✅ Integration in multiple pages

### **Phase 7.5: Advanced Features (Week 3)**
- ✅ Spreadsheet-style grid view
- ✅ CSV import/export
- ✅ Product analytics
- ✅ Bulk operations

### **Phase 7.6: Testing & Refinement (Week 3-4)**
- ✅ Test AI product searches
- ✅ Test draft generation with product data
- ✅ Test AI Assistant capabilities
- ✅ Performance optimization
- ✅ UI/UX polish

---

## 🎨 **PHASE 8: UI/UX DETAILS**

### **8.1 Navigation Addition**

**Add to main navigation:**
```typescript
{
  name: 'Products',
  href: '/products',
  icon: PackageIcon,
  badge: incompleteCount // Show count of incomplete products
}
```

### **8.2 AI Assistant Button**

**Floating button (bottom-right):**
```tsx
<div className="fixed bottom-6 right-6 z-50">
  <button className="w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700">
    <BotIcon className="w-6 h-6" />
  </button>
</div>
```

### **8.3 Email View Integration**

**Add AI Assistant panel in emails view:**
```
┌─────────────────────┬──────────────────────┐
│  Conversation List  │  Email Thread        │
│                     │                      │
│  [Conversations...] │  [Messages...]       │
│                     │                      │
│                     │  [Reply box]         │
│                     ├──────────────────────┤
│                     │  🤖 AI Assistant     │
│                     │  [Chat interface]    │
│                     │                      │
└─────────────────────┴──────────────────────┘
```

---

## 🚀 **PHASE 9: SUCCESS METRICS**

### **What Success Looks Like:**

1. **AI Draft Quality:**
   - ✅ AI includes accurate product-specific shipping times
   - ✅ AI references product warranties when relevant
   - ✅ AI provides correct care instructions
   - ✅ Drafts contain product-specific information

2. **Agent Efficiency:**
   - ✅ Agents can quickly look up product info
   - ✅ Bulk operations save time
   - ✅ AI Assistant answers questions instantly
   - ✅ Less time searching for product details

3. **Data Quality:**
   - ✅ All products have complete information
   - ✅ Easy to maintain and update
   - ✅ Consistent formatting
   - ✅ AI-friendly structure

4. **User Experience:**
   - ✅ Intuitive product management
   - ✅ Fast search and filtering
   - ✅ Helpful AI Assistant
   - ✅ Professional interface

---

## 📝 **PHASE 10: EXAMPLE USE CASES**

### **Use Case 1: Customer Asks About Shipping**

**Customer Email:** "When will my Widget Pro order ship?"

**AI Workflow:**
1. Reads customer message
2. Identifies product: "Widget Pro"
3. Calls `search_product("Widget Pro")`
4. Gets product data: `shippingTime: "2-3 business days"`
5. Drafts response: "Your Widget Pro typically ships within 2-3 business days..."

### **Use Case 2: Agent Uses AI Assistant**

**Agent:** "What products are missing shipping information?"

**AI Assistant:**
1. Searches all products
2. Filters where `shippingTime` is null/empty
3. Returns list: "Found 12 products missing shipping info: Widget Lite, Gadget Mini, ..."

**Agent:** "Update all Widgets to ship in 3-5 days"

**AI Assistant:**
1. Confirms: "Update shipping time to '3-5 business days' for 8 products in Widgets category?"
2. Agent confirms
3. Bulk update executed
4. Reports: "✅ Updated 8 products successfully"

### **Use Case 3: New Product Setup**

**Agent workflow:**
1. Click "Bulk Add Products"
2. Paste 20 product names
3. Set category: "Electronics"
4. Click "Create"
5. AI Assistant suggests: "Would you like me to help fill in details for these products?"
6. Agent can then edit each individually or use AI to generate descriptions

---

## 🎯 **NEXT STEPS TO BEGIN IMPLEMENTATION**

1. **Approve this plan** - Review and provide feedback
2. **Create database migration** - Add Product model
3. **Build backend API** - Product CRUD endpoints
4. **Create UI components** - Products page and editor
5. **Integrate AI tool** - Add search_product to draft AI
6. **Build AI Assistant** - Chatbot component
7. **Test and refine** - Ensure everything works smoothly

---

## 💡 **ADDITIONAL CONSIDERATIONS**

### **Security:**
- ✅ Workspace-scoped products (each workspace has own products)
- ✅ Role-based access (only admins can edit products)
- ✅ Audit log for product changes

### **Performance:**
- ✅ Indexed database fields for fast search
- ✅ Cached product data for AI queries
- ✅ Pagination for large product lists

### **Scalability:**
- ✅ Supports unlimited products per workspace
- ✅ JSON specs for flexible product types
- ✅ Can add custom fields without schema changes

---

## 📞 **FEEDBACK & QUESTIONS**

Before we start implementation, please review:

1. **Database schema** - Any fields to add/remove?
2. **UI design** - Any changes to layout or workflow?
3. **AI integration** - Any additional AI capabilities needed?
4. **AI Assistant** - Any other tasks it should handle?
5. **Priority** - Which phase should we start with?

Let me know your thoughts and we can begin implementation!
