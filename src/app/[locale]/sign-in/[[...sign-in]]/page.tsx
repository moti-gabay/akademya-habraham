import { SignIn } from "@clerk/nextjs";
import { getLocale } from "next-intl/server";
import { BrandMark } from "@/components/BrandMark";
import { redirect } from "@/i18n/navigation";
import { authMode } from "@/lib/authMode";

export default async function SignInPage() {
  // Without Clerk there is nothing to sign in to: everyone is the sample user.
  if (authMode !== "clerk") redirect({ href: "/", locale: await getLocale() });
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <BrandMark />
      </div>
      <SignIn />
    </main>
  );
}
