import express, { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { ProposedChange } from "../types/index";
import { diffCalculator } from "../services/diff";
import { schemaService } from "../services/schema";
import { migrationService } from "../services/migration";
import { llmSqlGenerator } from "../services/llm-sql-generator";
import { LLMFactory } from "../services/llm";
import { connectionManager } from "../db/connection";

const router = Router();

// In-memory storage of proposed changes (per session)
// TODO: In Phase 2, persist this to a database
const proposedChanges = new Map<string, ProposedChange>();

/**
 * POST /api/changes/propose
 * Submit a proposed change and get validation + diff
 */
router.post("/propose", async (req: Request, res: Response) => {
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
      appliedLocally: false,
    };

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

    // Generate SQL preview using LLM
    change.sqlPreview = await llmSqlGenerator.generateSQL(change);

    // Store the change
    proposedChanges.set(changeId, change);
    console.log(`Proposed change ${changeId}:`, change);
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
 * GET /api/changes/:id/sql-preview
 * Get the SQL preview for a proposed change without applying it
 */
router.get("/:id/sql-preview", async (req: Request, res: Response) => {
  try {
    const change = proposedChanges.get(req.params.id);

    if (!change) {
      return res.status(404).json({
        error: `Change ${req.params.id} not found`,
      });
    }

    const sqlPreview = await llmSqlGenerator.generateSQL(change);

    return res.json({
      changeId: change.id,
      type: change.type,
      sql: sqlPreview,
    });
  } catch (error: any) {
    console.error("SQL preview error:", error);
    return res.status(500).json({
      error: error.message || "Failed to generate SQL preview",
    });
  }
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
    } else if (change.type === "EXECUTE_SQL") {
      const connStr =
        connectionString || process.env.LOCAL_DB_CONNECTION_STRING;
      if (!connStr) {
        return res.status(400).json({
          error: "No connection string available to apply change",
        });
      }
      const payload = change.payload as any;
      applyResult = await migrationService.executeSQL(payload.sql, connStr);
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
    change.appliedLocally = true;

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
 * POST /api/changes/:id/revert
 * Undo an applied change entirely
 */
router.post("/:id/revert", async (req: Request, res: Response) => {
  try {
    const change = proposedChanges.get(req.params.id);

    if (!change) {
      return res
        .status(404)
        .json({ error: `Change ${req.params.id} not found` });
    }

    if (!change.appliedLocally) {
      return res.status(400).json({
        error:
          "Cannot revert a change that hasn't been applied yet. If you want to discard it, delete it instead.",
      });
    }

    const connectionString =
      req.body.connectionString || process.env.LOCAL_DB_CONNECTION_STRING;
    if (!connectionString) {
      return res
        .status(400)
        .json({ error: "No connection string available to revert change" });
    }

    let revertResult: any;

    if (change.type === "CREATE_TABLE") {
      const payload = change.payload as any;
      // Inverse of CREATE is DROP
      revertResult = await migrationService.applyDropTable(
        { tableName: payload.tableName, schema: payload.schema },
        connectionString,
      );
    } else if (change.type === "ALTER_TABLE") {
      const payload = change.payload as any;
      revertResult = await migrationService.revertAlterTable(
        payload,
        connectionString,
      );
    } else if (change.type === "DROP_TABLE") {
      return res
        .status(501)
        .json({ error: `Reverting a DROP TABLE is not supported directly.` });
    } else if (change.type === "EXECUTE_SQL") {
      return res.status(501).json({
        error: `Reverting raw SQL is not supported. Manual intervention may be required.`,
      });
    } else {
      return res
        .status(501)
        .json({ error: `Reverting ${change.type} is not yet implemented` });
    }

    if (!revertResult.success) {
      return res.status(500).json({
        error: "Failed to revert change",
        details: revertResult.error,
      });
    }

    // Unmark as applied
    change.appliedLocally = false;

    return res.json({
      success: true,
      message: revertResult.message,
      change,
    });
  } catch (error: any) {
    console.error("Revert error:", error);
    return res.status(500).json({
      error: error.message || "Failed to revert change",
    });
  }
});

/**
 * PUT /api/changes/:id/sql
 * Update the SQL preview for a proposed change
 */
router.put("/:id/sql", (req: Request, res: Response) => {
  try {
    const change = proposedChanges.get(req.params.id);
    const { sqlPreview } = req.body;

    if (!change) {
      return res.status(404).json({
        error: `Change ${req.params.id} not found`,
      });
    }

    if (sqlPreview === undefined) {
      return res.status(400).json({
        error: "sqlPreview is required",
      });
    }

    change.sqlPreview = sqlPreview;
    change.edited = true;

    return res.json({
      success: true,
      change,
    });
  } catch (error: any) {
    console.error("Update SQL error:", error);
    return res.status(500).json({
      error: error.message || "Failed to update SQL",
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

/**
 * POST /api/changes/ai-assistant
 * Ask AI Assistant to create schema based on user description
 */
router.post("/ai-assistant", async (req: Request, res: Response) => {
  try {
    const { conversationHistory } = req.body;

    if (!conversationHistory || !Array.isArray(conversationHistory)) {
      return res.status(400).json({
        error: "conversationHistory is required and must be an array",
      });
    }

    const systemMessage = {
      role: "system" as const,
      content: `You are a database schema expert. Your job is to help users create database tables based on their descriptions.

When the user describes what they want, you should:
1. Parse their description and understand the tables and columns they want
2. If anything is unclear, ask clarifying questions WRAPPED IN TAGS: <clarifying_question>Your question here?</clarifying_question>
3. Once you have all the information, respond with a JSON object containing ALL the tables to create in a single response

IMPORTANT TAGGING RULES:
- When asking a question: Wrap your question with <clarifying_question>question text</clarifying_question>
- ALWAYS respond with ALL tables in a single JSON response - never split across multiple responses
- ALWAYS set "continueNeeded": false - this ensures the user is not prompted to click continue
- ALWAYS include <all_tables_complete></all_tables_complete> at the end of your response when creating tables

FOREIGN KEY RULES:
- For foreign keys, use the format: {"constraintName": "fk_table_column", "column": "local_column", "referencedTable": "referenced_table", "referencedColumn": "referenced_column", "onDelete": "CASCADE|SET NULL|RESTRICT|NO ACTION"}
- constraintName should follow pattern: fk_<table>_<column>
- onDelete must be one of: CASCADE, SET NULL, RESTRICT, or NO ACTION
- Create the referenced table BEFORE the table that references it
- If a user describes relationships, automatically create the appropriate foreign keys

When responding with table definitions, use this exact JSON format:
{
  "action": "create_tables",
  "continueNeeded": false,
  "tables": [
    {
      "tableName": "table_name",
      "schema": "public",
      "columns": [
        {"name": "id", "type": "SERIAL", "nullable": false, "defaultValue": null, "isPrimaryKey": true},
        {"name": "name", "type": "VARCHAR(255)", "nullable": false, "defaultValue": null, "isPrimaryKey": false}
      ],
      "primaryKey": ["id"],
      "foreignKeys": [
        {
          "constraintName": "fk_posts_user_id",
          "column": "user_id",
          "referencedTable": "users",
          "referencedColumn": "id",
          "onDelete": "CASCADE"
        }
      ]
    }
  ]
}

FORMAT FOR MODIFYING EXISTING TABLES (ALTER):
{
  "action": "alter_tables",
  "continueNeeded": false,
  "alterations": [
    {
      "tableName": "existing_table",
      "schema": "public",
      "modifications": [
        {
          "type": "rename_column",
          "columnName": "old_column_name",
          "newName": "new_column_name"
        }
      ]
    }
  ]
}

EXAMPLES:
- If user asks for "users and posts tables", create BOTH tables in a single response with "continueNeeded": false and <all_tables_complete></all_tables_complete>
- If user asks for a single table, set "continueNeeded": false and include <all_tables_complete></all_tables_complete>
- Example with relationships: User says "Create users table with id and name, and posts table with id, title, and a foreign key to users". Create both tables in one response, with posts.foreignKeys containing the reference to users.
- Handle all dependencies, relationships, and table creation in one response
- If you need clarification, wrap your entire question in <clarifying_question> tags`,
    };

    const messages = [
      systemMessage,
      ...conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    const llmProvider = LLMFactory.getProvider();
    const response = await llmProvider.generateCompletion(messages);

    if (!response) {
      return res.status(500).json({
        error: "Failed to get LLM response",
      });
    }

    let jsonMatch = null;
    let clarifyingQuestion = null;
    let continueNeeded = false;
    let allTablesComplete = false;

    try {
      // Check for clarifying question tags first
      const questionPattern =
        /<clarifying_question>([\s\S]*?)<\/clarifying_question>/;
      const questionMatch = response.match(questionPattern);
      if (questionMatch) {
        clarifyingQuestion = questionMatch[1].trim();
      }

      // Check for table creation JSON
      const jsonPattern = /\{[\s\S]*"action"\s*:\s*"create_tables"[\s\S]*\}/;
      const match = response.match(jsonPattern);
      if (match) {
        jsonMatch = JSON.parse(match[0]);
        continueNeeded = jsonMatch.continueNeeded || false;
      }

      // Check for completion tag
      const completePattern = /<all_tables_complete>/;
      allTablesComplete = completePattern.test(response);
    } catch (e) {
      // Not JSON, treat as a question
    }

    // If there's a clarifying question, return it without creating tables
    if (clarifyingQuestion) {
      return res.json({
        assistantMessage: clarifyingQuestion,
        isClarifyingQuestion: true,
        continueNeeded: false,
      });
    }

    if (jsonMatch && jsonMatch.action === "create_tables" && jsonMatch.tables) {
      // Create the tables as proposed changes
      const changeIds: string[] = [];

      for (const table of jsonMatch.tables) {
        const changeId = uuidv4();
        const change: ProposedChange = {
          id: changeId,
          type: "CREATE_TABLE",
          status: "pending",
          payload: {
            tableName: table.tableName,
            schema: table.schema || "public",
            columns: table.columns || [],
            primaryKey: table.primaryKey || [],
            foreignKeys: table.foreignKeys || [],
          },
          createdAt: new Date().toISOString(),
          appliedLocally: false,
        };

        // Generate SQL preview using LLM
        change.sqlPreview = await llmSqlGenerator.generateSQL(change);

        proposedChanges.set(changeId, change);
        changeIds.push(changeId);
      }

      // Build assistant message
      let assistantMessage = `I've created ${jsonMatch.tables.length} table(s) for you.`;

      if (continueNeeded && !allTablesComplete) {
        assistantMessage +=
          " These tables have dependencies. Please type 'continue' or 'next' to create the remaining tables, or describe what else you need.";
      } else if (allTablesComplete) {
        assistantMessage += " All tables have been created successfully!";
      }

      return res.json({
        changeIds,
        assistantMessage,
        continueNeeded,
        allTablesComplete,
        isClarifyingQuestion: false,
      });
    } else {
      // Return the response as a question/message
      return res.json({
        assistantMessage: response,
        isClarifyingQuestion: true,
        continueNeeded: false,
      });
    }
  } catch (error: any) {
    console.error("AI Assistant error:", error);
    return res.status(500).json({
      error: error.message || "Failed to process AI Assistant request",
    });
  }
});

/**
 * POST /api/changes/from-sql
 * Create a proposed change from raw SQL
 */
router.post("/from-sql", async (req: Request, res: Response) => {
  try {
    const { sql } = req.body;

    if (!sql || !sql.trim()) {
      return res.status(400).json({
        error: "sql is required",
      });
    }

    const changeId = uuidv4();
    const change: ProposedChange = {
      id: changeId,
      type: "EXECUTE_SQL" as any,
      status: "pending",
      payload: {
        sql: sql.trim(),
      } as any,
      sqlPreview: sql.trim(),
      createdAt: new Date().toISOString(),
      appliedLocally: false,
    };

    // Store the change
    proposedChanges.set(changeId, change);
    console.log(`SQL proposal ${changeId}:`, change);

    return res.json({
      changeId,
      change,
      message: "SQL proposal created successfully",
    });
  } catch (error: any) {
    console.error("SQL proposal error:", error);
    return res.status(500).json({
      error: error.message || "Failed to create SQL proposal",
    });
  }
});

export default router;
