-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApplicationEmoji" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "hash" TEXT NOT NULL
);
INSERT INTO "new_ApplicationEmoji" ("hash", "id", "module", "name") SELECT "hash", "id", "module", "name" FROM "ApplicationEmoji";
DROP TABLE "ApplicationEmoji";
ALTER TABLE "new_ApplicationEmoji" RENAME TO "ApplicationEmoji";
CREATE UNIQUE INDEX "ApplicationEmoji_name_key" ON "ApplicationEmoji"("name");
CREATE INDEX "ApplicationEmoji_module_idx" ON "ApplicationEmoji"("module");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
