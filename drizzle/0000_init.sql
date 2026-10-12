CREATE TYPE "public"."category_kind" AS ENUM('holiday', 'parsha', 'halacha');--> statement-breakpoint
CREATE TYPE "public"."lesson_access" AS ENUM('free', 'subscriber');--> statement-breakpoint
CREATE TYPE "public"."lesson_status" AS ENUM('draft', 'processing', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('he', 'en', 'ru', 'es');--> statement-breakpoint
CREATE TYPE "public"."track_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "category_kind" NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"hebcal_code" text
);
--> statement-breakpoint
CREATE TABLE "category_translations" (
	"category_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "category_translations_category_id_locale_pk" PRIMARY KEY("category_id","locale"),
	CONSTRAINT "category_translations_locale_slug_unique" UNIQUE("locale","slug")
);
--> statement-breakpoint
CREATE TABLE "glossary_term_translations" (
	"term_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"term" text NOT NULL,
	"short_definition" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "glossary_term_translations_term_id_locale_pk" PRIMARY KEY("term_id","locale"),
	CONSTRAINT "glossary_term_translations_locale_slug_unique" UNIQUE("locale","slug")
);
--> statement-breakpoint
CREATE TABLE "glossary_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "glossary_terms_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "lesson_glossary_terms" (
	"lesson_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "lesson_glossary_terms_lesson_id_term_id_pk" PRIMARY KEY("lesson_id","term_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_translations" (
	"lesson_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"slug" text NOT NULL,
	CONSTRAINT "lesson_translations_lesson_id_locale_pk" PRIMARY KEY("lesson_id","locale"),
	CONSTRAINT "lesson_translations_locale_slug_unique" UNIQUE("locale","slug")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid,
	"teacher_id" uuid,
	"created_by" uuid,
	"duration_sec" integer,
	"access" "lesson_access" DEFAULT 'subscriber' NOT NULL,
	"status" "lesson_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"thumbnail_key" text,
	"parsha_code" text,
	"holiday_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_translations" (
	"teacher_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "teacher_translations_teacher_id_locale_pk" PRIMARY KEY("teacher_id","locale")
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_step_lessons" (
	"step_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "track_step_lessons_step_id_lesson_id_pk" PRIMARY KEY("step_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "track_step_translations" (
	"step_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "track_step_translations_step_id_locale_pk" PRIMARY KEY("step_id","locale")
);
--> statement-breakpoint
CREATE TABLE "track_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "track_steps_track_id_sort_order_unique" UNIQUE("track_id","sort_order")
);
--> statement-breakpoint
CREATE TABLE "track_translations" (
	"track_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "track_translations_track_id_locale_pk" PRIMARY KEY("track_id","locale"),
	CONSTRAINT "track_translations_locale_slug_unique" UNIQUE("locale","slug")
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "track_status" DEFAULT 'draft' NOT NULL,
	CONSTRAINT "tracks_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_term_translations" ADD CONSTRAINT "glossary_term_translations_term_id_glossary_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."glossary_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_glossary_terms" ADD CONSTRAINT "lesson_glossary_terms_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_glossary_terms" ADD CONSTRAINT "lesson_glossary_terms_term_id_glossary_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."glossary_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_translations" ADD CONSTRAINT "lesson_translations_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_translations" ADD CONSTRAINT "teacher_translations_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_step_lessons" ADD CONSTRAINT "track_step_lessons_step_id_track_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."track_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_step_lessons" ADD CONSTRAINT "track_step_lessons_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_step_translations" ADD CONSTRAINT "track_step_translations_step_id_track_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."track_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_steps" ADD CONSTRAINT "track_steps_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_translations" ADD CONSTRAINT "track_translations_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_glossary_terms_term_id_index" ON "lesson_glossary_terms" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "track_step_lessons_lesson_id_index" ON "track_step_lessons" USING btree ("lesson_id");