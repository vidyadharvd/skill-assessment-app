# Build Plan — Skill Assessment App

> Living document. Update as decisions get made or scope changes.

---

## 1. Document Review Summary

The product is an outcome-driven skill assessment platform. A user picks **function → role → subject → outcome**; the system generates a single scenario-based question covering every skill mapped to that outcome; the user writes a free-form response; an LLM independently scores each skill against a versioned rubric (lazy-generated and cached). Auth is Google OAuth only.

Source docs (in `/docs`):
- `product_brief.md`
- `skill_assessment_taxonomy.md`
- `skill_assessment_ux_auth_flows.md`
- `er_diagram_indexing_strategy.md`
- `assessment_generation_scoring_logic.md`

---

## 2. Gaps & Inconsistencies to Resolve
- resolved

---

## 3. Tech Stack (LOCKED)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | Server components for cheap reads, client components where needed, single deploy target. |
| Backend | Next.js Route Handlers / Server Actions | Modular service files mean we can extract a separate API later without rewriting business logic. |
| DB | **Supabase Postgres** (Docker locally for dev) | Hosted Postgres with SQL editor + table viewer; FTS via `tsvector`, JSONB for rubrics. |
| ORM | Drizzle | Lean, SQL-first, type-safe — good fit for connecting directly to Supabase Postgres via connection string. |
| Auth | **Auth.js (NextAuth) with Google provider** | Idiomatic Next.js integration, easy provider swap later. Connects to our own `users` table. |
| LLM | Anthropic Claude (Sonnet) | One provider for both rubric generation and evaluation. |
| Validation | Zod | API boundaries, LLM output parsing, form input. |
| Hosting | Vercel (app) + Supabase (DB) | Lowest-friction path for incremental shipping. |

**Supabase scope:** Postgres only. We're not using Supabase Auth, Storage, Realtime, or Edge Functions for the MVP. The Supabase dashboard is used purely as a DB admin tool.

**Auth integration note:** Auth.js handles the Google OAuth flow and session management. Our `users` table (defined in the ER doc) is the source of truth for user identity within the app — the Auth.js callback writes/updates a row there on each sign-in.

---

## 4. Modular Architecture

Goal: sharp boundaries with one-way dependencies so any single piece can be swapped without rewriting the rest.

### Backend modules (`/lib/server` or `/services`)

| Module | Responsibility | Owns writes to |
|---|---|---|
| `db/` | Schema, migrations, seeds, query helpers. | All tables (only path to SQL). |
| `llm/` | Provider-agnostic client. Retries, timeouts, structured output. | — |
| `taxonomy/` | Read-only: list functions, roles by function, subjects by role, outcomes by subject, skills by outcome. | — |
| `rubrics/` | `getOrCreateRubric(skill, context)`. Cache + lazy generation. | `skill_rubrics` |
| `questions/` | `generateQuestion(outcome, skills) → text`. | — (returns text; orchestrator persists) |
| `evaluator/` | `evaluateSkill(response, skill, rubric, context) → {score, justification}`. Pure per-skill. | — |
| `assessments/` | Orchestrator. Lifecycle: draft → question → submit → fan-out evaluation → aggregate → persist. | `assessments`, `responses`, `response_skill_scores` |

### Frontend modules

| Path | Purpose |
|---|---|
| `app/(auth)/` | Login, OAuth callback. |
| `app/assessment/new/` | Cascading wizard (function → role → subject → outcome → generate). |
| `app/assessment/[id]/` | Question + response screen. |
| `app/assessment/[id]/results/` | Scores + visualization. |
| `components/ui/` | Design primitives (Button, Card, Select, Bar). Swappable. |
| `lib/api-client/` | Typed wrappers around server actions / route handlers. |

### Why this split survives future change

- Switch LLM provider → touch only `llm/`.
- Change rubric format → touch only `rubrics/` + the prompt template.
- Add a new question type → new module beside `questions/`; orchestrator change is minimal.
- Build an admin app → reuse all backend modules unchanged.

---

## 5. Phased Build Plan

Each phase is independently shippable and verifiable. Don't start phase N+1 until phase N's exit criteria pass.

### Phase 0 — Foundations (½ day)
- Decide & document stack.
- Init repo: Next.js + TS + Tailwind + Postgres + ORM + Auth.js + Anthropic SDK + Zod.
- `.env.example`, lint, format, basic CI.
- **Exit:** `pnpm dev` boots a hello-world page; `pnpm db:push` creates an empty DB.

