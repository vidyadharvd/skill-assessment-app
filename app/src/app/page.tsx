import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { getSession } from "@/lib/server/auth/session";

export default async function Home() {
  const session = await getSession();

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-16">
      <section className="w-full max-w-3xl rounded-[2rem] border border-neutral-200 bg-white p-10 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
          Outcome-Driven Assessment
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-neutral-950">
          One focused question, scored skill by skill.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-600">
          Choose a function, role, subject, and outcome. We generate one
          scenario question that covers the mapped skills, then score your
          response against versioned rubrics.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            className="inline-flex items-center rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
            href={session?.user?.id ? "/assessment/new" : "/login"}
          >
            {session?.user?.id ? "Go to Assessment Flow" : "Start Assessment"}
          </Link>
          {!session?.user?.id ? (
            <Link
              className="inline-flex items-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:border-neutral-400 hover:bg-neutral-100"
              href="/login"
            >
              Login
            </Link>
          ) : null}
        </div>
        <div className="mt-8 rounded-2xl bg-neutral-100 p-4 text-sm text-neutral-600">
          {session?.user?.id ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Signed in as{" "}
                <span className="font-medium text-neutral-900">
                  {session.user.email}
                </span>
                .
              </p>
              <SignOutButton />
            </div>
          ) : (
            <p>Phase 2 adds Google sign-in and a persisted `users` table.</p>
          )}
        </div>
      </section>
    </main>
  );
}
