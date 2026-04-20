import express, { Router, Request, Response } from "express";
import { liquibaseGenerator } from "../services/liquibase";
import { sessionManager } from "../services/session";
import { githubService } from "../services/github";
import { ProposedChange, ChangesetDefinition } from "../types/index";

const router = Router();

/**
 * POST /api/liquibase/init
 * Initialize Phase 2 session with user inputs (author, application, sprint)
 */
router.post("/init", (req: Request, res: Response) => {
  try {
    const { author, targetApplication, targetSprint, branchName } = req.body;

    if (!author || !targetApplication || !targetSprint || !branchName) {
      return res.status(400).json({
        error:
          "author, targetApplication, targetSprint, and branchName are required",
      });
    }

    const session = sessionManager.initSession(
      author,
      targetApplication,
      targetSprint,
      branchName,
    );

    return res.json({
      success: true,
      session,
    });
  } catch (error: any) {
    console.error("Init session error:", error);
    return res.status(500).json({
      error: error.message || "Failed to initialize session",
    });
  }
});

/**
 * GET /api/liquibase/session
 * Get current session state
 */
router.get("/session", (req: Request, res: Response) => {
  try {
    const session = sessionManager.getSession();
    return res.json(session);
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || "Failed to get session",
    });
  }
});

/**
 * POST /api/liquibase/add-proposed-changes
 * Add proposed changes from Phase 1 to session
 */
router.post("/add-proposed-changes", (req: Request, res: Response) => {
  try {
    const { changes } = req.body;

    if (!Array.isArray(changes)) {
      return res.status(400).json({
        error: "changes must be an array",
      });
    }

    const session = sessionManager.setProposedChanges(changes);

    return res.json({
      success: true,
      session,
    });
  } catch (error: any) {
    console.error("Add proposed changes error:", error);
    return res.status(500).json({
      error: error.message || "Failed to add proposed changes",
    });
  }
});

/**
 * GET /api/liquibase/last-changeset-id
 * Fetch changeset.xml from GitHub and extract the last changeset ID
 */
router.get("/last-changeset-id", async (req: Request, res: Response) => {
  try {
    const session = sessionManager.getSession();

    if (!session.targetApplication) {
      return res.status(400).json({
        error: "Session must be initialized with targetApplication",
      });
    }

    // Fetch changeset.xml from GitHub
    const branch = session.branchName || `OCDEV-${session.author}`;
    const xmlContent = await githubService.fetchChangesetXml(
      session.targetApplication,
      branch,
    );

    // Parse to get last changeset ID and application prefix
    const lastNumber = githubService.parseLastChangesetId(xmlContent);
    const appPrefix = githubService.extractApplicationPrefix(xmlContent);

    return res.json({
      success: true,
      lastNumber,
      appPrefix,
      nextNumber: lastNumber + 1,
    });
  } catch (error: any) {
    console.error("Last changeset ID error:", error);
    return res.status(500).json({
      error: error.message || "Failed to fetch last changeset ID",
    });
  }
});

/**
 * POST /api/liquibase/generate-batch
 * Generate changesets from all proposed changes in session
 */
router.post("/generate-batch", async (req: Request, res: Response) => {
  try {
    const { startId } = req.body; // e.g., "trade-124"
    const session = sessionManager.getSession();

    if (
      !session.author ||
      !session.targetApplication ||
      !session.targetSprint
    ) {
      return res.status(400).json({
        error: "Session must be initialized before generating batch",
      });
    }

    if (!startId) {
      return res.status(400).json({
        error: "startId is required (e.g., 'trade-124')",
      });
    }

    // Parse the starting ID to get prefix and number
    const match = startId.match(/^([a-z-]+)-(\d+)$/);
    if (!match) {
      return res.status(400).json({
        error: "startId must be in format 'prefix-number' (e.g., 'trade-124')",
      });
    }

    const [, appPrefix] = match;
    let currentNumber = parseInt(match[2], 10);

    // Generate changesets
    let changesets: ChangesetDefinition[] = [];

    for (const change of session.proposedChanges) {
      const nextId = `${appPrefix}-${currentNumber}`;
      currentNumber += 1;

      const changeset = liquibaseGenerator.generateChangesetDefinition(
        change,
        nextId,
        session.targetApplication,
        session.targetSprint,
        session.author,
        null,
      );

      changesets.push(changeset);
    }

    // Add LLM reviews on top
    changesets = await liquibaseGenerator.reviewChangesets(changesets);

    // Store in session
    sessionManager.setChangesets(changesets);

    return res.json({
      success: true,
      changesets,
      count: changesets.length,
    });
  } catch (error: any) {
    console.error("Generate batch error:", error);
    return res.status(500).json({
      error: error.message || "Failed to generate batch",
    });
  }
});

