import React, { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import { ColDef, ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { GridAttributeWithMeta } from "../../types";

ModuleRegistry.registerModules([AllCommunityModule]);

interface GridPreviewProps {
  columns: GridAttributeWithMeta[];
  data: any[];
}

const GridPreview: React.FC<GridPreviewProps> = ({ columns, data }) => {
  const columnDefs = useMemo<ColDef[]>(() => {
    return columns
      .filter((col) => !col.hide)
      .map((col) => ({
        field: col.column_name,
        headerName: col.header_name,
        width: col.width,
        minWidth: col.min_width,
        maxWidth: col.max_width,
        sortable: col.sortable,
        resizable: col.resizable,
        filter: col.filter,
        // Ensure pinned is strictly typed for AG Grid
        pinned: (col.pinned as "left" | "right") || null,
        // Map 0 to undefined if flex shouldn't be active
        flex: col.flex || undefined,
      }))
      .sort((a, b) => {
        const aPos =
          columns.find((c) => c.column_name === a.field)?.position || 0;
        const bPos =
          columns.find((c) => c.column_name === b.field)?.position || 0;
        return aPos - bPos;
      });
  }, [columns]);

  if (columnDefs.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>No visible columns. Add or unhide columns to see the preview.</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>No data available for preview.</p>
      </div>
    );
  }

  return (
    <div className="ag-theme-alpine w-full h-full">
      <AgGridReact
        rowData={data}
        columnDefs={columnDefs}
        defaultColDef={{
          resizable: true,
          sortable: true,
        }}
      />
    </div>
  );
};

export default GridPreview;
