import { Builder } from "xml2js";
import {
  ProposedChange,
  CreateTablePayload,
  AlterTablePayload,
  DropTablePayload,
  ColumnDefinition,
  ChangesetDefinition,
  ChangeReview,
  GridConfigPayload,
} from "../../types/index";
import { LLMFactory, LLMMessage } from "../../core/llm"; // Adjust based on your core paths
import { gridCSVGenerator } from "./grid-csv.service"; // Adjust based on your feature paths

export class LiquibaseGeneratorService {
  private author: string;

  constructor(author: string = "liquiai") {
    this.author = author;
  }

  /**
   * Generates the root Liquibase changelog XML wrapper (for /init).
   */
  generateMasterChangelogXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ext="http://www.liquibase.org/xml/ns/dbchangelog-ext"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog 
        http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-4.20.xsd
        http://www.liquibase.org/xml/ns/dbchangelog-ext 
        http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-ext.xsd">

    </databaseChangeLog>`;
  }

  shouldUseSqlFormat(change: ProposedChange): boolean {
    switch (change.type) {
      case "CREATE_TABLE":
      case "ALTER_TABLE":
      case "ADD_INDEX":
      case "DROP_INDEX":
        return false;
      case "DROP_TABLE":
        return false;
      case "EXECUTE_SQL":
        return true;
      case "GRID_CONFIG":
        return false;
      default:
        return false;
    }
  }

  generateChangesetDefinition(
    change: ProposedChange,
    changesetId: string,
    targetApplication: string,
    targetSprint: string,
    author: string,
    comment: string | null = null,
  ): ChangesetDefinition {
    if (change.type === "GRID_CONFIG") {
      return this.generateGridConfigChangesetDefinition(
        change,
        changesetId,
        targetApplication,
        targetSprint,
        author,
        comment,
      );
    }

    const useSqlFormat = this.shouldUseSqlFormat(change);
    const xmlContent = this.generateChangesetXml(
      change,
      changesetId,
      author,
      targetApplication,
      targetSprint,
    );

    let sqlFilePath: string | null = null;
    let sqlFileContent: string | null = null;
    let sqlFiles: Array<{ path: string; content: string }> | undefined;

    if (useSqlFormat) {
      sqlFilePath = this.generateSqlFileName(
        change,
        targetApplication,
        targetSprint,
      );
      sqlFileContent = this.generateSQL(change);
      sqlFiles = [{ path: sqlFilePath, content: sqlFileContent }];
    }

    return {
      id: changesetId,
      author,
      comment,
      changeType: useSqlFormat ? "sql" : "xml",
      change,
      sqlFilePath,
      sqlFileContent,
      sqlFiles,
      xmlContent,
      targetApplication,
      targetSprint,
      edited: false,
    };
  }

  private generateGridConfigChangesetDefinition(
    change: ProposedChange,
    changesetId: string,
    targetApplication: string,
    targetSprint: string,
    author: string,
    comment: string | null,
  ): ChangesetDefinition {
    const payload = change.payload as GridConfigPayload;
    const gridName = payload.gridName;
    const beforeColumns = payload.beforeColumns || [];
    const afterColumns = payload.afterColumns || [];
    const isNewGrid = beforeColumns.length === 0;

    const csvFiles: Array<{ path: string; content: string }> = [];

    if (isNewGrid) {
      const gridCsvPath = `${targetApplication}/${targetSprint}/grid_${gridName}.csv`;
      const attributesCsvPath = `${targetApplication}/${targetSprint}/grid_attributes_${gridName}.csv`;

      csvFiles.push({
        path: gridCsvPath,
        content: gridCSVGenerator.generateGridTableCSV({
          id: payload.gridId,
          grid_name: gridName,
        }),
      });

      csvFiles.push({
        path: attributesCsvPath,
        content: gridCSVGenerator.generateGridAttributesCSV(afterColumns),
      });
    } else {
      const updateCsv = gridCSVGenerator.generateGridAttributesUpdateCSV(
        beforeColumns,
        afterColumns,
      );
      const attributesUpdateCsvPath = `${targetApplication}/${targetSprint}/grid_attributes_${gridName}_update.csv`;

      csvFiles.push({
        path: attributesUpdateCsvPath,
        content: updateCsv.csv,
      });
    }

    const xmlContent = this.generateGridChangesetXml(
      changesetId,
      author,
      gridName,
      targetApplication,
      targetSprint,
      isNewGrid,
    );

    return {
      id: changesetId,
      author,
      comment,
      changeType: "xml",
      change,
      sqlFilePath: null,
      sqlFileContent: null,
      sqlFiles: csvFiles,
      xmlContent,
      targetApplication,
      targetSprint,
      edited: false,
    };
  }

  generateChangesetXml(
    change: ProposedChange,
    changesetId: string,
    author: string = this.author,
    targetApplication: string = "application",
    targetSprint: string = "sprint",
  ): string {
    let changeXml: any;

    switch (change.type) {
      case "CREATE_TABLE":
        changeXml = this.generateCreateTable(
          change.payload as CreateTablePayload,
        );
        break;
      case "ALTER_TABLE":
        changeXml = this.generateAlterTable(
          change.payload as AlterTablePayload,
        );
        break;
      case "DROP_TABLE":
        changeXml = this.generateDropTable(change.payload as DropTablePayload);
        break;
      case "EXECUTE_SQL": {
        const sqlFilePath = this.generateSqlFileName(
          change,
          targetApplication,
          targetSprint,
        );
        changeXml = {
          sqlFile: {
            $: { path: sqlFilePath, relativeToChangelogFile: "true" },
          },
        };
        break;
      }
      default:
        throw new Error(`Unsupported change type: ${change.type}`);
    }

    let changesetContent: any = {};
    if (Array.isArray(changeXml)) {
      for (const item of changeXml) {
        const key = Object.keys(item)[0];
        if (!changesetContent[key]) changesetContent[key] = [];
        changesetContent[key].push(item[key]);
      }
    } else {
      const key = Object.keys(changeXml)[0];
      changesetContent[key] = changeXml[key];
    }

    const changeSet = {
      changeSet: {
        $: { id: changesetId, author: author },
        ...changesetContent,
      },
    };

    const builder = new Builder({
      headless: true,
      xmldec: undefined,
      renderOpts: { pretty: true, indent: "    " },
    });
    let xml = builder.buildObject(changeSet);
    return xml
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n");
  }

  appendToChangesetXml(
    existingXml: string,
    changesetXmlBlocks: string[],
    comment?: string | null,
  ): string {
    const closingTag = "</databaseChangeLog>";
    const index = existingXml.lastIndexOf(closingTag);

    if (index === -1)
      throw new Error(
        "Invalid changeset.xml: missing </databaseChangeLog> tag",
      );

    let insertion = comment ? `\n    \n` : "\n";
    insertion += changesetXmlBlocks.join("\n\n") + "\n";

    return existingXml.substring(0, index) + insertion + closingTag;
  }

  private generateSqlFileName(
    change: ProposedChange,
    application: string,
    sprint: string,
  ): string {
    let filename = "";
    const changeSuffix = change.id ? change.id.slice(0, 8) : `${Date.now()}`;

    const sanitizeToken = (value: string): string =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60) || "data";

    const detectSqlTargetTable = (sql: string): string => {
      const insertMatch = sql.match(
        /insert\s+into\s+((?:"?[a-zA-Z_][\w$]*"?\.)?"?[a-zA-Z_][\w$]*"?)/i,
      );
      const updateMatch = sql.match(
        /update\s+((?:"?[a-zA-Z_][\w$]*"?\.)?"?[a-zA-Z_][\w$]*"?)/i,
      );
      const deleteMatch = sql.match(
        /delete\s+from\s+((?:"?[a-zA-Z_][\w$]*"?\.)?"?[a-zA-Z_][\w$]*"?)/i,
      );

      const target =
        insertMatch?.[1] || updateMatch?.[1] || deleteMatch?.[1] || "data";
      return sanitizeToken(target.replace(/"/g, "").replace(/\./g, "_"));
    };

    switch (change.type) {
      case "CREATE_TABLE":
        filename = `create_${(change.payload as CreateTablePayload).tableName}.sql`;
        break;
      case "ALTER_TABLE":
        filename = `alter_${(change.payload as AlterTablePayload).tableName}.sql`;
        break;
      case "DROP_TABLE":
        filename = `drop_${(change.payload as DropTablePayload).tableName}.sql`;
        break;
      case "EXECUTE_SQL": {
        const payload = change.payload as any;
        const sql = payload.sql || "";
        const aiProvidedFileName =
          typeof payload.fileName === "string" ? payload.fileName.trim() : "";

        if (
          aiProvidedFileName.length > 0 &&
          /^[a-zA-Z0-9._-]+\.sql$/.test(aiProvidedFileName)
        ) {
          filename = aiProvidedFileName;
          break;
        }

        const lowerSql = sql.toLowerCase();
        const targetToken = detectSqlTargetTable(sql);
        if (lowerSql.includes("insert"))
          filename = `insert_${targetToken}_${changeSuffix}.sql`;
        else if (lowerSql.includes("update"))
          filename = `update_${targetToken}_${changeSuffix}.sql`;
        else if (lowerSql.includes("delete"))
          filename = `delete_${targetToken}_${changeSuffix}.sql`;
        else filename = `migration_${targetToken}_${changeSuffix}.sql`;
        break;
      }
      default:
        filename = `migration_${changeSuffix}.sql`;
    }

    return `${application}/${sprint}/${filename}`;
  }

  private generateCreateTable(payload: CreateTablePayload): any {
    const { tableName, columns, foreignKeys } = payload;
    const columnElements = columns.map((col) => this.columnToXml(col));
    const constraints: any[] = [];

    if (foreignKeys && foreignKeys.length > 0) {
      foreignKeys.forEach((fk) => {
        constraints.push({
          foreignKeyConstraint: {
            $: {
              constraintName: fk.constraintName,
              baseColumnNames: fk.column,
              baseTableName: tableName,
              referencedTableName: fk.referencedTable,
              referencedColumnNames: fk.referencedColumn,
              onDelete: fk.onDelete,
            },
          },
        });
      });
    }

    return {
      createTable: {
        $: { tableName },
        column: columnElements,
        ...Object.assign({}, ...constraints),
      },
    };
  }

  private generateAlterTable(payload: AlterTablePayload): any {
    const {
      tableName,
      addedColumns = [],
      removedColumns = [],
      modifiedColumns = [],
      addedForeignKeys = [],
      removedForeignKeys = [],
    } = payload;

    const changes: any[] = [];

    addedColumns.forEach((col) => {
      changes.push({
        addColumn: { $: { tableName }, column: [this.columnToXml(col)] },
      });
    });

    removedColumns.forEach((col) => {
      changes.push({
        dropColumn: {
          $: {
            tableName,
            columnName: typeof col === "string" ? col : col.name,
          },
        },
      });
    });

    modifiedColumns.forEach((mod) => {
      const { oldDefinition, newDefinition } = mod;

      if (oldDefinition.name !== newDefinition.name) {
        changes.push({
          renameColumn: {
            $: {
              tableName,
              oldColumnName: oldDefinition.name,
              newColumnName: newDefinition.name,
            },
          },
        });
      }

      if (oldDefinition.type !== newDefinition.type) {
        changes.push({
          modifyDataType: {
            $: {
              tableName,
              columnName: newDefinition.name,
              newDataType: newDefinition.type,
            },
          },
        });
      }

      if (oldDefinition.nullable && !newDefinition.nullable) {
        changes.push({
          addNotNullConstraint: {
            $: {
              tableName,
              columnName: newDefinition.name,
              columnDataType: newDefinition.type,
            },
          },
        });
      } else if (!oldDefinition.nullable && newDefinition.nullable) {
        changes.push({
          dropNotNullConstraint: {
            $: {
              tableName,
              columnName: newDefinition.name,
              columnDataType: newDefinition.type,
            },
          },
        });
      }

      if (oldDefinition.defaultValue !== newDefinition.defaultValue) {
        if (
          newDefinition.defaultValue === null ||
          newDefinition.defaultValue === ""
        ) {
          changes.push({
            dropDefaultValue: {
              $: { tableName, columnName: newDefinition.name },
            },
          });
        } else {
          changes.push({
            addDefaultValue: {
              $: {
                tableName,
                columnName: newDefinition.name,
                defaultValue: newDefinition.defaultValue,
              },
            },
          });
        }
      }
    });

    addedForeignKeys.forEach((fk) => {
      changes.push({
        addForeignKeyConstraint: {
          $: {
            baseTableName: tableName,
            baseColumnNames: fk.column,
            constraintName: fk.constraintName,
            referencedTableName: fk.referencedTable,
            referencedColumnNames: fk.referencedColumn,
            onDelete: fk.onDelete || undefined,
          },
        },
      });
    });

    removedForeignKeys.forEach((fk) => {
      changes.push({
        dropForeignKeyConstraint: {
          $: {
            baseTableName: tableName,
            constraintName: typeof fk === "string" ? fk : fk.constraintName,
          },
        },
      });
    });

    if (changes.length === 0)
      throw new Error("No changes specified for ALTER TABLE");
    return changes.length === 1 ? changes[0] : changes;
  }

  private generateDropTable(payload: DropTablePayload): any {
    return { dropTable: { $: { tableName: payload.tableName } } };
  }

  private columnToXml(col: ColumnDefinition): any {
    const columnAttrs: any = { name: col.name, type: col.type };
    if (col.defaultValue) columnAttrs.defaultValue = col.defaultValue;

    const constraintAttrs: any = {};
    if (!col.nullable) constraintAttrs.nullable = "false";
    if (col.isPrimaryKey) constraintAttrs.primaryKey = "true";

    const result: any = { $: columnAttrs };
    if (Object.keys(constraintAttrs).length > 0)
      result.constraints = [{ $: constraintAttrs }];

    return result;
  }

  generateSQL(change: ProposedChange): string {
    const lines: string[] = ["-- Generated by Liquibase Migration Tool", ""];

    switch (change.type) {
      case "EXECUTE_SQL":
        return (change.payload as any).sql || "";
      case "CREATE_TABLE": {
        const payload = change.payload as CreateTablePayload;
        const cols = payload.columns
          .map((col) => {
            let def = `${col.name} ${col.type}`;
            if (!col.nullable) def += " NOT NULL";
            if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
            return def;
          })
          .join(",\n  ");
        let sql = `CREATE TABLE ${payload.tableName} (\n  ${cols}`;
        if (payload.primaryKey && payload.primaryKey.length > 0)
          sql += `,\n  PRIMARY KEY (${payload.primaryKey.join(", ")})`;
        sql += "\n);";
        lines.push(sql);
        break;
      }
      case "DROP_TABLE":
        lines.push(
          `DROP TABLE ${(change.payload as DropTablePayload).tableName};`,
        );
        break;
      case "ALTER_TABLE": {
        const payload = change.payload as AlterTablePayload;
        const tableFqn = payload.tableName;

        (payload.addedColumns || []).forEach((col) => {
          let def = `${col.name} ${col.type}`;
          if (!col.nullable) def += " NOT NULL";
          if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
          lines.push(`ALTER TABLE ${tableFqn} ADD COLUMN ${def};`);
        });

        (payload.removedColumns || []).forEach((col) => {
          lines.push(
            `ALTER TABLE ${tableFqn} DROP COLUMN ${typeof col === "string" ? col : col.name};`,
          );
        });

        (payload.modifiedColumns || []).forEach((mod) => {
          const { oldDefinition, newDefinition } = mod;
          if (oldDefinition.name !== newDefinition.name)
            lines.push(
              `ALTER TABLE ${tableFqn} RENAME COLUMN ${oldDefinition.name} TO ${newDefinition.name};`,
            );
          if (oldDefinition.type !== newDefinition.type)
            lines.push(
              `ALTER TABLE ${tableFqn} ALTER COLUMN ${newDefinition.name} TYPE ${newDefinition.type};`,
            );
          if (oldDefinition.nullable && !newDefinition.nullable)
            lines.push(
              `ALTER TABLE ${tableFqn} ALTER COLUMN ${newDefinition.name} SET NOT NULL;`,
            );
          else if (!oldDefinition.nullable && newDefinition.nullable)
            lines.push(
              `ALTER TABLE ${tableFqn} ALTER COLUMN ${newDefinition.name} DROP NOT NULL;`,
            );

          if (oldDefinition.defaultValue !== newDefinition.defaultValue) {
            if (
              newDefinition.defaultValue === null ||
              newDefinition.defaultValue === ""
            )
              lines.push(
                `ALTER TABLE ${tableFqn} ALTER COLUMN ${newDefinition.name} DROP DEFAULT;`,
              );
            else
              lines.push(
                `ALTER TABLE ${tableFqn} ALTER COLUMN ${newDefinition.name} SET DEFAULT '${newDefinition.defaultValue}';`,
              );
          }
        });

        (payload.addedForeignKeys || []).forEach((fk) => {
          lines.push(
            `ALTER TABLE ${tableFqn} ADD CONSTRAINT ${fk.constraintName} FOREIGN KEY (${fk.column}) REFERENCES ${fk.referencedTable} (${fk.referencedColumn})${fk.onDelete ? ` ON DELETE ${fk.onDelete}` : ""};`,
          );
        });

        (payload.removedForeignKeys || []).forEach((fk) => {
          lines.push(
            `ALTER TABLE ${tableFqn} DROP CONSTRAINT ${typeof fk === "string" ? fk : fk.constraintName};`,
          );
        });
        break;
      }
    }
    return lines.join("\n");
  }

  private quoteXmlAttribute(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  generateGridChangesetXml(
    changesetId: string,
    author: string,
    gridName: string,
    application: string,
    sprint: string,
    isNew: boolean = true,
  ): string {
    const operations: string[] = [];

    if (isNew) {
      const gridPath = `${application}/${sprint}/grid_${gridName}.csv`;
      const attributesPath = `${application}/${sprint}/grid_attributes_${gridName}.csv`;
      operations.push(
        `        <loadData file="${this.quoteXmlAttribute(gridPath)}" tableName="grid"/>`,
      );
      operations.push(
        `        <loadData file="${this.quoteXmlAttribute(attributesPath)}" tableName="grid_attributes"/>`,
      );
    } else {
      const attributesPath = `${application}/${sprint}/grid_attributes_${gridName}_update.csv`;
      operations.push(
        `        <loadUpdateData file="${this.quoteXmlAttribute(attributesPath)}" tableName="grid_attributes" primaryKey="id"/>`,
      );
    }

    return `    <changeSet id="${changesetId}" author="${author}">\n${operations.join("\n")}\n    </changeSet>`;
  }

  generateGridChangesetDefinition(
    gridName: string,
    changesetId: string,
    author: string,
    targetApplication: string,
    targetSprint: string,
    csvFiles: Array<{ tableName: string; path: string; content: string }>,
    isNew: boolean = true,
    comment: string | null = null,
  ): any {
    const xmlContent = this.generateGridChangesetXml(
      changesetId,
      author,
      gridName,
      targetApplication,
      targetSprint,
      isNew,
    );
    return {
      id: changesetId,
      author,
      comment,
      changeType: isNew ? "loadData" : "loadUpdateData",
      csvFiles,
      xmlContent,
      targetApplication,
      targetSprint,
      edited: false,
    };
  }

  // Included here so processBatchGeneration works immediately
  async reviewChangesets(
    changesets: ChangesetDefinition[],
  ): Promise<ChangesetDefinition[]> {
    if (!changesets || changesets.length === 0) return changesets;

    const payload = changesets.map((cs) => ({
      id: cs.id,
      changeType: cs.change.type,
      xml: cs.xmlContent,
      sqlPreview: cs.change.sqlPreview || null,
    }));

    const systemPrompt = `You are a senior PostgreSQL/Liquibase migration reviewer... (Keep your exact prompt here) ...`;
    const userPrompt = `Review these changesets:\n${JSON.stringify(payload, null, 2)}`;

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    try {
      const provider = LLMFactory.getProvider();
      let responseText = await provider.generateCompletion(messages, {
        temperature: 0,
        maxTokens: 1800,
        enableReasoning: false,
      });

      responseText = responseText
        .replace(/^```[a-zA-Z]*\n/, "")
        .replace(/```$/, "")
        .trim();
      const parsed = JSON.parse(responseText);
      const reviewsMap = parsed.reviews || {};
      const validSeverities = new Set(["low", "medium", "high"]);

      const isActionable = (message: unknown): message is string => {
        if (typeof message !== "string") return false;
        const normalized = message.trim();
        if (normalized.length < 30) return false;
        const vaguePattern =
          /^(consider|maybe|might|could|optional|nice to have|style|formatting)\b/i;
        if (vaguePattern.test(normalized)) return false;
        const evidencePattern =
          /(table|column|constraint|foreign key|drop|rename|modify|not null|default|update|delete|insert|changeset)/i;
        return evidencePattern.test(normalized);
      };

      return changesets.map((cs) => {
        const rawReviews = Array.isArray(reviewsMap[cs.id])
          ? reviewsMap[cs.id]
          : [];
        const normalizedReviews: ChangeReview[] = rawReviews
          .filter((r: any) => r && validSeverities.has(r.severity))
          .map((r: any) => ({
            severity: r.severity as "low" | "medium" | "high",
            message: typeof r.message === "string" ? r.message.trim() : "",
          }))
          .filter((r: ChangeReview) => isActionable(r.message));

        const dedupedReviews: ChangeReview[] = Array.from(
          new Map(
            normalizedReviews.map((r: ChangeReview) => [
              `${r.severity}::${r.message.toLowerCase()}`,
              r,
            ]),
          ).values(),
        );

        cs.reviews = dedupedReviews;
        return cs;
      });
    } catch (e) {
      console.warn(
        "LLM review failed, returning changesets without reviews...",
        e,
      );
      return changesets;
    }
  }
}
