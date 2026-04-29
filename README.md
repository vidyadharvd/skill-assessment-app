# Skill Assessment App

Outcome-driven skill assessment platform. Pick function → role → subject → outcome,
answer one scenario question, get LLM-scored per-skill results.

## Repo layout

```
.
├── app/        # Next.js app (TypeScript, Tailwind, Drizzle, Auth.js, OpenAI SDK)
├── docs/       # Product brief, taxonomy, ER diagram, scoring logic, build plan
└── .github/    # CI workflows
```

The product spec lives in `docs/`. Start with `docs/product_brief.md` and
`docs/build_plan.md`.

## Local setup

```bash
cd app
cp .env.example .env.local       # fill in real values; .env.local is gitignored
pnpm install
pnpm dev                         # http://localhost:3000
```

To create the schema in your Supabase Postgres:

```bash
pnpm db:push                     # phase 0: a no-op (schema is empty); phase 1 adds tables
```

## Tech stack (locked — see `docs/build_plan.md` §3)

| Layer    | Choice                                              |
| -------- | --------------------------------------------------- |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS   |
| Backend  | Next.js Route Handlers / Server Actions             |
| DB       | Supabase Postgres                                   |
| ORM      | Drizzle                                             |
| Auth     | Auth.js (NextAuth) with Google provider             |
| LLM      | OpenAI (gpt-4o via structured outputs)              |
| Validation | Zod                                               |
| Hosting  | Vercel (app) + Supabase (DB)                        |

## Phase status

- [x] **Phase 0** — Foundations
- [x] Phase 1 — Data layer & seed
- [x] Phase 2 — Auth
- [x] Phase 3 — Cascading selection wizard
- [x] Phase 4 — User layer schema
- [x] Phase 5 — LLM client + question generation
- [x] Phase 6 — Response submission
- [x] Phase 7 — Rubric service
- [x] Phase 8 — Evaluator + orchestrator
- [x] Phase 9 — Results UI
- [x] Phase 10 — Edge & polish
- [ ] Phase 11 — Tests
