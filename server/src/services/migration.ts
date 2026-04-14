import { Client } from "pg";
import {
  CreateTablePayload,
  AlterTablePayload,
  DropTablePayload,
} from "../types";

class MigrationService {
  /**
   * Apply a CREATE TABLE statement to a database
   */
  /**
   * Apply a DROP TABLE statement to a database
   */
  async applyDropTable(
    payload: { tableName: string; schema?: string },
    connectionString: string,
  ): Promise<{ success: boolean; message: string; error?: string }> {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      const schema = payload.schema || "public";
      const sql = `DROP TABLE "${schema}"."${payload.tableName}" CASCADE;`;
      console.log("Executing SQL:", sql);
      await client.query(sql);
      return {
        success: true,
        message: `Table "${payload.tableName}" dropped successfully`,
      };
    } catch (error: any) {
      console.error("Failed to drop table:", error);
      return {
        success: false,
        message: "Failed to drop table",
        error: error.message,
      };
    } finally {
      await client.end();
    }
  }

  async revertDropTable(
    payload: DropTablePayload,
    connectionString: string,
  ): Promise<{ success: boolean; message: string; error?: string }> {
    if (!payload.definition) {
      return {
        success: false,
        message: "Cannot revert dropped table without its full definition.",
        error:
          "Table structure was lost because the payload lacked definition.",
      };
    }

    // CreateTablePayload expects these fields
    const createPayload: CreateTablePayload = {
      tableName: payload.definition.name,
      schema: payload.definition.schema,
      columns: payload.definition.columns,
      foreignKeys: payload.definition.foreignKeys,
      primaryKey: payload.definition.primaryKey,
    };

    return this.applyCreateTable(createPayload, connectionString);
  }

  async revertAlterTable(
    payload: AlterTablePayload,
    connectionString: string,
  ): Promise<{ success: boolean; message: string; error?: string }> {
    // To revert an alter table, we swap added with removed columns, inverted modifications, etc.
    const inversePayload: AlterTablePayload = {
      tableName: payload.tableName,
      schema: payload.schema,
      addedColumns: [],
      removedColumns: [],
      modifiedColumns: [],
      addedForeignKeys: [],
      removedForeignKeys: [],
    };

    // Added columns become removed columns
    if (payload.addedColumns) {
      inversePayload.removedColumns = payload.addedColumns;
    }

    // Removed columns become added columns - now that we construct the removed definition it works!
    if (payload.removedColumns && payload.removedColumns.length > 0) {
      inversePayload.addedColumns = payload.removedColumns.map((c) => {
        if (typeof c === "string")
          throw new Error(
            "Cannot revert string column defs, need complete def",
          );
        return c;
      });
    }

    // Modified columns swap old and new definitions
    if (payload.modifiedColumns) {
      inversePayload.modifiedColumns = payload.modifiedColumns.map((mod) => ({
        columnName: mod.newDefinition.name, // The column currently has the new name
        newDefinition: mod.oldDefinition,
        oldDefinition: mod.newDefinition,
      }));
    }

    // Added foreign keys become removed
    if (payload.addedForeignKeys) {
      inversePayload.removedForeignKeys = payload.addedForeignKeys; // Wait, actually we can just pass the whole fk
    }

    if (payload.removedForeignKeys && payload.removedForeignKeys.length > 0) {
      inversePayload.addedForeignKeys = payload.removedForeignKeys.map((fk) => {
        if (typeof fk === "string")
          throw new Error("Cannot revert string fk defs, need complete def");
        return fk;
      });
    }

    return this.applyAlterTable(inversePayload, connectionString);
  }

  async applyCreateTable(
    payload: CreateTablePayload,
    connectionString: string,
  ): Promise<{ success: boolean; message: string; error?: string }> {
    const client = new Client({ connectionString });

    try {
      await client.connect();

      const sql = this.generateCreateTableSQL(payload);
      console.log("Executing SQL:", sql);

      await client.query(sql);

      return {
        success: true,
        message: `Table "${payload.tableName}" created successfully`,
      };
    } catch (error: any) {
      console.error("Failed to create table:", error);
      return {
        success: false,
        message: "Failed to create table",
        error: error.message,
      };
    } finally {
      await client.end();
    }
  }

  /**
   * Apply an ALTER TABLE statement to a database
   */
  async applyAlterTable(
    payload: AlterTablePayload,
    connectionString: string,
  ): Promise<{ success: boolean; message: string; error?: string }> {
    const client = new Client({ connectionString });

    try {
      await client.connect();

      const statements = this.generateAlterTableSQL(payload);

      if (!statements || statements.length === 0) {
        return {
          success: false,
          message: "No alter operations specified",
          error: "No columns to add, remove, or modify",
        };
      }

      // Execute all alter statements
      for (const sql of statements) {
        console.log("Executing SQL:", sql);
        await client.query(sql);
      }

      return {
        success: true,
        message: `Table "${payload.tableName}" altered successfully`,
      };
    } catch (error: any) {
      console.error("Failed to alter table:", error);
      return {
        success: false,
        message: "Failed to alter table",
        error: error.message,
      };
    } finally {
      await client.end();
    }
  }

  /**
   * Generate ALTER TABLE SQL statements from payload
   */
  private generateAlterTableSQL(payload: AlterTablePayload): string[] {
    const schema = payload.schema || "public";
    const tableName = payload.tableName;
    const safeTableName = `"${schema}"."${tableName}"`;
    const statements: string[] = [];

    const alterParts: string[] = [];

    // Handle added columns
    if (payload.addedColumns && payload.addedColumns.length > 0) {
      payload.addedColumns.forEach((col) => {
        let colDef = `"${col.name}" ${col.type}`;

        if (!col.nullable) {
          colDef += " NOT NULL";
        }

        if (col.defaultValue) {
          colDef += ` DEFAULT ${col.defaultValue}`;
        }

        alterParts.push(`ADD COLUMN ${colDef}`);
      });
    }

    // Handle removed columns
    if (payload.removedColumns && payload.removedColumns.length > 0) {
      payload.removedColumns.forEach((col) => {
        const colName = typeof col === "string" ? col : col.name;
        alterParts.push(`DROP COLUMN "${colName}"`);
      });
    }

    // Handle modified columns
    if (payload.modifiedColumns && payload.modifiedColumns.length > 0) {
      payload.modifiedColumns.forEach((mod) => {
        const newDef = mod.newDefinition;

        // Handle type change
        if (mod.oldDefinition.type !== newDef.type) {
          alterParts.push(
            `ALTER COLUMN "${mod.columnName}" TYPE ${newDef.type}`,
          );
        }

        // Handle NOT NULL constraint
        if (mod.oldDefinition.nullable !== newDef.nullable) {
          if (!newDef.nullable) {
            alterParts.push(`ALTER COLUMN "${mod.columnName}" SET NOT NULL`);
          } else {
            alterParts.push(`ALTER COLUMN "${mod.columnName}" DROP NOT NULL`);
          }
        }

        // Handle default value
        if (mod.oldDefinition.defaultValue !== newDef.defaultValue) {
          if (newDef.defaultValue) {
            alterParts.push(
              `ALTER COLUMN "${mod.columnName}" SET DEFAULT ${newDef.defaultValue}`,
            );
          } else {
            alterParts.push(`ALTER COLUMN "${mod.columnName}" DROP DEFAULT`);
          }
        }

        // Handle column rename (name change)
        if (mod.oldDefinition.name !== newDef.name) {
          alterParts.push(
            `RENAME COLUMN "${mod.oldDefinition.name}" TO "${newDef.name}"`,
          );
        }
      });
    }

    // Handle added foreign keys
    if (payload.addedForeignKeys && payload.addedForeignKeys.length > 0) {
      payload.addedForeignKeys.forEach((fk) => {
        const referencedTableParts = fk.referencedTable.split(".");
        const refSchema =
          referencedTableParts.length > 1 ? referencedTableParts[0] : "public";
        const refTable = referencedTableParts[referencedTableParts.length - 1];
        const safeRefTable = `"${refSchema}"."${refTable}"`;
        alterParts.push(
          `ADD CONSTRAINT "${fk.constraintName}" FOREIGN KEY ("${fk.column}") REFERENCES ${safeRefTable}("${fk.referencedColumn}") ON DELETE ${fk.onDelete}`,
        );
      });
    }

    // Handle removed foreign keys
    if (payload.removedForeignKeys && payload.removedForeignKeys.length > 0) {
      payload.removedForeignKeys.forEach((fk) => {
        const constraintName = typeof fk === "string" ? fk : fk.constraintName;
        alterParts.push(`DROP CONSTRAINT "${constraintName}"`);
      });
    }

    if (alterParts.length > 0) {
      const sql = `ALTER TABLE ${safeTableName} ${alterParts.join(", ")};`;
      statements.push(sql);
    }

    return statements;
  }

  /**
   * Insert data into a proposed table (before it's created in the actual DB)
   * This is for local preview/testing
   */
  async insertProposedTableData(
    tableName: string,
    columns: { name: string; value: any }[],
    existingData: any[],
  ): Promise<any[]> {
    // Create a new row object from columns
    const newRow: any = {};
    columns.forEach((col) => {
      newRow[col.name] = col.value;
    });

    // Add to existing data (in-memory for proposed tables)
    return [...existingData, newRow];
  }

  /**
   * Generate CREATE TABLE SQL from payload
   */
  private generateCreateTableSQL(payload: CreateTablePayload): string {
    const schema = payload.schema || "public";
    const tableName = payload.tableName;
    const safeTableName = `"${schema}"."${tableName}"`;

    // Build column definitions
    const columnDefs = payload.columns.map((col) => {
      let colDef = `"${col.name}" ${col.type}`;

      if (col.isPrimaryKey) {
        colDef += " PRIMARY KEY";
      }

      if (!col.nullable) {
        colDef += " NOT NULL";
      }

      if (col.defaultValue) {
        colDef += ` DEFAULT ${col.defaultValue}`;
      }

      return colDef;
    });

    // Add foreign keys if present
    const fkDefs = (payload.foreignKeys || []).map((fk) => {
      const referencedTableParts = fk.referencedTable.split(".");
      const refSchema =
        referencedTableParts.length > 1 ? referencedTableParts[0] : "public";
      const refTable = referencedTableParts[referencedTableParts.length - 1];
      const safeRefTable = `"${refSchema}"."${refTable}"`;
      return `CONSTRAINT "${fk.constraintName}" FOREIGN KEY ("${fk.column}") REFERENCES ${safeRefTable}("${fk.referencedColumn}") ON DELETE ${fk.onDelete}`;
    });

    const allDefs = [...columnDefs, ...fkDefs];
    const sql = `CREATE TABLE ${safeTableName} (\n  ${allDefs.join(",\n  ")}\n);`;

    return sql;
  }
}

export const migrationService = new MigrationService();