/**
 * PUT /api/liquibase/changeset/:id
 * Update a specific changeset (user edits XML/SQL content)
 */
router.put("/changeset/:id", (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { xmlContent, sqlFileContent, sqlFilePath, comment, changeType } =
      req.body;

    const session = sessionManager.getSession();
    const changeset = session.changesets.find((cs) => cs.id === id);

    if (!changeset) {
      return res.status(404).json({
        error: `Changeset ${id} not found in session`,
      });
    }

    const updates: any = {
      edited: true,
    };

    const replaceSqlFilePathInXml = (
      sourceXml: string,
      oldPath: string | null,
      nextPath: string,
    ): string => {
      if (!sourceXml || !nextPath) {
        return sourceXml;
      }

      if (oldPath) {
        const escapedOld = oldPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const exactPattern = new RegExp(
          `(<sqlFile[^>]*\\bpath=")${escapedOld}(")`,
          "g",
        );
        const replacedExact = sourceXml.replace(
          exactPattern,
          `$1${nextPath}$2`,
        );
        if (replacedExact !== sourceXml) {
          return replacedExact;
        }
      }

      return sourceXml.replace(
        /(<sqlFile[^>]*\bpath=")([^"]+)(")/,
        `$1${nextPath}$3`,
      );
    };

    if (xmlContent !== undefined) {
      updates.xmlContent = xmlContent;
    }
    if (sqlFileContent !== undefined) {
      updates.sqlFileContent = sqlFileContent;
    }
    if (comment !== undefined) {
      updates.comment = comment;
    }
    if (changeType !== undefined) {
      updates.changeType = changeType;
    }
    if (sqlFilePath !== undefined) {
      updates.sqlFilePath = sqlFilePath;

      if (changeset.sqlFiles && changeset.sqlFiles.length > 0) {
        updates.sqlFiles = changeset.sqlFiles.map((file, index) =>
          index === 0 ? { ...file, path: sqlFilePath } : file,
        );
      }

      if (sqlFilePath) {
        const xmlSource =
          updates.xmlContent !== undefined
            ? updates.xmlContent
            : changeset.xmlContent;
        updates.xmlContent = replaceSqlFilePathInXml(
          xmlSource,
          changeset.sqlFilePath,
          sqlFilePath,
        );
      }
    }

    sessionManager.updateChangeset(id, updates);

    return res.json({
      success: true,
      changeset: sessionManager
        .getSession()
        .changesets.find((cs) => cs.id === id),
    });
  } catch (error: any) {
    console.error("Update changeset error:", error);
    return res.status(500).json({
      error: error.message || "Failed to update changeset",
    });
  }
});

/**
 * POST /api/liquibase/aggregate
 * Merge all changesets into a single changeset
 */
router.post("/aggregate", async (req: Request, res: Response) => {
  try {
    const { aggregatedId, sqlMergeMode } = req.body as {
      aggregatedId?: string;
      sqlMergeMode?: "single" | "multiple";
    };

    if (!aggregatedId) {
      return res.status(400).json({
        error: "aggregatedId is required (e.g., 'trade-124')",
      });
    }

    const effectiveSqlMergeMode =
      sqlMergeMode === "multiple" ? "multiple" : "single";

    const session = sessionManager.getSession();

    if (session.changesets.length === 0) {
      return res.status(400).json({
        error: "No changesets to aggregate",
      });
    }

    // Aggregate all changesets into one intelligently using LLMs
    const aggregated =
      await liquibaseGenerator.aggregateChangesetsIntelligently(
        session.changesets,
        aggregatedId,
        effectiveSqlMergeMode,
      );

    // Replace changesets in session with the aggregated one
    sessionManager.setChangesets([aggregated]);

    return res.json({
      success: true,
      changesets: [aggregated],
    });
  } catch (error: any) {
    console.error("Aggregate error:", error);
    return res.status(500).json({
      error: error.message || "Failed to aggregate changesets",
    });
  }
});

