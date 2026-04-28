/**
 * Phase 0 placeholder — confirms the app boots.
 * Phase 3 will replace this with the cascading selection wizard.
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">Skill Assessment</h1>
      <p className="text-sm text-neutral-600">
        Phase 0 — foundations. Sign-in and the assessment wizard arrive in
        later phases.
      </p>
      <p className="text-xs text-neutral-400">
        Build status:{" "}
        <span className="font-mono text-emerald-700">dev server live</span>
      </p>
    </main>
  );
}
