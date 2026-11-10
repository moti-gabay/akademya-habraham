import { and, desc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { UserDataRepo } from "../repos/types";
import type { Db } from "./client";
import * as t from "./schema";
import { uuidOrNil } from "./uuid";

// A learner's own data for an access request; see UserDataRepo.
export function createDrizzleUserDataRepo(getDb: () => Db): UserDataRepo {
  return {
    async findIdByEmail(email) {
      const [row] = await getDb()
        .select({ id: t.users.id })
        .from(t.users)
        .where(and(eq(t.users.email, email), ne(t.users.status, "deleted")))
        .limit(1);
      return row?.id ?? null;
    },

    async buildExport(userId) {
      const db = getDb();
      const [user] = await db
        .select()
        .from(t.users)
        .where(and(eq(t.users.id, uuidOrNil(userId)), ne(t.users.status, "deleted")))
        .limit(1);
      if (!user) return null;

      const titleHe = alias(t.lessonTranslations, "title_he");
      const titleLoc = alias(t.lessonTranslations, "title_loc");
      const progress = await db
        .select({
          lessonId: t.userLessonProgress.lessonId,
          lessonTitle: sql<string>`coalesce(nullif(${titleLoc.title}, ''), ${titleHe.title})`,
          lastPositionSec: t.userLessonProgress.lastPositionSec,
          watchedPct: t.userLessonProgress.watchedPct,
          completedAt: t.userLessonProgress.completedAt,
          updatedAt: t.userLessonProgress.updatedAt,
        })
        .from(t.userLessonProgress)
        .innerJoin(titleHe, and(eq(titleHe.lessonId, t.userLessonProgress.lessonId), eq(titleHe.locale, "he")))
        .leftJoin(titleLoc, and(eq(titleLoc.lessonId, t.userLessonProgress.lessonId), eq(titleLoc.locale, user.locale)))
        .where(eq(t.userLessonProgress.userId, user.id))
        .orderBy(desc(t.userLessonProgress.updatedAt), t.userLessonProgress.lessonId);

      // Admin changes to this account. Who made them, and from which address, stays out.
      const changes = await db
        .select({ action: t.auditLog.action, at: t.auditLog.createdAt, change: t.auditLog.diff })
        .from(t.auditLog)
        .where(and(eq(t.auditLog.targetType, "user"), eq(t.auditLog.targetId, user.id)))
        .orderBy(t.auditLog.createdAt);

      return {
        account: {
          id: user.id,
          email: user.email,
          name: user.name,
          locale: user.locale,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt.toISOString(),
        },
        progress: progress.map((row) => ({
          ...row,
          completedAt: row.completedAt?.toISOString() ?? null,
          updatedAt: row.updatedAt.toISOString(),
        })),
        accountChanges: changes.map((row) => ({ ...row, at: row.at.toISOString() })),
      };
    },
  };
}
