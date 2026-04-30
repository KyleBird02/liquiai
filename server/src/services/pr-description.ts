import { ChangesetDefinition, ChangeReview } from "../types/index";

/**
 * Build a full text context from changesets including XML and SQL sidecar contents.
 * This ensures the LLM receives the actual SQL/DDL and seed rows when generating PR text.
 */
function buildChangesetFullContext(changesets: ChangesetDefinition[]): string {
  return changesets
    .map((cs, index) => {
      const parts: string[] = [];
      parts.push(`Changeset ${index + 1}`);
      parts.push(`ID: ${cs.id}`);
      parts.push(`Type: ${cs.change.type}`);
      parts.push(`Target Application: ${cs.targetApplication}`);
      parts.push(`Target Sprint: ${cs.targetSprint}`);
      parts.push(`XML Content:\n${cs.xmlContent}`);

      if (cs.sqlFiles && cs.sqlFiles.length > 0) {
        cs.sqlFiles.forEach((f, fi) => {
          parts.push(`SQL File ${fi + 1} Path: ${f.path}`);
          parts.push(`SQL File ${fi + 1} Content:\n${f.content}`);
        });
      } else if (cs.sqlFilePath || cs.sqlFileContent) {
        parts.push(
          `SQL File Path: ${cs.sqlFilePath || "n/a"}\nSQL File Content:\n${cs.sqlFileContent || ""}`,
        );
      }

      return parts.join("\n");
    })
    .join("\n\n-----\n\n");
}

/**
 * Detect the primary table/object affected by a changeset
 */
export function detectChangesetTarget(cs: ChangesetDefinition): string {
  const payload: any = cs.change?.payload || {};

  if (payload.tableName) {
    return `${payload.schema || "public"}.${payload.tableName}`;
  }

  const xmlMatch = cs.xmlContent.match(
    /<(?:createTable|addColumn|dropTable|dropColumn|createIndex|dropIndex)\s+[^>]*tableName="([^"]+)"/i,
  );
  if (xmlMatch?.[1]) {
    return `public.${xmlMatch[1]}`;
  }

  return "various";
}

/**
 * Build an intelligent PR title based on affected tables
 */
export function buildAutoPrTitle(
  application: string,
  changesets: ChangesetDefinition[],
): string {
  const targets = Array.from(
    new Set(
      changesets
        .map((cs) => detectChangesetTarget(cs))
        .filter((t) => t !== "various"),
    ),
  );

  if (targets.length === 0) {
    return `Database migration for ${application}`;
  }

  if (targets.length === 1) {
    return `Database migration: update ${targets[0]}`;
  }

  const primary = targets.slice(0, 2).join(", ");
  const remaining = targets.length - 2;
  return remaining > 0
    ? `Database migration: update ${primary} + ${remaining} more`
    : `Database migration: update ${primary}`;
}

/**
 * Build a markdown table/list of all changesets with their details
 */
export function buildChangesetMapping(changesets: ChangesetDefinition[]): string {
  if (changesets.length === 0) {
    return "No changesets.";
  }

  const lines: string[] = [];

  changesets.forEach((cs) => {
    const target = detectChangesetTarget(cs);
    const operationType = cs.change?.type || "UNKNOWN";
    const sqlFiles =
      cs.sqlFiles && cs.sqlFiles.length > 0
        ? `; SQL files: ${cs.sqlFiles.map((f: any) => f.path).join(", ")}`
        : "";

    lines.push(
      `- **${cs.id}** (${operationType}): ${target}${sqlFiles}`,
    );

    // Add details for seed data if present
    const payload: any = cs.change?.payload || {};
    if (
      payload.seedData &&
      Array.isArray(payload.seedData) &&
      payload.seedData.length > 0
    ) {
      lines.push(
        `  - Seed data: ${payload.seedData.length} row(s)`,
      );
    }

    // Add column details for CREATE_TABLE
    if (
      operationType === "CREATE_TABLE" &&
      payload.columns &&
      Array.isArray(payload.columns)
    ) {
      const cols = payload.columns
        .map(
          (col: any) =>
            `${col.name} ${col.type}${col.isPrimaryKey ? " PK" : ""}${!col.nullable ? " NOT NULL" : ""}`,
        )
        .slice(0, 3); // Show first 3 columns
      const more =
        payload.columns.length > 3
          ? ` + ${payload.columns.length - 3} more`
          : "";
      lines.push(`  - Columns: ${cols.join(", ")}${more}`);
    }
  });

  return lines.join("\n");
}