/**
 * POST /api/liquibase/reorder-renumber
 * Reorder generated changesets and renumber IDs sequentially from the minimum current number
 */
router.post("/reorder-renumber", (req: Request, res: Response) => {
  try {
    const { orderedIds } = req.body as { orderedIds?: string[] };
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ error: "orderedIds is required" });
    }

    const session = sessionManager.getSession();
    const current = session.changesets || [];

    if (current.length === 0) {
      return res.status(400).json({ error: "No changesets to reorder" });
    }

    if (orderedIds.length !== current.length) {
      return res.status(400).json({
        error: "orderedIds length must match existing changesets count",
      });
    }

    const currentIdSet = new Set(current.map((cs) => cs.id));
    const orderedIdSet = new Set(orderedIds);
    if (
      orderedIdSet.size !== current.length ||
      !orderedIds.every((id) => currentIdSet.has(id))
    ) {
      return res
        .status(400)
        .json({ error: "orderedIds do not match current changesets" });
    }

    const idMatch = current[0]?.id.match(/^([a-zA-Z-]+)-(\d+)$/);
    if (!idMatch) {
      return res.status(400).json({
        error: "Unable to parse changeset ID format for renumbering",
      });
    }

    const appPrefix = idMatch[1];
    const minNumber = current
      .map((cs) => {
        const match = cs.id.match(/^([a-zA-Z-]+)-(\d+)$/);
        return match ? parseInt(match[2], 10) : Number.MAX_SAFE_INTEGER;
      })
      .reduce((acc, value) => Math.min(acc, value), Number.MAX_SAFE_INTEGER);

    const byId = new Map(current.map((cs) => [cs.id, cs]));

    const reordered = orderedIds.map((oldId, index) => {
      const original = byId.get(oldId)!;
      const nextId = `${appPrefix}-${minNumber + index}`;
      const nextXml = original.xmlContent.replace(
        /(<change[sS]et[^>]*\bid=")([^"]+)(")/,
        `$1${nextId}$3`,
      );

      return {
        ...original,
        id: nextId,
        xmlContent: nextXml,
      };
    });

    sessionManager.setChangesets(reordered);

    return res.json({
      success: true,
      changesets: reordered,
      startId: reordered[0]?.id || null,
    });
  } catch (error: any) {
    console.error("Reorder/renumber error:", error);
    return res.status(500).json({
      error: error.message || "Failed to reorder and renumber changesets",
    });
  }
});

router.post("/retrigger-preflight", async (req: Request, res: Response) => {
  try {
    const session = sessionManager.getSession();
    const current = session.changesets || [];

    if (current.length === 0) {
      return res.status(400).json({ error: "No changesets to review" });
    }

    const reviewed = await liquibaseGenerator.reviewChangesets(current);
    sessionManager.setChangesets(reviewed);

    return res.json({
      success: true,
      changesets: reviewed,
    });
  } catch (error: any) {
    console.error("Retrigger preflight error:", error);
    return res.status(500).json({
      error: error.message || "Failed to retrigger preflight",
    });
  }
});

/**
 * GET /api/liquibase/changesets
 * List all generated changesets in the current session
 */
router.get("/changesets", (req: Request, res: Response) => {
  try {
    const session = sessionManager.getSession();
    return res.json({
      success: true,
      changesets: session.changesets || [],
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || "Failed to get changesets",
    });
  }
});

/**
 * POST /api/liquibase/clear-session
 * Clear current session (useful for starting over)
 */
router.post("/clear-session", (req: Request, res: Response) => {
  try {
    sessionManager.clearSession();
    return res.json({
      success: true,
      message: "Session cleared",
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || "Failed to clear session",
    });
  }
});

export default router;
