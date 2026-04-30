import {
  getServices,
  getGithubService,
  getLLMFactory,
  getPRDescriptionService,
} from "./server-proxy";
import preflightFixer from "./preflight-fixer";
import {
  promptForRedWarning,
  promptForAmberWarning,
} from "../prompts/warnings.prompts";
import console from "console";
import process from "process";
import fs from "fs";
import path from "path";

export interface SchemaRunnerArgs {
  app: string;
  sprint: string;
  author: string;
  change: string;
  dryRun: boolean;
  interactive: boolean;
  groupChangesets: boolean;
  groupFiles: boolean;
}

export async function runSchemaRunner(args: SchemaRunnerArgs): Promise<void> {
  console.log("✓ Schema introspected");

  // Parse natural language change via LLM into a MigrationIntent-like JSON
  const system = {
    role: "system" as const,
    content:
      'You are a migration intent parser. Receive a short natural-language instruction to modify a PostgreSQL schema and return ONLY valid JSON with shape: { "operation": "CREATE_TABLE|ALTER_TABLE|DROP_TABLE|EXECUTE_SQL", "confidence": "high|low", "reasoning": string, "payload": object }. Payload should contain necessary fields for the operation (tableName, schema, columns, sql, etc.). For CREATE_TABLE, include optional seedData rows when the request mentions seed rows, fixtures, or mock data.',
  };
  const user = { role: "user" as const, content: args.change };

  let intentText = "";
  try {
    try {
      const envCandidates = [
        path.resolve(__dirname, "..", "..", "..", ".env"),
        path.resolve(__dirname, "..", "..", ".env"),
      ];
      let envPath: string | null = null;
      for (const c of envCandidates) {
        if (fs.existsSync(c)) {
          envPath = c;
          break;
        }
      }
      if (envPath) {
        const raw = fs.readFileSync(envPath, "utf8");
        const match = raw.match(/^OPENROUTER_API_KEY=(.+)$/m);
        if (match) {
          const rawKey = match[1].trim().replace(/^"|"$|^'|'$/g, "");
          if (rawKey && rawKey.length > 20) {
            process.env.OPENROUTER_API_KEY = rawKey;
          }
        }
      }
    } catch (e) {
      // ignore
    }

    // Now construct LLM provider (after possible env override)
    const llmModule = await getLLMFactory();
    const llmFactory = llmModule.LLMFactory;
    const llm = llmFactory.getProvider();

    intentText = await llm.generateCompletion([system as any, user as any], {
      temperature: 0,
      maxTokens: 800,
    });
  } catch (e: any) {
    console.error("LLM parse error:", e?.message || e);
    process.exit(1);
  }

  let intent: any;
  try {
    // Try to extract JSON from the model output
    const jsonStart = intentText.indexOf("{");
    const jsonStr = jsonStart >= 0 ? intentText.slice(jsonStart) : intentText;
    intent = JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse intent JSON from LLM response:", intentText);
    process.exit(1);
  }

  if (intent.confidence === "low") {
    if (args.interactive) {
      console.log(
        "⚠ Low confidence interpretation:",
        intent.reasoning || intent,
      );
      const confirm = await promptForRedWarning(
        "Type CONFIRM to proceed with this low-confidence interpretation",
      );
      if (!confirm) {
        console.error("Aborted by user");
        process.exit(1);
      }
    } else {
      console.error("Low confidence interpretation in non-interactive mode");
      process.exit(1);
    }
  }

  console.log(`✓ Change parsed: ${intent.reasoning || args.change}`);

  // Normalize LLM payload to service-compatible format
  const normalizedPayload = normalizeLLMPayload(
    intent.operation,
    intent.payload,
  );

  // Build a ProposedChange compatible object
  const proposedChange = {
    id: `cli-${Date.now()}`,
    type: intent.operation || "EXECUTE_SQL",
    status: "pending",
    payload: normalizedPayload,
    createdAt: new Date().toISOString(),
  } as any;

  // Compute next changeset id by reading remote changeset.xml when possible
  let nextId = `migration-${Date.now()}`;
  try {
    const githubModule = await getGithubService();
    const githubService = githubModule.githubService;
    const xml = await githubService.fetchChangesetXml(args.app, undefined);
    const lastNumber = githubService.parseLastChangesetId(xml);
    const prefix =
      githubService.extractApplicationPrefix(xml) ||
      args.app.replace(/[^a-z0-9]+/gi, "-");
    nextId = `${prefix}-${lastNumber + 1}`;
  } catch (e) {
    // fallback to timestamp-based id
    nextId = `${args.app.replace(/[^a-z0-9]+/gi, "-")}-${Date.now()}`;
  }

  // Generate changeset using liquibase generator
  const servicesModule = await getServices();
  const { liquibaseGenerator } = servicesModule;
  const changeset = liquibaseGenerator.generateChangesetDefinition(
    proposedChange,
    nextId,
    args.app,
    args.sprint,
    args.author,
    intent.reasoning || null,
  );

  console.log(`✓ Changeset generated: ${changeset.id}`);

  // Create batch
  const batch = {
    changesets: [changeset],
    aggregated: args.groupChangesets,
    sqlFilesGrouped: args.groupFiles,
    author: args.author,
    targetApplication: args.app,
    targetSprint: args.sprint,
    prTitle: `${args.app}/${args.sprint}: ${changeset.comment}`,
    prDescription: changeset.comment || "",
  };

  // Run LLM review (preflight approximation)
  const servicesModule2 = await getServices();
  const lbGen = servicesModule2.liquibaseGenerator;
  let reviewed = await lbGen.reviewChangesets([changeset]);
  let reviews = reviewed[0].reviews || [];
  let errors = reviews
    .filter((r: any) => r.severity === "high")
    .map((r: any) => r.message);
  let warnings = reviews
    .filter((r: any) => r.severity === "medium" || r.severity === "low")
    .map((r: any) => r.message);

  // Attempt auto-fixes for common CLI auto-fixable issues
  const { changesets: fixed, fixes } = await preflightFixer.applyAutoFixes([
    changeset,
  ]);
  if (fixes.length > 0) {
    console.log("Applied auto-fixes:");
    fixes.forEach((f) => console.log(`  - ${f}`));
    // re-run review after fixes
    reviewed = await lbGen.reviewChangesets(fixed as any);
    reviews = reviewed[0].reviews || [];
    errors = reviews
      .filter((r: any) => r.severity === "high")
      .map((r: any) => r.message);
    warnings = reviews
      .filter((r: any) => r.severity === "medium" || r.severity === "low")
      .map((r: any) => r.message);
  }

  if (errors.length > 0) {
    console.error("✗ Preflight failed:");
    errors.forEach((err: any) => console.error(`  - ${err}`));
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn("⚠ Warnings:");
    warnings.forEach((warn: any) => console.warn(`  - ${warn}`));
    if (args.interactive) {
      const confirm = await promptForAmberWarning("Continue anyway?");
      if (!confirm) {
        console.error("Aborted by user");
        process.exit(1);
      }
    }
  }
  console.log("✓ Preflight passed");

  // Print preview
  console.log("\n=== Changeset Preview ===");
  console.log(changeset.xmlContent);

  // Build PR title and description using the shared service (matching server application pattern)
  const prDescriptionModule = await getPRDescriptionService();
  const { generatePrText } = prDescriptionModule;

  // Ask LLM for concise PR title + 1-2 line description (preferred)
  const generated = await generatePrText([changeset], args.app, args.sprint);
  const prTitle = generated.title;
  const prDescription = generated.description;

  console.log("\n=== PR Title ===");
  console.log(prTitle);
  console.log("\n=== PR Description ===");
  console.log(prDescription);

  if (args.dryRun) {
    console.log("\n✓ Dry run complete");
    return;
  }

  // Require explicit confirmation before creating PR in interactive mode
  if (args.interactive) {
    const confirm = await promptForRedWarning("Create PR with this changeset?");
    if (!confirm) {
      console.error("Aborted by user");
      process.exit(1);
    }
  }

  const branch = `migration/${args.app}/${args.sprint}/${changeset.id}`.replace(
    /[^a-zA-Z0-9_\-/]/g,
    "-",
  );

  let existingXml = "";
  try {
    const githubModule = await getGithubService();
    const githubService = githubModule.githubService;
    existingXml = await githubService.fetchChangesetXml(args.app);
  } catch (e) {
    existingXml = `<?xml version="1.0" encoding="UTF-8"?>\n<databaseChangeLog>\n</databaseChangeLog>`;
  }

  const newXml = liquibaseGenerator.appendToChangesetXml(
    existingXml,
    [changeset.xmlContent],
    changeset.comment || null,
  );

  const files: any[] = [];
  files.push({
    path: `${args.app}/changeset.xml`,
    message: `Add ${changeset.id} changeset`,
    content: newXml,
  });

  if (changeset.sqlFiles && Array.isArray(changeset.sqlFiles)) {
    for (const f of changeset.sqlFiles) {
      files.push({
        path: f.path,
        message: `Add SQL file ${f.path}`,
        content: f.content,
      });
    }
  }

  const prInput = {
    branch,
    title: prTitle,
    description: prDescription,
    files,
  };

  const githubModule = await getGithubService();
  const githubService = githubModule.githubService;
  const pr = await githubService.createPullRequest(prInput);
  console.log(`✓ PR created: ${pr.prUrl}`);
}

