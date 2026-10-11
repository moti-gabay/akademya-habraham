// Single switch point: replace these exports with the Drizzle repos when the
// database is wired in. Callers only know the interfaces in ./types.
export { glossaryRepo, holidayRepo, lessonRepo, pathRepo, progressRepo, userRepo } from "../mock/repos";
export type * from "./types";
