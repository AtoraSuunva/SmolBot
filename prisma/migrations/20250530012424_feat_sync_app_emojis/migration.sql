-- CreateTable
CREATE TABLE "ApplicationEmoji" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "hash" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "ApplicationEmoji_module_idx" ON "ApplicationEmoji"("module");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationEmoji_name_module_key" ON "ApplicationEmoji"("name", "module");
