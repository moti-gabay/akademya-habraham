import { revalidateTag } from "next/cache";
import type { Actor } from "@/server/auth/actor";
import type { Result } from "@/server/catalog/service";
import { authErrorResponse, getActor } from "./auth";
import { CATALOG_TAG } from "./catalogCache";

// Runs one admin catalog operation for a route handler: resolves the actor, turns the
// service's result into a response, and refreshes the public catalog pages after a
// change. Who may do what is decided in the service, not here.
export async function adminCatalogResponse(
  request: Request,
  run: (actor: Actor | null, ip: string | null) => Promise<Result>,
  // False for reads, which change nothing the public pages show.
  changesCatalog = true,
): Promise<Response> {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
    const result = await run(await getActor(), ip);
    if (!result.ok) {
      const { status, ...body } = result;
      return Response.json(body, { status });
    }
    // Stale pages are served while fresh ones are built in the background.
    if (changesCatalog) revalidateTag(CATALOG_TAG, "max");
    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}

export const jsonBody = (request: Request): Promise<unknown> => request.json().catch(() => null);
