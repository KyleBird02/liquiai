import {
  ProposedChange,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  DependencyEdge,
  CreateTablePayload,
  AlterTablePayload,
  DropTablePayload,
} from "../types/index";
import { schemaService } from "./schema";
import { diffCalculator } from "./diff";

class ChangeValidator {
  /**
   * Validates a proposed change against the current schema snapshot
   */
  validate(change: ProposedChange): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const affectedTables: Set<string> = new Set();
    const dependencyGraph: DependencyEdge[] = [];

    switch (change.type) {
      case "CREATE_TABLE":
        this.validateCreateTable(
          change.payload as CreateTablePayload,
          errors,
          warnings,
          affectedTables,
          dependencyGraph,
        );
        break;
      case "ALTER_TABLE":
        this.validateAlterTable(
          change.payload as AlterTablePayload,
          errors,
          warnings,
          affectedTables,
          dependencyGraph,
        );
        break;
      case "DROP_TABLE":
        this.validateDropTable(
          change.payload as DropTablePayload,
          errors,
          warnings,
          affectedTables,
          dependencyGraph,
        );
        break;
      case "ADD_INDEX":
      case "DROP_INDEX":
        // TODO: Implement index validation
        break;
    }

    const passed = errors.length === 0;

    return {
      passed,
      errors,
      warnings,
      affectedTables: Array.from(affectedTables),
      dependencyGraph,
    };
  }

  private validateCreateTable(
    payload: CreateTablePayload,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    affectedTables: Set<string>,
    dependencyGraph: DependencyEdge[],
  ): void {
    const { tableName, schema, columns, primaryKey, foreignKeys } = payload;

    affectedTables.add(tableName);

    // Check if table already exists
    if (schemaService.tableExists(schema, tableName)) {
      errors.push({
        code: "TABLE_EXISTS",
        message: `Table ${schema}.${tableName} already exists`,
      });
      return;
    }

    // Validate columns
    if (!columns || columns.length === 0) {
      errors.push({
        code: "NO_COLUMNS",
        message: "Table must have at least one column",
      });
      return;
    }

    // Check for duplicate column names
    const columnNames = new Set<string>();
    columns.forEach((col) => {
      if (columnNames.has(col.name)) {
        errors.push({
          code: "DUPLICATE_COLUMN",
          message: `Column ${col.name} is defined more than once`,
        });
      }
      columnNames.add(col.name);
    });

    // Validate primary key columns exist
    if (primaryKey) {
      primaryKey.forEach((pkCol) => {
        if (!columnNames.has(pkCol)) {
          errors.push({
            code: "PK_COLUMN_NOT_FOUND",
            message: `Primary key column ${pkCol} does not exist`,
          });
        }
      });
    }

    // Validate foreign keys
    if (foreignKeys) {
      foreignKeys.forEach((fk) => {
        if (!columnNames.has(fk.column)) {
          errors.push({
            code: "FK_COLUMN_NOT_FOUND",
            message: `Foreign key column ${fk.column} does not exist`,
          });
        }

        // Check if referenced table exists
        const refTable = schemaService.getTableByName(fk.referencedTable);
        if (!refTable) {
          warnings.push({
            code: "FK_REF_TABLE_NOT_FOUND",
            message: `Referenced table ${fk.referencedTable} does not exist`,
            severity: "medium",
          });
        } else {
          // Check if referenced column exists
          const refCol = refTable.columns.find(
            (c) => c.name === fk.referencedColumn,
          );
          if (!refCol) {
            errors.push({
              code: "FK_REF_COLUMN_NOT_FOUND",
              message: `Referenced column ${fk.referencedTable}.${fk.referencedColumn} does not exist`,
            });
          }

          dependencyGraph.push({
            from: tableName,
            to: fk.referencedTable,
            type: "foreign_key",
          });
          affectedTables.add(fk.referencedTable);
        }
      });
    }
  }

  private validateAlterTable(
    payload: AlterTablePayload,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    affectedTables: Set<string>,
    dependencyGraph: DependencyEdge[],
  ): void {
    const { tableName, schema, addedColumns, removedColumns, modifiedColumns } =
      payload;

    affectedTables.add(tableName);

    const table = schemaService.getTableByNameAndSchema(schema, tableName);
    if (!table) {
      // For ALTER_TABLE, treat missing table as a warning since this is a proposed change
      // The table lookup will be stricter when the change is actually applied
      warnings.push({
        code: "TABLE_NOT_FOUND_IN_SNAPSHOT",
        message: `Table ${schema}.${tableName} not found in current schema snapshot. This change will be validated against the database when applied.`,
        severity: "low",
      });
      // Still consider the change as valid for proposing; it will be validated strictly during application
      affectedTables.add(tableName);
      return;
    }

    const columnMap = new Map(table.columns.map((c) => [c.name, c]));

    // Validate removed columns
    if (removedColumns) {
      removedColumns.forEach((colName) => {
        if (!columnMap.has(colName)) {
          errors.push({
            code: "COLUMN_NOT_FOUND",
            message: `Column ${colName} does not exist`,
          });
          return;
        }

        // Check if any foreign keys depend on this column
        const dependents = schemaService.getDependentTables(schema, tableName);
        if (dependents.length > 0) {
          warnings.push({
            code: "COLUMN_HAS_DEPENDENTS",
            message: `Column ${colName} may be referenced by foreign keys`,
            severity: "high",
          });
          dependents.forEach((dep) => {
            dependencyGraph.push({
              from: dep.name,
              to: tableName,
              type: "foreign_key",
            });
            affectedTables.add(dep.name);
          });
        }
      });
    }

    // Validate modified columns
    if (modifiedColumns) {
      modifiedColumns.forEach((mod) => {
        if (!columnMap.has(mod.columnName)) {
          errors.push({
            code: "COLUMN_NOT_FOUND",
            message: `Column ${mod.columnName} does not exist`,
          });
        }
      });
    }

    // Validate added columns
    if (addedColumns) {
      addedColumns.forEach((col) => {
        if (columnMap.has(col.name)) {
          errors.push({
            code: "COLUMN_EXISTS",
            message: `Column ${col.name} already exists`,
          });
        }
      });
    }
  }

  private validateDropTable(
    payload: DropTablePayload,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    affectedTables: Set<string>,
    dependencyGraph: DependencyEdge[],
  ): void {
    const { tableName, schema } = payload;

    affectedTables.add(tableName);

    const table = schemaService.getTableByNameAndSchema(schema, tableName);
    if (!table) {
      errors.push({
        code: "TABLE_NOT_FOUND",
        message: `Table ${schema}.${tableName} does not exist`,
      });
      return;
    }

    // Check for dependent tables
    const dependents = schemaService.getDependentTables(schema, tableName);
    if (dependents.length > 0 && !payload.cascade) {
      errors.push({
        code: "TABLE_HAS_DEPENDENTS",
        message: `Table has dependent foreign keys. Set cascade=true to drop anyway.`,
      });

      dependents.forEach((dep) => {
        dependencyGraph.push({
          from: dep.name,
          to: tableName,
          type: "foreign_key",
        });
        affectedTables.add(dep.name);
      });
    }

    warnings.push({
      code: "DESTRUCTIVE_DROP",
      message: `Dropping table ${schema}.${tableName} will delete all data`,
      severity: "high",
    });
  }
}

export const changeValidator = new ChangeValidator();
