# ER Diagram & Indexing Strategy

## 1. Entities (Tables)

### functions

- id (PK)
- name (UNIQUE)

### roles

- id (PK)
- function\_id (FK → functions.id)
- name
- UNIQUE(function\_id, name)

### subjects

- id (PK)
- role\_id (FK → roles.id)
- name
- UNIQUE(role\_id, name)

### outcomes

- id (PK)
- subject\_id (FK → subjects.id)
- description
- UNIQUE(subject\_id, description)

### skills

- id (PK)
- name (UNIQUE)

### skill\_rubrics

- id (PK)
- skill\_id (FK → skills.id)
- rubric\_json
- version
- created\_at
- UNIQUE(skill\_id, version)

---

## 2. Junction Table (Many-to-Many)

### outcome\_skills

- outcome\_id (FK → outcomes.id)
- skill\_id (FK → skills.id)
- PRIMARY KEY (outcome\_id, skill\_id)

---

## 3. User Layer (Auth + Assessments)

### users

- id (PK)
- email (UNIQUE)
- oauth\_provider (e.g., 'google')
- provider\_user\_id (UNIQUE)
- name
- avatar\_url
- created\_at
- last\_login\_at

### assessments

- id (PK)
- user\_id (FK → users.id)
- outcome\_id (FK → outcomes.id)
- question\_text
- overall\_score (DECIMAL(4,2), nullable until COMPLETED — mean of per-skill scores)
- status (ENUM: 'DRAFT', 'GENERATED', 'SUBMITTED', 'EVALUATING', 'COMPLETED', 'FAILED', 'ABANDONED')
- created\_at
- completed\_at (nullable)

### assessment\_skills (skill snapshot per assessment)

- assessment\_id (FK → assessments.id)
- skill\_id (FK → skills.id)
- PRIMARY KEY (assessment\_id, skill\_id)

> Captures the exact skill set evaluated for this assessment at the moment of generation. Insulates historical assessments from future edits to `outcome_skills`.

### responses

- id (PK)
- assessment\_id (FK → assessments.id)
- answer\_text
- created\_at
- UNIQUE(assessment\_id)

### response_skill_scores

- id (PK)
- response_id (FK → responses.id)
- skill_id (FK → skills.id)
- rubric_id (FK → skill_rubrics.id, nullable until SCORED)
- score (INT 0–5, nullable until SCORED)
- justification_text (nullable until SCORED) -- explanation: why the user got this score
- status (ENUM: 'PENDING', 'SCORED', 'FAILED')
- error_text (nullable; populated when status = 'FAILED')
- updated_at
- UNIQUE(response_id, skill_id)

> One row per (response, skill) is created up-front in PENDING status when the response is submitted. Each LLM evaluation transitions a row to SCORED or FAILED independently, so partial failures are recoverable and retries are idempotent (only re-run rows where status = 'FAILED').
>
> `rubric_version` is derivable via JOIN on `skill_rubrics.id`; we do not duplicate it here.

---

## 4. Relationships

- Function (1) → (N) Roles
- Role (1) → (N) Subjects
- Subject (1) → (N) Outcomes
- Outcomes (M) ↔ (N) Skills (via outcome\_skills)

User Layer:

- User (1) → (N) Assessments
- Assessment (M) ↔ (N) Skills (via assessment\_skills — snapshot of evaluated skills)
- Assessment (1) → (1) Response
- Response (1) → (N) Response Skill Scores
- Skill (1) → (N) Response Skill Scores

---

## 5. Indexing Strategy

### Primary Indexes

- All `id` fields (auto)

### Foreign Key Indexes (mandatory)

- roles(function\_id)
- subjects(role\_id)
- outcomes(subject\_id)
- outcome\_skills(outcome\_id)
- outcome\_skills(skill\_id)

User Layer:

- assessments(user\_id)
- assessments(outcome\_id)
- assessments(status)
- assessment\_skills(assessment\_id)
- assessment\_skills(skill\_id)
- responses(assessment\_id)
- response\_skill\_scores(response\_id)
- response\_skill\_scores(skill\_id)
- response\_skill\_scores(status)

### Lookup Indexes

- functions(name)
- roles(function\_id, name)
- subjects(role\_id, name)
- skills(name)
- users(email)

### Search Index

- outcomes(description)
  - Use FULL TEXT (MySQL) or GIN + to\_tsvector (Postgres)

### Composite Indexes (important queries)

- outcome\_skills(skill\_id, outcome\_id)
- response\_skill\_scores(response\_id, skill\_id)
- response\_skill\_scores(skill\_id, response\_id)

---

## 6. Typical Query Patterns

- Fetch roles by function\_id
- Fetch subjects by role\_id
- Fetch outcomes by subject\_id
- Fetch skills by outcome\_id
- Reverse lookup: outcomes by skill\_id

User Layer:

- Fetch assessments by user\_id
- Fetch evaluated skills for an assessment via assessment\_skills (snapshot)
- Fetch response by assessment\_id
- Fetch response-level skill scores
- Fetch failed score rows for retry (response\_id, status = 'FAILED')
- Compute overall\_score from response\_skill\_scores once all rows are SCORED

---

## 7. Scaling Notes

- Clear separation:

  - Static layer → taxonomy
  - Dynamic layer → users, responses, scores

- outcome\_skills → mapping hotspot

- response\_skill\_scores → core evaluation layer

- Cache candidates:

  - outcome → skills
  - assessment → scores

---

## 8. ER (Text Diagram)

Static Layer:
functions
↓
roles
↓
subjects
↓
outcomes
↕
skills

(outcome\_skills bridges outcomes ↔ skills)

User Layer:
users
↓
assessments
↕
skills (via assessment\_skills — snapshot)
↓
responses
↓
response\_skill\_scores
↘
skills, skill\_rubrics

