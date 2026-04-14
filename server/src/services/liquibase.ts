import {
  ProposedChange,
  CreateTablePayload,
  AlterTablePayload,
  DropTablePayload,
  ColumnDefinition,
  ChangesetDefinition,
} from "../types/index";
import { Builder, parseString } from "xml2js";
import { LLMFactory, LLMMessage } from "./llm";

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
    // For PoC, we'll use simplified logic:
    // - CREATE_TABLE, ADD_INDEX, DROP_INDEX always use XML
    // - ALTER_TABLE (complex operations) and DROP_TABLE use XML for simplicity
    // In Phase 3, this could be more sophisticated

    switch (change.type) {
      case "CREATE_TABLE":
      case "ALTER_TABLE":
      case "ADD_INDEX":
      case "DROP_INDEX":
        return false; // Use inline XML
      case "DROP_TABLE":
        return false; // Use inline XML
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
    const useSqlFormat = this.shouldUseSqlFormat(change);
    const xmlContent = this.generateChangesetXml(change, changesetId, author);

    let sqlFilePath: string | null = null;
    let sqlFileContent: string | null = null;

    if (useSqlFormat) {
      // Generate SQL file name based on change type and payload
      sqlFilePath = this.generateSqlFileName(
        change,
        targetApplication,
        targetSprint,
      );
      sqlFileContent = this.generateSQL(change);
    }

    return {
      id: changesetId,
      author,
      comment,
      changeType: useSqlFormat ? "sql" : "xml",
      change,
      sqlFilePath,
      sqlFileContent,
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
      default:
        throw new Error(`Unsupported change type: ${change.type}`);
    }

    // Build just the changeset element, not the full databaseChangeLog
    let changesetContent: any = {};
    if (Array.isArray(changeXml)) {
      // If there are multiple changes (like multiple ALTER TABLE actions in one changeset)
      // xml2js expects sibling elements of the same name to be arrays, or multiple different elements
      // as separate keys.
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
        indent: "    ", // 4 spaces for inner tags
      },
    });

    let xml = builder.buildObject(changeSet);
    // Add 4 spaces of base indentation so the <changeSet> tag itself is indented
    // when inserted into the databaseChangeLog
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
      default:
        filename = `migration_${Date.now()}.sql`;
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

  /**
   * Aggregate multiple changesets into a single changeset
   * Merges all changes into one XML block with a new ID
   */
  aggregateChangesets(
    changesets: ChangesetDefinition[],
    aggregatedId: string,
  ): ChangesetDefinition {
    if (changesets.length === 0) {
      throw new Error("Cannot aggregate empty changeset list");
    }

    if (changesets.length === 1) {
      return changesets[0];
    }

    // Get the first changeset as base (to get author, application, sprint)
    const baseChangeset = changesets[0];

    // Parse and merge all XML blocks
    // For simplicity, we'll create a new multi-operation changeset
    let mergedXmlContent = `    <changeSet id="${aggregatedId}" author="${baseChangeset.author}">`;

    // Add each change operation
    for (const cs of changesets) {
      // Parse the changeset XML to extract just the inner operation
      const xmlMatch = cs.xmlContent.match(
        /<change[sS]et[^>]*>\n?([\s\S]*?)\n?\s*<\/change[sS]et>/,
      );
      if (xmlMatch) {
        mergedXmlContent += "\n" + xmlMatch[1];
      }
    }

    mergedXmlContent += "\n    </changeSet>";

    return {
      id: aggregatedId,
      author: baseChangeset.author,
      comment: null,
      changeType: "xml",
      change: changesets[0].change, // Reference first change (ideally would be metadata)
      sqlFilePath: null,
      sqlFileContent: null,
      xmlContent: mergedXmlContent,
      targetApplication: baseChangeset.targetApplication,
      targetSprint: baseChangeset.targetSprint,
      edited: false,
    };
  }

  /**
   * Aggregate multiple changesets into a single intelligent changeset using an LLM,
   * while simultaneously reviewing the merged changes for risks.
   */
  async aggregateChangesetsIntelligently(
    changesets: ChangesetDefinition[],
    aggregatedId: string,
  ): Promise<ChangesetDefinition> {
    if (changesets.length === 0) {
      throw new Error("Cannot aggregate empty changeset list");
    }
    if (changesets.length === 1) {
      return changesets[0];
    }

    const baseChangeset = changesets[0];

    // Combine all existing reviews from the individual changesets
    const combinedReviews = changesets.flatMap((cs) => cs.reviews || []);

    // Extract XML blocks without the `<changeSet>` wrapper.
    const xmlBlocks: string[] = [];
    for (const cs of changesets) {
      const xmlMatch = cs.xmlContent.match(
        /<change[sS]et[^>]*>\n?([\s\S]*?)\n?\s*<\/change[sS]et>/,
      );
      if (xmlMatch) {
        xmlBlocks.push(xmlMatch[1].trim());
      }
    }

    const rawActions = xmlBlocks.join("\n\n");
    const systemPrompt = `You are a strict, expert Liquibase developer and Database DBA.
Your goal is to successfully combine multiple Liquibase XML operations into the most optimized, single set of actions.
Combine operations where appropriate (e.g. creating a table with a column added in a later changeset should just be a single CREATE TABLE changeset).

RETURN EXACTLY ONE VALID JSON OBJECT WITH NO COMMENTS OR STRING WRITINGS. Example format:
{
  "xml": "unformatted raw inner Liquibase XML operations. Do NOT output a wrapping <changeSet> tag. Keep 8 spaces of indentation since this output goes directly inside a changeset! Escape quotes properly."
}
DO NOT WRAP YOUR RESPONSE IN \`\`\`json. OUTPUT ONLY RAW JSON.`;

    const userPrompt = `Here are the un-combined XML operations meant to be run chronologically:\n${rawActions}\n\nPlease intelligently output the JSON.`;

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    try {
      const provider = LLMFactory.getProvider();
      let responseText = await provider.generateCompletion(messages);

      // Strip potential markdown markers
      responseText = responseText
        .replace(/^```[a-zA-Z]*\n/, "")
        .replace(/```$/, "")
        .trim();

      const parsed = JSON.parse(responseText);
      const intelligentXml = parsed.xml;

      // Ensure the LLM output has a trailing newline before the closing tag,
      // and avoid adding extra indentation to the first line if the LLM already padded it.
      const formattedXml = intelligentXml
        .split("\n")
        .map((line: string) => {
          // If the line has no leading spaces, add 8 spaces
          if (line.trim().length > 0 && !line.startsWith(" ")) {
            return "        " + line;
          }
          // If it starts with 8 spaces, keep it, else let it be
          return line;
        })
        .join("\n");

      const mergedXmlContent = `    <changeSet id="${aggregatedId}" author="${baseChangeset.author}">
${formattedXml}
    </changeSet>`;

      return {
        id: aggregatedId,
        author: baseChangeset.author,
        comment: "Aggregated via AI",
        changeType: "xml",
        change: changesets[0].change, // Reference first change
        sqlFilePath: null,
        sqlFileContent: null,
        xmlContent: mergedXmlContent,
        targetApplication: baseChangeset.targetApplication,
        targetSprint: baseChangeset.targetSprint,
        edited: false,
        reviews: combinedReviews,
      };
    } catch (e) {
      console.warn(
        "LLM aggregation failed, falling back to basic string append...",
        e,
      );
      const fallback = this.aggregateChangesets(changesets, aggregatedId);
      fallback.reviews = combinedReviews;
      return fallback;
    }
  }

  /**
   * Query the LLM to review an array of individual changesets.
   * Modifies and returns the array with warnings attached.
   */
  async reviewChangesets(
    changesets: ChangesetDefinition[],
  ): Promise<ChangesetDefinition[]> {
    if (!changesets || changesets.length === 0) return changesets;

    const payload = changesets.map((cs) => ({ id: cs.id, xml: cs.xmlContent }));
    const systemPrompt = `You are a Database DBA reviewing Liquibase changesets for potential risks.
For each changeset ID, identify if there are warnings (e.g. dropping columns risks data loss in higher envs, renaming columns may break APIs, changing field types).
RETURN EXACTLY ONE VALID JSON OBJECT WITH NO COMMENTS OR STRING WRITINGS. Example format:
{
  "reviews": {
    "changeset_id_here": [
      { "severity": "medium", "message": "..." }
    ]
  }
}
DO NOT WRAP YOUR RESPONSE IN \`\`\`json. OUTPUT ONLY RAW JSON.`;

    const userPrompt = `Review these changesets:\n${JSON.stringify(payload, null, 2)}`;

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    try {
      const provider = LLMFactory.getProvider();
      let responseText = await provider.generateCompletion(messages);

      responseText = responseText
        .replace(/^```[a-zA-Z]*\n/, "")
        .replace(/```$/, "")
        .trim();

      const parsed = JSON.parse(responseText);
      const reviewsMap = parsed.reviews || {};

      return changesets.map((cs) => {
        if (reviewsMap[cs.id]) {
          cs.reviews = reviewsMap[cs.id];
        } else {
          cs.reviews = [];
        }
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

export const liquibaseGenerator = new LiquibaseGenerator(
  process.env.LIQUIBASE_CHANGESET_AUTHOR || "liquiai",
);
