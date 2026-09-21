-- CreateTable
CREATE TABLE "SplatTrainingJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "runpodJobId" TEXT,
    "outputBucket" TEXT,
    "outputKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "SplatTrainingJob_spaceId_idx" ON "SplatTrainingJob"("spaceId");
