-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AutomodRule" (
    "rule_id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT,
    "action" TEXT NOT NULL DEFAULT 'log',
    "duration" INTEGER,
    "deleteTarget" BOOLEAN NOT NULL DEFAULT false,
    "parameters" JSONB NOT NULL
);
INSERT INTO "new_AutomodRule" ("guild_id", "message", "name", "parameters", "rule_id", "type") SELECT "guild_id", "message", "name", "parameters", "rule_id", "type" FROM "AutomodRule";
DROP TABLE "AutomodRule";
ALTER TABLE "new_AutomodRule" RENAME TO "AutomodRule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
