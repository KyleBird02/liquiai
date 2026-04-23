import express, { Router, Request, Response } from "express";
import { sessionManager } from "../services/session";
import { githubService } from "../services/github";
import { LLMFactory } from "../services/llm";
import { formatWarningsForPR } from "../services/warnings";
import { liquibaseGenerator } from "../services/liquibase";
import {
  ChangesetBatch,
  ChangesetDefinition,
  GitHubFileChange,
} from "../types/index";

const router = Router();

const stripBoldMarkdown = (input: string): string => {
  return input.replace(/\*\*(.*?)\*\*/g, "$1").replace(/__(.*?)__/g, "$1");
};

const detectChangesetTarget = (cs: ChangesetDefinition): string => {
  const payload: any = cs.change.payload || {};

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
};

const buildAutoPrTitle = (
  application: string,
  changesets: ChangesetDefinition[],
): string => {
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
};

const buildChangesetDigest = (changesets: ChangesetDefinition[]): string => {
  return changesets
    .map((cs) => {
      const sqlFiles =
        cs.sqlFiles
          ?.map((f) => `${f.path}:${(f.content || "").length}`)
          .join("|") || "";
      return [
        cs.id,
        cs.change.type,
        cs.xmlContent.length,
        cs.sqlFilePath || "",
        (cs.sqlFileContent || "").length,
        sqlFiles,
      ].join("::");
    })
    .join("###");
};

