import {
  GridConfig,
  GridConfigChange,
  GridAttribute,
  GridAttributeWithMeta,
  GridAttributeModification,
  WidthSuggestion,
  Grid,
  SyntheticDataRow,
} from "../types/index";
import {
  getAllGrids,
  getGridWithAttributes,
  getAllGridColumns,
  createGrid,
  createGridColumn,
  deleteGrid,
  createGridAttribute,
  updateGridAttribute,
  deleteGridAttribute,
  getColumnUsageForWidthSuggestion,
  getSampleColumnData,
} from "../db/queries";
import { connectionManager } from "../db/connection";

class GridService {
  /**
   * Fetches all grids from the database
   */
  async getAllGrids(): Promise<Grid[]> {
    return getAllGrids();
  }

  /**
   * Fetches a single grid by ID with all its attributes and metadata
   */
  async getGridConfig(gridId: number): Promise<GridConfig | null> {
    const result = await getGridWithAttributes(gridId);
    return result;
  }

  /**
   * Fetches all available grid columns (the registry)
   */
  async getAllGridColumns(): Promise<any[]> {
    return getAllGridColumns();
  }

  /**
   * Creates a new grid
   */
  async createNewGrid(gridName: string): Promise<Grid> {
    return createGrid(gridName);
  }

  async createGridWithColumns(
    gridName: string,
    columns: Array<{ columnName: string; columnType: string }>,
  ): Promise<GridConfig> {
    const normalizedGridName = gridName.trim();
    if (!normalizedGridName) {
      throw new Error("gridName is required");
    }

    const normalizedColumns = columns
      .map((col) => ({
        columnName: col.columnName.trim(),
        columnType: col.columnType.trim(),
      }))
      .filter((col) => col.columnName && col.columnType);

    const client = await connectionManager.getClient();

    try {
      await client.query("BEGIN");

      const grid = await createGrid(normalizedGridName, client);
      const existingRegistryColumns = await getAllGridColumns(client);

      for (let index = 0; index < normalizedColumns.length; index += 1) {
        const requestedColumn = normalizedColumns[index];
        let resolvedColumn = existingRegistryColumns.find(
          (existing) =>
            existing.column_name.toLowerCase() ===
              requestedColumn.columnName.toLowerCase() &&
            existing.column_type.toLowerCase() ===
              requestedColumn.columnType.toLowerCase(),
        );

        if (!resolvedColumn) {
          resolvedColumn = await createGridColumn(
            requestedColumn.columnName,
            requestedColumn.columnType,
            client,
          );
          existingRegistryColumns.push(resolvedColumn);
        }

        await createGridAttribute(
          grid.id,
          resolvedColumn.id,
          requestedColumn.columnName
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (str) => str.toUpperCase())
            .trim(),
          150,
          80,
          300,
          index,
          true,
          true,
          true,
          null,
          false,
          null,
          client,
        );
      }

      const config = await getGridWithAttributes(grid.id, client);
      await client.query("COMMIT");

      if (!config) {
        throw new Error("Failed to load created grid");
      }

      return config;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createGridFromProposedConfig(
    gridName: string,
    afterColumns: GridAttributeWithMeta[],
  ): Promise<GridConfig> {
    const seedColumns = afterColumns.map((col) => ({
      columnName: col.column_name,
      columnType: col.column_type,
    }));

    const createdConfig = await this.createGridWithColumns(
      gridName,
      seedColumns,
    );

    if (!afterColumns.length) {
      return createdConfig;
    }

    const desiredByName = new Map(
      afterColumns.map((col, index) => [
        `${col.column_name.toLowerCase()}::${col.column_type.toLowerCase()}`,
        { ...col, position: index },
      ]),
    );

    const patchedColumns = createdConfig.columns.map((created, index) => {
      const key = `${created.column_name.toLowerCase()}::${created.column_type.toLowerCase()}`;
      const desired = desiredByName.get(key);
      if (!desired) {
        return { ...created, position: index };
      }

      return {
        ...created,
        header_name: desired.header_name,
        width: desired.width,
        min_width: desired.min_width,
        max_width: desired.max_width,
        position: desired.position,
        sortable: desired.sortable,
        resizable: desired.resizable,
        filter: desired.filter,
        pinned: desired.pinned,
        hide: desired.hide,
        flex: desired.flex,
      };
    });

    return this.applyGridConfig(createdConfig.grid.id, patchedColumns);
  }

  async deleteGridById(gridId: number): Promise<void> {
    const client = await connectionManager.getClient();
    try {
      await client.query("BEGIN");
      await deleteGrid(gridId, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async applyGridConfig(
    gridId: number,
    proposedColumns: GridAttributeWithMeta[],
  ): Promise<GridConfig> {
    const client = await connectionManager.getClient();

    try {
      await client.query("BEGIN");

      const currentConfig = await getGridWithAttributes(gridId, client);
      if (!currentConfig) {
        throw new Error("Grid not found");
      }

      const currentColumns: GridAttributeWithMeta[] =
        currentConfig.columns || [];
      const normalizedProposedColumns = proposedColumns.map((col, index) => ({
        ...col,
        position: index,
      }));

      const currentById = new Map(currentColumns.map((col) => [col.id, col]));
      const nextById = new Map(
        normalizedProposedColumns
          .filter((col) => typeof col.id === "number" && col.id > 0)
          .map((col) => [col.id, col]),
      );

      for (const currentColumn of currentColumns) {
        if (!nextById.has(currentColumn.id)) {
          await deleteGridAttribute(currentColumn.id, client);
        }
      }

      await client.query(
        "UPDATE grid_attributes SET position = position + 1000000 WHERE grid_id = $1",
        [gridId],
      );

      for (const proposedColumn of normalizedProposedColumns) {
        if (currentById.has(proposedColumn.id)) {
          await updateGridAttribute(
            proposedColumn.id,
            {
              column_id: proposedColumn.column_id,
              header_name: proposedColumn.header_name,
              width: proposedColumn.width,
              min_width: proposedColumn.min_width,
              max_width: proposedColumn.max_width,
              position: proposedColumn.position,
              sortable: proposedColumn.sortable,
              resizable: proposedColumn.resizable,
              filter: proposedColumn.filter,
              pinned: proposedColumn.pinned,
              hide: proposedColumn.hide,
              flex: proposedColumn.flex,
            },
            client,
          );
        } else {
          await createGridAttribute(
            gridId,
            proposedColumn.column_id,
            proposedColumn.header_name,
            proposedColumn.width,
            proposedColumn.min_width,
            proposedColumn.max_width,
            proposedColumn.position,
            proposedColumn.sortable,
            proposedColumn.resizable,
            proposedColumn.filter,
            proposedColumn.pinned,
            proposedColumn.hide,
            proposedColumn.flex,
            client,
          );
        }
      }

      const updatedConfig = await getGridWithAttributes(gridId, client);
      await client.query("COMMIT");

      if (!updatedConfig) {
        throw new Error("Failed to reload updated grid");
      }

      return updatedConfig;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Computes the diff between before and after grid configurations
   */
  computeGridDiff(
    before: GridAttributeWithMeta[] | null,
    after: GridAttributeWithMeta[],
  ): GridConfigChange {
    const beforeMap = new Map((before || []).map((col) => [col.id, col]));
    const afterMap = new Map(after.map((col) => [col.id, col]));

    const addedColumns: GridAttributeWithMeta[] = [];
    const removedColumns: GridAttributeWithMeta[] = [];
    const modifiedAttributes: GridAttributeModification[] = [];

    // Find added columns
    after.forEach((col) => {
      if (!beforeMap.has(col.id)) {
        addedColumns.push(col);
      }
    });

    // Find removed columns
    (before || []).forEach((col) => {
      if (!afterMap.has(col.id)) {
        removedColumns.push(col);
      }
    });

    // Find modified columns
    after.forEach((afterCol) => {
      const beforeCol = beforeMap.get(afterCol.id);
      if (beforeCol) {
        const modifications: GridAttributeModification[] = [];

        // Check each field for changes
        (
          [
            "header_name",
            "width",
            "min_width",
            "max_width",
            "position",
            "sortable",
            "resizable",
            "filter",
            "pinned",
            "hide",
            "flex",
          ] as (keyof GridAttribute)[]
        ).forEach((field) => {
          if (beforeCol[field] !== afterCol[field]) {
            modifications.push({
              columnName: afterCol.column_name,
              field,
              before: beforeCol[field],
              after: afterCol[field],
            });
          }
        });

        modifiedAttributes.push(...modifications);
      }
    });

    return {
      type: before ? "UPDATE_GRID" : "NEW_GRID",
      grid: after[0]
        ? { id: after[0].grid_id, grid_name: "" }
        : { id: 0, grid_name: "" },
      before,
      after,
      addedColumns,
      removedColumns,
      modifiedAttributes,
    };
  }

  /**
   * Suggests column widths based on existing usage of the same column name in other grids
   */
  async suggestColumnWidths(
    columns: GridAttributeWithMeta[],
  ): Promise<WidthSuggestion[]> {
    const suggestions: WidthSuggestion[] = [];

    for (const column of columns) {
      const usageData = await getColumnUsageForWidthSuggestion(
        column.column_name,
      );

      if (usageData.length === 0) {
        // No usage data found, return current values with low confidence
        suggestions.push({
          columnName: column.column_name,
          suggestedWidth: column.width,
          suggestedMinWidth: column.min_width,
          suggestedMaxWidth: column.max_width,
          confidence: "low",
          dataPoints: 0,
        });
      } else {
        // Compute median values
        const widths = usageData.map((d) => d.width).sort((a, b) => a - b);
        const minWidths = usageData
          .map((d) => d.min_width)
          .sort((a, b) => a - b);
        const maxWidths = usageData
          .map((d) => d.max_width)
          .sort((a, b) => a - b);

        const median = (arr: number[]) => {
          const mid = Math.floor(arr.length / 2);
          return arr.length % 2 !== 0
            ? arr[mid]
            : (arr[mid - 1] + arr[mid]) / 2;
        };

        suggestions.push({
          columnName: column.column_name,
          suggestedWidth: Math.round(median(widths)),
          suggestedMinWidth: Math.round(median(minWidths)),
          suggestedMaxWidth: Math.round(median(maxWidths)),
          confidence: usageData.length >= 3 ? "high" : "low",
          dataPoints: usageData.length,
        });
      }
    }

    return suggestions;
  }

  /**
   * Generates synthetic data rows for grid preview
   */
  async generateSyntheticData(
    columns: GridAttributeWithMeta[],
    rowCount: number = 10,
  ): Promise<SyntheticDataRow[]> {
    const rows: SyntheticDataRow[] = [];

    // First pass: try to fetch real data for each column
    const columnData: { [key: string]: (string | number | boolean | null)[] } =
      {};

    for (const column of columns) {
      // Try to find a real table with this column name
      // For now, we'll use synthetic data generation
      columnData[column.column_name] = [];
    }

    // Generate synthetic data
    for (let i = 0; i < rowCount; i++) {
      const row: SyntheticDataRow = {};

      for (const column of columns) {
        const columnName = column.column_name;
        const columnType = column.column_type;

        row[columnName] = this.generateSyntheticValue(
          columnName,
          columnType,
          i,
        );
      }

      rows.push(row);
    }

    return rows;
  }

  /**
   * Generates a synthetic value based on column type and name
   */
  private generateSyntheticValue(
    columnName: string,
    columnType: string,
    rowIndex: number,
  ): string | number | boolean | null {
    const type = columnType.toLowerCase();

    if (type.includes("int") || type === "numeric" || type === "decimal") {
      // Generate realistic numbers
      if (columnName.includes("price") || columnName.includes("amount")) {
        return parseFloat((Math.random() * 10000).toFixed(2));
      }
      if (columnName.includes("id")) {
        return rowIndex + 1;
      }
      return Math.floor(Math.random() * 1000);
    }

    if (type.includes("varchar") || type === "text") {
      // Generate realistic strings based on column name
      if (columnName.includes("price")) {
        return `$${(Math.random() * 10000).toFixed(2)}`;
      }
      if (columnName.includes("date")) {
        return new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];
      }
      if (columnName.includes("name") || columnName.includes("title")) {
        return `Item ${rowIndex + 1}`;
      }
      return `Value_${rowIndex + 1}`;
    }

    if (type === "boolean") {
      return Math.random() > 0.5;
    }

    if (type.includes("timestamp") || type.includes("date")) {
      return new Date(
        Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000,
      ).toISOString();
    }

    return null;
  }

  /**
   * Applies width suggestions to columns
   */
  applyWidthSuggestions(
    columns: GridAttributeWithMeta[],
    suggestions: WidthSuggestion[],
  ): GridAttributeWithMeta[] {
    const suggestionMap = new Map(suggestions.map((s) => [s.columnName, s]));

    return columns.map((col) => {
      const suggestion = suggestionMap.get(col.column_name);
      if (suggestion) {
        return {
          ...col,
          width: suggestion.suggestedWidth,
          min_width: suggestion.suggestedMinWidth,
          max_width: suggestion.suggestedMaxWidth,
        };
      }
      return col;
    });
  }

  /**
   * Validates grid configuration
   */
  validateGridConfig(config: GridConfig): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.grid || !config.grid.grid_name) {
      errors.push("Grid must have a name");
    }

    if (!config.columns || config.columns.length === 0) {
      errors.push("Grid must have at least one column");
    }

    // Check for duplicate positions
    const positions = config.columns.map((c) => c.position);
    if (new Set(positions).size !== positions.length) {
      errors.push("Column positions must be unique");
    }

    // Check for valid widths
    config.columns.forEach((col, idx) => {
      if (col.width < col.min_width || col.width > col.max_width) {
        warnings.push(
          `Column ${col.header_name} width (${col.width}) is outside min (${col.min_width}) and max (${col.max_width}) bounds`,
        );
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

export const gridService = new GridService();
