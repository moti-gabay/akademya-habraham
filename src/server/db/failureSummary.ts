// What may be logged about a database failure: the error classes down the cause chain and
// a code (SQLSTATE such as 28P01, or ECONNREFUSED). Never a message, which can carry the
// host, the user or a query; a code is kept only when it has the shape of one.
const CODE = /^[A-Za-z0-9_]{1,32}$/;
const MAX_DEPTH = 5;

export type FailureSummary = { classes: string[]; code: string | null };

export function failureSummary(error: unknown): FailureSummary {
  const classes: string[] = [];
  let code: string | null = null;
  let current: unknown = error;
  for (let depth = 0; depth < MAX_DEPTH && current != null; depth++) {
    if (typeof current !== "object") {
      classes.push(typeof current);
      break;
    }
    classes.push(current.constructor?.name || "Object");
    const own = (current as { code?: unknown }).code;
    if (code === null && typeof own === "string" && CODE.test(own)) code = own;
    current = (current as { cause?: unknown }).cause;
  }
  return { classes, code };
}
