import React, { useState, useEffect } from "react";
import { GridConfig, GridAttributeWithMeta } from "../../types";
import GridColumnList from "./GridColumnList";
import GridPreview from "./GridPreview";
import AIAssistantPanel from "./AIAssistantPanel";
import { gridAPI } from "../../api";

interface GridEditorProps {
  gridId: number;
  onSave?: (columns: GridAttributeWithMeta[]) => void;
  onPreviewChange?: (columns: GridAttributeWithMeta[], data: any[]) => void;
}

type TabMode = "columns" | "assistant";

export const GridEditor: React.FC<GridEditorProps> = ({
  gridId,
  onSave,
  onPreviewChange,
}) => {
  const [gridConfig, setGridConfig] = useState<GridConfig | null>(null);
  const [columns, setColumns] = useState<GridAttributeWithMeta[]>([]);
  const [originalColumns, setOriginalColumns] = useState<
    GridAttributeWithMeta[]
  >([]);
  const [editHistory, setEditHistory] = useState<GridAttributeWithMeta[][]>([]);
  const [syntheticData, setSyntheticData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>("columns");

  // Load grid on mount
  useEffect(() => {
    const loadGrid = async () => {
      try {
        setLoading(true);
        const data = await gridAPI.getGrid(gridId);
        if (data?.error) {
          throw new Error(data.error);
        }

        const initialColumns = data.columns.map(
          (col: GridAttributeWithMeta) => ({
            ...col,
          }),
        );

        setGridConfig(data);
        setColumns(
          initialColumns.map((col: GridAttributeWithMeta) => ({ ...col })),
        );
        setOriginalColumns(
          initialColumns.map((col: GridAttributeWithMeta) => ({ ...col })),
        );
        setEditHistory([]);

        const syntheticRows = await gridAPI.generateSyntheticData(data.columns);
        if (!syntheticRows?.error) {
          setSyntheticData(syntheticRows);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadGrid();
  }, [gridId]);

  useEffect(() => {
    onPreviewChange?.(columns, syntheticData);
  }, [columns, syntheticData, onPreviewChange]);

  const serializeColumns = (value: GridAttributeWithMeta[]) =>
    JSON.stringify(
      value.map((col) => ({
        id: col.id,
        grid_id: col.grid_id,
        column_id: col.column_id,
        header_name: col.header_name,
        width: col.width,
        min_width: col.min_width,
        max_width: col.max_width,
        position: col.position,
        sortable: col.sortable,
        resizable: col.resizable,
        filter: col.filter,
        pinned: col.pinned,
        hide: col.hide,
        flex: col.flex,
      })),
    );

  const handleColumnUpdate = (updatedColumns: GridAttributeWithMeta[]) => {
    if (serializeColumns(updatedColumns) === serializeColumns(columns)) {
      return;
    }

    setEditHistory((prev) => [...prev, columns.map((col) => ({ ...col }))]);
    setColumns(updatedColumns);
  };

  const isDirty =
    serializeColumns(columns) !== serializeColumns(originalColumns);

  const handleSave = () => {
    onSave?.(columns.map((col) => ({ ...col })));
  };

  const handleRevertLastEdit = () => {
    if (editHistory.length === 0) {
      return;
    }

    const previousColumns = editHistory[editHistory.length - 1];
    setEditHistory((prev) => prev.slice(0, prev.length - 1));
    setColumns(previousColumns.map((col) => ({ ...col })));
  };

  const handleRestoreOriginal = () => {
    if (serializeColumns(columns) === serializeColumns(originalColumns)) {
      return;
    }

    setEditHistory([]);
    setColumns(originalColumns.map((col) => ({ ...col })));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p>Loading grid workspace...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="bg-red-50 text-red-700 px-6 py-4 rounded-lg border border-red-200">
          <span className="font-semibold">Error:</span> {error}
        </div>
      </div>
    );
  }

  if (!gridConfig) return null;

  return (
    <div className="flex flex-col h-full bg-[#f8fafc]">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shadow-sm z-10">
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            {gridConfig.grid.grid_name}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Live configuration preview
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRevertLastEdit}
            disabled={editHistory.length === 0}
            className="bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 text-gray-700 px-4 py-2 rounded-md font-medium transition-colors"
          >
            Revert Last Edit
          </button>
          <button
            onClick={handleRestoreOriginal}
            disabled={!isDirty}
            className="bg-amber-100 hover:bg-amber-200 disabled:bg-amber-50 disabled:text-amber-300 text-amber-800 px-4 py-2 rounded-md font-medium transition-colors"
          >
            Restore Original
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md font-medium transition-colors shadow-sm flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              ></path>
            </svg>
            Save Configuration
          </button>
        </div>
      </div>

      <div className="px-6 py-2 bg-white border-b border-gray-100 text-sm text-gray-600">
        {isDirty ? "Unsaved grid edits" : "No unsaved grid edits"}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Stage - Full Bleed Grid Preview */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <GridPreview columns={columns} data={syntheticData} />
        </div>

        {/* Right Sidebar - Tools & AI (Remains unchanged) */}
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab("columns")}
              className={`flex-1 py-4 text-sm font-semibold transition-colors ${
                activeTab === "columns"
                  ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              Columns
            </button>
            <button
              onClick={() => setActiveTab("assistant")}
              className={`flex-1 py-4 text-sm font-semibold transition-colors ${
                activeTab === "assistant"
                  ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              AI Assistant
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30">
            {activeTab === "columns" ? (
              <div className="h-full flex flex-col animate-fadeIn">
                <GridColumnList
                  columns={columns}
                  onColumnsChange={handleColumnUpdate}
                />
              </div>
            ) : (
              <div className="h-full flex flex-col animate-fadeIn">
                <AIAssistantPanel
                  gridConfig={{ grid: gridConfig.grid, columns }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GridEditor;
