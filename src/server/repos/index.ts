import { getDb } from "../db/client";
import { createDrizzleRepos } from "../db/repos";
import * as mockRepos from "../mock/repos";

// Single switch point. The database is opt-in: only DATA_SOURCE=db selects it, and a
// DATABASE_URL on its own does not. Keep public deployments on mock until Clerk auth
// lands (Milestone 2): the heartbeat endpoint is unauthenticated, so with a database
// anyone could write progress for the sample user.
export const dataSource: "db" | "mock" = process.env.DATA_SOURCE === "db" ? "db" : "mock";

export const { glossaryRepo, holidayRepo, lessonRepo, pathRepo, progressRepo, userRepo } =
  dataSource === "db" ? createDrizzleRepos(getDb) : mockRepos;
export type * from "./types";
