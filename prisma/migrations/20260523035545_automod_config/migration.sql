-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AutomodConfig" (
    "guild_id" TEXT NOT NULL PRIMARY KEY,
    "prepend" TEXT,
    "ignoredChannels" JSONB NOT NULL DEFAULT [],
    "ignoredRoles" JSONB NOT NULL DEFAULT [],
    "ignoredUsers" JSONB NOT NULL DEFAULT [],
    "ignoreBots" BOOLEAN NOT NULL DEFAULT true,
    "ignoreAdmins" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_AutomodConfig" ("guild_id", "prepend") SELECT "guild_id", "prepend" FROM "AutomodConfig";
DROP TABLE "AutomodConfig";
ALTER TABLE "new_AutomodConfig" RENAME TO "AutomodConfig";
CREATE TABLE "new_AutomodRule" (
    "rule_id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT,
    "action" TEXT NOT NULL DEFAULT 'log',
    "duration" INTEGER NOT NULL DEFAULT 30,
    "parameters" JSONB NOT NULL DEFAULT "{}",
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AutomodRule" ("action", "created_at", "duration", "guild_id", "message", "name", "parameters", "rule_id", "type", "updated_at") SELECT "action", "created_at", "duration", "guild_id", "message", "name", "parameters", "rule_id", "type", "updated_at" FROM "AutomodRule";
DROP TABLE "AutomodRule";
ALTER TABLE "new_AutomodRule" RENAME TO "AutomodRule";
CREATE INDEX "AutomodRule_guild_id_idx" ON "AutomodRule"("guild_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
