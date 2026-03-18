import { v4 as uuidv4 } from "uuid";
import {
  ProposedChange,
  CreateTablePayload,
  TableDefinition,
  ColumnDefinition,
} from "../types";

class ChangesService {
  private proposedChanges: Map<string, ProposedChange> = new Map();

  /**
   * Propose a new CREATE TABLE change
   */
  proposeCREATETable(payload: CreateTablePayload): ProposedChange {
    const change: ProposedChange = {
      id: uuidv4(),
      type: "CREATE_TABLE",
      status: "pending",
      payload,
      createdAt: new Date().toISOString(),
    };

    this.proposedChanges.set(change.id, change);
    return change;
  }

  /**
   * Get all proposed changes
   */
  getAllChanges(): ProposedChange[] {
    return Array.from(this.proposedChanges.values());
  }

  /**
   * Get a specific proposed change
   */
  getChange(id: string): ProposedChange | undefined {
    return this.proposedChanges.get(id);
  }

  /**
   * Get pending changes only
   */
  getPendingChanges(): ProposedChange[] {
    return this.getAllChanges().filter((change) => change.status === "pending");
  }

  /**
   * Update change status
   */
  updateChangeStatus(
    id: string,
    status: "pending" | "validated" | "rejected",
  ): ProposedChange | undefined {
    const change = this.proposedChanges.get(id);
    if (change) {
      change.status = status;
    }
    return change;
  }

  /**
   * Convert a proposed CREATE TABLE to a TableDefinition
   * This is used for displaying proposed tables in the schema explorer
   */
  convertCreateTableToTableDefinition(
    payload: CreateTablePayload,
  ): TableDefinition {
    return {
      name: payload.tableName,
      schema: payload.schema,
      columns: payload.columns,
      indexes: [],
      foreignKeys: payload.foreignKeys || [],
      primaryKey: payload.primaryKey || [],
    };
  }

  /**
   * Delete a proposed change
   */
  deleteChange(id: string): boolean {
    return this.proposedChanges.delete(id);
  }

  /**
   * Clear all proposed changes
   */
  clearAllChanges(): void {
    this.proposedChanges.clear();
  }

  /**
   * Generate CREATE TABLE SQL from a proposed change
   */
  generateCreateTableSQL(payload: CreateTablePayload): string {
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
      const safeFkTable = `"${fk.referencedTable.split(".")[0] || "public"}"."${fk.referencedTable.split(".").pop()}"`;
      return `CONSTRAINT "${fk.constraintName}" FOREIGN KEY ("${fk.column}") REFERENCES ${safeFkTable}("${fk.referencedColumn}") ON DELETE ${fk.onDelete}`;
    });

    const allDefs = [...columnDefs, ...fkDefs];
    const sql = `CREATE TABLE ${safeTableName} (\n  ${allDefs.join(",\n  ")}\n);`;

    return sql;
  }
}

export const changesService = new ChangesService();
