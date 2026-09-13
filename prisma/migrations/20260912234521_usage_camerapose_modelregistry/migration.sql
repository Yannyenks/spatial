/*
  Warnings:

  - You are about to drop the column `cameraPositions` on the `Scene` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CameraPose" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "positionX" REAL NOT NULL,
    "positionY" REAL NOT NULL,
    "positionZ" REAL NOT NULL,
    "rotationX" REAL NOT NULL DEFAULT 0,
    "rotationY" REAL NOT NULL DEFAULT 0,
    "rotationZ" REAL NOT NULL DEFAULT 0,
    "timestamp" REAL NOT NULL DEFAULT 0,
    "confidence" REAL NOT NULL DEFAULT 1,
    "sourceAssetId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CameraPose_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModelVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v0',
    "capabilities" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AIJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "spaceId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "modelVersionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorJson" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "durationMs" INTEGER,
    "costCents" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AIJob_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "ModelVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AIJob" ("completedAt", "costCents", "createdAt", "durationMs", "errorJson", "id", "model", "progress", "projectId", "provider", "spaceId", "stage", "startedAt", "status") SELECT "completedAt", "costCents", "createdAt", "durationMs", "errorJson", "id", "model", "progress", "projectId", "provider", "spaceId", "stage", "startedAt", "status" FROM "AIJob";
DROP TABLE "AIJob";
ALTER TABLE "new_AIJob" RENAME TO "AIJob";
CREATE INDEX "AIJob_projectId_idx" ON "AIJob"("projectId");
CREATE INDEX "AIJob_status_idx" ON "AIJob"("status");
CREATE TABLE "new_Reconstruction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "qualityJson" TEXT,
    "outputUri" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT,
    "model" TEXT,
    "modelVersionId" TEXT,
    "sourceJobId" TEXT,
    CONSTRAINT "Reconstruction_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reconstruction_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "ModelVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Reconstruction" ("createdAt", "id", "isCurrent", "method", "model", "outputUri", "projectId", "provider", "qualityJson", "sourceJobId", "spaceId", "status", "version") SELECT "createdAt", "id", "isCurrent", "method", "model", "outputUri", "projectId", "provider", "qualityJson", "sourceJobId", "spaceId", "status", "version" FROM "Reconstruction";
DROP TABLE "Reconstruction";
ALTER TABLE "new_Reconstruction" RENAME TO "Reconstruction";
CREATE INDEX "Reconstruction_spaceId_idx" ON "Reconstruction"("spaceId");
CREATE INDEX "Reconstruction_projectId_idx" ON "Reconstruction"("projectId");
CREATE TABLE "new_Scene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "navigationPoints" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "Scene_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Scene" ("createdAt", "id", "metadataJson", "navigationPoints", "spaceId") SELECT "createdAt", "id", "metadataJson", "navigationPoints", "spaceId" FROM "Scene";
DROP TABLE "Scene";
ALTER TABLE "new_Scene" RENAME TO "Scene";
CREATE UNIQUE INDEX "Scene_spaceId_key" ON "Scene"("spaceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "UsageRecord_organizationId_idx" ON "UsageRecord"("organizationId");

-- CreateIndex
CREATE INDEX "UsageRecord_metric_idx" ON "UsageRecord"("metric");

-- CreateIndex
CREATE INDEX "CameraPose_sceneId_idx" ON "CameraPose"("sceneId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelVersion_provider_model_version_key" ON "ModelVersion"("provider", "model", "version");
