-- AlterTable (ADR-017: why a failed CV failed, on the CV's own row)
ALTER TABLE "cvs" ADD COLUMN "last_error_code" TEXT,
ADD COLUMN "last_error_message" TEXT;
