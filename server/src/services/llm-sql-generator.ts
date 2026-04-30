import {
  ProposedChange,
  CreateTablePayload,
  AlterTablePayload,
  DropTablePayload,
} from "../types/index";
import { LLMFactory, LLMMessage } from "./llm.js";

class LLMSqlGenerator {
  private sqlCache = new Map<string, string>();

  /**
   * Generate SQL from a ProposedChange using LLM
   * Returns cached SQL if change.id already exists
   */
  async generateSQL(change: ProposedChange): Promise<string> {
    // Check cache first
    if (this.sqlCache.has(change.id)) {
      return this.sqlCache.get(change.id)!;
    }

    if (change.type === "CREATE_TABLE") {
      const directSql = this.generateCreateTableSQL(
        change.payload as CreateTablePayload,
      );
      this.sqlCache.set(change.id, directSql);
      return directSql;
    }

    if (change.type === "DROP_TABLE") {
      const directSql = this.generateDropTableSQL(
        change.payload as DropTablePayload,
      );
      this.sqlCache.set(change.id, directSql);
      return directSql;
    }

    const payloadStr = this.serializePayload(change);
    const messages: LLMMessage[] = [
      {
        role: "system",
        content:
          "You are a PostgreSQL expert. Generate valid PostgreSQL DDL only. No explanations, comments, or markdown. Return pure SQL.",
      },
      {
        role: "user",
        content: `Generate PostgreSQL SQL:\n${payloadStr}`,
      },
    ];

    const provider = LLMFactory.getProvider();
    const sql = await provider.generateCompletion(messages);
    const cleaned = this.cleanSQL(sql);

    this.sqlCache.set(change.id, cleaned);
    return cleaned;
  }

  /**
   * Only serialize changed fields to minimize token usage
   */
  private serializePayload(change: ProposedChange): string {
    switch (change.type) {
      case "CREATE_TABLE":
        return this.serializeCreateTable(change.payload as CreateTablePayload);
      case "ALTER_TABLE":
        return this.serializeAlterTable(change.payload as AlterTablePayload);
      case "DROP_TABLE":
        return this.serializeDropTable(change.payload as DropTablePayload);
      default:
        return "";
    }
  }

  private serializeCreateTable(p: CreateTablePayload): string {
    const lines: string[] = ["CREATE TABLE " + p.tableName];
    lines.push(
      p.columns
        .map(
          (c) =>
            `${c.name} ${c.type}${!c.nullable ? " NOT NULL" : ""}${c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ""}`,
        )
        .join(", "),
    );
    if (p.primaryKey?.length) {
      lines.push(`PRIMARY KEY: ${p.primaryKey.join(",")}`);
    }
    if (p.foreignKeys?.length) {
      lines.push(
        ...p.foreignKeys.map(
          (fk) =>
            `FK: ${fk.column} -> ${fk.referencedTable}(${fk.referencedColumn})`,
        ),
      );
    }
    return lines.join("\n");
  }

