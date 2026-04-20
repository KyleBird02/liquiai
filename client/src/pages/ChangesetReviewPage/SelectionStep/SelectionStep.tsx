import React from "react";
import { useNavigate } from "react-router-dom";
import { ProposedChange } from "@/types";

interface SelectionStepProps {
  proposedChanges: ProposedChange[];
  selectedChanges: string[];
  loading: boolean;
  error: string | null;
  onChangeSelection: (changeId: string, checked: boolean) => void;
  onToggleSelectAll: () => void;
  onGenerateChangesets: () => Promise<void>;
}

export const SelectionStep: React.FC<SelectionStepProps> = ({
  proposedChanges,
  selectedChanges,
  loading,
  error,
  onChangeSelection,
  onToggleSelectAll,
  onGenerateChangesets,
}) => {
  const navigate = useNavigate();
  const allSelected =
    proposedChanges.length > 0 &&
    selectedChanges.length === proposedChanges.length;

  const getPreviewText = (change: ProposedChange): string => {
    const payload = change.payload || {};

    if (change.type === "CREATE_TABLE") {
      const cols = Array.isArray(payload.columns)
        ? payload.columns.map((c: any) => c.name).slice(0, 6)
        : [];
      const columnText = cols.length > 0 ? cols.join(", ") : "no columns";
      return `Create table preview: ${columnText}`;
    }

    if (change.type === "ALTER_TABLE") {
      const addCount = Array.isArray(payload.addedColumns)
        ? payload.addedColumns.length
        : 0;
      const removeCount = Array.isArray(payload.removedColumns)
        ? payload.removedColumns.length
        : 0;
      const modifyCount = Array.isArray(payload.modifiedColumns)
        ? payload.modifiedColumns.length
        : 0;
      return `Alter table preview: +${addCount} add, -${removeCount} remove, ~${modifyCount} modify`;
    }

    if (change.type === "EXECUTE_SQL") {
      const sql = typeof payload.sql === "string" ? payload.sql : "";
      return sql.length > 160 ? `${sql.slice(0, 160)}...` : sql;
    }

    if (change.type === "DROP_TABLE") {
      return "Drop table preview";
    }

    return "Read-only preview available in review step";
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Select Changes to Generate
        </h1>
        <p className="text-gray-600 mb-8">
          Choose which proposed changes from Phase 1 to include
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-8">
          {proposedChanges.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 mb-4">
                No proposed changes found from Phase 1
              </p>
              <button
                onClick={() => navigate("/changes")}
                className="inline-block bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
              >
                Go Back to Create Changes
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  onClick={onToggleSelectAll}
                  type="button"
                  className="px-3 py-1.5 text-sm font-medium rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50 transition"
                >
                  {allSelected ? "Clear All" : "Select All"}
                </button>
              </div>

              {proposedChanges.map((change) => (
                <label
                  key={change.id}
                  className="flex items-start p-4 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedChanges.includes(change.id)}
                    onChange={(e) =>
                      onChangeSelection(change.id, e.target.checked)
                    }
                    className="mt-1 h-4 w-4 text-blue-600 rounded"
                  />
                  <div className="ml-3 flex-1">
                    <p className="font-medium text-gray-900">
                      {change.type}
                      {change.payload?.tableName &&
                        ` - ${change.payload.tableName}`}
                    </p>
                    <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap break-words">
                      {getPreviewText(change)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Status:{" "}
                      <span className="font-medium">{change.status}</span>
                    </p>
                  </div>
                </label>
              ))}

              <div className="mt-8 flex gap-4">
                <button
                  onClick={() => navigate("/changes")}
                  className="flex-1 bg-gray-300 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-400 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={onGenerateChangesets}
                  disabled={loading || selectedChanges.length === 0}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 font-medium"
                >
                  {loading ? "Generating..." : "Generate Changesets"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
