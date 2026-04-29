"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

type Variant = "primary" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "inline-flex items-center justify-center rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300",
  ghost:
    "inline-flex items-center justify-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:border-neutral-400 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-70",
};

type Props = {
  /** Where to send the user after the session is destroyed. Defaults to /login. */
  callbackUrl?: string;
  className?: string;
  /** Override copy shown on the button. */
  label?: string;
  /** Visual style. Defaults to "ghost" since logout is rarely the primary action. */
  variant?: Variant;
};

export function SignOutButton({
  callbackUrl = "/login",
  className,
  label = "Sign out",
  variant = "ghost",
}: Props) {
  const [pending, setPending] = useState(false);

  return (
    <button
      className={className ?? VARIANT_CLASSES[variant]}
      disabled={pending}
      onClick={() => {
        setPending(true);
        // signOut clears the next-auth session cookie and redirects to callbackUrl.
        void signOut({ callbackUrl });
      }}
      type="button"
    >
      {pending ? "Signing out..." : label}
    </button>
  );
}
