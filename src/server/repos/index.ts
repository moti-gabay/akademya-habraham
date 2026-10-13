import { getDb } from "../db/client";
import { createDrizzleRepos } from "../db/repos";
import * as mockRepos from "../mock/repos";

// Single switch point. The database is opt-in: only DATA_SOURCE=db selects it, and a
// DATABASE_URL on its own does not. Who may write to it is decided in src/lib/authMode.ts.
export const dataSource: "db" | "mock" = process.env.DATA_SOURCE === "db" ? "db" : "mock";

export const { adminCatalogRepo, catalogRepo, glossaryRepo, holidayRepo, lessonRepo, mediaRepo, pathRepo, progressRepo, userRepo } =
  dataSource === "db" ? createDrizzleRepos(getDb) : mockRepos;
export type * from "./types";