/**
 * Format changeset review warnings as markdown
 */
export function formatChangesetWarnings(
  changesets: ChangesetDefinition[],
): string {
  const allReviews: ChangeReview[] = [];

  for (const changeset of changesets) {
    if (changeset.reviews && Array.isArray(changeset.reviews)) {
      allReviews.push(...changeset.reviews);
    }
  }

  // Deduplicate by message
  const uniqueReviews = Array.from(
    new Map(
      allReviews.map((review) => [review.message, review]),
    ).values(),
  );

  if (uniqueReviews.length === 0) {
    return "";
  }

  // Organize by severity
  const highSeverity = uniqueReviews.filter((r) => r.severity === "high");
  const mediumSeverity = uniqueReviews.filter((r) => r.severity === "medium");
  const lowSeverity = uniqueReviews.filter((r) => r.severity === "low");

  const lines: string[] = [
    `## Automated Review - LLM Analysis`,
    ``,
    `⚠️ **${uniqueReviews.length} warning(s) detected** during AI review.`,
    ``,
  ];

  if (highSeverity.length > 0) {
    lines.push(`### 🔴 High Severity`);
    lines.push(``);
    for (const warning of highSeverity) {
      lines.push(`- **${warning.message}**`);
    }
    lines.push("");
  }

  if (mediumSeverity.length > 0) {
    lines.push(`### 🟡 Medium Severity`);
    lines.push(``);
    for (const warning of mediumSeverity) {
      lines.push(`- ${warning.message}`);
    }
    lines.push("");
  }

  if (lowSeverity.length > 0) {
    lines.push(`### 🔵 Low Severity`);
    lines.push(``);
    for (const warning of lowSeverity) {
      lines.push(`- ${warning.message}`);
    }
    lines.push("");
  }

  lines.push(
    `> This automated review was performed by the Liquibase Migration Tool AI analyzer.`,
  );

  return lines.join("\n");
}

/**
 * Build a detailed PR description with changeset details
 */
export function buildPRDescription(
  application: string,
  sprint: string,
  changesets: ChangesetDefinition[],
  author: string,
): string {
  const summary = [
    `## Migration Summary`,
    ``,
    `**Application:** ${application}  `,
    `**Sprint:** ${sprint}  `,
    `**Author:** ${author}  `,
    `**Changesets:** ${changesets.length}`,
    ``,
  ].join("\n");

  const changesetMapping = buildChangesetMapping(changesets);

  const details = [
    `## Changeset Details`,
    ``,
    changesetMapping,
    ``,
  ].join("\n");

  const warnings = formatChangesetWarnings(changesets);

  const sections = [summary, details, warnings]
    .filter((section) => section && section.trim().length > 0)
    .join("\n---\n\n");

  return sections;
}

/**
 * Use LLM to generate a concise PR title and 1-2 line description.
 * Returns { title, description }.
 */
