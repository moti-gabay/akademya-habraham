import { localize } from "../i18n/locales";
import type { UserDataRepo } from "../repos/types";
import { users } from "./data";
import type { MockStore } from "./store";

// Mock users are fictional, always active Hebrew-speaking learners. Admin changes to an
// account need Clerk, which mock mode never has, so accountChanges is always empty.
export function createMockUserDataRepo(store: MockStore): UserDataRepo {
  return {
    async findIdByEmail(email) {
      const wanted = email.toLowerCase();
      return Object.keys(users).find((id) => users[id].email.toLowerCase() === wanted) ?? null;
    },

    async buildExport(userId) {
      const user = users[userId];
      if (!user) return null;
      const progress = [...(store.progress.get(userId)?.values() ?? [])]
        .sort((a, b) => b.updatedAt - a.updatedAt || a.lessonId.localeCompare(b.lessonId))
        .flatMap((entry) => {
          const lesson = store.lessons.get(entry.lessonId);
          if (!lesson) return [];
          const title = lesson.translations.he.title;
          return [
            {
              lessonId: entry.lessonId,
              lessonTitle: title,
              lastPositionSec: entry.positionSec,
              watchedPct: entry.watchedPct,
              completedAt: entry.completedAt === null ? null : new Date(entry.completedAt).toISOString(),
              updatedAt: new Date(entry.updatedAt).toISOString(),
            },
          ];
        });
      return {
        account: {
          id: userId,
          email: user.email,
          name: localize(user.name, "he"),
          locale: "he",
          role: "user",
          status: "active",
          createdAt: user.createdAt,
        },
        progress,
        accountChanges: [],
      };
    },
  };
}
