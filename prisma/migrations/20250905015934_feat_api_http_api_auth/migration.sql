-- CreateTable
CREATE TABLE "Token" (
    "token_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "parent_token_id" INTEGER,
    "hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "guild_id" TEXT,
    "permissions" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME,
    CONSTRAINT "Token_parent_token_id_fkey" FOREIGN KEY ("parent_token_id") REFERENCES "Token" ("token_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Token_hash_key" ON "Token"("hash");
