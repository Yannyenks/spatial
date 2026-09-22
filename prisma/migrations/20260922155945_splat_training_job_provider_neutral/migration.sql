/*
  Warnings:

  - You are about to drop the column `runpodJobId` on the `SplatTrainingJob` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SplatTrainingJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "providerJobId" TEXT,
    "outputBucket" TEXT,
    "outputKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);
INSERT INTO "new_SplatTrainingJob" ("completedAt", "createdAt", "error", "id", "outputBucket", "outputKey", "projectId", "spaceId", "status") SELECT "completedAt", "createdAt", "error", "id", "outputBucket", "outputKey", "projectId", "spaceId", "status" FROM "SplatTrainingJob";
DROP TABLE "SplatTrainingJob";
ALTER TABLE "new_SplatTrainingJob" RENAME TO "SplatTrainingJob";
CREATE INDEX "SplatTrainingJob_spaceId_idx" ON "SplatTrainingJob"("spaceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