### Phase 1 — Data layer & seed (1 day)
- Define schema: `functions`, `roles`, `subjects`, `outcomes`, `skills`, `outcome_skills`, `skill_rubrics`.
- Resolve `rubric_id` vs `rubric_version`.
- Add the indexing strategy from the ER doc verbatim.
- Seed script ingests the taxonomy doc into the DB.
- **Exit:** `pnpm db:seed` populates all functions/roles/subjects/outcomes/skills/mappings; verified by SELECT queries.

### Phase 2 — Auth (½ day)
- Auth.js + Google provider.
- `users` table, session callback, protected route helper.
- **Exit:** I can sign in with Google and see my row in `users`.

### Phase 3 — Cascading selection wizard (1 day)
- Server-rendered, one decision per screen.
- Read-only; no LLM yet.
- **Exit:** Click through function → role → subject → outcome; "Generate Assessment" button wired but stubbed.

### Phase 4 — User layer schema (½ day)
- Add `assessments`, `responses`, `response_skill_scores`.
- Add `status` enum on assessments, per-skill score status, snapshotted skill list.
- **Exit:** Schema exists, FK constraints verified.

### Phase 5 — LLM client + question generation (1 day)
- `llm/` wrapper (retries, timeout, Zod-validated structured output).
- `questions/generateQuestion`.
- Wizard "Generate" creates `assessments` row in `GENERATED` status with `question_text`.
- **Exit:** Generate produces a real question stored in DB and visible on screen.

### Phase 6 — Response submission (½ day)
- Single-textarea screen.
- Validate (non-empty + min length).
- On submit, write `responses`, transition to `EVALUATING`.
- **Exit:** Response durably stored before any evaluation runs.

### Phase 7 — Rubric service (1 day)
- `rubrics/getOrCreateRubric`.
- Cache hit → return; miss → generate via LLM, validate shape, persist, return.
- **Exit:** Calling the service twice for a fresh skill makes one LLM call, not two.

### Phase 8 — Evaluator + orchestrator (1.5 days)
- `evaluator/evaluateSkill`.
- Orchestrator: fan out one call per skill in parallel; persist each `response_skill_scores` row independently.
- Compute `overall_score` once all rows succeed.
- Idempotent retry path for failed skills only.
- **Exit:** Full flow works end-to-end; killing one LLM call mid-flight leaves DB sane and "Retry" only re-runs failures.

### Phase 9 — Results UI (½ day)
- Per-skill bar chart, overall score, expandable justifications.
- **Exit:** A real assessment renders correctly.

### Phase 10 — Edge & polish (1 day)
- Loading states, retry CTAs, abandoned-assessment handling, rate limiting, basic observability.
- **Exit:** All edge states from `skill_assessment_ux_auth_flows.md` § 9 covered.

### Phase 11 — Tests (consolidate here)
- Unit tests: `evaluator`, `rubrics`, taxonomy queries.
- One e2e test: happy path.
- Schema tests: migrations apply cleanly.

---

## 6. Decide Before Phase 0

| # | Decision | Status |
|---|---|---|
| 1 | Tech stack (Next.js + Supabase Postgres + Drizzle + Auth.js + Anthropic) | ✅ Locked |
| 2 | `rubric_id` (FK) over `rubric_version` | ✅ Resolved — see ER doc §3, scoring logic §5 |
| 3 | Snapshot evaluated skills via `assessment_skills` | ✅ Resolved — see ER doc §3 |
| 4 | `assessments.status` enum: DRAFT, GENERATED, SUBMITTED, EVALUATING, COMPLETED, FAILED, ABANDONED | ✅ Resolved — see ER doc §3 |
| 5 | Open Questions section in product brief | ✅ Resolved — none outstanding for MVP |
| 6 | Per-skill score status enum: PENDING, SCORED, FAILED | ✅ Resolved — see ER doc §3 |
| 7 | Min response length (50 chars) and 1 active assessment per user | ✅ Resolved — see UX doc §4 |

All decisions resolved. Cleared to start Phase 0.

---

## 7. Change Log

- _2026-04-28_: Initial draft.
- _2026-04-28_: Resolutions baked into source docs (ER, scoring logic, UX, product brief). Items 2–7 in §6 marked resolved.
- _2026-04-28_: Tech stack locked — Next.js + Supabase Postgres + Drizzle + Auth.js + Anthropic. Supabase scope limited to Postgres only.