const buildChangesetContext = (changesets: ChangesetDefinition[]): string => {
  return changesets
    .map((cs, index) => {
      const sqlSections: string[] = [];

      if (cs.sqlFiles && cs.sqlFiles.length > 0) {
        cs.sqlFiles.forEach((f, fileIndex) => {
          sqlSections.push(
            `SQL File ${fileIndex + 1} Path: ${f.path}\nSQL File ${fileIndex + 1} Content:\n${f.content}`,
          );
        });
      } else if (cs.sqlFilePath || cs.sqlFileContent) {
        sqlSections.push(
          `SQL File Path: ${cs.sqlFilePath || "n/a"}\nSQL File Content:\n${cs.sqlFileContent || ""}`,
        );
      }

      return [
        `Changeset ${index + 1}`,
        `ID: ${cs.id}`,
        `Type: ${cs.change.type}`,
        `Application: ${cs.targetApplication}`,
        `Sprint: ${cs.targetSprint}`,
        `XML:\n${cs.xmlContent}`,
        sqlSections.join("\n\n"),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n-----\n\n");
};

const generateReviewerAppendix = async (
  changesets: ChangesetDefinition[],
): Promise<string> => {
  const provider = LLMFactory.getProvider();
  const applications = Array.from(
    new Set(changesets.map((cs) => cs.targetApplication).filter(Boolean)),
  );
  const sprints = Array.from(
    new Set(changesets.map((cs) => cs.targetSprint).filter(Boolean)),
  );

  const systemPrompt = `You are generating a reviewer-focused PR appendix for Liquibase migrations.

You MUST parse combined changesets correctly. A single <changeSet> can include multiple <createTable>, alter operations, and a <sqlFile>. Include all affected tables and data changes.

Return markdown only with this exact section order:
## Migration Scope
## Tables Changed
## Table Schemas
## Relationships
## Data Changes
## Changeset Mapping

Rules:
- Keep it concise and accurate.
- Use markdown tables where useful.
- Include schema-qualified table names when clear; otherwise use public.<table>.
- In Data Changes, include target table(s), statement counts, and estimated rows if inferable.
- If detail is unknown, explicitly write "unknown" instead of omitting.
- Do not include code fences.
- Do not include any section outside the six required sections.`;

  const userPrompt = [
    `Application(s): ${applications.join(", ") || "unknown"}`,
    `Sprint folder(s): ${sprints.join(", ") || "unknown"}`,
    `Total changesets: ${changesets.length}`,
    "",
    "Changeset source data:",
    buildChangesetContext(changesets),
  ].join("\n");

  const response = await provider.generateCompletion([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  return response
    .replace(/^```[a-zA-Z]*\n/, "")
    .replace(/```$/, "")
    .trim();
};

const getOrGenerateReviewerAppendix = async (
  changesets: ChangesetDefinition[],
): Promise<string> => {
  const digest = buildChangesetDigest(changesets);
  const session = sessionManager.getSession();
  const cached = session.prReviewerAppendix;

  if (cached && cached.digest === digest && cached.markdown) {
    return cached.markdown;
  }

  let markdown = "";
  try {
    markdown = await generateReviewerAppendix(changesets);
  } catch {
    const scopeTargets = Array.from(
      new Set(changesets.map((cs) => detectChangesetTarget(cs))),
    );
    markdown = [
      "## Migration Scope",
      `- Total changesets: ${changesets.length}`,
      `- Tables impacted: ${scopeTargets.filter((t) => t !== "various").length || "unknown"}`,
      "",
      "## Tables Changed",
      scopeTargets.map((t) => `- ${t}`).join("\n") || "- unknown",
      "",
      "## Table Schemas",
      "- Derived from changeset XML in this batch.",
      "",
      "## Relationships",
      "- See changeset XML for foreign key operations.",
      "",
      "## Data Changes",
      "- See SQL file entries in changeset mapping.",
      "",
      "## Changeset Mapping",
      ...changesets.map((cs) => `- ${cs.id}: ${cs.change.type}`),
    ].join("\n");
  }

  session.prReviewerAppendix = { digest, markdown };
  return markdown;
};

/**
 * GET /api/github/applications
 * Returns a list of Root directories representing applications
 */
router.get("/applications", async (req: Request, res: Response) => {
  try {
    const apps = await githubService.getApplications();
    return res.json({ success: true, applications: apps });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/github/sprints
 * Returns a list of subdirectories representing sprints for an application
 */
router.get("/sprints", async (req: Request, res: Response) => {
  try {
    const application = req.query.application as string;
    if (!application) {
      return res.status(400).json({ error: "application is required" });
    }
    const sprints = await githubService.getSprints(application);
    return res.json({ success: true, sprints });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/github/preview
 * Preview all files that would be committed (changeset.xml + SQL files)
 * Before user confirms PR creation
 */
router.get("/preview", async (req: Request, res: Response) => {
  try {
    const session = sessionManager.getSession();

    if (
      !session.author ||
      !session.targetApplication ||
      !session.targetSprint
    ) {
      return res.status(400).json({
        error: "Session must be initialized",
      });
    }

    if (session.changesets.length === 0) {
      return res.status(400).json({
        error: "No changesets generated yet",
      });
    }

    const newChangesetXmls = session.changesets.map((cs) => cs.xmlContent);

    // Combine new changesets into a preview snippet
    const newChangesetPreview = newChangesetXmls.join("\n\n");

    // Prepare file changes
    const files: GitHubFileChange[] = [
      {
        path: `${session.targetApplication}/changeset.xml`,
        newContent: newChangesetPreview,
        content: newChangesetPreview,
        fileType: "changeset-xml",
        message: `Update changeset.xml - Add ${session.changesets.length} new changesets`,
      },
    ];

    // Add SQL files if any
    for (const changeset of session.changesets) {
      const sqlFiles =
        changeset.sqlFiles && changeset.sqlFiles.length > 0
          ? changeset.sqlFiles
          : changeset.changeType === "sql" &&
              changeset.sqlFilePath &&
              changeset.sqlFileContent
            ? [
                {
                  path: changeset.sqlFilePath,
                  content: changeset.sqlFileContent,
                },
              ]
            : [];

      sqlFiles.forEach((sqlFile, fileIndex) => {
        files.push({
          path: sqlFile.path,
          content: sqlFile.content,
          fileType: "sql-file",
          message:
            sqlFiles.length > 1
              ? `Add migration: ${changeset.id} (${fileIndex + 1}/${sqlFiles.length})`
              : `Add migration: ${changeset.id}`,
        });
      });
    }

    return res.json({
      success: true,
      files,
      summary: {
        totalFiles: files.length,
        changesetCount: session.changesets.length,
        applicationPath: session.targetApplication,
        sprintFolder: session.targetSprint,
      },
    });
  } catch (error: any) {
    console.error("Preview error:", error);
    return res.status(500).json({
      error: error.message || "Failed to generate preview",
    });
  }
});

/**
 * GET /api/github/generate-pr-text
 * Generate simple PR title and description using LLM
 */
router.get("/generate-pr-text", async (req: Request, res: Response) => {
  try {
    const session = sessionManager.getSession();

    if (session.changesets.length === 0) {
      return res.status(400).json({ error: "No changesets available" });
    }

    const title = buildAutoPrTitle(
      session.targetApplication || "application",
      session.changesets,
    );
    const description = [
      `Migration for ${session.targetApplication}/${session.targetSprint}.`,
      "",
      "Summary:",
      "- Schema and data changes have been prepared via Liquibase changesets.",
      "- Full reviewer appendix is auto-attached to the final PR description.",
    ].join("\n");

    return res.json({ title, description });
  } catch (error: any) {
    console.error("Generate PR text error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate PR text" });
  }
});

router.post("/prepare-pr-appendix", async (req: Request, res: Response) => {
  try {
    const session = sessionManager.getSession();

    if (session.changesets.length === 0) {
      return res.status(400).json({ error: "No changesets available" });
    }

    const markdown = await getOrGenerateReviewerAppendix(session.changesets);

    return res.json({
      success: true,
      prepared: true,
      length: markdown.length,
    });
  } catch (error: any) {
    console.error("Prepare PR appendix error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to prepare PR appendix" });
  }
});

/**
 * POST /api/github/create-pr
 * Create a PR in the Liquibase repository with all changesets
 */
router.post("/create-pr", async (req: Request, res: Response) => {
  try {
    const { prTitle, prDescription } = req.body;
    const session = sessionManager.getSession();

    if (
      !session.author ||
      !session.targetApplication ||
      !session.targetSprint
    ) {
      return res.status(400).json({
        error: "Session must be initialized",
      });
    }

    if (session.changesets.length === 0) {
      return res.status(400).json({
        error: "No changesets to commit",
      });
    }

    if (!prTitle || !prDescription) {
      return res.status(400).json({
        error: "prTitle and prDescription are required",
      });
    }

    if (!session.executionResult?.prUnlocked) {
      return res.status(403).json({
        error:
          "PR creation is locked until local sync, validate, and execution succeed",
      });
    }

    // Fetch current changeset.xml from GitHub
    const branch = session.branchName || `OCDEV-${session.author}`;

    const currentChangesetXml = await githubService.fetchChangesetXml(
      session.targetApplication,
    );

    const newChangesetsXmlBlocks = session.changesets.map(
      (cs) => cs.xmlContent,
    );

    const appendedChangesetXml = liquibaseGenerator.appendToChangesetXml(
      currentChangesetXml,
      newChangesetsXmlBlocks,
    );

    // Prepare all file changes
    const files: GitHubFileChange[] = [
      {
        path: `${session.targetApplication}/changeset.xml`,
        message: `Update changeset.xml - Add ${session.changesets.length} new changesets`,
        content: appendedChangesetXml,
      },
    ];

    // Add SQL files
    for (const changeset of session.changesets) {
      const sqlFiles =
        changeset.sqlFiles && changeset.sqlFiles.length > 0
          ? changeset.sqlFiles
          : changeset.changeType === "sql" &&
              changeset.sqlFilePath &&
              changeset.sqlFileContent
            ? [
                {
                  path: changeset.sqlFilePath,
                  content: changeset.sqlFileContent,
                },
              ]
            : [];

      sqlFiles.forEach((sqlFile, fileIndex) => {
        files.push({
          path: sqlFile.path,
          message:
            sqlFiles.length > 1
              ? `Add SQL migration: ${changeset.id} (${fileIndex + 1}/${sqlFiles.length})`
              : `Add SQL migration: ${changeset.id}`,
          content: sqlFile.content,
        });
      });
    }

    // Create PR via GitHub API
    // Append warnings section to description
    const warningsSection = formatWarningsForPR(session.changesets);
    const reviewerAppendix = await getOrGenerateReviewerAppendix(
      session.changesets,
    );
    const sanitizedApprovedDescription = stripBoldMarkdown(
      String(prDescription || ""),
    );
    const finalDescription = [
      sanitizedApprovedDescription,
      reviewerAppendix,
      warningsSection,
    ]
      .filter((section) => section && section.trim().length > 0)
      .join("\n\n---\n\n");

    const pr = await githubService.createPullRequest({
      branch,
      title: prTitle,
      description: finalDescription,
      files,
    });

    // Store batch metadata for reference
    const batch: ChangesetBatch = {
      changesets: session.changesets,
      aggregated:
        session.changesets.length === 1 && session.proposedChanges.length > 1,
      author: session.author,
      targetApplication: session.targetApplication,
      targetSprint: session.targetSprint,
      prTitle,
      prDescription: finalDescription,
    };
    sessionManager.setBatch(batch);

    sessionManager.setChangesets([]);
    sessionManager.setProposedChanges([]);

    return res.json({
      success: true,
      pr,
      message: `PR created successfully at ${pr.prUrl}`,
    });
  } catch (error: any) {
    console.error("Create PR error:", error);
    return res.status(500).json({
      error: error.message || "Failed to create PR",
    });
  }
});

/**
 * GET /api/github/rate-limit
 * Check GitHub API rate limit status
 */
router.get("/rate-limit", async (req: Request, res: Response) => {
  try {
    const rateLimit = await githubService.getRateLimit();
    return res.json({
      rateLimit,
      warning: rateLimit.remaining < 10 ? "Low on API calls" : null,
    });
  } catch (error: any) {
    console.error("Rate limit check error:", error);
    return res.status(500).json({
      error: error.message || "Failed to check rate limit",
    });
  }
});

export default router;
