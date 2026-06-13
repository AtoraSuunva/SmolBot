-- AlterTable
ALTER TABLE "PhashUrl" ADD COLUMN "image_content_type" TEXT;
ALTER TABLE "PhashUrl" ADD COLUMN "image_data" BLOB;
ALTER TABLE "PhashUrl" ADD COLUMN "image_file_name" TEXT;
ALTER TABLE "PhashUrl" ADD COLUMN "image_size" INTEGER;
