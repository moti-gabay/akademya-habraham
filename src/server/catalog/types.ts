import type { AuditEntry } from "../auth/audit";
import type { Locale } from "../i18n/locales";
import type { CatalogInput, Entity } from "./schemas";

export type LessonStatus = "draft" | "processing" | "published" | "archived";
export type PublishStatus = "draft" | "published";

// Columns the forms do not edit directly.
type Managed = {
  categories: object;
  teachers: object;
  lessons: { status: LessonStatus; publishedAt: Date | null };
  terms: object;
  tracks: { status: PublishStatus };
  steps: { sortOrder: number };
};

// An entity as the admin sees it: every language, no fallback applied.
export type AdminRecord<E extends Entity> = CatalogInput<E> & { id: string } & Managed[E];

export type LinkKind = "lessonTerms" | "stepLessons";

// Storage for the admin catalog. Rules (who may do what, what blocks a delete) live in
// service.ts; implementations only read and write.
export interface AdminCatalogRepo {
  list<E extends Entity>(entity: E, filter?: { trackId?: string }): Promise<AdminRecord<E>[]>;
  get<E extends Entity>(entity: E, id: string): Promise<AdminRecord<E> | null>;
  slugTaken(entity: Entity, locale: Locale, slug: string, exceptId?: string): Promise<boolean>;
  codeTaken(entity: "terms" | "tracks", code: string, exceptId?: string): Promise<boolean>;
  // Creates or updates the row and its translations in one atomic write. Translations
  // missing from the input are removed.
  save<E extends Entity>(entity: E, id: string, input: CatalogInput<E>, actorId: string): Promise<void>;
  remove(entity: Entity, id: string): Promise<void>;
  setStatus(entity: "lessons" | "tracks", id: string, status: PublishStatus, now: Date): Promise<void>;
  getLinks(kind: LinkKind, id: string): Promise<string[]>;
  // Replaces the ordered list. False when one of the ids does not exist.
  setLinks(kind: LinkKind, id: string, ids: string[]): Promise<boolean>;
  reorderSteps(trackId: string, stepIds: string[]): Promise<void>;
  lessonCount(by: "categories" | "teachers", id: string): Promise<number>;
  hasProgress(lessonId: string): Promise<boolean>;
  audit(entry: AuditEntry): Promise<void>;
}
