CREATE TYPE "public"."subtitle_source" AS ENUM('manual', 'auto');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('created', 'uploading', 'processing', 'ready', 'error');--> statement-breakpoint
CREATE TABLE "lesson_subtitles" (
	"lesson_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"r2_key" text NOT NULL,
	"bunny_synced_at" timestamp with time zone,
	"source" "subtitle_source" DEFAULT 'manual' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_subtitles_lesson_id_locale_pk" PRIMARY KEY("lesson_id","locale")
);
--> statement-breakpoint
CREATE TABLE "video_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"bunny_video_id" text NOT NULL,
	"bunny_library_id" text NOT NULL,
	"status" "video_status" DEFAULT 'created' NOT NULL,
	"duration_sec" integer,
	"thumbnail_url" text,
	"ready_at" timestamp with time zone,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_assets_lesson_id_unique" UNIQUE("lesson_id"),
	CONSTRAINT "video_assets_bunny_video_id_unique" UNIQUE("bunny_video_id")
);
--> statement-breakpoint
ALTER TABLE "lesson_subtitles" ADD CONSTRAINT "lesson_subtitles_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;