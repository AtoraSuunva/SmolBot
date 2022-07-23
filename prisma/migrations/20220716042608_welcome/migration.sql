-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WelcomeSettings" (
    "guild_id" TEXT NOT NULL PRIMARY KEY,
    "message" TEXT NOT NULL,
    "channel" TEXT,
    "rejoins" BOOLEAN NOT NULL DEFAULT false,
    "instant" BOOLEAN NOT NULL DEFAULT false,
    "reactWith" TEXT NOT NULL,
    "reactAnimated" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_WelcomeSettings" ("channel", "guild_id", "instant", "message", "reactWith", "rejoins") SELECT "channel", "guild_id", "instant", "message", "reactWith", "rejoins" FROM "WelcomeSettings";
DROP TABLE "WelcomeSettings";
ALTER TABLE "new_WelcomeSettings" RENAME TO "WelcomeSettings";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
