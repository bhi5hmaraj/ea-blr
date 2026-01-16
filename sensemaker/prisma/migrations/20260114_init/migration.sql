-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ListingKind" AS ENUM ('JOB', 'NEWS');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ObservationSource" AS ENUM ('MANUAL', 'SCRAPE', 'EMAIL', 'API');

-- CreateEnum
CREATE TYPE "RawFormat" AS ENUM ('TEXT', 'MARKDOWN', 'HTML', 'PDF', 'IMAGE');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "kind" "ListingKind" NOT NULL DEFAULT 'JOB',
    "canonicalKey" TEXT NOT NULL,
    "title" TEXT,
    "orgName" TEXT,
    "sourceUrl" TEXT,
    "selectedRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "sourceType" "ObservationSource" NOT NULL,
    "sourceRef" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawFormat" "RawFormat" NOT NULL,
    "rawText" TEXT,
    "rawBlobRef" TEXT,
    "rawMeta" JSONB,
    "contentHash" TEXT,
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "observationId" TEXT,
    "schemaVersion" INTEGER NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'PENDING',
    "extracted" JSONB NOT NULL,
    "edited" JSONB,
    "resolved" JSONB,
    "notes" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Listing_canonicalKey_key" ON "Listing"("canonicalKey");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_selectedRevisionId_key" ON "Listing"("selectedRevisionId");

-- CreateIndex
CREATE INDEX "Listing_kind_createdAt_idx" ON "Listing"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_orgName_idx" ON "Listing"("orgName");

-- CreateIndex
CREATE INDEX "Observation_processingStatus_createdAt_idx" ON "Observation"("processingStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Observation_sourceType_capturedAt_idx" ON "Observation"("sourceType", "capturedAt");

-- CreateIndex
CREATE INDEX "Observation_contentHash_idx" ON "Observation"("contentHash");

-- CreateIndex
CREATE INDEX "Observation_createdBy_idx" ON "Observation"("createdBy");

-- CreateIndex
CREATE INDEX "Revision_listingId_createdAt_idx" ON "Revision"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "Revision_observationId_idx" ON "Revision"("observationId");

-- CreateIndex
CREATE INDEX "Revision_status_createdAt_idx" ON "Revision"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Revision_approvedBy_idx" ON "Revision"("approvedBy");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_selectedRevisionId_fkey" FOREIGN KEY ("selectedRevisionId") REFERENCES "Revision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
