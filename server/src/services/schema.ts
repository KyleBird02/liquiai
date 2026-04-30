import { Client } from "pg";
import {
  introspectSchema,
  introspectSchemaWithConnection,
} from "../db/queries.js";
import { SchemaSnapshot, TableDefinition } from "../types/index";

class SchemaService {
  private currentSnapshot: SchemaSnapshot | null = null;

  /**
   * Captures the current state of the database
   */
  async captureSnapshot(databaseName: string): Promise<SchemaSnapshot> {
    const snapshot = await introspectSchema(databaseName);
    this.currentSnapshot = snapshot;
    return snapshot;
  }

  /**
   * Captures the schema snapshot for a specific connection and stores it as current
   */
  async captureSnapshotWithConnection(
    connectionString: string,
    databaseName: string,
  ): Promise<SchemaSnapshot> {
    const snapshot = await introspectSchemaWithConnection(
      connectionString,
      databaseName,
    );
    this.currentSnapshot = snapshot;
    return snapshot;
  }

  /**
   * Returns the most recently captured snapshot
   */
  getCurrentSnapshot(): SchemaSnapshot | null {
    return this.currentSnapshot;
  }

  /**
   * Sets the current snapshot (useful for testing or manual snapshots)
   */
  setCurrentSnapshot(snapshot: SchemaSnapshot): void {
    this.currentSnapshot = snapshot;
  }

  /**
   * Finds a table by name in the current snapshot
   */
  getTableByName(tableName: string): TableDefinition | undefined {
    if (!this.currentSnapshot) {
      return undefined;
    }
    return this.currentSnapshot.tables.find((t) => t.name === tableName);
  }

  /**
   * Finds a table by name and schema in the current snapshot
   */
  getTableByNameAndSchema(
    schema: string,
    tableName: string,
  ): TableDefinition | undefined {
    if (!this.currentSnapshot) {
      return undefined;
    }
    return this.currentSnapshot.tables.find(
      (t) => t.schema === schema && t.name === tableName,
    );
  }

  /**
   * Get all tables in a specific schema
   */
  getTablesBySchema(schema: string): TableDefinition[] {
    if (!this.currentSnapshot) {
      return [];
    }
    return this.currentSnapshot.tables.filter((t) => t.schema === schema);
  }

  /**
   * Check if a table exists in the current snapshot
   */
  tableExists(schema: string, tableName: string): boolean {
    return this.getTableByNameAndSchema(schema, tableName) !== undefined;
  }

  /**
   * Get all foreign keys that reference a specific table
   */
  getIncomingForeignKeys(schema: string, tableName: string): any[] {
    if (!this.currentSnapshot) {
      return [];
    }
    return this.currentSnapshot.tables
      .flatMap((table) =>
        table.foreignKeys.map((fk) => ({
          ...fk,
          sourceTable: table.name,
          sourceSchema: table.schema,
        })),
      )
      .filter(
        (fk) => fk.referencedTable === tableName && fk.sourceSchema === schema,
      );
  }

  /**
   * Get all tables that depend on a specific table
   */
  getDependentTables(schema: string, tableName: string): TableDefinition[] {
    const dependentTableNames = new Set<string>();

    const incoming = this.getIncomingForeignKeys(schema, tableName);
    incoming.forEach((fk) => {
      dependentTableNames.add(fk.sourceTable);
    });

    if (!this.currentSnapshot) {
      return [];
    }

    return Array.from(dependentTableNames)
      .map((name) => this.getTableByName(name))
      .filter((t): t is TableDefinition => t !== undefined);
  }
}

export const schemaService = new SchemaService();
