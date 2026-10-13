// Wraps generateStaticParams for pages that read the catalog. A build must not fail
// because the database is unreachable or behind on migrations (a preview deployment,
// for one): the pages are then left out of the build and rendered on first request.
// STRICT_STATIC_PARAMS=1 turns the failure back on, for the checks before a pull request.
export async function safeStaticParams<T>(name: string, load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch (error) {
    if (process.env.STRICT_STATIC_PARAMS === "1") throw error;
    // First line only, cut short: enough to see what failed, and no connection string.
    const message = (error instanceof Error ? error.message : String(error))
      .split("\n")[0]
      .slice(0, 160)
      .replace(/postgres(ql)?:\/\/\S+/g, "[redacted]");
    console.warn(`[build] ${name}: not prerendered, pages will be rendered on demand. ${message}`);
    return [];
  }
}
