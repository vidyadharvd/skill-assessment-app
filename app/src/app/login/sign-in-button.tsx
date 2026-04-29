"use client";

import { signIn } from "next-auth/react";

export function SignInButton() {
  return (
    <button
      className="inline-flex items-center justify-center rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
      onClick={() => signIn("google", { callbackUrl: "/assessment/new" })}
      type="button"
    >
      Continue with Google
    </button>
  );
}
