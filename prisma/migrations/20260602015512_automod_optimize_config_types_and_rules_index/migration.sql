-- DropIndex
DROP INDEX "AutomodRule_guild_id_idx";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AutomodConfig" (
    "guild_id" TEXT NOT NULL PRIMARY KEY,
    "prepend" TEXT,
    "ignoredChannels" TEXT NOT NULL DEFAULT '',
    "ignoredRoles" TEXT NOT NULL DEFAULT '',
    "ignoredUsers" TEXT NOT NULL DEFAULT '',
    "ignoreBots" BOOLEAN NOT NULL DEFAULT true,
    "ignoreAdmins" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_AutomodConfig" ("guild_id", "ignoreAdmins", "ignoreBots", "ignoredChannels", "ignoredRoles", "ignoredUsers", "prepend") SELECT "guild_id", "ignoreAdmins", "ignoreBots", "ignoredChannels", "ignoredRoles", "ignoredUsers", "prepend" FROM "AutomodConfig";
DROP TABLE "AutomodConfig";
ALTER TABLE "new_AutomodConfig" RENAME TO "AutomodConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AutomodRule_guild_id_type_idx" ON "AutomodRule"("guild_id", "type");