/**
 * Transform LLM intent payload to service-compatible format
 * Handles mapping from LLM's simplified structure to required Liquibase payload schema
 */
function normalizeLLMPayload(operation: string, rawPayload: any): any {
  if (!rawPayload) {
    return { sql: "" };
  }

  switch (operation) {
    case "ALTER_TABLE": {
      // LLM may provide addColumn as single object; service expects addedColumns as array
      const normalized: any = {
        tableName: rawPayload.tableName || "unknown",
        schema: rawPayload.schema || "public",
      };

      // Handle addColumn -> addedColumns transformation
      // LLM may use: addColumn (singular), addColumns, or addedColumns
      if (rawPayload.addColumn) {
        normalized.addedColumns = [
          normalizeColumnDefinition(rawPayload.addColumn),
        ];
      } else if (rawPayload.addColumns) {
        normalized.addedColumns = Array.isArray(rawPayload.addColumns)
          ? rawPayload.addColumns.map(normalizeColumnDefinition)
          : [normalizeColumnDefinition(rawPayload.addColumns)];
      } else if (rawPayload.addedColumns) {
        normalized.addedColumns = rawPayload.addedColumns.map(
          normalizeColumnDefinition,
        );
      } else {
        normalized.addedColumns = [];
      }

      // Handle removedColumns
      if (rawPayload.removedColumns) {
        normalized.removedColumns = Array.isArray(rawPayload.removedColumns)
          ? rawPayload.removedColumns.map(normalizeColumnDefinition)
          : [normalizeColumnDefinition(rawPayload.removedColumns)];
      } else {
        normalized.removedColumns = [];
      }

      // Handle modifiedColumns
      normalized.modifiedColumns = rawPayload.modifiedColumns || [];
      normalized.addedForeignKeys = rawPayload.addedForeignKeys || [];
      normalized.removedForeignKeys = rawPayload.removedForeignKeys || [];

      return normalized;
    }

    case "CREATE_TABLE": {
      const normalized: any = {
        tableName: rawPayload.tableName || "unknown",
        schema: rawPayload.schema || "public",
        columns: (rawPayload.columns || []).map(normalizeColumnDefinition),
        primaryKey: rawPayload.primaryKey || [],
        foreignKeys: rawPayload.foreignKeys || [],
        seedData: normalizeSeedData(
          rawPayload.seedData || rawPayload.seedRows || rawPayload.rows || [],
        ),
      };
      return normalized;
    }

    case "DROP_TABLE": {
      return {
        tableName: rawPayload.tableName || "unknown",
        schema: rawPayload.schema || "public",
        cascade: rawPayload.cascade || false,
      };
    }

    case "EXECUTE_SQL":
    default: {
      return rawPayload.sql ? { sql: rawPayload.sql } : { sql: "" };
    }
  }
}

