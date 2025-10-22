/**
 * Shopify API Service Layer
 *
 * Provides functions for interacting with Shopify Admin API
 * for customer support operations:
 * - Customer lookup
 * - Order history
 * - Order details
 * - Refund processing
 */

// Environment variables
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || '';
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

// Base URL for Shopify Admin API
const SHOPIFY_API_BASE = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`;

/**
 * Helper function to make authenticated requests to Shopify Admin API
 */
async function shopifyRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${SHOPIFY_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json() as T;
}

/**
 * GraphQL query helper for Shopify Admin API
 */
async function shopifyGraphQL<T>(query: string, variables?: Record<string, any>): Promise<T> {
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify GraphQL error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data as T;
}

// Type definitions
export interface ShopifyCustomer {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  orders_count: number;
  total_spent: string;
  created_at: string;
  updated_at: string;
  phone?: string;
  note?: string;
  tags?: string;
  verified_email: boolean;
  state: string;
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  currency: string;
  line_items: ShopifyLineItem[];
  customer: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
  };
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  refunds?: ShopifyRefund[];
}

export interface ShopifyLineItem {
  id: number;
  product_id: number;
  variant_id: number;
  title: string;
  variant_title: string | null;
  quantity: number;
  price: string;
  total_discount: string;
  fulfillment_status: string | null;
  name: string;
}

export interface ShopifyAddress {
  first_name: string;
  last_name: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone?: string;
}

export interface ShopifyRefund {
  id: number;
  order_id: number;
  created_at: string;
  note?: string;
  refund_line_items: ShopifyRefundLineItem[];
  transactions: ShopifyTransaction[];
}

export interface ShopifyRefundLineItem {
  id: number;
  line_item_id: number;
  quantity: number;
  subtotal: string;
  total_tax: string;
  line_item: ShopifyLineItem;
}

export interface ShopifyTransaction {
  id: number;
  order_id: number;
  amount: string;
  kind: string;
  gateway: string;
  status: string;
  created_at: string;
}

/**
 * Search for a customer by email
 */
export async function findCustomerByEmail(email: string): Promise<ShopifyCustomer | null> {
  try {
    const response = await shopifyRequest<{ customers: ShopifyCustomer[] }>(
      `/customers/search.json?query=email:${encodeURIComponent(email)}`
    );

    if (response.customers && response.customers.length > 0) {
      return response.customers[0];
    }

    return null;
  } catch (error) {
    console.error('Error finding customer by email:', error);
    throw error;
  }
}

/**
 * Get customer details by ID
 */
export async function getCustomer(customerId: string): Promise<ShopifyCustomer> {
  try {
    const response = await shopifyRequest<{ customer: ShopifyCustomer }>(
      `/customers/${customerId}.json`
    );
    return response.customer;
  } catch (error) {
    console.error('Error getting customer:', error);
    throw error;
  }
}

/**
 * Get all orders for a customer
 */
export async function getCustomerOrders(customerId: string, limit: number = 50): Promise<ShopifyOrder[]> {
  try {
    const response = await shopifyRequest<{ orders: ShopifyOrder[] }>(
      `/customers/${customerId}/orders.json?limit=${limit}&status=any`
    );
    return response.orders || [];
  } catch (error) {
    console.error('Error getting customer orders:', error);
    throw error;
  }
}

/**
 * Get order details by order ID
 */
export async function getOrder(orderId: number): Promise<ShopifyOrder> {
  try {
    const response = await shopifyRequest<{ order: ShopifyOrder }>(
      `/orders/${orderId}.json`
    );
    return response.order;
  } catch (error) {
    console.error('Error getting order:', error);
    throw error;
  }
}

/**
 * Search for orders by order number
 */
export async function findOrderByNumber(orderNumber: string): Promise<ShopifyOrder | null> {
  try {
    const response = await shopifyRequest<{ orders: ShopifyOrder[] }>(
      `/orders.json?name=${encodeURIComponent(orderNumber)}&status=any`
    );

    if (response.orders && response.orders.length > 0) {
      return response.orders[0];
    }

    return null;
  } catch (error) {
    console.error('Error finding order by number:', error);
    throw error;
  }
}

/**
 * Create a refund for an order
 *
 * @param orderId - The order ID to refund
 * @param refundLineItems - Array of line items to refund with quantities
 * @param amount - Optional: specific amount to refund (otherwise calculated from line items)
 * @param reason - Reason for the refund
 * @param notify - Whether to notify the customer
 */
export async function createRefund(
  orderId: number,
  refundLineItems: Array<{ line_item_id: number; quantity: number; restock_type?: string }>,
  options: {
    amount?: string;
    reason?: string;
    notify?: boolean;
    note?: string;
  } = {}
): Promise<ShopifyRefund> {
  try {
    const refundData: any = {
      refund: {
        notify: options.notify ?? false,
        note: options.note,
        refund_line_items: refundLineItems.map(item => ({
          line_item_id: item.line_item_id,
          quantity: item.quantity,
          restock_type: item.restock_type || 'no_restock',
        })),
      },
    };

    // If specific amount is provided, add it
    if (options.amount) {
      refundData.refund.transactions = [{
        amount: options.amount,
        kind: 'refund',
        gateway: 'manual',
      }];
    }

    const response = await shopifyRequest<{ refund: ShopifyRefund }>(
      `/orders/${orderId}/refunds.json`,
      {
        method: 'POST',
        body: JSON.stringify(refundData),
      }
    );

    return response.refund;
  } catch (error) {
    console.error('Error creating refund:', error);
    throw error;
  }
}

/**
 * Calculate a refund (preview without creating)
 */
export async function calculateRefund(
  orderId: number,
  refundLineItems: Array<{ line_item_id: number; quantity: number }>
): Promise<{
  refund_line_items: ShopifyRefundLineItem[];
  transactions: ShopifyTransaction[];
}> {
  try {
    const response = await shopifyRequest<{
      refund: {
        refund_line_items: ShopifyRefundLineItem[];
        transactions: ShopifyTransaction[];
      };
    }>(
      `/orders/${orderId}/refunds/calculate.json`,
      {
        method: 'POST',
        body: JSON.stringify({
          refund: {
            refund_line_items: refundLineItems.map(item => ({
              line_item_id: item.line_item_id,
              quantity: item.quantity,
            })),
          },
        }),
      }
    );

    return {
      refund_line_items: response.refund.refund_line_items,
      transactions: response.refund.transactions,
    };
  } catch (error) {
    console.error('Error calculating refund:', error);
    throw error;
  }
}

/**
 * Get all refunds for an order
 */
export async function getOrderRefunds(orderId: number): Promise<ShopifyRefund[]> {
  try {
    const response = await shopifyRequest<{ refunds: ShopifyRefund[] }>(
      `/orders/${orderId}/refunds.json`
    );
    return response.refunds || [];
  } catch (error) {
    console.error('Error getting order refunds:', error);
    throw error;
  }
}

/**
 * Validate Shopify configuration
 */
export function validateShopifyConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!SHOPIFY_STORE_DOMAIN) {
    errors.push('SHOPIFY_STORE_DOMAIN is not configured');
  }

  if (!SHOPIFY_ADMIN_ACCESS_TOKEN) {
    errors.push('SHOPIFY_ADMIN_ACCESS_TOKEN is not configured');
  }

  if (!SHOPIFY_API_VERSION) {
    errors.push('SHOPIFY_API_VERSION is not configured');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Test Shopify connection
 */
export async function testShopifyConnection(): Promise<{ success: boolean; shop?: any; error?: string }> {
  try {
    const config = validateShopifyConfig();
    if (!config.valid) {
      return {
        success: false,
        error: `Configuration errors: ${config.errors.join(', ')}`,
      };
    }

    // Try to fetch shop information
    const response = await shopifyRequest<{ shop: any }>('/shop.json');

    return {
      success: true,
      shop: response.shop,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
