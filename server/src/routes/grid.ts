import express, { Router, Request, Response } from "express";
import { gridService } from "../services/grid";
import { connectionManager, createConnection } from "../db/connection";
import {
  GridConfig,
  GridConfigChange,
  WidthSuggestion,
  AIAssistantChatRequest,
} from "../types/index";
import { gridCSVGenerator } from "../services/grid-csv";
import { liquibaseGenerator } from "../services/liquibase";

const router = Router();

const getDefaultConnectionString = (): string | null => {
  return (
    process.env.LOCAL_DB_CONNECTION_STRING ||
    process.env.DEV_DB_CONNECTION_STRING ||
    null
  );
};

const ensureDbConnection = async (): Promise<string | null> => {
  if (connectionManager.isConnected()) {
    return null;
  }

  const connectionString = getDefaultConnectionString();
  if (!connectionString) {
    return "Database connection is not initialized. Set LOCAL_DB_CONNECTION_STRING or DEV_DB_CONNECTION_STRING, or call /api/schema/connect first.";
  }

  await createConnection(connectionString);
  return null;
};

/**
 * GET /api/grid/list
 * List all grids from the database
 */
router.get("/list", async (req: Request, res: Response) => {
  try {
    const connectionError = await ensureDbConnection();
    if (connectionError) {
      return res.status(400).json({ error: connectionError });
    }

    const grids = await gridService.getAllGrids();
    res.json(grids);
  } catch (error: any) {
    console.error("Error listing grids:", error);
    res.status(500).json({ error: error.message || "Failed to list grids" });
  }
});

router.post("/create", async (req: Request, res: Response) => {
  try {
    const connectionError = await ensureDbConnection();
    if (connectionError) {
      return res.status(400).json({ error: connectionError });
    }

    const { gridName, columns = [] } = req.body;
    if (!gridName || typeof gridName !== "string") {
      return res.status(400).json({ error: "gridName is required" });
    }

    const created = await gridService.createGridWithColumns(gridName, columns);
    res.status(201).json(created);
  } catch (error: any) {
    console.error("Error creating grid:", error);
    res.status(500).json({ error: error.message || "Failed to create grid" });
  }
});

/**
 * GET /api/grid/:id
 * Get full GridConfig for a specific grid (joined view)
 */
router.get("/:id(\\d+)", async (req: Request, res: Response) => {
  try {
    const connectionError = await ensureDbConnection();
    if (connectionError) {
      return res.status(400).json({ error: connectionError });
    }

    const gridId = parseInt(req.params.id, 10);
    if (isNaN(gridId)) {
      return res.status(400).json({ error: "Invalid grid ID" });
    }

    const config = await gridService.getGridConfig(gridId);
    if (!config) {
      return res.status(404).json({ error: "Grid not found" });
    }

    res.json(config);
  } catch (error: any) {
    console.error("Error fetching grid:", error);
    res.status(500).json({ error: error.message || "Failed to fetch grid" });
  }
});

router.post("/:id(\\d+)/apply", async (req: Request, res: Response) => {
  try {
    const connectionError = await ensureDbConnection();
    if (connectionError) {
      return res.status(400).json({ error: connectionError });
    }

    const gridId = parseInt(req.params.id, 10);
    if (isNaN(gridId)) {
      return res.status(400).json({ error: "Invalid grid ID" });
    }

    const { columns } = req.body;
    if (!columns || !Array.isArray(columns)) {
      return res.status(400).json({ error: "columns array is required" });
    }

    const updatedConfig = await gridService.applyGridConfig(gridId, columns);
    res.json(updatedConfig);
  } catch (error: any) {
    console.error("Error applying grid config:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to apply grid configuration" });
  }
});

/**
 * GET /api/grid/columns
 * List all grid columns (the column registry)
 */
router.get("/columns/all", async (req: Request, res: Response) => {
  try {
    const connectionError = await ensureDbConnection();
    if (connectionError) {
      return res.status(400).json({ error: connectionError });
    }

    const columns = await gridService.getAllGridColumns();
    res.json(columns);
  } catch (error: any) {
    console.error("Error fetching grid columns:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to fetch grid columns" });
  }
});

