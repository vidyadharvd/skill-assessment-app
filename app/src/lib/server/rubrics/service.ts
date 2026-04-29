import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/server/db/client";
import { skillRubrics } from "@/lib/server/db/schema";

import {
  generateRubric,
  SkillRubricSchema,
  type GenerateRubricInput,
  type SkillRubric,
} from "./generate";

export type RubricRecord = {
  id: number;
  skillId: number;
  version: number;
  createdAt: Date;
  rubric: SkillRubric;
};

export type GetOrCreateRubricInput = GenerateRubricInput & {
  skillId: number;
};

const inFlightRubrics = new Map<number, Promise<RubricRecord>>();

export async function getOrCreateRubric(
  input: GetOrCreateRubricInput,
): Promise<RubricRecord> {
  const cached = await getLatestRubricBySkillId(input.skillId);
  if (cached) {
    return cached;
  }

  const existingInFlight = inFlightRubrics.get(input.skillId);
  if (existingInFlight) {
    return existingInFlight;
  }

  const pending = createAndPersistRubric(input).finally(() => {
    inFlightRubrics.delete(input.skillId);
  });

  inFlightRubrics.set(input.skillId, pending);
  return pending;
}

async function createAndPersistRubric(
  input: GetOrCreateRubricInput,
): Promise<RubricRecord> {
  const cached = await getLatestRubricBySkillId(input.skillId);
  if (cached) {
    return cached;
  }

  const rubric = await generateRubric(input);

  const [inserted] = await db
    .insert(skillRubrics)
    .values({
      skillId: input.skillId,
      version: 1,
      rubricJson: rubric,
    })
    .onConflictDoNothing()
    .returning({
      id: skillRubrics.id,
      skillId: skillRubrics.skillId,
      version: skillRubrics.version,
      createdAt: skillRubrics.createdAt,
      rubricJson: skillRubrics.rubricJson,
    });

  if (inserted) {
    return mapRubricRow(inserted);
  }

  const persisted = await getLatestRubricBySkillId(input.skillId);
  if (persisted) {
    return persisted;
  }

  throw new Error(
    `Failed to persist rubric for skill ${input.skillId} after generation.`,
  );
}

async function getLatestRubricBySkillId(
  skillId: number,
): Promise<RubricRecord | null> {
  const [row] = await db
    .select({
      id: skillRubrics.id,
      skillId: skillRubrics.skillId,
      version: skillRubrics.version,
      createdAt: skillRubrics.createdAt,
      rubricJson: skillRubrics.rubricJson,
    })
    .from(skillRubrics)
    .where(eq(skillRubrics.skillId, skillId))
    .orderBy(desc(skillRubrics.version))
    .limit(1);

  return row ? mapRubricRow(row) : null;
}

function mapRubricRow(row: {
  id: number;
  skillId: number;
  version: number;
  createdAt: Date;
  rubricJson: unknown;
}): RubricRecord {
  return {
    id: row.id,
    skillId: row.skillId,
    version: row.version,
    createdAt: row.createdAt,
    rubric: SkillRubricSchema.parse(row.rubricJson),
  };
}
