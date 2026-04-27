import React, { useState, useEffect, useMemo } from "react";
import { AgGridReact } from "ag-grid-react";

import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

import { Grid, GridConfig, GridAttributeWithMeta } from "../types";
import { gridAPI, changesAPI, schemaAPI } from "../api";
import GridEditor from "../components/grid/GridEditor";

interface DBConfig {
  dev: string;
  local: string;
}

const buildGridBundleSql = (gridName: string, diff: any) => {
  const lines: string[] = [
    `-- GRID CONFIG BUNDLE: ${gridName}`,
    `-- Added columns: ${diff?.addedColumns?.length || 0}`,
    `-- Removed columns: ${diff?.removedColumns?.length || 0}`,
    `-- Modified fields: ${diff?.modifiedAttributes?.length || 0}`,
  ];

  if (
    Array.isArray(diff?.modifiedAttributes) &&
    diff.modifiedAttributes.length > 0
  ) {
    lines.push("-- Modifications:");
    diff.modifiedAttributes.forEach((m: any) => {
      lines.push(
        `-- ${m.columnName}.${m.field}: ${String(m.before)} -> ${String(m.after)}`,
      );
    });
  }

  return lines.join("\n");
};

export const GridConfigPage: React.FC = () => {
  const [grids, setGrids] = useState<Grid[]>([]);
  const [config, setConfig] = useState<DBConfig | null>(null);
  const [selectedEnv, setSelectedEnv] = useState<"dev" | "local">("local");
  const [selectedGridId, setSelectedGridId] = useState<number | null>(null);
  const [currentConfig, setCurrentConfig] = useState<GridConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewGridForm, setShowNewGridForm] = useState(false);
  const [newGridName, setNewGridName] = useState("");
  const [availableColumns, setAvailableColumns] = useState<
    Array<{ id: number; column_name: string; column_type: string }>
  >([]);
  const [newGridColumns, setNewGridColumns] = useState<
    Array<{ columnName: string; columnType: string }>
  >([{ columnName: "", columnType: "" }]);
  const [step, setStep] = useState<"select" | "edit" | "review">("select");
  const [fullPreviewColumns, setFullPreviewColumns] = useState<
    GridAttributeWithMeta[]
  >([]);
  const [fullPreviewData, setFullPreviewData] = useState<any[]>([]);

  const loadGrids = async () => {
    const result = await gridAPI.listGrids();
    if (!result.error) {
      setGrids(result);
      return;
    }

    setError(result.error);
  };

  const loadGridColumns = async () => {
    const result = await gridAPI.getGridColumns();
    if (!result.error) {
      setAvailableColumns(result);
      return;
    }

    setError(result.error);
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        const cfg = await schemaAPI.getConfig();
        if (cfg && !("error" in cfg)) {
          setConfig(cfg as DBConfig);

          const localConnection = (cfg as DBConfig).local;
          if (localConnection) {
            await schemaAPI.connect(localConnection);
          }
        }

        await loadGrids();
        await loadGridColumns();
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  const handleEnvChange = async (env: "dev" | "local") => {
    try {
      setLoading(true);
      setSelectedEnv(env);
      setSelectedGridId(null);
      setCurrentConfig(null);
      setFullPreviewColumns([]);
      setFullPreviewData([]);

      const connectionString = env === "dev" ? config?.dev : config?.local;
      if (!connectionString) {
        setError("Connection string not found");
        return;
      }

      const connectResult = await schemaAPI.connect(connectionString);
      if ((connectResult as any)?.error) {
        setError((connectResult as any).error || "Failed to connect");
        return;
      }

      await loadGrids();
      await loadGridColumns();
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGridSelect = async (gridId: number) => {
    try {
      setSelectedGridId(gridId);
      const config = await gridAPI.getGrid(gridId);
      if (!config.error) {
        setCurrentConfig(config);
        setFullPreviewColumns(config.columns || []);
        setFullPreviewData([]);
        setStep("edit");
      } else {
        setError(config.error);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveConfiguration = async (columns: GridAttributeWithMeta[]) => {
    if (!selectedGridId) return;

    try {
      const result = await gridAPI.proposeGridChange(selectedGridId, columns);
      if (!result.error) {
        const currentGridName =
          currentConfig?.grid.grid_name || `grid_${selectedGridId}`;
        const payload = {
          gridId: selectedGridId,
          gridName: currentGridName,
          beforeColumns: result.diff?.before || currentConfig?.columns || [],
          afterColumns: result.diff?.after || columns,
          diff: result.diff,
          sql: buildGridBundleSql(currentGridName, result.diff),
        };

        const proposed = await changesAPI.proposeChange("GRID_CONFIG", payload);
        if ((proposed as any)?.error) {
          setError(
            (proposed as any).error || "Failed to record grid change bundle",
          );
          return;
        }

        setStep("review");
      } else {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateNewGrid = async () => {
    if (!newGridName.trim()) {
      setError("Grid name is required");
      return;
    }

    const columns = newGridColumns
      .map((col) => ({
        columnName: col.columnName.trim(),
        columnType: col.columnType.trim(),
      }))
      .filter((col) => col.columnName && col.columnType);

    try {
      setLoading(true);

      const afterColumns: GridAttributeWithMeta[] = columns.map(
        (col, index) => {
          const existing = availableColumns.find(
            (c) =>
              c.column_name.toLowerCase() === col.columnName.toLowerCase() &&
              c.column_type.toLowerCase() === col.columnType.toLowerCase(),
          );

          return {
            id: -(index + 1),
            grid_id: 0,
            column_id: existing?.id || 0,
            column_name: col.columnName,
            column_type: col.columnType,
            header_name: col.columnName
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (str) => str.toUpperCase())
              .trim(),
            width: 150,
            min_width: 80,
            max_width: 300,
            position: index,
            sortable: true,
            resizable: true,
            filter: true,
            pinned: null,
            hide: false,
            flex: null,
          };
        },
      );

      const diff = {
        type: "NEW_GRID",
        grid: { id: 0, grid_name: newGridName.trim() },
        before: null,
        after: afterColumns,
        addedColumns: afterColumns,
        removedColumns: [],
        modifiedAttributes: [],
      };

      const payload = {
        gridId: 0,
        gridName: newGridName.trim(),
        beforeColumns: [],
        afterColumns,
        diff,
        sql: buildGridBundleSql(newGridName.trim(), diff),
      };

      const proposed = await changesAPI.proposeChange("GRID_CONFIG", payload);
      if ((proposed as any)?.error) {
        setError((proposed as any).error || "Failed to stage new grid change");
        return;
      }

      setShowNewGridForm(false);
      setNewGridName("");
      setNewGridColumns([{ columnName: "", columnType: "" }]);
      setStep("review");
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to stage new grid");
    } finally {
      setLoading(false);
    }
  };

  const handleEditorPreviewChange = (
    columns: GridAttributeWithMeta[],
    data: any[],
  ) => {
    setFullPreviewColumns(columns);
    setFullPreviewData(data);
  };

  const previewColumnDefs = useMemo(() => {
    if (!fullPreviewColumns.length) return [];

    return [...fullPreviewColumns]
      .sort((a, b) => a.position - b.position)
      .filter((col) => !col.hide)
      .map((col) => ({
        headerName: col.header_name,
        field: col.column_name || `col_${col.column_id}`,
        width: col.width,
        minWidth: col.min_width,
        maxWidth: col.max_width,
        sortable: col.sortable,
        resizable: col.resizable,
        filter: col.filter,
        pinned: col.pinned || null, // AG grid uses 'left' | 'right' | null
        flex: col.flex || undefined,
      }));
  }, [fullPreviewColumns]);

  if (loading) return <div className="p-8">Loading grids...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b p-6">
        <h1 className="text-3xl font-bold mb-2">AG Grid Configuration</h1>
        <p className="text-gray-600">
          Create and edit grid configurations for AG Grid tables
        </p>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
            {error}
          </div>
        )}

        {step === "select" && (
          <div>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Select a Grid</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Environment
                  </label>
                  <select
                    value={selectedEnv}
                    onChange={(e) =>
                      handleEnvChange(e.target.value as "dev" | "local")
                    }
                    disabled={loading || !config}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="local">Local</option>
                    <option value="dev">Development</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Grid
                  </label>
                  <select
                    value={selectedGridId ?? ""}
                    onChange={(e) =>
                      setSelectedGridId(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    disabled={loading || grids.length === 0}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">-- Select a grid --</option>
                    {grids.map((grid) => (
                      <option key={grid.id} value={grid.id}>
                        {grid.grid_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-1 md:col-span-1 space-y-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    &nbsp;
                  </label>
                  <button
                    onClick={() =>
                      selectedGridId && handleGridSelect(selectedGridId)
                    }
                    disabled={loading || !selectedGridId}
                    className="w-full flex items-center justify-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    <span>Configure Grid</span>
                  </button>
                </div>
              </div>

              {grids.length === 0 && !loading && (
                <div className="text-center py-6 text-gray-500">
                  No grids found. Create one to get started.
                </div>
              )}

              {/* New Grid Form */}
              {!showNewGridForm && (
                <button
                  onClick={() => setShowNewGridForm(true)}
                  className="w-full py-2 border-2 border-dashed border-gray-300 rounded hover:border-blue-500 transition text-blue-600 font-semibold"
                >
                  + Create New Grid
                </button>
              )}

              {showNewGridForm && (
                <div className="mt-4 p-4 bg-gray-50 rounded border">
                  <input
                    type="text"
                    value={newGridName}
                    onChange={(e) => setNewGridName(e.target.value)}
                    placeholder="Enter grid name (e.g., tradeGrid)"
                    className="w-full px-3 py-2 border rounded mb-2 focus:outline-none focus:border-blue-400"
                  />

                  <div className="space-y-2 mb-3">
                    {newGridColumns.map((col, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2">
                        <input
                          list="grid-column-names"
                          value={col.columnName}
                          onChange={(e) => {
                            const next = [...newGridColumns];
                            next[idx] = {
                              ...next[idx],
                              columnName: e.target.value,
                            };
                            setNewGridColumns(next);
                          }}
                          placeholder="Column name"
                          className="col-span-5 px-3 py-2 border rounded focus:outline-none focus:border-blue-400"
                        />
                        <input
                          list="grid-column-types"
                          value={col.columnType}
                          onChange={(e) => {
                            const next = [...newGridColumns];
                            next[idx] = {
                              ...next[idx],
                              columnType: e.target.value,
                            };
                            setNewGridColumns(next);
                          }}
                          placeholder="Column type"
                          className="col-span-5 px-3 py-2 border rounded focus:outline-none focus:border-blue-400"
                        />
                        <button
                          onClick={() => {
                            if (newGridColumns.length === 1) return;
                            setNewGridColumns((prev) =>
                              prev.filter((_, i) => i !== idx),
                            );
                          }}
                          className="col-span-2 bg-red-100 text-red-700 rounded hover:bg-red-200"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        setNewGridColumns((prev) => [
                          ...prev,
                          { columnName: "", columnType: "" },
                        ])
                      }
                      className="w-full py-2 border border-dashed border-gray-300 rounded text-sm text-blue-600 hover:border-blue-400"
                    >
                      + Add Column
                    </button>
                  </div>

                  <datalist id="grid-column-names">
                    {Array.from(
                      new Set(availableColumns.map((c) => c.column_name)),
                    ).map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <datalist id="grid-column-types">
                    {Array.from(
                      new Set(availableColumns.map((c) => c.column_type)),
                    ).map((type) => (
                      <option key={type} value={type} />
                    ))}
                  </datalist>

                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateNewGrid}
                      className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setNewGridName("");
                        setNewGridColumns([{ columnName: "", columnType: "" }]);
                        setShowNewGridForm(false);
                      }}
                      className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === "edit" && selectedGridId && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">
                Edit Grid: {currentConfig?.grid.grid_name}
              </h2>
              <button
                onClick={() => setStep("select")}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                ← Back
              </button>
            </div>

            {/* The underlying editor component */}
            <GridEditor
              gridId={selectedGridId}
              onSave={handleSaveConfiguration}
              onPreviewChange={handleEditorPreviewChange}
            />
          </div>
        )}

        {step === "review" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Review Changes</h2>
            <p className="text-gray-600 mb-4">
              Grid changes will be converted to Liquibase changesets here.
            </p>
            <button
              onClick={() => setStep("select")}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              ← Back to Selection
            </button>
          </div>
        )}
      </div>
      {step === "edit" && selectedGridId && (
        <div className="w-[100vw] ml-[calc(50%-50vw)] bg-gray-50 border-t mt-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Live Configuration Preview
            </h3>
          </div>

          <div className="ag-theme-alpine w-full h-[400px] border-y border-gray-200">
            <AgGridReact
              rowData={fullPreviewData}
              columnDefs={previewColumnDefs}
              defaultColDef={{
                minWidth: 50,
                resizable: true,
                sortable: true,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default GridConfigPage;
