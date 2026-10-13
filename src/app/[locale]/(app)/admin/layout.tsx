import { getLocale } from "next-intl/server";
import { AdminNav } from "@/components/admin/AdminNav";
import type { Locale } from "@/i18n/routing";
import { getAdminActor } from "@/lib/auth";

// The admin area: admins only (anyone else gets a 404), and the sections open only in a
// session where a second factor was verified. Every page checks again for itself.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getAdminActor((await getLocale()) as Locale);
  return (
    <div className="mx-auto max-w-3xl">
      {actor.secondFactorVerified && <AdminNav />}
      {children}
    </div>
  );
}
