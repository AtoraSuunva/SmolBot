-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PhashInfo" (
    "phash" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "is_scam" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("phash", "guild_id")
);
INSERT INTO "new_PhashInfo" ("created_at", "guild_id", "is_scam", "phash") SELECT "created_at", "guild_id", "is_scam", "phash" FROM "PhashInfo";
DELETE FROM "new_PhashInfo";
DROP TABLE "PhashInfo";
ALTER TABLE "new_PhashInfo" RENAME TO "PhashInfo";
CREATE INDEX "PhashInfo_phash_idx" ON "PhashInfo"("phash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
