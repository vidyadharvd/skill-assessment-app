# Assessment Generation & Scoring Logic&#x20;

## 1. Question Generation Logic

### Input

- Selected outcome
- Fetch mapped skills via `outcome_skills`
- Let total skills = S

### Constraints

- Total questions = 1
- The single question must assess **all mapped skills**

### Generation Strategy

- Generate **one comprehensive, scenario-based question**
- The question should naturally require use of multiple skills
- Avoid explicitly listing skills in the question
- Ensure coverage of all skills implicitly through the task

### Output

- 1 question
- Question tagged with full list of mapped skills

---

## 2. Question–Skill Mapping Storage

- The question must have an implicit mapping to all skills of the selected outcome
- At assessment creation, the resolved skill list is **snapshotted** into `assessment_skills` (M:N) so historical assessments stay stable even if `outcome_skills` is later edited
- Live derivation path (used at generation time only): `assessment.outcome_id` → `outcome_skills`
- Evaluation always reads the snapshot from `assessment_skills`, never the live mapping

---

## 3. Response Evaluation Logic

### Input

- Single user response
- Full skill mapping

### Evaluation

- Evaluate the response from different skill perspectives
- Generate **independent scores for each skill** based on the same response

---

## 4. Skill and Assessment Scoring Logic

- A single response is evaluated **independently across all mapped skills**
- Each skill is treated as a separate evaluation dimension

### Computation

For each skill K:

`score(K) = evaluation of the response against skill-specific rubric`

### Rules

- Each skill has its own rubric or evaluation criteria
- Same response → multiple independent evaluations (one per skill)

### Output

- One score per (response\_id, skill\_id)
- Stored in `response_skill_scores` with `rubric_id` (FK), `score`, `justification_text`, `status`
- `overall_score` (DECIMAL(4,2)) is the mean of per-skill scores, computed and persisted on `assessments` only when **all** `response_skill_scores` rows reach `status = 'SCORED'`
- Assessment transitions to `COMPLETED` at that point

---

## 5. Data Mapping Alignment

- Skill mapping is **snapshotted** into `assessment_skills` at generation time (source: `outcome_skills` for the chosen outcome)
- `assessments`
  - stores `question_text`, `outcome_id`, `status`, `overall_score`, `created_at`, `completed_at`
- `assessment_skills`
  - frozen list of evaluated skills per assessment (`assessment_id`, `skill_id`)
- `responses`
  - stores the single `answer_text`
- `response_skill_scores`
  - one row per evaluated skill, created up-front in `status = 'PENDING'`
  - on success: `status = 'SCORED'`, populates `score`, `rubric_id` (FK to `skill_rubrics.id`), `justification_text`
  - on failure: `status = 'FAILED'`, populates `error_text`; eligible for idempotent retry

---

## 6. LLM Evaluation Agent (Generic Design)

### Goal

- Use a single, reusable evaluation agent to score any skill across any context

### Inputs to Agent

- Function
- Role
- Subject
- Outcome
- Skill (single skill per evaluation call)
- Question
- User response
- Skill-specific rubric

### Prompt Structure

**System Prompt (fixed):**

- Define evaluator role
- Enforce objective, rubric-based scoring
- Specify scoring format (e.g., numeric scale)

**User Prompt (templated):**

```
Context:
Function: {function}
Role: {role}
Subject: {subject}
Outcome: {outcome}

Question:
{question}

User Response:
{response}

Skill to Evaluate:
{skill}

Rubric:
{rubric}

Instructions:
- Evaluate only this skill
- Follow rubric strictly
- Output a score and brief justification
```

### Evaluation Strategy

- Run **one LLM call per skill** (parallel fan-out)
- Each call is isolated → prevents cross-skill contamination
- Produces:
  - `score`
  - `justification_text`
- Each call writes its own `response_skill_scores` row independently — partial failures do NOT block other skills
- Failed rows can be retried independently using their `(response_id, skill_id)` key (idempotent: only rows in `status = 'FAILED'` are re-run)

### Scoring Scale&#x20;

- Define a consistent numeric scale (0 to 5)
- Same scale across all skills
- Rubric defines what each score means

## 7. Rubric Design&#x20;

Use a **5-point scale (0–5)** with clear anchors and a small set of criteria per skill.

**Structure (per skill):**

```
{
  "skill": "<skill_name>",
  "criteria": [
    "C1: <what good looks like>",
    "C2: <what good looks like>",
    "C3: <what good looks like>"
  ],
  "scale": {
    "0": "No evidence / incorrect",
    "1": "Very weak, major gaps",
    "2": "Partial, misses key aspects",
    "3": "Adequate, meets basics",
    "4": "Strong, minor gaps",
    "5": "Excellent, complete and precise"
  },
  "scoring_instructions": [
    "Assess only this skill",
    "Use criteria to judge completeness and correctness",
    "Pick the closest matching level",
    "Return integer score (0–5) and 1–2 line justification"
  ]
}
```

**Guidelines**

- Keep **3 criteria max** per skill (reduces prompt length, improves consistency)
- Criteria should be **observable in text** (avoid vague traits)
- Same scale across all skills (comparability)
- Version via `rubric_version` for future changes

**Why this works**

- Simple → stable LLM behavior
- Consistent → comparable scores
- Generic → works across roles/subjects without redesign

---

### Rubric Storage & Generation

#### Source of Truth

- Store rubrics in a separate table:

```
skill_rubrics

- id (PK)

- skill_id (FK → skills.id)

- rubric_json

- version

- created_at

- UNIQUE(skill_id, version)
```

#### Retrieval Flow

- On evaluation:
  1. Fetch the latest rubric for `skill_id` (or specific version if pinned)
  2. Pass rubric into LLM prompt
  3. Store `rubric_id` (FK) in `response_skill_scores`. The rubric's `version` is derivable via JOIN — never duplicated.

#### If Rubric Missing

- Trigger a **Rubric Generator Agent (LLM)**

- Input:

  - skill
  - function / role / subject / outcome context

- Output:

  - rubric in defined JSON structure

- Persist generated rubric into `skill_rubrics`

#### Properties

- Lazy generation (only when needed)
- Cached after first creation
- Versionable (future improvements possible)
- Decoupled from evaluation logic

### Storage Alignment

- Each evaluation result → one row in `response_skill_scores`
- Columns: (`response_id`, `skill_id`, `rubric_id`, `score`, `justification_text`, `status`, `error_text`)
- `rubric_version` is **not** stored here — fetched via JOIN on `skill_rubrics.id` when needed

### Key Properties

- Fully generic (works across all functions/roles/subjects)
- No hardcoding of skills
- Extensible (rubrics can evolve independently)

