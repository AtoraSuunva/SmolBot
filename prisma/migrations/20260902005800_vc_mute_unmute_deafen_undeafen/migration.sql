-- CreateTable
CREATE TABLE "VcActionQueue" (
    "userID" TEXT NOT NULL,
    "guildID" TEXT NOT NULL,
    "verb" TEXT NOT NULL,
    "executorID" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userID", "guildID", "verb")
);