/**
 * Ensure a column definition has all required fields
 */
function normalizeColumnDefinition(col: any): any {
  const constraintValues = Array.isArray(col.constraints)
    ? col.constraints.map((constraint: unknown) =>
        String(constraint).toUpperCase(),
      )
    : typeof col.constraints === "string"
      ? [String(col.constraints).toUpperCase()]
      : [];

  const isPrimaryKey =
    col.isPrimaryKey === true || constraintValues.includes("PRIMARY KEY");
  const nullable =
    col.nullable !== undefined
      ? col.nullable
      : !(constraintValues.includes("NOT NULL") || isPrimaryKey);

  return {
    name: col.name || "unknown",
    type: col.type || "VARCHAR",
    nullable,
    defaultValue:
      col.defaultValue !== undefined
        ? col.defaultValue
        : col.default !== undefined
          ? col.default
          : null,
    isPrimaryKey,
    ordinalPosition: col.ordinalPosition,
    charMaxLength: col.charMaxLength,
  };
}

function normalizeSeedData(
  rows: unknown,
): Array<Record<string, string | number | boolean | null>> {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .filter((row): row is Record<string, unknown> => {
      return !!row && typeof row === "object" && !Array.isArray(row);
    })
    .map((row) => {
      const normalizedRow: Record<string, string | number | boolean | null> =
        {};

      for (const [key, value] of Object.entries(row)) {
        if (value === undefined) {
          continue;
        }

        if (
          value === null ||
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          normalizedRow[key] = value;
        } else {
          normalizedRow[key] = String(value);
        }
      }

      return normalizedRow;
    });
}
