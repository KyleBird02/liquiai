import React, { useState } from "react";
import { GridAttributeWithMeta } from "../../types";

interface GridColumnListProps {
  columns: GridAttributeWithMeta[];
  onColumnsChange: (columns: GridAttributeWithMeta[]) => void;
}

const GridColumnList: React.FC<GridColumnListProps> = ({
  columns,
  onColumnsChange,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  // Track which column is currently open for editing
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      const newColumns = [...columns];
      const [draggedColumn] = newColumns.splice(draggedIndex, 1);
      newColumns.splice(index, 0, draggedColumn);

      // Update positions
      const updated = newColumns.map((col, idx) => ({
        ...col,
        position: idx,
      }));

      setDraggedIndex(index);
      onColumnsChange(updated);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleHeaderNameChange = (id: number, newName: string) => {
    const updated = columns.map((col) =>
      col.id === id ? { ...col, header_name: newName } : col,
    );
    onColumnsChange(updated);
  };

  const handleWidthChange = (id: number, newWidth: number) => {
    const updated = columns.map((col) =>
      col.id === id ? { ...col, width: newWidth } : col,
    );
    onColumnsChange(updated);
  };

  const handleToggle = (
    id: number,
    field: keyof GridAttributeWithMeta,
    value: boolean,
  ) => {
    const updated = columns.map((col) =>
      col.id === id ? { ...col, [field]: value } : col,
    );
    onColumnsChange(updated);
  };

  const handleRemove = (id: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent the accordion from toggling when clicking remove
    const updated = columns
      .filter((col) => col.id !== id)
      .map((col, idx) => ({ ...col, position: idx }));
    onColumnsChange(updated);
  };

  return (
    <div className="space-y-2">
      {columns.map((column, index) => {
        const isExpanded = expandedId === column.id;

        return (
          <div
            key={column.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`border rounded-lg transition-all bg-white ${
              draggedIndex === index
                ? "border-blue-400 shadow-md ring-1 ring-blue-400"
                : isExpanded
                  ? "border-blue-300 shadow-sm"
                  : "border-gray-200 hover:border-gray-300"
            }`}
          >
            {/* Clickable Header Row */}
            <div
              onClick={() => toggleExpand(column.id)}
              className={`flex items-center gap-3 p-3 cursor-pointer select-none transition-colors ${
                isExpanded ? "bg-blue-50/50 rounded-t-lg" : "rounded-lg"
              }`}
            >
              {/* Drag Handle Icon */}
              <div className="text-gray-400 cursor-grab active:cursor-grabbing">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <path d="M7 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 14a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" />
                </svg>
              </div>

              <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {index}
              </span>

              <span className="font-mono text-sm text-gray-800 flex-1 truncate">
                {column.header_name}
              </span>

              {/* Remove Button */}
              <button
                onClick={(e) => handleRemove(column.id, e)}
                className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
                title="Remove Column"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>

              {/* Expand/Collapse Chevron */}
              <div
                className={`text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>

            {/* Expandable Editor Content */}
            {isExpanded && (
              <div className="p-4 border-t border-gray-100 bg-white rounded-b-lg space-y-4 animate-fadeIn">
                {/* Internal DB Name Reference */}
                <div className="flex justify-between items-center text-xs text-gray-500 bg-gray-50 p-2 rounded">
                  <span>DB Column:</span>
                  <span className="font-mono">{column.column_name}</span>
                </div>

                {/* Header Name Input */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Display Header Name
                  </label>
                  <input
                    type="text"
                    value={column.header_name}
                    onChange={(e) =>
                      handleHeaderNameChange(column.id, e.target.value)
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Width Slider */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-gray-600">
                      Width
                    </label>
                    <span className="text-xs text-blue-600 font-mono bg-blue-50 px-1.5 py-0.5 rounded">
                      {column.width}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={column.min_width}
                    max={column.max_width}
                    value={column.width}
                    onChange={(e) =>
                      handleWidthChange(column.id, parseInt(e.target.value, 10))
                    }
                    className="w-full accent-blue-600"
                  />
                </div>

                {/* Toggle Switches */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {[
                    { key: "sortable", label: "Sortable" },
                    { key: "resizable", label: "Resizable" },
                    { key: "filter", label: "Filterable" },
                    { key: "hide", label: "Hidden" },
                  ].map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(
                          column[key as keyof GridAttributeWithMeta],
                        )}
                        onChange={(e) =>
                          handleToggle(
                            column.id,
                            key as keyof GridAttributeWithMeta,
                            e.target.checked,
                          )
                        }
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700 group-hover:text-gray-900">
                        {label}
                      </span>
                    </label>
                  ))}
                </div>

                {/* Pinned Dropdown */}
                <div className="pt-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Pin Column
                  </label>
                  <select
                    value={column.pinned || ""}
                    onChange={(e) => {
                      const value = (e.target.value || null) as
                        | "left"
                        | "right"
                        | null;
                      const updated = columns.map((col) =>
                        col.id === column.id ? { ...col, pinned: value } : col,
                      );
                      onColumnsChange(updated);
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="">Unpinned (Scrollable)</option>
                    <option value="left">Pin to Left</option>
                    <option value="right">Pin to Right</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default GridColumnList;
