import {
  ProposedChange,
  CreateTablePayload,
  AlterTablePayload,
  DropTablePayload,
} from "../types/index";
import { LLMFactory, LLMMessage } from "./llm";

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

    // Cache the result
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
    const hasAddedColumns = p.addedColumns?.length;
    const hasRemovedColumns = p.removedColumns?.length;
    const hasModifiedColumns = p.modifiedColumns?.length;
    const hasAddedFKs = p.addedForeignKeys?.length;
    const hasRemovedFKs = p.removedForeignKeys?.length;

    if (hasAddedColumns) {
      lines.push(
        "ADD COLUMNS: " +
          p.addedColumns
            .map(
              (c) =>
                `${c.name} ${c.type}${!c.nullable ? " NOT NULL" : ""}${c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ""}`,
            )
            .join(", "),
      );
    }

    if (hasRemovedColumns) {
      const droppedCols = p.removedColumns
        .map((c) => {
          const colName = typeof c === "string" ? c : c.name;
          const isFk = typeof c === "string" ? false : c.isForeignKey;
          return isFk ? `${colName} (FK)` : colName;
        })
        .join(", ");
      lines.push("DROP COLUMNS: " + droppedCols);
      const hasFk = p.removedColumns.some((c) =>
        typeof c === "string" ? false : c.isForeignKey,
      );
      if (hasFk) {
        lines.push("Note: Some columns have foreign keys - may need CASCADE");
      }
    }

    if (hasModifiedColumns) {
      lines.push(
        "MODIFY COLUMNS: " +
          p.modifiedColumns
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
          p.addedForeignKeys
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
          p.removedForeignKeys
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
