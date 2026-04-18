import { ChangeReview } from "../types/index";

/**
 * Format warnings from changesets as a markdown section for the PR description
 */
export function formatWarningsForPR(changesets: any[]): string {
  // Collect all reviews from all changesets
  const allReviews: ChangeReview[] = [];

  for (const changeset of changesets) {
    if (changeset.reviews && Array.isArray(changeset.reviews)) {
      allReviews.push(...changeset.reviews);
    }
  }

  // Deduplicate by message
  const uniqueReviews = Array.from(
    new Map(allReviews.map((review) => [review.message, review])).values(),
  );

  if (uniqueReviews.length === 0) {
    return "";
  }

  // Organize by severity
  const highSeverity = uniqueReviews.filter((r) => r.severity === "high");
  const mediumSeverity = uniqueReviews.filter((r) => r.severity === "medium");
  const lowSeverity = uniqueReviews.filter((r) => r.severity === "low");

  const lines: string[] = [
    "\n---",
    "\n## Automated Review - LLM Analysis\n",
    `⚠️ **${uniqueReviews.length} warning(s) detected** during AI review.\n`,
  ];

  if (highSeverity.length > 0) {
    lines.push("### 🔴 High Severity\n");
    for (const warning of highSeverity) {
      lines.push(`- **${warning.message}**`);
    }
    lines.push("");
  }

  if (mediumSeverity.length > 0) {
    lines.push("### 🟡 Medium Severity\n");
    for (const warning of mediumSeverity) {
      lines.push(`- ${warning.message}`);
    }
    lines.push("");
  }

  if (lowSeverity.length > 0) {
    lines.push("### 🔵 Low Severity\n");
    for (const warning of lowSeverity) {
      lines.push(`- ${warning.message}`);
    }
    lines.push("");
  }

  lines.push(
    "> This automated review was performed by the Liquibase Migration Tool AI analyzer.",
  );

  return lines.join("\n");
}
