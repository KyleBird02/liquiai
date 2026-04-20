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
 * Ask AI Assistant to create schema and SQL data changes based on user description
 */
router.post("/ai-assistant", async (req: Request, res: Response) => {
  try {
    const { conversationHistory } = req.body as {
      conversationHistory?: Array<{
        role: "user" | "assistant";
        content: string;
      }>;
    };

    if (!conversationHistory || !Array.isArray(conversationHistory)) {
      return res.status(400).json({
        error: "conversationHistory is required and must be an array",
      });
    }

    const snapshot = schemaService.getCurrentSnapshot();
    const existingTableSet = new Set<string>();
    const snapshotSummary: string[] = [];

    if (snapshot) {
      snapshot.tables.forEach((table) => {
        const key = `${table.schema}.${table.name}`.toLowerCase();
        existingTableSet.add(key);
        snapshotSummary.push(`${table.schema}.${table.name}`);
      });
    }

    const pendingCreateTableSet = new Set<string>();
    for (const change of proposedChanges.values()) {
      if (change.type === "CREATE_TABLE") {
        const payload = change.payload as any;
        const schema = payload.schema || "public";
        pendingCreateTableSet.add(
          `${schema}.${payload.tableName}`.toLowerCase(),
        );
      }
    }

    const compactHistory = conversationHistory.slice(-6).map((message) => ({
      role: message.role,
      content: (message.content || "").slice(0, 400),
    }));

    const systemMessage = {
      role: "system" as const,
      content: `You are a PostgreSQL schema and data assistant.

Current LOCAL schema knowledge base (latest captured snapshot):
${snapshotSummary.length > 0 ? snapshotSummary.slice(0, 120).join("\n") : "No snapshot currently loaded."}

Rules:
- Never create a table that already exists in the knowledge base.
- If user asks for an existing table, ask them to change the input using:
  <clarifying_question>Table public.table_name already exists. Please rename the table or request an alteration instead.</clarifying_question>
- For any data insertion/population request, ALWAYS return SQL statements (never column-value JSON data payloads).
- When inserting many rows into the same table, ALWAYS use one multi-row INSERT statement with VALUES (...), (...), (...) instead of many single-row INSERT statements.
- Ask clarifying questions only when required and wrap them in <clarifying_question>...</clarifying_question>.
- If ready, return one JSON object only.
- Do not include markdown fences.
- Always set continueNeeded=false.
- Append <all_tables_complete></all_tables_complete> after the JSON when complete.

Allowed actions:
- create_tables
- add_data_sql
- create_tables_and_add_data_sql

Response schema:
{
  "action": "create_tables_and_add_data_sql",
  "continueNeeded": false,
  "tables": [
    {
      "tableName": "table_name",
      "schema": "public",
      "columns": [
        {"name":"id","type":"SERIAL","nullable":false,"defaultValue":null,"isPrimaryKey":true}
      ],
      "primaryKey": ["id"],
      "foreignKeys": [
        {"constraintName":"fk_posts_user_id","column":"user_id","referencedTable":"users","referencedColumn":"id","onDelete":"CASCADE"}
      ]
    }
  ],
  "sqlStatements": [
    {"sql":"INSERT INTO public.table_name (col1, col2) VALUES ('value1_row1', 'value2_row1'), ('value1_row2', 'value2_row2'), ('value1_row3', 'value2_row3');", "fileName":"add_users_to_transactions.sql"}
  ]
}`,
    };

    const messages = [
      systemMessage,
      ...compactHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    const llmProvider = LLMFactory.getProvider();
    const response = await llmProvider.generateCompletion(messages, {
      temperature: 0.1,
      maxTokens: 1400,
      enableReasoning: false,
    });

    if (!response) {
      return res.status(500).json({
        error: "Failed to get LLM response",
      });
    }

    let jsonMatch: any = null;
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

      // Check for action JSON
      const jsonPattern =
        /\{[\s\S]*"action"\s*:\s*"(create_tables|add_data_sql|create_tables_and_add_data_sql)"[\s\S]*\}/;
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

    if (
      jsonMatch &&
      [
        "create_tables",
        "add_data_sql",
        "create_tables_and_add_data_sql",
      ].includes(jsonMatch.action)
    ) {
      const action = jsonMatch.action;
      const requestedTables = Array.isArray(jsonMatch.tables)
        ? jsonMatch.tables
        : [];
      type SqlStatementEntry = { sql: string; fileName?: string } | null;
      const requestedSqlEntries = Array.isArray(jsonMatch.sqlStatements)
        ? jsonMatch.sqlStatements
            .map((entry: unknown): SqlStatementEntry => {
              if (typeof entry === "string") {
                return {
                  sql: entry,
                  fileName: undefined as string | undefined,
                };
              }
              if (
                entry &&
                typeof entry === "object" &&
                typeof (entry as any).sql === "string"
              ) {
                const rawFileName = (entry as any).fileName;
                return {
                  sql: (entry as any).sql,
                  fileName:
                    typeof rawFileName === "string" ? rawFileName : undefined,
                };
              }
              return null;
            })
            .filter(
              (
                entry: SqlStatementEntry,
              ): entry is { sql: string; fileName?: string } => entry !== null,
            )
        : [];

      if (requestedTables.length === 0 && requestedSqlEntries.length === 0) {
        return res.json({
          assistantMessage:
            "I need more detail. Please describe the tables to create and/or the data to insert.",
          isClarifyingQuestion: true,
          continueNeeded: false,
        });
      }

      const duplicateTargets: string[] = [];
      const seenInRequest = new Set<string>();

      for (const table of requestedTables) {
        const schema = (table.schema || "public").toLowerCase();
        const tableName = (table.tableName || "").toLowerCase();
        const key = `${schema}.${tableName}`;

        if (
          existingTableSet.has(key) ||
          pendingCreateTableSet.has(key) ||
          seenInRequest.has(key)
        ) {
          duplicateTargets.push(key);
        }

        seenInRequest.add(key);
      }

      if (duplicateTargets.length > 0) {
        const unique = Array.from(new Set(duplicateTargets));
        const assistantMessage =
          `The following table(s) already exist in your LOCAL snapshot or pending changes: ${unique.join(", ")}. ` +
          "Please fix your input by renaming these tables or request ALTER operations instead.";

        return res.json({
          assistantMessage,
          isClarifyingQuestion: true,
          continueNeeded: false,
        });
      }

      const newlyCreatedTableSet = new Set<string>();
      requestedTables.forEach((table: any) => {
        const schema = (table.schema || "public").toLowerCase();
        const tableName = (table.tableName || "").toLowerCase();
        newlyCreatedTableSet.add(`${schema}.${tableName}`);
      });

      // Data additions must be SQL changes
      const sqlChangeIds: string[] = [];
      const invalidSqlStatements: string[] = [];
      const unknownSqlTables: string[] = [];
      const pendingSqlChanges: ProposedChange[] = [];
      const sqlGroupsByTable = new Map<
        string,
        {
          statements: string[];
          fileName?: string;
          hasMixedFileName: boolean;
        }
      >();

      const extractInsertTable = (statement: string): string | null => {
        const match = statement.match(
          /insert\s+into\s+((?:"?[a-zA-Z_][\w$]*"?\.)?"?[a-zA-Z_][\w$]*"?)/i,
        );
        if (!match) return null;

        const raw = match[1].replace(/"/g, "");
        if (raw.includes(".")) {
          const [schema, table] = raw.split(".");
          return `${schema.toLowerCase()}.${table.toLowerCase()}`;
        }
        return `public.${raw.toLowerCase()}`;
      };

      const stripLeadingSqlNoise = (statement: string): string => {
        let remaining = statement.trim();

        // Remove leading line comments and block comments.
        while (remaining.length > 0) {
          if (remaining.startsWith("--")) {
            const nextLine = remaining.indexOf("\n");
            remaining =
              nextLine >= 0 ? remaining.slice(nextLine + 1).trim() : "";
            continue;
          }

          if (remaining.startsWith("/*")) {
            const endComment = remaining.indexOf("*/");
            if (endComment < 0) {
              return "";
            }
            remaining = remaining.slice(endComment + 2).trim();
            continue;
          }

          break;
        }

        return remaining;
      };

      const isInsertOnlyDataSql = (statement: string): boolean => {
        const normalized = stripLeadingSqlNoise(statement).toLowerCase();
        if (!normalized) {
          return false;
        }

        // Allow wrappers and CTEs as long as INSERT exists and no destructive/other DDL or DML verbs exist.
        const hasInsert = /\binsert\s+into\b/i.test(normalized);
        if (!hasInsert) {
          return false;
        }

        const forbiddenVerbPattern =
          /\b(update|delete\s+from|drop\s+table|drop\s+column|alter\s+table|truncate\s+table|create\s+table)\b/i;
        return !forbiddenVerbPattern.test(normalized);
      };

      const extractInsertStatements = (statement: string): string[] => {
        const sql = stripLeadingSqlNoise(statement);
        if (!sql) return [];

        // Capture INSERT blocks up to semicolon (supports multi-line VALUES batches).
        const matches =
          sql.match(/insert\s+into[\s\S]*?;/gi)?.map((s) => s.trim()) || [];

        return matches.filter((s) => s.length > 0);
      };

      const addStatementToGroup = (sql: string, fileName?: string) => {
        const targetTable = extractInsertTable(sql);
        if (targetTable) {
          const existsInSnapshotOrPending =
            existingTableSet.has(targetTable) ||
            pendingCreateTableSet.has(targetTable) ||
            newlyCreatedTableSet.has(targetTable);

          if (!existsInSnapshotOrPending) {
            unknownSqlTables.push(targetTable);
            return;
          }
        }

        const groupKey = targetTable || "__generic__";
        const existingGroup = sqlGroupsByTable.get(groupKey);
        if (!existingGroup) {
          sqlGroupsByTable.set(groupKey, {
            statements: [sql],
            fileName,
            hasMixedFileName: false,
          });
        } else {
          existingGroup.statements.push(sql);
          if (
            fileName &&
            existingGroup.fileName &&
            existingGroup.fileName !== fileName
          ) {
            existingGroup.hasMixedFileName = true;
          }
          if (!existingGroup.fileName && fileName) {
            existingGroup.fileName = fileName;
          }
        }
      };

      for (const entry of requestedSqlEntries) {
        const sql = entry.sql.trim();
        if (!sql) continue;

        if (isInsertOnlyDataSql(sql)) {
          addStatementToGroup(sql, entry.fileName);
          continue;
        }

        // Auto-recover mixed SQL: keep only INSERT statements and discard unsafe ones.
        const recoveredInserts = extractInsertStatements(sql).filter((s) =>
          isInsertOnlyDataSql(s),
        );

        if (recoveredInserts.length === 0) {
          invalidSqlStatements.push(sql);
          continue;
        }

        recoveredInserts.forEach((insertSql) => {
          addStatementToGroup(insertSql, entry.fileName);
        });
      }

      sqlGroupsByTable.forEach((group) => {
        const changeId = uuidv4();
        const sqlBody = group.statements.join("\n\n");

        const sqlChange: ProposedChange = {
          id: changeId,
          type: "EXECUTE_SQL" as any,
          status: "pending",
          payload: {
            sql: sqlBody,
            fileName: group.hasMixedFileName ? undefined : group.fileName,
          } as any,
          sqlPreview: sqlBody,
          createdAt: new Date().toISOString(),
          appliedLocally: false,
        };

        pendingSqlChanges.push(sqlChange);
      });

      if (invalidSqlStatements.length > 0) {
        return res.json({
          assistantMessage:
            "Data additions must be SQL INSERT statements only. Please revise your request.",
          isClarifyingQuestion: true,
          continueNeeded: false,
        });
      }

      if (unknownSqlTables.length > 0) {
        const uniqueUnknown = Array.from(new Set(unknownSqlTables));
        return res.json({
          assistantMessage:
            `These SQL statements reference unknown table(s): ${uniqueUnknown.join(", ")}. ` +
            "Please create those tables first (or include them in the same request).",
          isClarifyingQuestion: true,
          continueNeeded: false,
        });
      }

      pendingSqlChanges.forEach((sqlChange) => {
        proposedChanges.set(sqlChange.id, sqlChange);
        sqlChangeIds.push(sqlChange.id);
      });

      // Create table proposals after all validations pass
      const creationResults = await Promise.all(
        requestedTables.map(async (table: any) => {
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

          // Generate SQL preview
          change.sqlPreview = await llmSqlGenerator.generateSQL(change);

          proposedChanges.set(changeId, change);
          return changeId;
        }),
      );

      const changeIds = [...creationResults, ...sqlChangeIds];

      // Build assistant message
      let assistantMessage = "I've prepared your requested changes.";

      if (requestedTables.length > 0) {
        assistantMessage += ` Created ${requestedTables.length} table proposal(s).`;
      }
      if (sqlChangeIds.length > 0) {
        assistantMessage += ` Added ${sqlChangeIds.length} SQL data change(s).`;
      }

      if (action === "add_data_sql" && requestedTables.length === 0) {
        assistantMessage += " Data additions were generated as SQL changes.";
      }

      if (continueNeeded && !allTablesComplete) {
        assistantMessage +=
          " Some dependencies remain. Please provide additional details to continue.";
      } else if (allTablesComplete) {
        assistantMessage += " All requested changes are ready for review.";
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
