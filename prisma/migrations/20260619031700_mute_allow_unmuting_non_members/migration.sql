-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MemberMutes" (
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "previous_roles" TEXT NOT NULL,
    "mute_channel" TEXT,
    "executor" TEXT,
    "remove_on_join" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("guild_id", "user_id")
);
INSERT INTO "new_MemberMutes" ("created_at", "executor", "guild_id", "mute_channel", "previous_roles", "user_id") SELECT "created_at", "executor", "guild_id", "mute_channel", "previous_roles", "user_id" FROM "MemberMutes";
DROP TABLE "MemberMutes";
ALTER TABLE "new_MemberMutes" RENAME TO "MemberMutes";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
