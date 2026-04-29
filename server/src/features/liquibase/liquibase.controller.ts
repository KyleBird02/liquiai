import { Request, Response, NextFunction } from "express";
import { LiquibaseService } from "./liquibase.service";
import { GithubService } from "../github/github.service";

export class LiquibaseController {
  private liquibaseService: LiquibaseService;
  private githubService: GithubService = new GithubService();

  constructor() {
    this.liquibaseService = new LiquibaseService();
    this.githubService = new GithubService();
  }

  /**
   * Initialize Liquibase workspace
   */
  initialize = (req: Request, res: Response, next: NextFunction) => {
    try {
      const { author, targetApplication, targetSprint, branchName } = req.body;

      if (!author || !targetApplication || !targetSprint || !branchName) {
        return res.status(400).json({
          error:
            "author, targetApplication, targetSprint, and branchName are required",
        });
      }

      const result = this.liquibaseService.initWorkspace(
        author,
        targetApplication,
        targetSprint,
        branchName,
      );

      return res.status(200).json({
        success: true,
        message: "Liquibase workspace initialized successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get current session data
   */
  getSession = (res: Response) => {
    try {
      const session = this.liquibaseService.getSession();
      return res.json(session);
    } catch (error: any) {
      return res.status(500).json({
        error: error.message || "Failed to get session",
      });
    }
  };

  /**
   * Set proposed changes for the current session
   */
  addProposedChanges = (req: Request, res: Response) => {
    try {
      const { changes } = req.body;

      if (!Array.isArray(changes)) {
        return res.status(400).json({
          error: "changes must be an array",
        });
      }

      const session = this.liquibaseService.setProposedChanges(changes);

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
  };

  /**
   * Get the last changeset ID from GitHub
   */
  lastChangesetId = async (res: Response) => {
    try {
      const session = this.liquibaseService.getSession();

      if (!session.targetApplication) {
        return res.status(400).json({
          error: "Session must be initialized with targetApplication",
        });
      }

      const branch = session.branchName || `OCDEV-${session.author}`;
      const xmlContent = await this.githubService.fetchChangesetXml(
        session.targetApplication,
        branch,
      );

      const lastNumber = this.githubService.parseLastChangesetId(xmlContent);
      const appPrefix = this.githubService.extractApplicationPrefix(xmlContent);

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
  };

  /**
   * Generate batch of changesets from all proposed changes
   */
  generateBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { startId } = req.body;

      if (!startId) {
        return res.status(400).json({
          error: "startId is required (e.g., 'trade-124')",
        });
      }

      const match = startId.match(/^([a-z-]+)-(\d+)$/);
      if (!match) {
        return res.status(400).json({
          error:
            "startId must be in format 'prefix-number' (e.g., 'trade-124')",
        });
      }

      const [, appPrefix, numberStr] = match;
      const startNumber = parseInt(numberStr, 10);

      const changesets = await this.liquibaseService.processBatchGeneration(
        appPrefix,
        startNumber,
      );

      return res.json({
        success: true,
        changesets,
        count: changesets.length,
      });
    } catch (error: any) {
      console.error("Generate batch error:", error);

      if (
        error.message === "Session must be initialized before generating batch"
      ) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(500).json({
        error: error.message || "Failed to generate batch",
      });
    }
  };

  /**
   * Update a specific changeset in the session with new content, comment, or change type
   */
  updateChangeset = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (!id) {
        return res.status(400).json({ error: "Changeset ID is required" });
      }

      if (updates.sqlFiles !== undefined && !Array.isArray(updates.sqlFiles)) {
        return res.status(400).json({
          error: "sqlFiles must be an array when provided",
        });
      }

      const updatedChangeset =
        await this.liquibaseService.processChangesetUpdate(id, updates);

      return res.status(200).json({
        success: true,
        changeset: updatedChangeset,
      });
    } catch (error: any) {
      console.error("Update changeset error:", error);

      if (error.message.includes("not found in session")) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({
        error: error.message || "Failed to update changeset",
      });
    }
  };
}
