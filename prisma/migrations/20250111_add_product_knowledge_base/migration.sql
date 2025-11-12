-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "description" TEXT,
    "specifications" JSONB,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "materials" TEXT,
    "dimensions" TEXT,
    "weight" TEXT,
    "colors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sizes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price" TEXT,
    "msrp" TEXT,
    "availabilityStatus" TEXT,
    "shippingTime" TEXT,
    "shippingRestrictions" TEXT,
    "handlingTime" TEXT,
    "shipsFrom" TEXT,
    "instructions" TEXT,
    "careInstructions" TEXT,
    "warrantyInfo" TEXT,
    "returnPolicy" TEXT,
    "faqs" JSONB,
    "relatedProducts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "aiSearchKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_workspaceId_idx" ON "Product"("workspaceId");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
