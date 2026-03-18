import express, { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { ProposedChange } from "../types/index";
import { changeValidator } from "../services/validator";
import { diffCalculator } from "../services/diff";
import { schemaService } from "../services/schema";
import { migrationService } from "../services/migration";
import { connectionManager } from "../db/connection";

const router = Router();

// In-memory storage of proposed changes (per session)
// TODO: In Phase 2, persist this to a database
const proposedChanges = new Map<string, ProposedChange>();

/**
 * POST /api/changes/propose
 * Submit a proposed change and get validation + diff
 */
router.post("/propose", (req: Request, res: Response) => {
  try {
    const { type, payload } = req.body;

    if (!type || !payload) {
      return res.status(400).json({
        error: "type and payload are required",
      });
    }

    const changeId = uuidv4();
    const change: ProposedChange = {
      id: changeId,
      type,
      status: "pending",
      payload,
      createdAt: new Date().toISOString(),
    };

    // Validate the change
    const validationResult = changeValidator.validate(change);
    change.validationResult = validationResult;
    change.status = validationResult.passed ? "validated" : "rejected";

    // Calculate diff against current snapshot
    let schemaDiff = null;
    if (type === "CREATE_TABLE") {
      const snapshot = schemaService.getCurrentSnapshot();
      const beforeTable = schemaService.getTableByNameAndSchema(
        payload.schema,
        payload.tableName,
      );
      // For create, construct the after table from payload
      const afterTable = {
        name: payload.tableName,
        schema: payload.schema,
        columns: payload.columns,
        indexes: [],
        foreignKeys: payload.foreignKeys || [],
        primaryKey: payload.primaryKey || [],
      };
      schemaDiff = diffCalculator.calculateDiff(
        beforeTable || null,
        afterTable,
      );
    } else if (type === "DROP_TABLE") {
      const beforeTable = schemaService.getTableByNameAndSchema(
        payload.schema,
        payload.tableName,
      );
      schemaDiff = diffCalculator.calculateDiff(beforeTable || null, null);
    } else if (type === "ALTER_TABLE") {
      const beforeTable = schemaService.getTableByNameAndSchema(
        payload.schema,
        payload.tableName,
      );
      // TODO: Construct afterTable based on alter operations
      // For now, just return the before
      schemaDiff = diffCalculator.calculateDiff(
        beforeTable || null,
        beforeTable || null,
      );
    }

    // Store the change
    proposedChanges.set(changeId, change);

    return res.json({
      change,
      diff: schemaDiff,
      diffSummary: schemaDiff
        ? diffCalculator.summarizeDiff(schemaDiff)
        : "No diff available",
    });
  } catch (error: any) {
    console.error("Propose error:", error);
    return res.status(500).json({
      error: error.message || "Failed to propose change",
    });
  }
});

/**
 * GET /api/changes
 * List all proposed changes in the current session
 */
router.get("/", (req: Request, res: Response) => {
  const changes = Array.from(proposedChanges.values());
  return res.json({
    changes,
    count: changes.length,
  });
});

/**
 * GET /api/changes/:id
 * Get a specific proposed change
 */
router.get("/:id", (req: Request, res: Response) => {
  const change = proposedChanges.get(req.params.id);

  if (!change) {
    return res.status(404).json({
      error: `Change ${req.params.id} not found`,
    });
  }

  return res.json(change);
});

/**
 * POST /api/changes/:id/apply
 * Apply a validated change to the database
 * Body params:
 *   - connectionString (optional): if provided, applies to this connection instead of pre-connected one
 */
router.post("/:id/apply", async (req: Request, res: Response) => {
  try {
    const change = proposedChanges.get(req.params.id);
    const { connectionString } = req.body;

    if (!change) {
      return res.status(404).json({
        error: `Change ${req.params.id} not found`,
      });
    }

    if (!change.validationResult?.passed) {
      return res.status(400).json({
        error: "Change has validation errors. Cannot apply.",
        validationResult: change.validationResult,
      });
    }

    // Check if we have a connection
    if (!connectionString && !connectionManager.isConnected()) {
      return res.status(400).json({
        error:
          "Not connected to database. Provide connectionString in request body.",
      });
    }

    // Apply based on change type
    let applyResult: any;

    if (change.type === "CREATE_TABLE") {
      const connStr =
        connectionString || process.env.LOCAL_DB_CONNECTION_STRING;
      if (!connStr) {
        return res.status(400).json({
          error: "No connection string available to apply change",
        });
      }
      const payload = change.payload as any;
      applyResult = await migrationService.applyCreateTable(payload, connStr);
    } else if (change.type === "ALTER_TABLE") {
      const connStr =
        connectionString || process.env.LOCAL_DB_CONNECTION_STRING;
      if (!connStr) {
        return res.status(400).json({
          error: "No connection string available to apply change",
        });
      }
      const payload = change.payload as any;
      applyResult = await migrationService.applyAlterTable(payload, connStr);
    } else {
      return res.status(501).json({
        error: `Applying ${change.type} is not yet implemented`,
      });
    }

    if (!applyResult.success) {
      return res.status(500).json({
        error: "Failed to apply change",
        details: applyResult.error,
      });
    }

    // Mark change as applied
    change.status = "validated";

    return res.json({
      success: true,
      message: applyResult.message,
      change,
    });
  } catch (error: any) {
    console.error("Apply error:", error);
    return res.status(500).json({
      error: error.message || "Failed to apply change",
    });
  }
});

/**
 * DELETE /api/changes/:id
 * Discard a proposed change
 */
router.delete("/:id", (req: Request, res: Response) => {
  const success = proposedChanges.delete(req.params.id);

  if (!success) {
    return res.status(404).json({
      error: `Change ${req.params.id} not found`,
    });
  }

  return res.json({
    success: true,
    message: `Change ${req.params.id} discarded`,
  });
});

/**
 * POST /api/changes/clear
 * Clear all proposed changes in the session
 */
router.post("/clear", (req: Request, res: Response) => {
  const count = proposedChanges.size;
  proposedChanges.clear();

  return res.json({
    success: true,
    message: `Cleared ${count} changes`,
  });
});

export default router;
