import { notFound } from "next/navigation";
import { fakeRoutesEnabled } from "@/lib/media";
import { ClientFailure } from "./ClientFailure";

// TEST ONLY: fails on purpose so the e2e suite can see the error page. Same switch as
// the fake media routes (src/lib/media.ts): on only with the in-memory fakes and off
// Vercel, so it can never answer on a deployment; anywhere else it is a 404.
//   /dev/error            fails while rendering on the server, every time
//   /dev/error?once=<key> fails the first time for that key, then renders
//   /dev/error?client=1   fails in the browser (no digest)
const failedOnce = new Set<string>();

export default async function DevErrorPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!fakeRoutesEnabled()) notFound();
  const { once, client } = await searchParams;
  if (client) return <ClientFailure />;
  if (once && failedOnce.has(once)) return <main id="main" data-dev-error="recovered" />;
  if (once) failedOnce.add(once);
  throw new Error("dev-error-sentinel");
}
