import { z } from "zod";

// Input shapes for the admin catalog. Shared by the route handlers and the admin forms,
// so this file imports nothing that cannot run in the browser.
// Field names match the Drizzle column keys: the repos copy them as they are.

export const ENTITIES = ["categories", "teachers", "lessons", "terms", "tracks", "steps"] as const;
export type Entity = (typeof ENTITIES)[number];

export const CATEGORY_KINDS = ["holiday", "parsha", "halacha"] as const;
export const LESSON_ACCESS = ["free", "members"] as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const id = z.string().min(1).max(64);
const sortOrder = z.number().int().min(0).max(10_000);
// Letters and digits of any script, separated by single hyphens: "hanukkah-intro", "חנוכה".
export const SlugSchema = z
  .string()
  .trim()
  .max(80)
  .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u);
const code = z
  .string()
  .trim()
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

// Hebrew is required; a missing locale means "no translation" and falls back to Hebrew.
const translations = <T extends z.ZodType>(row: T) =>
  z.object({ he: row, en: row.optional(), ru: row.optional(), es: row.optional() });

const named = z.object({ name: text(120), slug: SlugSchema });

export const inputSchemas = {
  categories: z.object({
    kind: z.enum(CATEGORY_KINDS),
    parentId: id.nullable(),
    sortOrder,
    // Holiday name as @hebcal/core spells it, e.g. "Chanukah".
    hebcalCode: text(40).nullable(),
    translations: translations(named),
  }),
  teachers: z.object({ translations: translations(z.object({ name: text(120) })) }),
  lessons: z.object({
    categoryId: id.nullable(),
    teacherId: id.nullable(),
    durationSec: z.number().int().min(0).max(86_400).nullable(),
    access: z.enum(LESSON_ACCESS),
    translations: translations(
      z.object({
        title: text(200),
        description: text(500).nullable(),
        keyPoints: z.array(text(200)).max(8),
        slug: SlugSchema,
      }),
    ),
  }),
  terms: z.object({
    code,
    sortOrder,
    translations: translations(z.object({ term: text(80), shortDefinition: text(400), slug: SlugSchema })),
  }),
  tracks: z.object({ code, sortOrder, translations: translations(named) }),
  // A new step goes to the end of its track; the order is changed separately.
  steps: z.object({ trackId: id, translations: translations(named) }),
} satisfies Record<Entity, z.ZodType>;

export type CatalogInput<E extends Entity> = z.infer<(typeof inputSchemas)[E]>;

export const IdListSchema = z
  .array(id)
  .max(500)
  .refine((ids) => new Set(ids).size === ids.length);
