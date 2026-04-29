import { readFile } from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

const TAXONOMY_DOC_PATH = path.resolve(
  process.cwd(),
  "../docs/skill_assessment_taxonomy.md",
);

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
  );
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  ssl: process.env.NODE_ENV === "production" ? "require" : "prefer",
  prepare: false,
});

function getSection(markdown, heading, nextHeading) {
  const start = markdown.indexOf(heading);
  const end = markdown.indexOf(nextHeading, start);

  if (start === -1 || end === -1) {
    throw new Error(
      `Could not locate section between "${heading}" and "${nextHeading}".`,
    );
  }

  return markdown.slice(start + heading.length, end).trim();
}

function parseGroupedBullets(section) {
  const groups = new Map();
  let currentHeading = null;

  for (const rawLine of section.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (line.startsWith("### ")) {
      currentHeading = line.slice(4).trim();
      groups.set(currentHeading, []);
      continue;
    }

    if (line.startsWith("- ")) {
      if (!currentHeading) {
        throw new Error(`Found bullet before subsection heading: "${line}"`);
      }

      groups.get(currentHeading).push(line.slice(2).trim());
    }
  }

  return groups;
}

function parseSimpleBullets(section) {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

function parseOutcomeSkills(section) {
  const mapping = new Map();

  for (const rawLine of section.split("\n")) {
    const line = rawLine.trim();

    if (!line.startsWith("- ")) {
      continue;
    }

    const entry = line.slice(2).trim();
    const [outcome, skillsList] = entry.split(" → ");

    if (!outcome || !skillsList) {
      throw new Error(`Invalid outcome-to-skills mapping: "${line}"`);
    }

    mapping.set(
      outcome.trim(),
      skillsList
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean),
    );
  }

  return mapping;
}

function parseTaxonomy(markdown) {
  const functionsRolesSection = getSection(
    markdown,
    "## 1. Functions → Roles",
    "## 2. Roles → Subjects",
  );
  const rolesSubjectsSection = getSection(
    markdown,
    "## 2. Roles → Subjects",
    "## 3. Subjects →  Outcomes",
  );
  const subjectsOutcomesSection = getSection(
    markdown,
    "## 3. Subjects →  Outcomes",
    "## 4. Unique Skills",
  );
  const uniqueSkillsSection = getSection(
    markdown,
    "## 4. Unique Skills",
    "## 5. Outcome → Skills Mapping",
  );
  const mappingsStart = markdown.indexOf("## 5. Outcome → Skills Mapping");

  if (mappingsStart === -1) {
    throw new Error(
      'Could not locate section "## 5. Outcome → Skills Mapping".',
    );
  }

  return {
    functionRoles: parseGroupedBullets(functionsRolesSection),
    roleSubjects: parseGroupedBullets(rolesSubjectsSection),
    subjectOutcomes: parseGroupedBullets(subjectsOutcomesSection),
    uniqueSkills: parseSimpleBullets(uniqueSkillsSection),
    outcomeSkills: parseOutcomeSkills(markdown.slice(mappingsStart)),
  };
}

async function upsertFunction(name) {
  const [row] = await sql`
    insert into functions (name)
    values (${name})
    on conflict (name) do update set name = excluded.name
    returning id
  `;

  return row.id;
}

async function upsertRole(functionId, name) {
  const [row] = await sql`
    insert into roles (function_id, name)
    values (${functionId}, ${name})
    on conflict (function_id, name) do update set name = excluded.name
    returning id
  `;

  return row.id;
}

async function upsertSubject(roleId, name) {
  const [row] = await sql`
    insert into subjects (role_id, name)
    values (${roleId}, ${name})
    on conflict (role_id, name) do update set name = excluded.name
    returning id
  `;

  return row.id;
}

async function upsertOutcome(subjectId, description) {
  const [row] = await sql`
    insert into outcomes (subject_id, description)
    values (${subjectId}, ${description})
    on conflict (subject_id, description) do update set description = excluded.description
    returning id
  `;

  return row.id;
}

async function upsertSkill(name) {
  const [row] = await sql`
    insert into skills (name)
    values (${name})
    on conflict (name) do update set name = excluded.name
    returning id
  `;

  return row.id;
}

async function main() {
  const markdown = await readFile(TAXONOMY_DOC_PATH, "utf8");
  const taxonomy = parseTaxonomy(markdown);

  const roleIds = new Map();
  const subjectIds = new Map();
  const outcomeIds = new Map();
  const skillIds = new Map();

  for (const skillName of taxonomy.uniqueSkills) {
    skillIds.set(skillName, await upsertSkill(skillName));
  }

  for (const [functionName, roleNames] of taxonomy.functionRoles) {
    const functionId = await upsertFunction(functionName);

    for (const roleName of roleNames) {
      roleIds.set(roleName, await upsertRole(functionId, roleName));
    }
  }

  for (const [roleName, subjectNames] of taxonomy.roleSubjects) {
    const roleId = roleIds.get(roleName);

    if (!roleId) {
      throw new Error(`Missing role for subjects section: ${roleName}`);
    }

    for (const subjectName of subjectNames) {
      subjectIds.set(subjectName, await upsertSubject(roleId, subjectName));
    }
  }

  for (const [subjectName, outcomeDescriptions] of taxonomy.subjectOutcomes) {
    const subjectId = subjectIds.get(subjectName);

    if (!subjectId) {
      throw new Error(`Missing subject for outcomes section: ${subjectName}`);
    }

    for (const description of outcomeDescriptions) {
      outcomeIds.set(description, await upsertOutcome(subjectId, description));
    }
  }

  for (const [outcomeDescription, mappedSkills] of taxonomy.outcomeSkills) {
    const outcomeId = outcomeIds.get(outcomeDescription);

    if (!outcomeId) {
      throw new Error(
        `Missing outcome for mapping section: ${outcomeDescription}`,
      );
    }

    for (const skillName of mappedSkills) {
      const skillId = skillIds.get(skillName);

      if (!skillId) {
        throw new Error(`Missing skill for mapping section: ${skillName}`);
      }

      await sql`
        insert into outcome_skills (outcome_id, skill_id)
        values (${outcomeId}, ${skillId})
        on conflict (outcome_id, skill_id) do nothing
      `;
    }
  }

  console.log(
    `Seeded taxonomy: ${taxonomy.functionRoles.size} functions, ${roleIds.size} roles, ${subjectIds.size} subjects, ${outcomeIds.size} outcomes, ${skillIds.size} skills.`,
  );
}

try {
  await main();
} catch (error) {
  console.error("Failed to seed taxonomy.", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
