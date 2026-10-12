CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'editor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'blocked', 'deleted');--> statement-breakpoint
CREATE TABLE "user_lesson_progress" (
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"last_position_sec" integer DEFAULT 0 NOT NULL,
	"watched_pct" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_lesson_progress_user_id_lesson_id_pk" PRIMARY KEY("user_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" "citext" NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"locale" "locale" DEFAULT 'he' NOT NULL,
	"phone_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;