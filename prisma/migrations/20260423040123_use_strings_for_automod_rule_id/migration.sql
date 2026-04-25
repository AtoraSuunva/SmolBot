/*
  Warnings:

  - The primary key for the `AutomodRule` table will be changed. If it partially fails, the table could be left without primary key constraint.

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
    "parameters" JSONB NOT NULL
);
INSERT INTO "new_AutomodRule" ("guild_id", "message", "name", "parameters", "rule_id", "type") SELECT "guild_id", "message", "name", "parameters", "rule_id", "type" FROM "AutomodRule";
DROP TABLE "AutomodRule";
ALTER TABLE "new_AutomodRule" RENAME TO "AutomodRule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
