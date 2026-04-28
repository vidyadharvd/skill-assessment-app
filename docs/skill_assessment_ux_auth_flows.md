# UX Design

## 1. Entry

- Landing
  - CTA: Start Assessment
  - Secondary: Login

---

## 2. Auth Flows

### Google OAuth Only

- Continue with Google
- No email/password signup
- No role selection (default: candidate/employee)

### Post-auth Routing

- All users → Assessment Flow

---

## 3. Assessment Creation (User Flow)

(Flow follows the data structure: function → role → subject →  outcome)

Step 1: Select Function
Step 2: Select Role (filtered by function)
Step 3: Select Subject (filtered by role)
Step 4: Select  Outcome

→ CTA: Generate Assessment

---

## 4. Assessment Experience

Assessment has 1 question

Screen pattern:

- Single prompt (covers all skills)
  - Large text input (free-form)
  - Submit

Constraints:

- No multi-step flow
- Encourage detailed response (guided helper text)
- **Minimum length**: response must be ≥ 50 characters before Submit is enabled
- **Concurrency**: a user may have at most **one active assessment** (status ∈ {DRAFT, GENERATED, SUBMITTED, EVALUATING}) at a time

---

## 5. Submission & Evaluation

1. User selects function → role → subject → outcome
2. System refers to outcome → skills mapping and **snapshots** the resolved skill list into `assessment_skills` (frozen for this assessment)
3. System generates 1 comprehensive question covering all skills; `assessments.status = GENERATED`
4. User submits response → `responses` row written; `assessments.status = SUBMITTED → EVALUATING`
5. One `response_skill_scores` row per skill is created in `PENDING`; LLM evaluation fans out in parallel; each row transitions independently to `SCORED` or `FAILED`
6. When all rows reach `SCORED`: compute `overall_score` (mean), set `assessments.status = COMPLETED`, set `completed_at`. If any row is `FAILED`: surface partial-failure UX (see §9)

---

## 6. Results Screen

- Skill-wise scores (list)
- Simple visualization (bars)
- Overall assessment score (avg of all skill scores)

---

## 7. Key UX Principles

- Progressive disclosure (function → outcome)
- Zero cognitive overload (one decision per screen)
- Single deep response (focus on quality over steps)
- Feedback post completion

---

## 8. Loading & Async States

- After "Generate Assessment"

  - Loading: "Generating question..."

- After submission

  - Loading: "Evaluating response..."

- Disable actions during processing

---

## 9. Edge States

### Generation Failures

- Show: "Failed to generate question"
- CTA: Retry
- Underlying assessment row is set to `status = FAILED`; retry creates a new generation attempt on the same row

### Evaluation Failures

- Per-skill failures are isolated. Each `response_skill_scores` row has its own `status` (PENDING / SCORED / FAILED).
- If any skill row is FAILED:
  - Show: "Evaluation incomplete — some skills couldn't be scored"
  - CTA: **Retry failed skills only** (idempotent — does not re-run already-SCORED skills)
- Assessment only transitions to `COMPLETED` when every row reaches `SCORED`

### Empty / Too-Short Response

- Prevent submit
- Show inline error: "Response must be at least 50 characters"

### Partial / Interrupted Flow

- If user exits after question generation but before submit
  - On next visit, prompt: **Resume** (return to existing question) or **Discard** (mark `status = ABANDONED` and start fresh)
- Abandoned assessments are retained for analytics, never deleted

---

## 10. Notes (System Fit)

- UX follows a simple top-down selection flow:
  function → role → subject → outcome
- Ensures clean queries + indexing alignment
- Auth ties to assessments via user\_id

