# Product Brief

## 1. Problem

Managers and recruiters lack a consistent, objective way to measure skills, leading to unreliable evaluations and unclear identification of skill gaps across candidates and teams.

## 2. Target User

Managers and recruiters who need to assess the skills of their team members or potential candidates.

Secondary: Employees or candidates who take the assessments.

## 3. Value Proposition

A outcome-driven skill assessment platform that automatically maps desired outcomes to relevant skills and evaluates them objectively and reliably.

## 4. Core Features

1. Outcome-driven skill assessment creation
2. Automatic skill mapping to defined outcomes
3. Scenario-based question generation (single, holistic prompt covering all skills)
4. Response evaluation engine
5. Skill scoring, overall assessment score, and reporting

## 5. User Flow

1. Candidate/employee selects function, role, subject, and outcome
2. System generates a single, scenario-based question with a free-form response
3. User submits a single comprehensive response
4. System evaluates responses
5. User receives skill-wise scores and an overall assessment score&#x20;

## 6. Success Metrics

Primary: Correlation between assessment scores and real-world performance

## 7. Constraints & Assumptions

- Only text-based, free-form responses (no MCQs, no audio/video)
- Single-question assessment (scenario-based, holistic)
- Skill evaluation relies on automated scoring (no human review in MVP)
- Limited domain coverage (few functions/roles/subjects initially). These will be predefined
- Outcomes are  predefined&#x20;
- Reports are basic (skill scores, no deep insights or benchmarking)
- Response minimum length: 50 characters (see UX doc §4)
- One active assessment per user at a time (concurrency constraint)
- Scoring scale: integer 0–5 per skill; overall score is the arithmetic mean (DECIMAL(4,2))
- Auth: Google OAuth only (no email/password)
- Default user role: candidate/employee (no admin UI in MVP)

## 8. Open Questions

> _None outstanding for MVP. Add new questions here as they arise during implementation._

