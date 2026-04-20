import express, { Router, Request, Response } from "express";
import { sessionManager } from "../services/session";
import { githubService } from "../services/github";
import { LLMFactory } from "../services/llm";
import { formatWarningsForPR } from "../services/warnings";
import { liquibaseGenerator } from "../services/liquibase";
import { ChangesetBatch, GitHubFileChange } from "../types/index";

const router = Router();

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

    const provider = LLMFactory.getProvider();

    const changesText = session.changesets
      .map((cs) => cs.xmlContent)
      .join("\n\n");
    const systemPrompt = `You are a helpful assistant. Based on the following Liquibase XML changes, generate a very simple and brief PR title and description. 
Return exactly JSON format: {"title": "...", "description": "..."}.
Keep it simple, just a few words. No markdown wrappers.`;

    const userPrompt = `Generate PR text for:\n${changesText}`;

    let responseText = await provider.generateCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    responseText = responseText
      .replace(/^```[a-zA-Z]*\n/, "")
      .replace(/```$/, "")
      .trim();
    const parsed = JSON.parse(responseText);

    return res.json({ title: parsed.title, description: parsed.description });
  } catch (error: any) {
    console.error("Generate PR text error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate PR text" });
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
    const finalDescription = prDescription + warningsSection;

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
