# Outlight Customer Support Knowledge Base

## Email Classification Categories

### Primary Tags
- **non-support**: Not customer support related (marketing inquiries, partnership requests, spam, sales pitches)
- **chargeback**: Customer disputing charges with their bank
- **return**: Customer requesting to return a product
- **refund**: Customer asking about refund status or requesting a refund
- **product-inquiry**: Questions about product features, specifications, or availability
- **order-status**: Questions about order tracking, shipping, or delivery
- **damaged-product**: Product arrived damaged or defective
- **missing-items**: Items missing from order
- **cancellation**: Request to cancel an order

**Note**: Emails can have multiple tags. Apply all that are relevant.

---

## Return Policy

### Eligibility Window
- **30 days** from delivery date
- Order must be delivered, not just placed
- Count from delivery confirmation date

### Return Process
1. Customer initiates return via returns portal: **https://outlight.us/apps/returns-portal**
2. Customer receives return shipping label
3. Customer ships item back
4. Warehouse receives and inspects item
5. Refund processed within 5-7 business days of warehouse receipt

### Non-Returnable Items
- Items outside 30-day window
- Products marked as final sale
- Used or damaged items (unless damaged on arrival)

---

## Refund Processing Timeline

### Standard Timeline
- **5-7 business days** after return received at warehouse
- Additional 2-5 business days for bank processing

### If Return Approved Less Than 7 Days Ago
- Return likely still in transit to warehouse
- Refund processed once item arrives and is inspected
- Ask customer for patience

### Refund Verification Steps
1. Confirm return was approved in Shopify
2. Check if return has arrived at warehouse (ask admin)
3. If arrived, process refund immediately
4. If not arrived and approved <7 days ago, inform customer of timeline
5. If not arrived and approved >14 days ago, investigate with shipping carrier

---

## Draft Email Guidelines

### When to Draft Full Email Response
- **return**: Guide customer to returns portal with policy check
- **order-status**: Provide tracking information and estimated delivery
- **damaged-product**: Apologize, verify order, offer replacement or refund
- **missing-items**: Apologize, verify order, offer to send missing items
- **cancellation**: Check order status, cancel if not shipped or guide on return

### When to Provide Action Steps Only (No Draft)
- **non-support**: Tag and archive, no response needed
- **chargeback**: Tag and escalate to admin immediately
- **refund** (already returned): Provide verification steps for agent
- **product-inquiry**: Instruct agent to review product details and answer

### Email Tone
- Professional but friendly
- Empathetic to customer frustration
- Clear and concise
- Use customer's name when available
- End with offer to help further

---

## Product Information Quick Reference

### Common Product Questions
- Specifications: Direct to product page on website
- Availability: Check Shopify inventory
- Compatibility: Refer to product description
- Warranty: 1-year manufacturer warranty on all electronics

---

## Returns Portal Information

**URL**: https://outlight.us/apps/returns-portal

**How It Works**:
1. Customer enters order number and email
2. System verifies order eligibility
3. Customer selects items to return
4. Customer receives prepaid return label
5. Customer ships item back

**Return Label**:
- Prepaid USPS label provided
- Drop off at any USPS location
- Tracking number provided automatically

---

## Shipping Information

### Standard Shipping
- **Domestic (US)**: 5-7 business days
- **Processing time**: 1-2 business days before shipment

### Carriers
- USPS Priority Mail
- FedEx Ground
- UPS Ground
- EWS (international)

### Tracking
- Tracking numbers sent via email when shipped
- Check tracking at carrier website or via 17track

---

## Email Response Templates

### Return Request (Within Policy)
```
Dear [Customer Name],

Thank you for reaching out about returning your order.

I've verified that your order #[ORDER_NUMBER] qualifies for our 30-day return policy. To process your return, please visit our returns portal:

https://outlight.us/apps/returns-portal

Enter your order number and email address to generate a prepaid return label. Once you ship the item back and it arrives at our warehouse, we'll process your refund within 5-7 business days.

If you have any questions about the return process, I'm here to help!

Best regards,
Outlight Support Team
```

### Return Request (Outside Policy)
```
Dear [Customer Name],

Thank you for contacting us about your order #[ORDER_NUMBER].

Unfortunately, your order was delivered on [DELIVERY_DATE], which is outside our 30-day return window. Our return policy requires returns to be initiated within 30 days of delivery.

While we cannot accept a return at this time, please let me know if there's anything else I can help you with regarding this order.

Best regards,
Outlight Support Team
```

### Order Status Inquiry
```
Dear [Customer Name],

Thank you for checking on your order #[ORDER_NUMBER].

Your order is currently [STATUS]. [TRACKING_INFO]

Expected delivery: [ESTIMATED_DELIVERY]

You can track your package here: [TRACKING_URL]

Please let me know if you have any other questions!

Best regards,
Outlight Support Team
```

---

## Special Handling Cases

### Chargeback
**Action**: Do NOT respond to customer. Tag as "chargeback" and notify admin immediately. Chargebacks require special handling through payment processor.

### Non-Support
**Action**: Tag as "non-support" and archive. No response needed unless it's a legitimate business inquiry (then forward to appropriate department).

### Damaged/Defective Product
**Action**:
1. Express apology
2. Request photo evidence if not provided
3. Offer immediate replacement or full refund
4. Do NOT require return of damaged item
5. Process resolution same day when possible

---

## AI Draft Process Steps

### Step 1: Read Email Thread
- Read entire conversation history
- Identify main issue and any sub-issues
- Note customer sentiment and urgency

### Step 2: Classify and Tag
- Apply all relevant tags
- Determine primary category

### Step 3: Check Customer/Order Data
- Verify customer exists in Shopify
- Identify relevant order(s)
- Check order dates, status, and items

### Step 4: Apply Policy
- Check if action requested is within policy
- Determine appropriate response

### Step 5: Generate Output
- **If draft-eligible**: Show reasoning steps + email draft
- **If action-only**: Show actionable steps for agent to follow
- **If no-response**: Show classification and reason for no response
