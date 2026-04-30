import { getGithubService, getServices } from "./server-proxy";

type Changeset = any;

function generateRollbackSqlForAlter(payload: any): string {
  const parts: string[] = [];
  const table = payload.tableName;

  // Added columns -> DROP COLUMN
  if (payload.addedColumns && payload.addedColumns.length > 0) {
    for (const col of payload.addedColumns) {
      parts.push(`ALTER TABLE ${table} DROP COLUMN ${col.name};`);
    }
  }

  // Removed columns -> ADD COLUMN with definition if available
  if (payload.removedColumns && payload.removedColumns.length > 0) {
    for (const col of payload.removedColumns) {
      if (typeof col === "string") continue;
      let def = `${col.name} ${col.type}`;
      if (!col.nullable) def += " NOT NULL";
      if (
        col.defaultValue !== undefined &&
        col.defaultValue !== null &&
        col.defaultValue !== ""
      ) {
        def += ` DEFAULT ${col.defaultValue}`;
      }
      parts.push(`ALTER TABLE ${table} ADD COLUMN ${def};`);
    }
  }

  // Modified columns -> swap old/new definitions
  if (payload.modifiedColumns && payload.modifiedColumns.length > 0) {
    for (const mod of payload.modifiedColumns) {
      const oldDef = mod.oldDefinition;
      const col = mod.columnName || oldDef.name;
      if (oldDef.type !== mod.newDefinition.type) {
        parts.push(
          `ALTER TABLE ${table} ALTER COLUMN ${col} TYPE ${oldDef.type};`,
        );
      }
      if (oldDef.nullable && !mod.newDefinition.nullable) {
        parts.push(`ALTER TABLE ${table} ALTER COLUMN ${col} DROP NOT NULL;`);
      } else if (!oldDef.nullable && mod.newDefinition.nullable) {
        parts.push(`ALTER TABLE ${table} ALTER COLUMN ${col} SET NOT NULL;`);
      }
      if (oldDef.defaultValue !== mod.newDefinition.defaultValue) {
        if (
          oldDef.defaultValue === null ||
          oldDef.defaultValue === undefined ||
          oldDef.defaultValue === ""
        ) {
          parts.push(`ALTER TABLE ${table} ALTER COLUMN ${col} DROP DEFAULT;`);
        } else {
          parts.push(
            `ALTER TABLE ${table} ALTER COLUMN ${col} SET DEFAULT ${oldDef.defaultValue};`,
          );
        }
      }
      if (oldDef.name !== mod.newDefinition.name) {
        parts.push(
          `ALTER TABLE ${table} RENAME COLUMN ${mod.newDefinition.name} TO ${oldDef.name};`,
        );
      }
    }
  }

  return parts.join("\n");
}

export async function applyAutoFixes(
  changesets: Changeset[],
): Promise<{ changesets: Changeset[]; fixes: string[] }> {
  const fixes: string[] = [];

  for (const cs of changesets) {
    const change = cs.change as any;

    // 1) Fix NOT NULL added columns without default on ALTER_TABLE
    if (change.type === "ALTER_TABLE") {
      const payload = change.payload as any;
      if (payload.addedColumns && payload.addedColumns.length > 0) {
        for (const col of payload.addedColumns) {
          if (
            col.nullable === false &&
            (col.defaultValue === null ||
              col.defaultValue === undefined ||
              col.defaultValue === "")
          ) {
            // Auto-fix: make column nullable and set defaultValue to null
            col.nullable = true;
            col.defaultValue = null;
            fixes.push(
              `Made column ${col.name} nullable and set default=null in changeset ${cs.id}`,
            );
          }
        }
      }
    }

    // 2) Add rollback blocks if missing for destructive changes
    // try {
    //   if (!/\<rollback\>/i.test(cs.xmlContent)) {
    //     let rollbackXml = "";
    //     if (change.type === "CREATE_TABLE") {
    //       const table = change.payload.tableName;
    //       rollbackXml = `        <rollback>\n            <dropTable tableName="${table}"/>\n        </rollback>`;
    //     } else if (change.type === "DROP_TABLE") {
    //       const payload = change.payload as any;
    //       if (payload.definition) {
    //         // attempt to recreate the table using liquibaseGenerator.generateCreateTable
    //         // generateCreateTable returns an object for XML; fallback to SQL rollback
    //         const servicesModule = await getServices();
    //         const liquibaseGenerator = servicesModule.liquibaseGenerator;
    //         const createSql = liquibaseGenerator.generateSQL({
    //           type: "CREATE_TABLE",
    //           payload: payload.definition,
    //         } as any);
    //         rollbackXml = `        <rollback>\n            <sql>\n${createSql.replace(/\n/g, "\n")}\n            </sql>\n        </rollback>`;
    //       }
    //     } else if (change.type === "ALTER_TABLE") {
    //       const payload = change.payload as any;
    //       const sql = generateRollbackSqlForAlter(payload);
    //       if (sql && sql.trim().length > 0) {
    //         rollbackXml = `        <rollback>\n            <sql>\n${sql}\n            </sql>\n        </rollback>`;
    //       }
    //     }

    //     if (rollbackXml) {
    //       // Insert before closing </changeSet>
    //       cs.xmlContent = cs.xmlContent.replace(
    //         /<\/changeSet>\s*$/i,
    //         `${rollbackXml}\n    </changeSet>`,
    //       );
    //       fixes.push(`Added rollback block to changeset ${cs.id}`);
    //     }
    //   }
    // } catch (e) {
    //   // ignore
    // }

    // 3) Duplicate changeset id fix: if id already present in remote, bump
    try {
      const githubModule = await getGithubService();
      const githubService = githubModule.githubService;
      const xml = await githubService
        .fetchChangesetXml(cs.targetApplication)
        .catch(() => "");
      if (xml) {
        const last = githubService.parseLastChangesetId(xml);
        const prefix =
          githubService.extractApplicationPrefix(xml) ||
          cs.targetApplication.replace(/[^a-z0-9]+/gi, "-");
        const desired = `${prefix}-${last + 1}`;
        if (cs.id === desired) {
          // already ok
        } else if (xml.includes(`id="${cs.id}"`)) {
          const oldId = cs.id;
          cs.id = desired;
          cs.xmlContent = cs.xmlContent.replace(/id="[^"]+"/, `id="${cs.id}"`);
          fixes.push(`Rebased duplicate changeset id ${oldId} -> ${cs.id}`);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return { changesets, fixes };
}

export default { applyAutoFixes };