  private serializeAlterTable(p: AlterTablePayload): string {
    const lines: string[] = ["ALTER TABLE " + p.tableName];

    // Only include changes that are present
    const addedColumns = p.addedColumns ?? [];
    const removedColumns = p.removedColumns ?? [];
    const modifiedColumns = p.modifiedColumns ?? [];
    const addedForeignKeys = p.addedForeignKeys ?? [];
    const removedForeignKeys = p.removedForeignKeys ?? [];

    const hasAddedColumns = addedColumns.length > 0;
    const hasRemovedColumns = removedColumns.length > 0;
    const hasModifiedColumns = modifiedColumns.length > 0;
    const hasAddedFKs = addedForeignKeys.length > 0;
    const hasRemovedFKs = removedForeignKeys.length > 0;

    if (hasAddedColumns) {
      lines.push(
        "ADD COLUMNS: " +
          addedColumns
            .map(
              (c) =>
                `${c.name} ${c.type}${!c.nullable ? " NOT NULL" : ""}${c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ""}`,
            )
            .join(", "),
      );
    }

    if (hasRemovedColumns) {
      const droppedCols = removedColumns
        .map((c) => {
          const colName = typeof c === "string" ? c : c.name;
          const isFk = typeof c === "string" ? false : c.isForeignKey;
          return isFk ? `${colName} (FK)` : colName;
        })
        .join(", ");
      lines.push("DROP COLUMNS: " + droppedCols);
      const hasFk = removedColumns.some((c) =>
        typeof c === "string" ? false : c.isForeignKey,
      );
      if (hasFk) {
        lines.push("Note: Some columns have foreign keys - may need CASCADE");
      }
    }

    if (hasModifiedColumns) {
      lines.push(
        "MODIFY COLUMNS: " +
          modifiedColumns
            .map((m) => {
              const changes: string[] = [];
              if (m.oldDefinition.name !== m.newDefinition.name) {
                changes.push(
                  `${m.oldDefinition.name} -> ${m.newDefinition.name}`,
                );
              }
              if (m.oldDefinition.type !== m.newDefinition.type) {
                changes.push(
                  `type: ${m.oldDefinition.type} -> ${m.newDefinition.type}`,
                );
              }
              if (m.oldDefinition.nullable !== m.newDefinition.nullable) {
                changes.push(
                  `nullable: ${m.oldDefinition.nullable} -> ${m.newDefinition.nullable}`,
                );
              }
              if (
                m.oldDefinition.defaultValue !== m.newDefinition.defaultValue
              ) {
                changes.push(
                  `default: ${m.oldDefinition.defaultValue} -> ${m.newDefinition.defaultValue}`,
                );
              }
              return `${m.oldDefinition.name}: ${changes.join(", ")}`;
            })
            .join("; "),
      );
    }

    if (hasAddedFKs) {
      lines.push(
        "ADD FKS: " +
          addedForeignKeys
            .map(
              (fk) =>
                `${fk.column} -> ${fk.referencedTable}(${fk.referencedColumn})`,
            )
            .join(", "),
      );
    }

    if (hasRemovedFKs) {
      lines.push(
        "DROP FKS: " +
          removedForeignKeys
            .map((fk) => (typeof fk === "string" ? fk : fk.constraintName))
            .join(", "),
      );
    }

    // If no changes at all, throw error
    if (
      !hasAddedColumns &&
      !hasRemovedColumns &&
      !hasModifiedColumns &&
      !hasAddedFKs &&
      !hasRemovedFKs
    ) {
      lines.push("ERROR: No changes specified");
    }

    return lines.join("\n");
  }

  private serializeDropTable(p: DropTablePayload): string {
    let line = "DROP TABLE " + p.tableName;
    if (p.cascade) line += " CASCADE";
    return line;
  }

  private generateCreateTableSQL(payload: CreateTablePayload): string {
    const schema = payload.schema || "public";
    const columnDefinitions = payload.columns.map((column) => {
      let definition = `"${column.name}" ${column.type}`;
      if (!column.nullable) {
        definition += " NOT NULL";
      }
      if (column.defaultValue !== null && column.defaultValue !== undefined) {
        definition += ` DEFAULT ${column.defaultValue}`;
      }
      return definition;
    });

    if (payload.primaryKey && payload.primaryKey.length > 0) {
      const pkColumns = payload.primaryKey
        .map((column) => `"${column}"`)
        .join(", ");
      columnDefinitions.push(`PRIMARY KEY (${pkColumns})`);
    }

    if (payload.foreignKeys && payload.foreignKeys.length > 0) {
      payload.foreignKeys.forEach((fk) => {
        const referencedParts = fk.referencedTable.split(".");
        const referencedSchema =
          referencedParts.length > 1 ? referencedParts[0] : schema;
        const referencedTableName =
          referencedParts.length > 1 ? referencedParts[1] : fk.referencedTable;
        columnDefinitions.push(
          `CONSTRAINT "${fk.constraintName}" FOREIGN KEY ("${fk.column}") REFERENCES "${referencedSchema}"."${referencedTableName}"("${fk.referencedColumn}") ON DELETE ${fk.onDelete}`,
        );
      });
    }

    return `CREATE TABLE "${schema}"."${payload.tableName}" (\n  ${columnDefinitions.join(",\n  ")}\n);`;
  }

  private generateDropTableSQL(payload: DropTablePayload): string {
    const schema = payload.schema || "public";
    const cascadeSuffix = payload.cascade ? " CASCADE" : "";
    return `DROP TABLE "${schema}"."${payload.tableName}"${cascadeSuffix};`;
  }

  /**
   * Clean LLM response: strip markdown, comments, extra whitespace
   */
  private cleanSQL(sql: string): string {
    return sql
      .replace(/^```[\w]*\n?/gm, "") // Remove markdown code blocks
      .replace(/\n?```$/gm, "")
      .replace(/^--.*$/gm, "") // Remove SQL comments
      .replace(/\/\*[\s\S]*?\*\//g, "") // Remove block comments
      .replace(/\n\s*\n/g, "\n") // Remove blank lines
      .trim();
  }

  /**
   * Clear cache for testing or reset
   */
  clearCache(): void {
    this.sqlCache.clear();
  }
}

export const llmSqlGenerator = new LLMSqlGenerator();