/**
 * POST /api/grid/propose
 * Submit a proposed grid configuration change and compute diff
 */
router.post("/propose", async (req: Request, res: Response) => {
  try {
    const connectionError = await ensureDbConnection();
    if (connectionError) {
      return res.status(400).json({ error: connectionError });
    }

    const { gridId, proposedColumns } = req.body;

    if (!gridId || !proposedColumns) {
      return res
        .status(400)
        .json({ error: "gridId and proposedColumns are required" });
    }

    // Get current grid config
    const currentConfig = await gridService.getGridConfig(gridId);
    const beforeColumns = currentConfig?.columns || null;

    // Compute diff
    const diff = gridService.computeGridDiff(beforeColumns, proposedColumns);

    // Validate new configuration
    const validation = gridService.validateGridConfig({
      grid: diff.grid,
      columns: proposedColumns,
    });

    res.json({
      diff,
      validation,
    });
  } catch (error: any) {
    console.error("Error proposing grid change:", error);
    res.status(500).json({
      error: error.message || "Failed to propose grid change",
    });
  }
});

/**
 * POST /api/grid/ai/suggest-widths
 * Return width suggestions for current grid columns
 */
router.post("/ai/suggest-widths", async (req: Request, res: Response) => {
  try {
    const connectionError = await ensureDbConnection();
    if (connectionError) {
      return res.status(400).json({ error: connectionError });
    }

    const { columns } = req.body;

    if (!columns || !Array.isArray(columns)) {
      return res.status(400).json({ error: "columns array is required" });
    }

    const suggestions = await gridService.suggestColumnWidths(columns);
    res.json(suggestions);
  } catch (error: any) {
    console.error("Error suggesting widths:", error);
    res.status(500).json({
      error: error.message || "Failed to suggest widths",
    });
  }
});

/**
 * POST /api/grid/ai/suggest-headers
 * Return suggested header names based on column names
 */
router.post("/ai/suggest-headers", async (req: Request, res: Response) => {
  try {
    const { columns } = req.body;

    if (!columns || !Array.isArray(columns)) {
      return res.status(400).json({ error: "columns array is required" });
    }

    // Simple heuristic: convert camelCase to Title Case
    const suggestions = columns.map((col: any) => ({
      columnName: col.column_name,
      suggestedHeaderName: col.column_name
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str: string) => str.toUpperCase())
        .trim(),
      currentHeaderName: col.header_name,
    }));

    res.json(suggestions);
  } catch (error: any) {
    console.error("Error suggesting headers:", error);
    res.status(500).json({
      error: error.message || "Failed to suggest headers",
    });
  }
});

/**
 * POST /api/grid/ai/synthetic-data
 * Generate synthetic data for grid preview
 */
router.post("/ai/synthetic-data", async (req: Request, res: Response) => {
  try {
    const connectionError = await ensureDbConnection();
    if (connectionError) {
      return res.status(400).json({ error: connectionError });
    }

    const { columns, rowCount = 10 } = req.body;

    if (!columns || !Array.isArray(columns)) {
      return res.status(400).json({ error: "columns array is required" });
    }

    const syntheticData = await gridService.generateSyntheticData(
      columns,
      rowCount,
    );
    res.json(syntheticData);
  } catch (error: any) {
    console.error("Error generating synthetic data:", error);
    res.status(500).json({
      error: error.message || "Failed to generate synthetic data",
    });
  }
});

/**
 * POST /api/grid/ai/chat
 * Free-form AI assistant for grid configuration
 * Matches the existing application's LLM pattern
 */
