import {
  GridConfigChange,
  GridAttributeWithMeta,
  GridAttribute,
  Grid,
} from "../types/index";

class GridCSVGenerator {
  private readonly gridAttributesTableOrder: Array<keyof GridAttribute> = [
    "id",
    "grid_id",
    "column_id",
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
  ];

  /**
   * Converts grid data to CSV format
   */
  private toCSV(headers: string[], rows: any[][]): string {
    const headerLine = headers.map((h) => this.escapeCSV(String(h))).join(",");

    const dataLines = rows.map((row) =>
      row.map((val) => this.escapeCSV(String(val))).join(","),
    );

    return [headerLine, ...dataLines].join("\n");
  }

  /**
   * Escapes CSV values that contain special characters
   */
  private escapeCSV(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Generates CSV for a new grid (loadData)
   */
  generateGridTableCSV(grid: Grid): string {
    const headers = ["id", "grid_name"];
    const rows = [[grid.id, grid.grid_name]];
    return this.toCSV(headers, rows);
  }

  /**
   * Generates CSV for grid attributes (loadData)
   */
  generateGridAttributesCSV(columns: GridAttributeWithMeta[]): string {
    const headers = [
      "id",
      "grid_id",
      "column_id",
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
    ];

    const rows = columns.map((col) => [
      col.id,
      col.grid_id,
      col.column_id,
      col.header_name,
      col.width,
      col.min_width,
      col.max_width,
      col.position,
      col.sortable ? "true" : "false",
      col.resizable ? "true" : "false",
      col.filter ? "true" : "false",
      col.pinned || "",
      col.hide ? "true" : "false",
      col.flex !== null ? col.flex : "",
    ]);

    return this.toCSV(headers, rows);
  }

  /**
   * Generates update CSV for modified grid attributes (loadUpdateData)
   * Includes only changed rows and changed columns + primary key (id)
   */
  generateGridAttributesUpdateCSV(
    beforeColumns: GridAttributeWithMeta[],
    afterColumns: GridAttributeWithMeta[],
  ): {
    csv: string;
    headers: string[];
    changedRowCount: number;
  } {
    const beforeById = new Map(beforeColumns.map((col) => [col.id, col]));
    const changedFields = new Set<keyof GridAttribute>();
    const changedRows: GridAttributeWithMeta[] = [];

    for (const afterCol of afterColumns) {
      const beforeCol = beforeById.get(afterCol.id);
      if (!beforeCol) {
        changedRows.push(afterCol);
        this.gridAttributesTableOrder
          .filter((field) => field !== "id")
          .forEach((field) => changedFields.add(field));
        continue;
      }

      let rowChanged = false;
      for (const field of this.gridAttributesTableOrder) {
        if (field === "id") {
          continue;
        }

        if (beforeCol[field] !== afterCol[field]) {
          changedFields.add(field);
          rowChanged = true;
        }
      }

      if (rowChanged) {
        changedRows.push(afterCol);
      }
    }

    const headers = [
      "id",
      ...this.gridAttributesTableOrder
        .filter((field) => field !== "id")
        .filter((field) => changedFields.has(field))
        .map((field) => String(field)),
    ];

    const rows = changedRows.map((col) =>
      headers.map((header) => {
        const key = header as keyof GridAttribute;
        const value = col[key];

        if (typeof value === "boolean") {
          return value ? "true" : "false";
        }

        return value ?? "";
      }),
    );

    return {
      csv: this.toCSV(headers, rows),
      headers,
      changedRowCount: changedRows.length,
    };
  }

  /**
   * Generates a filename for a grid CSV
   */
  generateGridCSVFilename(gridName: string, update: boolean = false): string {
    const suffix = update ? "_update" : "";
    return `grid_${gridName}${suffix}.csv`;
  }

  /**
   * Generates the relative path for a grid CSV file in the liquibase repo
   */
  generateGridCSVPath(
    gridName: string,
    application: string,
    sprint: string,
    update: boolean = false,
  ): string {
    const filename = this.generateGridCSVFilename(gridName, update);
    return `${application}/${sprint}/${filename}`;
  }
}

export const gridCSVGenerator = new GridCSVGenerator();
