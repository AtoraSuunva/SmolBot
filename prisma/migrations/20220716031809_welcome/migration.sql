-- CreateTable
CREATE TABLE "WelcomeSettings" (
    "guild_id" TEXT NOT NULL PRIMARY KEY,
    "message" TEXT NOT NULL,
    "channel" TEXT,
    "rejoins" BOOLEAN NOT NULL DEFAULT false,
    "instant" BOOLEAN NOT NULL DEFAULT false,
    "reactWith" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "WelcomeUsers" (
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    PRIMARY KEY ("guild_id", "user_id")
);
