/*
  Warnings:

  - You are about to alter the column `parameters` on the `AutomodRule` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- AlterTable
ALTER TABLE "ModLogChannels" ADD COLUMN "member_timeout" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AutomodRule" (
    "rule_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "guild_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT,
    "action" TEXT NOT NULL,
    "delete" BOOLEAN NOT NULL DEFAULT false,
    "parameters" JSONB NOT NULL
);
INSERT INTO "new_AutomodRule" ("action", "delete", "guild_id", "message", "name", "parameters", "rule_id", "type") SELECT "action", "delete", "guild_id", "message", "name", "parameters", "rule_id", "type" FROM "AutomodRule";
DROP TABLE "AutomodRule";
ALTER TABLE "new_AutomodRule" RENAME TO "AutomodRule";
CREATE TABLE "new_ModLogConfig" (
    "guild_id" TEXT NOT NULL PRIMARY KEY,
    "channel_id" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "member_add" BOOLEAN NOT NULL DEFAULT false,
    "member_add_new" INTEGER NOT NULL DEFAULT 0,
    "member_add_invite" BOOLEAN NOT NULL DEFAULT false,
    "member_welcome" BOOLEAN NOT NULL DEFAULT false,
    "member_remove" BOOLEAN NOT NULL DEFAULT false,
    "member_remove_roles" BOOLEAN NOT NULL DEFAULT false,
    "member_ban" BOOLEAN NOT NULL DEFAULT false,
    "member_unban" BOOLEAN NOT NULL DEFAULT false,
    "member_timeout" BOOLEAN NOT NULL DEFAULT false,
    "user_update" TEXT NOT NULL DEFAULT 'None',
    "message_delete" BOOLEAN NOT NULL DEFAULT false,
    "message_delete_bulk" BOOLEAN NOT NULL DEFAULT false,
    "channel_create" BOOLEAN NOT NULL DEFAULT false,
    "channel_delete" BOOLEAN NOT NULL DEFAULT false,
    "channel_update" BOOLEAN NOT NULL DEFAULT false,
    "reaction_actions" BOOLEAN NOT NULL DEFAULT false,
    "automod_action" BOOLEAN NOT NULL DEFAULT false,
    "reaction_remove" BOOLEAN NOT NULL DEFAULT false,
    "reaction_time" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_ModLogConfig" ("automod_action", "channel_create", "channel_delete", "channel_id", "channel_update", "enabled", "guild_id", "member_add", "member_add_invite", "member_add_new", "member_ban", "member_remove", "member_remove_roles", "member_unban", "member_welcome", "message_delete", "message_delete_bulk", "reaction_actions", "reaction_remove", "reaction_time", "updated_at", "user_update") SELECT "automod_action", "channel_create", "channel_delete", "channel_id", "channel_update", "enabled", "guild_id", "member_add", "member_add_invite", "member_add_new", "member_ban", "member_remove", "member_remove_roles", "member_unban", "member_welcome", "message_delete", "message_delete_bulk", "reaction_actions", "reaction_remove", "reaction_time", "updated_at", "user_update" FROM "ModLogConfig";
DROP TABLE "ModLogConfig";
ALTER TABLE "new_ModLogConfig" RENAME TO "ModLogConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
