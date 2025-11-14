-- CreateTable
CREATE TABLE "OnboardingSection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT 'tool-sop',
    "icon" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingVideo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "duration" TEXT,
    "category" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSection_slug_key" ON "OnboardingSection"("slug");

-- CreateIndex
CREATE INDEX "OnboardingSection_category_idx" ON "OnboardingSection"("category");

-- CreateIndex
CREATE INDEX "OnboardingSection_order_idx" ON "OnboardingSection"("order");

-- CreateIndex
CREATE INDEX "TrainingVideo_category_idx" ON "TrainingVideo"("category");

-- CreateIndex
CREATE INDEX "TrainingVideo_order_idx" ON "TrainingVideo"("order");
