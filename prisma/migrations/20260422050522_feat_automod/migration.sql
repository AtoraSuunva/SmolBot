/*
  Warnings:

  - You are about to drop the column `action` on the `AutomodRule` table. All the data in the column will be lost.
  - You are about to drop the column `delete` on the `AutomodRule` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AutomodRule" (
    "rule_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "guild_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT,
    "parameters" JSONB NOT NULL
);
INSERT INTO "new_AutomodRule" ("guild_id", "message", "name", "parameters", "rule_id", "type") SELECT "guild_id", "message", "name", "parameters", "rule_id", "type" FROM "AutomodRule";
DROP TABLE "AutomodRule";
ALTER TABLE "new_AutomodRule" RENAME TO "AutomodRule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
