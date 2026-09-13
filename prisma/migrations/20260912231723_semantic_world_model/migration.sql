-- AlterTable
ALTER TABLE "Reconstruction" ADD COLUMN "model" TEXT;
ALTER TABLE "Reconstruction" ADD COLUMN "provider" TEXT;
ALTER TABLE "Reconstruction" ADD COLUMN "sourceJobId" TEXT;

-- CreateTable
CREATE TABLE "SpatialRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "predicate" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT,
    "objectLabel" TEXT,
    "confidence" REAL NOT NULL DEFAULT 1,
    "provenance" TEXT NOT NULL DEFAULT 'INFERRED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpatialRelation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Space" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "coverAssetId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parentSpaceId" TEXT,
    CONSTRAINT "Space_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Space_parentSpaceId_fkey" FOREIGN KEY ("parentSpaceId") REFERENCES "Space" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Space" ("coverAssetId", "createdAt", "id", "kind", "name", "order", "projectId") SELECT "coverAssetId", "createdAt", "id", "kind", "name", "order", "projectId" FROM "Space";
DROP TABLE "Space";
ALTER TABLE "new_Space" RENAME TO "Space";
CREATE INDEX "Space_projectId_idx" ON "Space"("projectId");
CREATE INDEX "Space_parentSpaceId_idx" ON "Space"("parentSpaceId");
CREATE TABLE "new_SpatialObjectRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "positionX" REAL NOT NULL,
    "positionY" REAL NOT NULL,
    "positionZ" REAL NOT NULL,
    "rotationX" REAL NOT NULL DEFAULT 0,
    "rotationY" REAL NOT NULL DEFAULT 0,
    "rotationZ" REAL NOT NULL DEFAULT 0,
    "scaleX" REAL NOT NULL DEFAULT 1,
    "scaleY" REAL NOT NULL DEFAULT 1,
    "scaleZ" REAL NOT NULL DEFAULT 1,
    "confidence" REAL NOT NULL DEFAULT 1,
    "provenance" TEXT NOT NULL DEFAULT 'INFERRED',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "SpatialObjectRecord_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SpatialObjectRecord" ("confidence", "id", "label", "metadataJson", "positionX", "positionY", "positionZ", "rotationX", "rotationY", "rotationZ", "scaleX", "scaleY", "scaleZ", "sceneId", "type") SELECT "confidence", "id", "label", "metadataJson", "positionX", "positionY", "positionZ", "rotationX", "rotationY", "rotationZ", "scaleX", "scaleY", "scaleZ", "sceneId", "type" FROM "SpatialObjectRecord";
DROP TABLE "SpatialObjectRecord";
ALTER TABLE "new_SpatialObjectRecord" RENAME TO "SpatialObjectRecord";
CREATE INDEX "SpatialObjectRecord_sceneId_idx" ON "SpatialObjectRecord"("sceneId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SpatialRelation_projectId_idx" ON "SpatialRelation"("projectId");

-- CreateIndex
CREATE INDEX "SpatialRelation_subjectId_idx" ON "SpatialRelation"("subjectId");

-- CreateIndex
CREATE INDEX "SpatialRelation_predicate_idx" ON "SpatialRelation"("predicate");
