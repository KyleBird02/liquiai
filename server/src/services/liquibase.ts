import {
  ProposedChange,
  CreateTablePayload,
  AlterTablePayload,
  DropTablePayload,
  ColumnDefinition,
  ChangesetDefinition,
  ChangeReview,
  GridConfigPayload,
} from "../types/index";
import { Builder, parseString } from "xml2js";
import { LLMFactory, LLMMessage } from "./llm";
import { gridCSVGenerator } from "./grid-csv";

class LiquibaseGenerator {
  private author: string;

  constructor(author: string = "liquiai") {
    this.author = author;
  }

  /**
   * Determine if a change should use inline XML or SQL file format
   * Simple DDL (CREATE/ALTER TABLE basics) = XML
   * Complex operations = SQL file
   */
  shouldUseSqlFormat(change: ProposedChange): boolean {
    switch (change.type) {
      case "CREATE_TABLE":
      case "ALTER_TABLE":
      case "ADD_INDEX":
      case "DROP_INDEX":
        return false; // Use inline XML
      case "DROP_TABLE":
        return false; // Use inline XML
      case "EXECUTE_SQL":
        return true; // Use SQL file
      case "GRID_CONFIG":
        return false; // Grid config uses Liquibase XML with CSV files
      default:
        return false;
    }
  }

  /**
   * Generate a changeset definition (wraps changeset XML into ChangesetDefinition)
   */
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
      // Generate SQL file name based on change type and payload
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

  /**
   * Generate just the <changeset/> XML block (not wrapped in databaseChangeLog)
   * Used for appending to existing changeset.xml
   */
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
        const payload = change.payload as any;
        const sqlFilePath = this.generateSqlFileName(
          change,
          targetApplication,
          targetSprint,
        );
        changeXml = {
          sqlFile: {
            $: {
              path: sqlFilePath,
              relativeToChangelogFile: "true",
            },
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
        if (!changesetContent[key]) {
          changesetContent[key] = [];
        }
        changesetContent[key].push(item[key]);
      }
    } else {
      const key = Object.keys(changeXml)[0];
      changesetContent[key] = changeXml[key];
    }

    const changeSet = {
      changeSet: {
        $: {
          id: changesetId,
          author: author,
        },
        ...changesetContent,
      },
    };

    const builder = new Builder({
      headless: true,
      xmldec: undefined,
      renderOpts: {
        pretty: true,
        indent: "    ",
      },
    });

    let xml = builder.buildObject(changeSet);
    xml = xml
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n");

