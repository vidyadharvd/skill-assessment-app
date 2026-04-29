import { redirect } from "next/navigation";

import { getSession } from "@/lib/server/auth/session";

import { SignInButton } from "./sign-in-button";

export default async function LoginPage() {
  const session = await getSession();

  if (session?.user?.id) {
    redirect("/assessment/new");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-16">
      <section className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-10 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
          Skill Assessment
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-neutral-950">
          Sign in to start your assessment
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          Google OAuth is the only sign-in path for the MVP. After login,
          you&apos;ll land in the assessment flow.
        </p>
        <div className="mt-8">
          <SignInButton />
        </div>
      </section>
    </main>
  );
}
