import express, { Router, Request, Response } from "express";
import { liquibaseGenerator } from "../services/liquibase";

const router = Router();

// Store applied changes by ID
const appliedChangesets = new Map<string, { xml: string; sql: string }>();

/**
 * POST /api/liquibase/generate
 * Generate Liquibase changeset XML from a proposed change
 */
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { change, changesetId } = req.body;

    if (!change) {
      return res.status(400).json({
        error: "change object is required",
      });
    }

    if (!change.type) {
      return res.status(400).json({
        error: "change.type is required",
      });
    }

    // Generate XML
    const xml = liquibaseGenerator.generateChangeset(change, changesetId);

    // Generate SQL preview
    const sql = liquibaseGenerator.generateSQL(change);

    // Store for later reference
    if (changesetId) {
      appliedChangesets.set(changesetId, { xml, sql });
    }

    return res.json({
      success: true,
      xml,
      sql,
      changesetId: changesetId || change.id,
    });
  } catch (error: any) {
    console.error("Generate error:", error);
    return res.status(500).json({
      error: error.message || "Failed to generate changeset",
    });
  }
});

/**
 * GET /api/liquibase/changesets
 * List all generated changesets
 */
router.get("/changesets", (req: Request, res: Response) => {
  const changesets = Array.from(appliedChangesets.entries()).map(
    ([id, { xml, sql }]) => ({
      id,
      xmlPreview: xml.substring(0, 200) + "...",
      sqlPreview: sql.substring(0, 200) + "...",
    }),
  );

  return res.json({
    changesets,
    count: changesets.length,
  });
});

/**
 * GET /api/liquibase/changesets/:id
 * Get a specific changeset
 */
router.get("/changesets/:id", (req: Request, res: Response) => {
  const changeset = appliedChangesets.get(req.params.id);

  if (!changeset) {
    return res.status(404).json({
      error: `Changeset ${req.params.id} not found`,
    });
  }

  return res.json({
    id: req.params.id,
    xml: changeset.xml,
    sql: changeset.sql,
  });
});

/**
 * GET /api/liquibase/changesets/:id/xml
 * Download the XML changeset
 */
router.get("/changesets/:id/xml", (req: Request, res: Response) => {
  const changeset = appliedChangesets.get(req.params.id);

  if (!changeset) {
    return res.status(404).json({
      error: `Changeset ${req.params.id} not found`,
    });
  }

  res.header("Content-Type", "application/xml");
  res.header(
    "Content-Disposition",
    `attachment; filename="changeset-${req.params.id}.xml"`,
  );
  res.send(changeset.xml);
});

/**
 * GET /api/liquibase/changesets/:id/sql
 * Get the SQL preview
 */
router.get("/changesets/:id/sql", (req: Request, res: Response) => {
  const changeset = appliedChangesets.get(req.params.id);

  if (!changeset) {
    return res.status(404).json({
      error: `Changeset ${req.params.id} not found`,
    });
  }

  res.header("Content-Type", "text/plain");
  res.send(changeset.sql);
});

export default router;
