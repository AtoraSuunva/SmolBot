-- AlterTable
ALTER TABLE "ModLogChannels" ADD COLUMN "automod_trigger" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "automod_timeout" BOOLEAN NOT NULL DEFAULT false,
    "user_update" TEXT NOT NULL DEFAULT 'None',
    "message_delete" BOOLEAN NOT NULL DEFAULT false,
    "message_delete_bulk" BOOLEAN NOT NULL DEFAULT false,
    "channel_create" BOOLEAN NOT NULL DEFAULT false,
    "channel_delete" BOOLEAN NOT NULL DEFAULT false,
    "channel_update" BOOLEAN NOT NULL DEFAULT false,
    "reaction_actions" BOOLEAN NOT NULL DEFAULT false,
    "automod_action" BOOLEAN NOT NULL DEFAULT false,
    "reaction_remove" BOOLEAN NOT NULL DEFAULT false,
    "reaction_time" INTEGER NOT NULL DEFAULT 0,
    "automod_trigger" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_ModLogConfig" ("automod_action", "automod_timeout", "channel_create", "channel_delete", "channel_id", "channel_update", "enabled", "guild_id", "member_add", "member_add_invite", "member_add_new", "member_ban", "member_remove", "member_remove_roles", "member_timeout", "member_unban", "member_welcome", "message_delete", "message_delete_bulk", "reaction_actions", "reaction_remove", "reaction_time", "updated_at", "user_update") SELECT "automod_action", "automod_timeout", "channel_create", "channel_delete", "channel_id", "channel_update", "enabled", "guild_id", "member_add", "member_add_invite", "member_add_new", "member_ban", "member_remove", "member_remove_roles", "member_timeout", "member_unban", "member_welcome", "message_delete", "message_delete_bulk", "reaction_actions", "reaction_remove", "reaction_time", "updated_at", "user_update" FROM "ModLogConfig";
DROP TABLE "ModLogConfig";
ALTER TABLE "new_ModLogConfig" RENAME TO "ModLogConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
