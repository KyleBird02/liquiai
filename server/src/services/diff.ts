import {
  TableDefinition,
  ColumnDefinition,
  SchemaDiff,
  ColumnModification,
} from "../types/index";

class DiffCalculator {
  /**
   * Calculates the diff between a before and after table definition
   */
  calculateDiff(
    before: TableDefinition | null,
    after: TableDefinition | null,
  ): SchemaDiff {
    const addedColumns: ColumnDefinition[] = [];
    const removedColumns: ColumnDefinition[] = [];
    const modifiedColumns: ColumnModification[] = [];
    const addedConstraints = after?.foreignKeys || [];
    const removedConstraints = before?.foreignKeys || [];
    const destructiveReasons: string[] = [];

    // Check for table drops
    if (before && !after) {
      destructiveReasons.push(
        `Table ${before.schema}.${before.name} will be dropped`,
      );
    }

    // Compare columns if both tables exist
    if (before && after) {
      const beforeColumnMap = new Map(before.columns.map((c) => [c.name, c]));
      const afterColumnMap = new Map(after.columns.map((c) => [c.name, c]));

      // Find added columns
      after.columns.forEach((col) => {
        if (!beforeColumnMap.has(col.name)) {
          addedColumns.push(col);
        }
      });

      // Find removed columns
      before.columns.forEach((col) => {
        if (!afterColumnMap.has(col.name)) {
          removedColumns.push(col);
          destructiveReasons.push(`Column ${col.name} will be dropped`);
        }
      });

      // Find modified columns
      after.columns.forEach((afterCol) => {
        const beforeCol = beforeColumnMap.get(afterCol.name);
        if (beforeCol && !this.columnsEqual(beforeCol, afterCol)) {
          modifiedColumns.push({
            columnName: afterCol.name,
            oldDefinition: beforeCol,
            newDefinition: afterCol,
          });

          // Check if this change is destructive
          if (!afterCol.nullable && beforeCol.nullable) {
            destructiveReasons.push(
              `Column ${afterCol.name} changed from nullable to NOT NULL`,
            );
          }
          if (beforeCol.type !== afterCol.type) {
            destructiveReasons.push(
              `Column ${afterCol.name} type changed from ${beforeCol.type} to ${afterCol.type}`,
            );
          }
        }
      });
    }

    const isDestructive =
      destructiveReasons.length > 0 || removedColumns.length > 0;

    return {
      before,
      after,
      addedColumns,
      removedColumns,
      modifiedColumns,
      addedConstraints,
      removedConstraints,
      isDestructive,
      destructiveReasons,
    };
  }

  /**
   * Checks if two column definitions are equivalent
   */
  private columnsEqual(
    col1: ColumnDefinition,
    col2: ColumnDefinition,
  ): boolean {
    return (
      col1.name === col2.name &&
      col1.type === col2.type &&
      col1.nullable === col2.nullable &&
      col1.defaultValue === col2.defaultValue &&
      col1.isPrimaryKey === col2.isPrimaryKey
    );
  }

  /**
   * Generates a human-readable summary of the diff
   */
  summarizeDiff(diff: SchemaDiff): string {
    if (!diff.before && !diff.after) {
      return "No changes";
    }

    const lines: string[] = [];

    if (!diff.before && diff.after) {
      lines.push(`CREATE TABLE ${diff.after.schema}.${diff.after.name}`);
      lines.push(
        `  Columns: ${diff.after.columns.map((c) => c.name).join(", ")}`,
      );
    } else if (diff.before && !diff.after) {
      lines.push(`DROP TABLE ${diff.before.schema}.${diff.before.name}`);
    } else if (diff.before && diff.after) {
      lines.push(`ALTER TABLE ${diff.after.schema}.${diff.after.name}`);
      if (diff.addedColumns.length > 0) {
        lines.push(
          `  ADD COLUMNS: ${diff.addedColumns.map((c) => c.name).join(", ")}`,
        );
      }
      if (diff.removedColumns.length > 0) {
        lines.push(
          `  DROP COLUMNS: ${diff.removedColumns.map((c) => c.name).join(", ")}`,
        );
      }
      if (diff.modifiedColumns.length > 0) {
        lines.push(
          `  MODIFY COLUMNS: ${diff.modifiedColumns.map((m) => m.columnName).join(", ")}`,
        );
      }
    }

    if (diff.isDestructive) {
      lines.push("  ⚠️  DESTRUCTIVE CHANGES");
      diff.destructiveReasons.forEach((reason) => {
        lines.push(`    - ${reason}`);
      });
    }

    return lines.join("\n");
  }
}

export const diffCalculator = new DiffCalculator();
