export interface Product {
  id: string;
  workspaceId: string;

  // Basic Info
  name: string;
  sku?: string | null;
  category?: string | null;
  status: 'active' | 'discontinued' | 'coming-soon';

  // Product Details
  description?: string | null;
  specifications?: Record<string, any> | null;
  features: string[];
  materials?: string | null;
  dimensions?: string | null;
  weight?: string | null;
  colors: string[];
  sizes: string[];

  // Pricing & Availability
  price?: string | null;
  msrp?: string | null;
  availabilityStatus?: string | null;
  variants?: Array<{ option: string; price: string; sku?: string }> | null;

  // Shipping & Logistics
  shippingTime?: string | null;
  shippingRestrictions?: string | null;
  handlingTime?: string | null;
  shipsFrom?: string | null;

  // Instructions & Support
  instructions?: string | null;
  careInstructions?: string | null;
  warrantyInfo?: string | null;
  returnPolicy?: string | null;

  // Additional Info
  faqs?: Array<{ question: string; answer: string }> | null;
  relatedProducts: string[];
  tags: string[];
  imageUrl?: string | null;

  // AI Search
  aiSearchKeywords: string[];

  // Metadata
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductFormData {
  name: string;
  sku?: string;
  category?: string;
  status: 'active' | 'discontinued' | 'coming-soon';
  description?: string;
  specifications?: Record<string, any>;
  features?: string[];
  materials?: string;
  dimensions?: string;
  weight?: string;
  colors?: string[];
  sizes?: string[];
  price?: string;
  msrp?: string;
  availabilityStatus?: string;
  variants?: Array<{ option: string; price: string; sku?: string }>;
  shippingTime?: string;
  shippingRestrictions?: string;
  handlingTime?: string;
  shipsFrom?: string;
  instructions?: string;
  careInstructions?: string;
  warrantyInfo?: string;
  returnPolicy?: string;
  faqs?: Array<{ question: string; answer: string }>;
  relatedProducts?: string[];
  tags?: string[];
  imageUrl?: string;
  aiSearchKeywords?: string[];
  notes?: string;
}

export interface ProductStats {
  total: number;
  active: number;
  incomplete: number;
  categories: Array<{ name: string; count: number }>;
}
