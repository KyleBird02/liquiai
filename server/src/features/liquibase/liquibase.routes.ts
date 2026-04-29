import { Router } from "express";
import { LiquibaseController } from "./liquibase.controller";

const router = Router();
const liquibaseController = new LiquibaseController();

/**
 * POST /api/liquibase/generate
 * Generate Liquibase changeset XML and SQL preview
 */
router.post("/init", liquibaseController.initialize);

/**
 * GET /api/liquibase/session
 * Get current session data
 */
router.get("/session", liquibaseController.getSession);

/**
 * POST /api/liquibase/add-proposed-changes
 * Add proposed changes to the current session
 */
router.post("/add-proposed-changes", liquibaseController.addProposedChanges);

/**
 * GET /api/liquibase/last-changeset-id
 * Get the last changeset ID from GitHub for the current session's target application and branch
 */
router.get("/last-changeset-id", liquibaseController.lastChangesetId);

/**
 * POST /api/liquibase/generate-batch
 * Generate changesets from all proposed changes in session
 */
router.post("/generate-batch", liquibaseController.generateBatch);

/**
 * PUT /api/liquibase/changeset/:id
 * Update a specific changeset (user edits XML/SQL content)
 */
router.put("/changeset/:id", liquibaseController.updateChangeset);
// router.post("/aggregate", liquibaseController.aggregateChangesets);
// router.post("/reorder-renumber", liquibaseController.reorderAndRenumber);
// router.post("/retrigger-preflight", liquibaseController.retriggerPreflight);
// router.get("/changesets", liquibaseController.listChangesets);
// router.post("/clear-session", liquibaseController.clearSession);

export default router;
