import { ChangesetDefinition, ChangeReview } from "../types/index";

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
