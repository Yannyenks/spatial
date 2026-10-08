-- AlterTable
ALTER TABLE "Reconstruction" ADD COLUMN "previewVideoKey" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SplatTrainingJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "engine" TEXT NOT NULL DEFAULT 'nerfstudio',
    "error" TEXT,
    "providerJobId" TEXT,
    "outputBucket" TEXT,
    "outputKey" TEXT,
    "videoKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);
INSERT INTO "new_SplatTrainingJob" ("completedAt", "createdAt", "error", "id", "outputBucket", "outputKey", "projectId", "providerJobId", "spaceId", "status") SELECT "completedAt", "createdAt", "error", "id", "outputBucket", "outputKey", "projectId", "providerJobId", "spaceId", "status" FROM "SplatTrainingJob";
DROP TABLE "SplatTrainingJob";
ALTER TABLE "new_SplatTrainingJob" RENAME TO "SplatTrainingJob";
CREATE INDEX "SplatTrainingJob_spaceId_idx" ON "SplatTrainingJob"("spaceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

