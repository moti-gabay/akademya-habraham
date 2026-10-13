import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { AuthError, resolveActor, ROLES, type Actor } from "@/server/auth/actor";
import { ADMIN_ROLE } from "@/server/catalog/service";
import { getDb } from "@/server/db/client";
import { SAMPLE_USER_ID } from "@/server/mock/data";
import { authMode, mockRole } from "./authMode";

// The only module that talks to Clerk's session API. Everything else works with Actor.

const SAMPLE_ACTOR: Actor = {
  userId: SAMPLE_USER_ID,
  role: mockRole ?? "user",
  locale: "he",
  secondFactorVerified: mockRole !== null,
};

async function preferredLocale(): Promise<Locale | undefined> {
  const value = (await cookies()).get("NEXT_LOCALE")?.value;
  return routing.locales.find((locale) => locale === value);
}

// Who is making this request, or null when signed out. Throws AuthError("account_blocked")
// for a blocked user. Cached per request: layout, page and header share one lookup.
export const getActor = cache(async (): Promise<Actor | null> => {
  if (authMode === "stub") return SAMPLE_ACTOR;

  const { userId: clerkUserId, factorVerificationAge } = await auth();
  if (!clerkUserId) return null;
  // Clerk reports -1 for a factor that was not used in this session.
  const secondFactorVerified = (factorVerificationAge?.[1] ?? -1) !== -1;
  return resolveActor(
    getDb(),
    { clerkUserId, secondFactorVerified },
    async () => {
      const user = await (await clerkClient()).users.getUser(clerkUserId);
      return {
        id: user.id,
        email_addresses: user.emailAddresses.map((email) => ({ id: email.id, email_address: email.emailAddress })),
        primary_email_address_id: user.primaryEmailAddressId,
        first_name: user.firstName,
        last_name: user.lastName,
        public_metadata: user.publicMetadata,
        banned: user.banned,
        updated_at: user.updatedAt,
      };
    },
    await preferredLocale(),
  );
});

// For pages: always returns an actor, sending signed-out visitors to sign-in and
// blocked users to an explanation.
export async function getPageActor(locale: Locale): Promise<Actor> {
  try {
    const actor = await getActor();
    if (actor) return actor;
  } catch (error) {
    if (error instanceof AuthError && error.code === "account_blocked") {
      return redirect({ href: "/blocked", locale });
    }
    throw error;
  }
  return redirect({ href: "/sign-in", locale });
}

// For the admin area: anyone below the admin role gets a 404, so the area is not advertised.
export async function getAdminActor(locale: Locale): Promise<Actor> {
  const actor = await getPageActor(locale);
  if (ROLES.indexOf(actor.role) < ROLES.indexOf(ADMIN_ROLE)) notFound();
  return actor;
}

// For every admin page except the entry page, which explains the second factor.
export async function requireAdminPage(locale: Locale): Promise<Actor> {
  const actor = await getAdminActor(locale);
  return actor.secondFactorVerified ? actor : redirect({ href: "/admin", locale });
}

// For route handlers: turns a failed auth check into its HTTP response.
export function authErrorResponse(error: unknown): Response {
  if (error instanceof AuthError) return Response.json({ error: error.code }, { status: error.status });
  throw error;
}
