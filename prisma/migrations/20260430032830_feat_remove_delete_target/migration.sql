/*
  Warnings:

  - You are about to drop the column `deleteTarget` on the `AutomodRule` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AutomodRule" (
    "rule_id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT,
    "action" TEXT NOT NULL DEFAULT 'log',
    "duration" INTEGER,
    "parameters" JSONB NOT NULL
);
INSERT INTO "new_AutomodRule" ("action", "duration", "guild_id", "message", "name", "parameters", "rule_id", "type") SELECT "action", "duration", "guild_id", "message", "name", "parameters", "rule_id", "type" FROM "AutomodRule";
DROP TABLE "AutomodRule";
ALTER TABLE "new_AutomodRule" RENAME TO "AutomodRule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