    return xml;
  }

  /**
   * Append new changesets to existing changeset.xml content
   * Inserts above the closing </databaseChangeLog> tag
   */
  appendToChangesetXml(
    existingXml: string,
    changesetXmlBlocks: string[],
    comment?: string | null,
  ): string {
    // Find the closing </databaseChangeLog> tag
    const closingTag = "</databaseChangeLog>";
    const index = existingXml.lastIndexOf(closingTag);

    if (index === -1) {
      throw new Error(
        "Invalid changeset.xml: missing </databaseChangeLog> tag",
      );
    }

    // Build the insertion string
    let insertion = "";
    if (comment) {
      insertion += `\n    <!-- ${comment} -->\n`;
    } else {
      insertion += "\n";
    }

    insertion += changesetXmlBlocks.join("\n\n");
    insertion += "\n";

    // Insert above the closing tag
    return existingXml.substring(0, index) + insertion + closingTag;
  }

  /**
   * Generate SQL file path based on change details
   */
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
      case "CREATE_TABLE": {
        const payload = change.payload as CreateTablePayload;
        filename = `create_${payload.tableName}.sql`;
        break;
      }
      case "ALTER_TABLE": {
        const payload = change.payload as AlterTablePayload;
        filename = `alter_${payload.tableName}.sql`;
        break;
      }
      case "DROP_TABLE": {
        const payload = change.payload as DropTablePayload;
        filename = `drop_${payload.tableName}.sql`;
        break;
      }
      case "EXECUTE_SQL": {
        const payload = change.payload as any;
        const sql = payload.sql || "";
        const aiProvidedFileName =
          typeof payload.fileName === "string" ? payload.fileName.trim() : "";
        const isValidProvidedName =
          aiProvidedFileName.length > 0 &&
          /^[a-zA-Z0-9._-]+\.sql$/.test(aiProvidedFileName);

        if (isValidProvidedName) {
          filename = aiProvidedFileName;
          break;
        }

        const lowerSql = sql.toLowerCase();
        const targetToken = detectSqlTargetTable(sql);
        if (lowerSql.includes("insert")) {
          filename = `insert_${targetToken}_${changeSuffix}.sql`;
        } else if (lowerSql.includes("update")) {
          filename = `update_${targetToken}_${changeSuffix}.sql`;
        } else if (lowerSql.includes("delete")) {
          filename = `delete_${targetToken}_${changeSuffix}.sql`;
        } else {
          filename = `migration_${targetToken}_${changeSuffix}.sql`;
        }
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
        $: {
          tableName,
        },
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

    // Add new columns
    addedColumns.forEach((col) => {
      changes.push({
        addColumn: {
          $: {
            tableName,
          },
          column: [this.columnToXml(col)],
        },
      });
    });

    // Drop columns
    removedColumns.forEach((col) => {
      changes.push({
        dropColumn: {
          $: {
            tableName,
            columnName: typeof col === "string" ? col : col.name, // backward compat
          },
        },
      });
    });

    // Handle modified columns
    modifiedColumns.forEach((mod) => {
      const { oldDefinition, newDefinition } = mod;

      // Rename column
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

      // Change data type
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

      // Add/drop not null
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

      // Add/drop default value
      if (oldDefinition.defaultValue !== newDefinition.defaultValue) {
        if (
          newDefinition.defaultValue === null ||
          newDefinition.defaultValue === ""
        ) {
          changes.push({
            dropDefaultValue: {
              $: {
                tableName,
                columnName: newDefinition.name,
              },
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

    // Add foreign keys
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

    // Drop foreign keys
    removedForeignKeys.forEach((fk) => {
      const fkName = typeof fk === "string" ? fk : fk.constraintName;
      changes.push({
        dropForeignKeyConstraint: {
          $: {
            baseTableName: tableName,
            constraintName: fkName,
          },
        },
      });
    });

    if (changes.length === 0) {
      throw new Error("No changes specified for ALTER TABLE");
    }

    // If there's only one change, return it directly; otherwise wrap in a nested structure
    // Note: In liquibase, multiple table modifications can be sequential within a single changeset,
    // so we can just return the array of changes to be flattened upwards.
    return changes.length === 1 ? changes[0] : changes;
  }

  private generateDropTable(payload: DropTablePayload): any {
    const { tableName } = payload;

    return {
      dropTable: {
        $: {
          tableName,
        },
      },
    };
  }

  private columnToXml(col: ColumnDefinition): any {
    const columnAttrs: any = {
      name: col.name,
      type: col.type,
    };

    if (col.defaultValue) {
      columnAttrs.defaultValue = col.defaultValue;
    }

    const constraintAttrs: any = {};

    if (!col.nullable) {
      constraintAttrs.nullable = "false";
    }

    if (col.isPrimaryKey) {
      constraintAttrs.primaryKey = "true";
    }

    const result: any = {
      $: columnAttrs,
    };

    if (Object.keys(constraintAttrs).length > 0) {
      result.constraints = [
        {
          $: constraintAttrs,
        },
      ];
    }

    return result;
  }

  /**
   * Generates SQL from a Liquibase changeset (for preview/debugging)
   */
  generateSQL(change: ProposedChange): string {
    const lines: string[] = ["-- Generated by Liquibase Migration Tool", ""];

    switch (change.type) {
      case "EXECUTE_SQL": {
        const payload = change.payload as any;
        return payload.sql || "";
      }
      case "CREATE_TABLE": {
        const payload = change.payload as CreateTablePayload;
        const { tableName, columns, primaryKey } = payload;

        const tableFqn = tableName;
        const cols = columns
          .map((col) => {
            let def = `${col.name} ${col.type}`;
            if (!col.nullable) def += " NOT NULL";
            if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
            return def;
          })
          .join(",\n  ");

        let sql = `CREATE TABLE ${tableFqn} (\n  ${cols}`;
        if (primaryKey && primaryKey.length > 0) {
          sql += `,\n  PRIMARY KEY (${primaryKey.join(", ")})`;
        }
        sql += "\n);";
        lines.push(sql);
        break;
      }

      case "DROP_TABLE": {
        const payload = change.payload as DropTablePayload;
        const { tableName } = payload;
        const tableFqn = tableName;
        lines.push(`DROP TABLE ${tableFqn};`);
        break;
      }

      case "ALTER_TABLE": {
        const payload = change.payload as AlterTablePayload;
        const {
          tableName,
          addedColumns = [],
          removedColumns = [],
          modifiedColumns = [],
          addedForeignKeys = [],
          removedForeignKeys = [],
        } = payload;
        const tableFqn = tableName;

        addedColumns.forEach((col) => {
          let def = `${col.name} ${col.type}`;
          if (!col.nullable) def += " NOT NULL";
          if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
          lines.push(`ALTER TABLE ${tableFqn} ADD COLUMN ${def};`);
        });

        removedColumns.forEach((col) => {
          const colName = typeof col === "string" ? col : col.name;
          lines.push(`ALTER TABLE ${tableFqn} DROP COLUMN ${colName};`);
        });

        modifiedColumns.forEach((mod) => {
          const { oldDefinition, newDefinition } = mod;

          if (oldDefinition.name !== newDefinition.name) {
            lines.push(
              `ALTER TABLE ${tableFqn} RENAME COLUMN ${oldDefinition.name} TO ${newDefinition.name};`,
            );
          }

          if (oldDefinition.type !== newDefinition.type) {
            lines.push(
              `ALTER TABLE ${tableFqn} ALTER COLUMN ${newDefinition.name} TYPE ${newDefinition.type};`,
            );
          }

          if (oldDefinition.nullable && !newDefinition.nullable) {
            lines.push(
              `ALTER TABLE ${tableFqn} ALTER COLUMN ${newDefinition.name} SET NOT NULL;`,
            );
          } else if (!oldDefinition.nullable && newDefinition.nullable) {
            lines.push(
              `ALTER TABLE ${tableFqn} ALTER COLUMN ${newDefinition.name} DROP NOT NULL;`,
            );
          }

          if (oldDefinition.defaultValue !== newDefinition.defaultValue) {
            if (
              newDefinition.defaultValue === null ||
              newDefinition.defaultValue === ""
            ) {
              lines.push(
                `ALTER TABLE ${tableFqn} ALTER COLUMN ${newDefinition.name} DROP DEFAULT;`,
              );
            } else {
              lines.push(
                `ALTER TABLE ${tableFqn} ALTER COLUMN ${newDefinition.name} SET DEFAULT '${newDefinition.defaultValue}';`,
              );
            }
          }
        });

        addedForeignKeys.forEach((fk) => {
          lines.push(
            `ALTER TABLE ${tableFqn} ADD CONSTRAINT ${fk.constraintName} FOREIGN KEY (${fk.column}) REFERENCES ${fk.referencedTable} (${fk.referencedColumn})${fk.onDelete ? ` ON DELETE ${fk.onDelete}` : ""};`,
          );
        });

        removedForeignKeys.forEach((fk) => {
          const fkName = typeof fk === "string" ? fk : fk.constraintName;
          lines.push(`ALTER TABLE ${tableFqn} DROP CONSTRAINT ${fkName};`);
        });
        break;
      }
    }

    return lines.join("\n");
  }

  private extractChangesetInnerXml(xmlContent: string): string {
    const xmlMatch = xmlContent.match(
      /<change[sS]et[^>]*>\n?([\s\S]*?)\n?\s*<\/change[sS]et>/,
    );
    return xmlMatch ? xmlMatch[1] : xmlContent;
  }

  private normalizeInnerXmlIndent(block: string, baseIndent = 8): string {
    const rawLines = block.replace(/\r\n/g, "\n").split("\n");

    while (rawLines.length > 0 && rawLines[0].trim().length === 0) {
      rawLines.shift();
    }
    while (
      rawLines.length > 0 &&
      rawLines[rawLines.length - 1].trim().length === 0
    ) {
      rawLines.pop();
    }

    const nonEmptyLines = rawLines.filter((line) => line.trim().length > 0);
    const minIndent =
      nonEmptyLines.length > 0
        ? Math.min(
            ...nonEmptyLines.map((line) => {
              const match = line.match(/^\s*/);
              return match ? match[0].length : 0;
            }),
          )
        : 0;

    const basePadding = " ".repeat(baseIndent);
    return rawLines
      .map((line) => {
        if (line.trim().length === 0) {
          return "";
        }
        const dedented =
          line.length >= minIndent ? line.slice(minIndent) : line;
        return `${basePadding}${dedented}`;
      })
      .join("\n");
  }

  private quoteXmlAttribute(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  private sortForAggregation(
    changesets: ChangesetDefinition[],
  ): ChangesetDefinition[] {
    const rank = (cs: ChangesetDefinition): number => {
      if (cs.change.type === "CREATE_TABLE") return 0;
      if (cs.change.type === "ALTER_TABLE") return 1;
      if (cs.change.type === "DROP_TABLE") return 2;
      if (cs.change.type === "EXECUTE_SQL") return 3;
      return 4;
    };

    return [...changesets].sort((a, b) => {
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });
  }

  private buildAggregatedChangeset(
    changesets: ChangesetDefinition[],
    aggregatedId: string,
    sqlMergeMode: "single" | "multiple" = "single",
  ): ChangesetDefinition {
    const orderedChangesets = this.sortForAggregation(changesets);
    const baseChangeset = orderedChangesets[0];
    const combinedReviews = orderedChangesets.flatMap((cs) => cs.reviews || []);

    const sqlFiles: Array<{ path: string; content: string }> = [];
    const usedSqlPaths = new Set<string>();
    const sqlPathBySourceKey = new Map<string, string>();

    orderedChangesets.forEach((cs) => {
      const sourceFiles =
        cs.sqlFiles && cs.sqlFiles.length > 0
          ? cs.sqlFiles
          : cs.sqlFilePath && cs.sqlFileContent
            ? [{ path: cs.sqlFilePath, content: cs.sqlFileContent }]
            : [];

      sourceFiles.forEach((file, fileIndex) => {
        const sourceKey = `${cs.id}::${fileIndex}`;
        let nextPath = file.path;
        if (usedSqlPaths.has(nextPath)) {
          const dotIndex = nextPath.lastIndexOf(".");
          const base = dotIndex > 0 ? nextPath.slice(0, dotIndex) : nextPath;
          const ext = dotIndex > 0 ? nextPath.slice(dotIndex) : ".sql";
          let attempt = 2;
          while (usedSqlPaths.has(`${base}_${attempt}${ext}`)) {
            attempt += 1;
          }
          nextPath = `${base}_${attempt}${ext}`;
        }

        usedSqlPaths.add(nextPath);
        sqlPathBySourceKey.set(sourceKey, nextPath);
        sqlFiles.push({ path: nextPath, content: file.content });
      });
    });

    const mergedOperations: string[] = [];

    orderedChangesets.forEach((cs) => {
      if (cs.change.type === "EXECUTE_SQL") {
        if (sqlMergeMode === "multiple") {
          const thisSqlFiles =
            cs.sqlFiles && cs.sqlFiles.length > 0
              ? cs.sqlFiles
              : cs.sqlFilePath && cs.sqlFileContent
                ? [{ path: cs.sqlFilePath, content: cs.sqlFileContent }]
                : [];

          thisSqlFiles.forEach((sf, fileIndex) => {
            const sourceKey = `${cs.id}::${fileIndex}`;
            const path = sqlPathBySourceKey.get(sourceKey) || sf.path;
            mergedOperations.push(
              `        <sqlFile path="${this.quoteXmlAttribute(path)}" relativeToChangelogFile="true"/>`,
            );
          });
        }
        return;
      }

      const inner = this.normalizeInnerXmlIndent(
        this.extractChangesetInnerXml(cs.xmlContent),
      );
      mergedOperations.push(inner);
    });

    let finalSqlFiles: Array<{ path: string; content: string }> | undefined;
    let sqlFilePath: string | null = null;
    let sqlFileContent: string | null = null;

    if (sqlFiles.length > 0) {
      if (sqlMergeMode === "single") {
        const combinedPath = `${baseChangeset.targetApplication}/${baseChangeset.targetSprint}/combined_${aggregatedId.replace(/[^a-zA-Z0-9_-]/g, "_")}.sql`;
        const combinedContent = sqlFiles
          .map((file) => `-- ${file.path}\n${file.content.trim()}`)
          .join("\n\n");

        mergedOperations.push(
          `        <sqlFile path="${this.quoteXmlAttribute(combinedPath)}" relativeToChangelogFile="true"/>`,
        );

        finalSqlFiles = [{ path: combinedPath, content: combinedContent }];
        sqlFilePath = combinedPath;
        sqlFileContent = combinedContent;
      } else {
        finalSqlFiles = sqlFiles;
        sqlFilePath = sqlFiles[0].path;
        sqlFileContent = sqlFiles[0].content;
      }
    }

    const mergedXmlContent = `    <changeSet id="${aggregatedId}" author="${baseChangeset.author}">\n${mergedOperations.join("\n\n")}\n    </changeSet>`;

    return {
      id: aggregatedId,
      author: baseChangeset.author,
      comment: "Aggregated",
      changeType: finalSqlFiles && finalSqlFiles.length > 0 ? "sql" : "xml",
      change: baseChangeset.change,
      sqlFilePath,
      sqlFileContent,
      sqlFiles: finalSqlFiles,
      xmlContent: mergedXmlContent,
      targetApplication: baseChangeset.targetApplication,
      targetSprint: baseChangeset.targetSprint,
      edited: false,
      reviews: combinedReviews,
    };
  }

  /**
   * Aggregate multiple changesets into a single changeset
   * Merges all changes into one XML block with a new ID
   */
  aggregateChangesets(
    changesets: ChangesetDefinition[],
    aggregatedId: string,
    sqlMergeMode: "single" | "multiple" = "single",
  ): ChangesetDefinition {
    if (changesets.length === 0) {
      throw new Error("Cannot aggregate empty changeset list");
    }

    if (changesets.length === 1) {
      return changesets[0];
    }

    return this.buildAggregatedChangeset(
      changesets,
      aggregatedId,
      sqlMergeMode,
    );
  }

  /**
   * Aggregate multiple changesets into a single intelligent changeset using an LLM,
   * while simultaneously reviewing the merged changes for risks.
   */
  async aggregateChangesetsIntelligently(
    changesets: ChangesetDefinition[],
    aggregatedId: string,
    sqlMergeMode: "single" | "multiple" = "single",
  ): Promise<ChangesetDefinition> {
    // Keep API compatibility but use deterministic aggregation to preserve operation ordering.
    return this.aggregateChangesets(changesets, aggregatedId, sqlMergeMode);
  }

  /**
   * Query the LLM to review an array of individual changesets.
   * Modifies and returns the array with warnings attached.
   */
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
    const systemPrompt = `You are a senior PostgreSQL/Liquibase migration reviewer.

Primary objective:
- Flag only migration risks that are likely to fail or cause data loss/breakage in higher environments (QA/UAT/PROD) where data volume and data quality differ from DEV.

Do NOT produce warnings for:
- Style preferences, naming preferences, or readability suggestions.
- Generic best-practice advice without concrete risk in the provided change.
- Duplicate restatements of the same issue.

Severity rules:
- high: likely deploy failure or irreversible data loss risk.
- medium: meaningful risk requiring reviewer attention, but not guaranteed failure.
- low: minor but concrete operational risk (use sparingly).

Risk checks to apply:
- DROP/RENAME/MODIFY type operations affecting existing structures => usually high.
- addColumn NOT NULL without default on existing table => high.
- addForeignKeyConstraint on existing/populated tables => medium unless clearly unsafe/high.
- SQL data changes:
  - UPDATE/DELETE without restrictive predicate => high.
  - INSERT with explicit values is usually safe and should not be warned by default.
- Multiple dependent operations where ordering in the same changeset is risky => medium/high.

Output requirements:
- Return ONLY valid JSON.
- Include warnings only when actionable and specific.
- Each message must mention concrete table/column/operation evidence from the change.
- If no actionable risk for a changeset, return an empty array for that changeset.

Required JSON shape:
{
  "reviews": {
    "changeset_id_here": [
      { "severity": "medium", "message": "Concrete risk with evidence and why it matters in higher envs." }
    ]
  }
}`;

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

  /**
   * Generate a changeset for a new grid configuration (uses loadData)
   */
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
      // For new grids, use loadData for both grid and grid_attributes
      const gridPath = `${application}/${sprint}/grid_${gridName}.csv`;
      const attributesPath = `${application}/${sprint}/grid_attributes_${gridName}.csv`;

      operations.push(
        `        <loadData file="${this.quoteXmlAttribute(gridPath)}" tableName="grid"/>`,
      );
      operations.push(
        `        <loadData file="${this.quoteXmlAttribute(attributesPath)}" tableName="grid_attributes"/>`,
      );
    } else {
      // For updated grids, use loadUpdateData
      const attributesPath = `${application}/${sprint}/grid_attributes_${gridName}_update.csv`;
      operations.push(
        `        <loadUpdateData file="${this.quoteXmlAttribute(attributesPath)}" tableName="grid_attributes" primaryKey="id"/>`,
      );
    }

    return `    <changeSet id="${changesetId}" author="${author}">\n${operations.join("\n")}\n    </changeSet>`;
  }

  /**
   * Generate a grid changeset definition
   */
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
}

export const liquibaseGenerator = new LiquibaseGenerator(
  process.env.LIQUIBASE_CHANGESET_AUTHOR || "liquiai",
);
