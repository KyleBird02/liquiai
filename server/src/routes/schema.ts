import express, { Router, Request, Response } from "express";
import { Client } from "pg";
import { connectionManager, createConnection } from "../db/connection";
import { schemaService } from "../services/schema";
import { introspectSchema, testConnection } from "../db/queries";

const router = Router();

router.get("/config", (req: Request, res: Response) => {
  res.json({
    dev: process.env.DEV_DB_CONNECTION_STRING || "",
    local: process.env.LOCAL_DB_CONNECTION_STRING || "",
    author: process.env.LIQUIBASE_CHANGESET_AUTHOR || "",
  });
});

/**
 * POST /api/schema/connect
 * Test and establish a database connection
 */
router.post("/connect", async (req: Request, res: Response) => {
  try {
    const { connectionString } = req.body;
    if (!connectionString) {
      console.log("ERROR: connectionString is required");
      return res.status(400).json({ error: "connectionString is required" });
    }

    // Test connection
    const isValid = await testConnection(connectionString);
    if (!isValid) {
      return res.status(400).json({ error: "Failed to connect to database" });
    }

    // Initialize the connection manager
    await createConnection(connectionString);

    return res.json({
      success: true,
      message: "Connected to database successfully",
    });
  } catch (error: any) {
    console.error("Connection error:", error);
    return res.status(500).json({
      error: error.message || "Failed to connect",
    });
  }
});

/**
 * GET /api/schema/snapshot
 * Capture the schema snapshot for a specific connection
 * Query params: connectionString (optional) - if provided, uses that instead of the pre-connected one
 */
router.get("/snapshot", async (req: Request, res: Response) => {
  try {
    const connectionString = req.query.connectionString as string | undefined;
    const databaseName = (req.query.database as string) || "current";

    // If connectionString is provided, use it directly without requiring pre-connection
    if (connectionString) {
      try {
        const snapshot = await schemaService.captureSnapshotWithConnection(
          connectionString,
          databaseName,
        );
        return res.json(snapshot);
      } catch (error: any) {
        console.error("Snapshot error with provided connection:", error);
        return res.status(500).json({
          error:
            error.message ||
            "Failed to capture snapshot with provided connection",
        });
      }
    }

    // Otherwise use the pre-established connection
    if (!connectionManager.isConnected()) {
      return res.status(400).json({
        error:
          "Not connected to database. Call /connect first or provide connectionString.",
      });
    }

    const snapshot = await schemaService.captureSnapshot(databaseName);
    return res.json(snapshot);
  } catch (error: any) {
    console.error("Snapshot error:", error);
    return res.status(500).json({
      error: error.message || "Failed to capture snapshot",
    });
  }
});

/**
 * GET /api/schema/current
 * Get the most recently captured snapshot
 */
router.get("/current", (req: Request, res: Response) => {
  const snapshot = schemaService.getCurrentSnapshot();

  if (!snapshot) {
    return res.status(404).json({
      error: "No snapshot available. Call /snapshot first.",
    });
  }

  return res.json(snapshot);
});

/**
 * GET /api/schema/tables
 * List all tables in the current snapshot
 */
router.get("/tables", (req: Request, res: Response) => {
  const snapshot = schemaService.getCurrentSnapshot();

  if (!snapshot) {
    return res.status(404).json({
      error: "No snapshot available. Call /snapshot first.",
    });
  }

  return res.json({
    tables: snapshot.tables.map((t) => ({
      name: t.name,
      schema: t.schema,
      columnCount: t.columns.length,
      foreignKeyCount: t.foreignKeys.length,
    })),
  });
});

/**
 * GET /api/schema/tables/:schema/:name
 * Get a specific table definition
 */
router.get("/tables/:schema/:name", (req: Request, res: Response) => {
  const { schema, name } = req.params;
  const table = schemaService.getTableByNameAndSchema(schema, name);

  if (!table) {
    return res.status(404).json({
      error: `Table ${schema}.${name} not found`,
    });
  }

  return res.json(table);
});

/**
 * GET /api/schema/table/data
 * Fetch all rows from a specific table
 * Query params:
 *   - table (required): table name, optionally schema-qualified (e.g., "public.users")
 *   - connectionString (optional): if provided, uses this connection instead of pre-connected one
 *   - limit (optional): max rows to return, default 50
 */
