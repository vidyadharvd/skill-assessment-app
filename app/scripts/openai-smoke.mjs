import OpenAI from "openai";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  ssl: process.env.NODE_ENV === "production" ? "require" : "prefer",
  prepare: false,
});

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
});

const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    question: {
      type: "string",
      minLength: 80,
      maxLength: 2000,
      description:
        "The full text of the scenario-based question to present to the candidate.",
    },
  },
  required: ["question"],
  additionalProperties: false,
};

const QUESTION_SYSTEM_PROMPT = [
  "You are an assessment question writer for a workplace skill-assessment platform.",
  "Your job is to write a single scenario-based, free-response question that",
  "implicitly tests every skill the assessor cares about. Constraints:",
  "",
  "  - Output exactly one question, not multiple.",
  "  - The question must be a realistic workplace scenario for the given role,",
  "    not a textbook prompt.",
  "  - Cover every skill the user lists, but never name a skill verbatim and",
  "    never tell the candidate which skills they will be evaluated on.",
  "  - Demand a written response that requires reasoning, not a checklist.",
  "  - Aim for 80–220 words. Long enough to give context, short enough to read",
  "    in under a minute.",
  "  - Use plain prose. No bullet lists, no markdown headings, no preamble like",
  "    'Here is a question:'. Just the scenario and the ask.",
].join("\n");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const [outcome] = await sql`
    select
      o.id,
      f.name as function_name,
      r.name as role_name,
      s.name as subject_name,
      o.description as outcome_description
    from outcomes o
    join subjects s on s.id = o.subject_id
    join roles r on r.id = s.role_id
    join functions f on f.id = r.function_id
    join outcome_skills os on os.outcome_id = o.id
    group by o.id, f.name, r.name, s.name, o.description
    order by o.id
    limit 1
  `;

  if (!outcome) {
    throw new Error("No outcome with mapped skills found for smoke test.");
  }

  const skills = await sql`
    select sk.name
    from outcome_skills os
    join skills sk on sk.id = os.skill_id
    where os.outcome_id = ${outcome.id}
    order by sk.name
  `;

  const userPrompt = [
    "Context:",
    `Function: ${outcome.function_name}`,
    `Role: ${outcome.role_name}`,
    `Subject: ${outcome.subject_name}`,
    `Outcome: ${outcome.outcome_description}`,
    "",
    "Skills the question must implicitly cover (do NOT name them in the question):",
    ...skills.map((skill) => `  - ${skill.name}`),
    "",
    "Write the question now and return it as JSON matching the required schema.",
  ].join("\n");

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    max_tokens: 1024,
    messages: [
      { role: "system", content: QUESTION_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "question_payload",
        description:
          "The single scenario-based question to present to the candidate.",
        schema: QUESTION_SCHEMA,
        strict: true,
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned no content.");
  }

  const parsed = JSON.parse(content);

  console.log(
    JSON.stringify(
      {
        ok: true,
        model: response.model,
        outcomeId: outcome.id,
        skillCount: skills.length,
        questionLength: parsed.question.length,
        preview: parsed.question.slice(0, 280),
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} finally {
  await sql.end();
}
