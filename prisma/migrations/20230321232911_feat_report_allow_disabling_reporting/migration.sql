-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReportConfig" (
    "guild_id" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "channel_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_ReportConfig" ("channel_id", "guild_id", "message", "updated_at") SELECT "channel_id", "guild_id", "message", "updated_at" FROM "ReportConfig";
DROP TABLE "ReportConfig";
ALTER TABLE "new_ReportConfig" RENAME TO "ReportConfig";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