router.post("/ai/chat", async (req: Request, res: Response) => {
  try {
    const { gridConfig, messages }: AIAssistantChatRequest = req.body;

    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: "messages are required" });
    }

    // Build context for the AI assistant
    const gridContext = gridConfig
      ? `Current grid: ${gridConfig.grid.grid_name}
Columns: ${gridConfig.columns.map((c) => `${c.column_name} (${c.header_name})`).join(", ")}`
      : "No grid context";

    // Format messages for OpenRouter API
    const formattedMessages = [
      {
        role: "system",
        content: `You are an AI assistant helping developers configure AG Grid tables. You provide suggestions for column widths, header names, and grid layout. Be concise and practical.

Grid Context:
${gridContext}`,
      },
      ...messages,
    ];

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + (process.env.OPENROUTER_API_KEY || ""),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4-5",
          messages: formattedMessages,
          max_tokens: 500,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenRouter API error:", error);
      return res
        .status(response.status)
        .json({ error: "Failed to get AI response" });
    }

    const data: any = await response.json();
    const assistantMessage =
      data.choices?.[0]?.message?.content || "Unable to generate response";

    res.json({
      role: "assistant",
      content: assistantMessage,
    });
  } catch (error: any) {
    console.error("Error in AI chat:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to process chat message" });
  }
});

/**
 * POST /api/grid/generate-changeset
 * Generate loadData or loadUpdateData changeset + CSV files
 */
router.post("/generate-changeset", async (req: Request, res: Response) => {
  try {
    const connectionError = await ensureDbConnection();
    if (connectionError) {
      return res.status(400).json({ error: connectionError });
    }

    const { gridId, proposedColumns, author, targetApplication, targetSprint } =
      req.body;

    if (
      !gridId ||
      !proposedColumns ||
      !author ||
      !targetApplication ||
      !targetSprint
    ) {
      return res.status(400).json({
        error:
          "gridId, proposedColumns, author, targetApplication, and targetSprint are required",
      });
    }

    // Get current grid config
    const currentConfig = await gridService.getGridConfig(gridId);

    if (!currentConfig) {
      return res.status(404).json({ error: "Grid not found" });
    }

    // Compute diff
    const change = gridService.computeGridDiff(
      currentConfig.columns,
      proposedColumns,
    );

    const gridName = currentConfig.grid.grid_name;
    const isNewGrid = !currentConfig.columns || currentConfig.columns.length === 0;

    const csvFiles: Array<{ tableName: string; path: string; content: string }> =
      [];

    if (isNewGrid) {
      const gridPath = `${targetApplication}/${targetSprint}/grid_${gridName}.csv`;
      const attributesPath = `${targetApplication}/${targetSprint}/grid_attributes_${gridName}.csv`;

      csvFiles.push({
        tableName: "grid",
        path: gridPath,
        content: gridCSVGenerator.generateGridTableCSV(currentConfig.grid),
      });

      csvFiles.push({
        tableName: "grid_attributes",
        path: attributesPath,
        content: gridCSVGenerator.generateGridAttributesCSV(proposedColumns),
      });
    } else {
      const updateCsv = gridCSVGenerator.generateGridAttributesUpdateCSV(
        currentConfig.columns,
        proposedColumns,
      );

      if (updateCsv.changedRowCount === 0) {
        return res.json({
          noChanges: true,
          message: "No grid attribute changes detected",
          change,
        });
      }

      const updatePath = `${targetApplication}/${targetSprint}/grid_attributes_${gridName}_update.csv`;
      csvFiles.push({
        tableName: "grid_attributes",
        path: updatePath,
        content: updateCsv.csv,
      });
    }

    const changesetId = `grid-${gridId}-${Date.now()}`;
    const changeset = liquibaseGenerator.generateGridChangesetDefinition(
      gridName,
      changesetId,
      author,
      targetApplication,
      targetSprint,
      csvFiles,
      isNewGrid,
      `Grid config update for ${gridName}`,
    );

    res.json({
      change,
      changeset,
      csvFiles,
      author,
      targetApplication,
      targetSprint,
    });
  } catch (error: any) {
    console.error("Error generating changeset:", error);
    res.status(500).json({
      error: error.message || "Failed to generate changeset",
    });
  }
});

export default router;
