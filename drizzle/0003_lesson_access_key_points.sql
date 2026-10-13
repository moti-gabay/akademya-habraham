-- Edited by hand: drizzle-kit drops and recreates the enum, which fails on rows that
-- hold 'subscriber'. Renaming the value keeps existing rows valid.
ALTER TYPE "public"."lesson_access" RENAME VALUE 'subscriber' TO 'members';--> statement-breakpoint
ALTER TABLE "lessons" ALTER COLUMN "access" SET DEFAULT 'members';--> statement-breakpoint
ALTER TABLE "lesson_translations" ADD COLUMN "key_points" text[];
