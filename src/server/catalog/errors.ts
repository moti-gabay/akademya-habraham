// Postgres unique_violation, whichever driver reports it (Drizzle wraps the driver's
// error as `cause`).
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