router.get("/table/data", async (req: Request, res: Response) => {
  try {
    const tableName = req.query.table as string | undefined;
    const connectionString = req.query.connectionString as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!tableName) {
      return res.status(400).json({ error: "table parameter is required" });
    }

    // Determine if table is schema-qualified
    let schema = "public";
    let table = tableName;
    if (tableName.includes(".")) {
      const parts = tableName.split(".");
      schema = parts[0];
      table = parts[1];
    }

    const safeTableName = `"${schema}"."${table}"`;
    const query = `SELECT * FROM ${safeTableName} LIMIT $1`;

    let rows: any[] = [];

    if (connectionString) {
      // Create a temporary client with the provided connection string
      const client = new Client({ connectionString });
      try {
        await client.connect();
        const result = await client.query(query, [limit]);
        rows = result.rows;
      } finally {
        await client.end();
      }
    } else {
      // Use the pre-established connection
      if (!connectionManager.isConnected()) {
        return res.status(400).json({
          error:
            "Not connected to database. Provide connectionString parameter.",
        });
      }
      const result = await connectionManager.query(query, [limit]);
      rows = result.rows;
    }

    return res.json({
      tableName: tableName,
      rowCount: rows.length,
      limit: limit,
      rows: rows,
    });
  } catch (error: any) {
    console.error("Table data fetch error:", error);
    return res.status(500).json({
      error: error.message || "Failed to fetch table data",
    });
  }
});

/**
 * POST /api/schema/tables/:schema/:table/columns/:column
 * Update a column definition in the database (local only)
 */
router.post(
  "/tables/:schema/:table/columns/:column",
  async (req: Request, res: Response) => {
    try {
      const { schema, table, column } = req.params;
      const { updates, connectionString } = req.body;

      if (!connectionString) {
        return res.status(400).json({
          error: "connectionString is required for column updates",
        });
      }

      if (!updates || typeof updates !== "object") {
        return res.status(400).json({
          error: "updates object is required",
        });
      }

      // Create a temporary client with the provided connection string
      const client = new Client({ connectionString });
      try {
        await client.connect();

        // Build the ALTER TABLE statement
        const alterParts: string[] = [];

        // Handle column rename
        if (updates.name && updates.name !== column) {
          alterParts.push(`RENAME COLUMN "${column}" TO "${updates.name}"`);
        }

        // Handle type change
        if (updates.type) {
          const colRef =
            updates.name && updates.name !== column
              ? `"${updates.name}"`
              : `"${column}"`;
          alterParts.push(`ALTER COLUMN ${colRef} TYPE ${updates.type}`);
        }

        // Handle NOT NULL constraint
        if (updates.nullable !== undefined) {
          const colRef =
            updates.name && updates.name !== column
              ? `"${updates.name}"`
              : `"${column}"`;
          if (!updates.nullable) {
            alterParts.push(`ALTER COLUMN ${colRef} SET NOT NULL`);
          } else {
            alterParts.push(`ALTER COLUMN ${colRef} DROP NOT NULL`);
          }
        }

        // Handle default value
        if (updates.defaultValue !== undefined) {
          const colRef =
            updates.name && updates.name !== column
              ? `"${updates.name}"`
              : `"${column}"`;
          if (updates.defaultValue) {
            alterParts.push(
              `ALTER COLUMN ${colRef} SET DEFAULT ${updates.defaultValue}`,
            );
          } else {
            alterParts.push(`ALTER COLUMN ${colRef} DROP DEFAULT`);
          }
        }

        if (alterParts.length === 0) {
          return res.status(400).json({
            error: "No updates provided",
          });
        }

        const alterSQL = `ALTER TABLE "${schema}"."${table}" ${alterParts.join(", ")}`;
        console.log("Executing ALTER TABLE:", alterSQL);

        await client.query(alterSQL);

        return res.json({
          success: true,
          message: "Column updated successfully",
          column: updates.name || column,
        });
      } finally {
        await client.end();
      }
    } catch (error: any) {
      console.error("Column update error:", error);
      return res.status(500).json({
        error: error.message || "Failed to update column",
      });
    }
  },
);

export default router;
