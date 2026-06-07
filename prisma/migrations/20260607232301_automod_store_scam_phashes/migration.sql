-- CreateTable
CREATE TABLE "PhashInfo" (
    "phash" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "is_scam" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("phash", "guild_id")
);

-- CreateTable
CREATE TABLE "PhashUrl" (
    "url" TEXT NOT NULL PRIMARY KEY,
    "phash" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PhashInfo_phash_idx" ON "PhashInfo"("phash");
