-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ActionLogConfig" (
    "guild_id" TEXT NOT NULL PRIMARY KEY,
    "log_bans" BOOLEAN NOT NULL,
    "log_unbans" BOOLEAN NOT NULL,
    "log_kicks" BOOLEAN NOT NULL,
    "log_timeouts" BOOLEAN NOT NULL,
    "log_timeout_removals" BOOLEAN NOT NULL,
    "merge_logs" BOOLEAN NOT NULL DEFAULT true,
    "log_channel_id" TEXT,
    "archive_enabled" BOOLEAN NOT NULL DEFAULT false,
    "archive_channel" TEXT,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_ActionLogConfig" ("archive_channel", "archive_enabled", "guild_id", "log_bans", "log_channel_id", "log_kicks", "log_timeout_removals", "log_timeouts", "log_unbans", "updated_at") SELECT "archive_channel", "archive_enabled", "guild_id", "log_bans", "log_channel_id", "log_kicks", "log_timeout_removals", "log_timeouts", "log_unbans", "updated_at" FROM "ActionLogConfig";
DROP TABLE "ActionLogConfig";
ALTER TABLE "new_ActionLogConfig" RENAME TO "ActionLogConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