export async function generatePrText(
  changesets: ChangesetDefinition[],
  application: string,
  sprint: string,
): Promise<{ title: string; description: string }> {
  const { LLMFactory } = await import("./llm");
  const provider = LLMFactory.getProvider();

  const systemPrompt = `You are a concise commit/PR title and short description generator for database migrations.

Rules:
- Return ONLY valid JSON with shape {"title":"...","description":"..."}.
- Title: one short sentence in imperative past tense (e.g. "Add settlement_date to Users table").
- Description: 1-2 short sentences (brief summary). Use additional lines only if there are multiple complex changes (more than 1 changeset or EXECUTE_SQL present).
- Do not include reviewer appendix, warnings, or file lists in the description; those are appended later.`;

  const payload = [
    `Application: ${application}`,
    `Sprint: ${sprint}`,
    `Total changesets: ${changesets.length}`,
    "Changeset context:",
    buildChangesetFullContext(changesets),
  ].join("\n");

  const messages: any = [
    { role: "system", content: systemPrompt },
    { role: "user", content: payload },
  ];

  try {
    const response = await provider.generateCompletion(messages, {
      temperature: 0.2,
      maxTokens: 200,
    });

    const text = response.replace(/^```[a-zA-Z]*\n/, "").replace(/```$/, "").trim();
    // Try to parse JSON out of the response
    const jsonStart = text.indexOf("{");
    const jsonStr = jsonStart >= 0 ? text.slice(jsonStart) : text;
    const parsed = JSON.parse(jsonStr);
    const title = String(parsed.title || parsed.prTitle || parsed.name || "Database migration").trim();
    let description = String(parsed.description || parsed.prDescription || "").trim();

    // Fallback heuristics
    if (!description) {
      description = changesets.length === 1
        ? `Apply changeset ${changesets[0].id}`
        : `Apply ${changesets.length} Liquibase changesets`;
    }

    // Keep description short: truncate to two sentences if needed
    const sentences = description.split(/(?<=[.?!])\s+/).slice(0, 2).join(" ");
    return { title, description: sentences };
  } catch (e) {
    // Graceful fallback
    const fallbackTitle = buildAutoPrTitle(application, changesets as any);
    const fallbackDescription = changesets.length === 1
      ? `Apply changeset ${changesets[0].id}`
      : `Apply ${changesets.length} Liquibase changesets`;
    return { title: fallbackTitle, description: fallbackDescription };
  }
}

/**
 * Generate both reviewer appendix (markdown) and concise PR text in a single LLM request.
 * Returns { appendix: string, prText: { title, description } }
 */
export async function generateAppendixAndPrText(
  changesets: ChangesetDefinition[],
  application: string,
  sprint: string,
): Promise<{ appendix: string; prText: { title: string; description: string } }> {
  const { LLMFactory } = await import("./llm");
  const provider = LLMFactory.getProvider();

  const systemPrompt = `You are a senior PostgreSQL/Liquibase migration reviewer and concise PR author.

Return ONLY valid JSON with shape:
{
  "appendix": "<markdown string for reviewer appendix (see rules)>",
  "prText": { "title": "...", "description": "..." }
}

Rules for appendix (markdown):
- Include sections in this exact order: ## Migration Scope, ## Tables Changed, ## Table Schemas, ## Relationships, ## Data Changes, ## Changeset Mapping
- Use markdown tables where useful. Do not include code fences.
- Be concise and accurate.

Rules for prText:
- Title: one short sentence in imperative past tense (e.g. \"Add settlement_date to Users table\").
- Description: 1-2 short sentences. Use multiple sentences only if multiple complex changes exist.

If any detail is unknown, use the word "unknown" explicitly.`;

  const payload = [
    `Application: ${application}`,
    `Sprint: ${sprint}`,
    `Total changesets: ${changesets.length}`,
    "Changeset context:",
    buildChangesetFullContext(changesets),
  ].join("\n");

  const messages: any = [
    { role: "system", content: systemPrompt },
    { role: "user", content: payload },
  ];

  try {
    const response = await provider.generateCompletion(messages, {
      temperature: 0.2,
      maxTokens: 1400,
      enableReasoning: false,
    });

    const text = response.replace(/^```[a-zA-Z]*\n/, "").replace(/```$/, "").trim();
    const jsonStart = text.indexOf("{");
    const jsonStr = jsonStart >= 0 ? text.slice(jsonStart) : text;
    const parsed = JSON.parse(jsonStr);

    const appendix = String(parsed.appendix || parsed.markdown || "").trim();
    const pr = parsed.prText || parsed.pr || {};
    const title = String(pr.title || pr.prTitle || "Database migration").trim();
    let description = String(pr.description || pr.prDescription || "").trim();

    if (!description) {
      description = changesets.length === 1
        ? `Apply changeset ${changesets[0].id}`
        : `Apply ${changesets.length} Liquibase changesets`;
    }

    // Truncate to two sentences
    const sentences = description.split(/(?<=[.?!])\s+/).slice(0, 2).join(" ");

    return { appendix, prText: { title, description: sentences } };
  } catch (e) {
    // Fallback: build appendix and prText deterministically
    const appendix = buildChangesetMapping(changesets);
    const prFallback = await generatePrText(changesets, application, sprint);
    return { appendix, prText: prFallback };
  }
}
