"use client";

import { SignOutButton } from "@clerk/nextjs";
import { outlineBtn } from "./ui";

export function SignOut({ label }: { label: string }) {
  return (
    <SignOutButton>
      <button type="button" className={outlineBtn}>
        {label}
      </button>
    </SignOutButton>
  );
}
