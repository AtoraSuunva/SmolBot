-- CreateTable
CREATE TABLE "AutoTagConfig" (
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    PRIMARY KEY ("guild_id", "channel_id")
);
