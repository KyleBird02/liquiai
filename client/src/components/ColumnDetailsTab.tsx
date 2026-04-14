import React, { useState } from "react";
import {
  TableDefinition,
  ColumnDefinition,
  ColumnDetails,
} from "@/types/index";
import {
  ChevronDown,
  ChevronUp,
  Edit2,
  Save,
  X,
  Key,
  Link,
  AlertCircle,
  Plus,
  Trash2,
} from "lucide-react";

interface ColumnDetailsTabProps {
  table: TableDefinition;
  selectedEnv: "dev" | "local";
  onUpdateColumn?: (
    columnName: string,
    updates: Partial<ColumnDefinition>,
  ) => Promise<void>;
  onAddColumn?: () => Promise<void>;
  onDeleteColumn?: (columnName: string) => Promise<void>;
}

interface EditingColumn {
  originalName: string;
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
}

export const ColumnDetailsTab: React.FC<ColumnDetailsTabProps> = ({
  table,
  selectedEnv,
  onUpdateColumn,
  onAddColumn,
  onDeleteColumn,
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editingColumn, setEditingColumn] = useState<EditingColumn | null>(
    null,
  );
  const [updatingColumn, setUpdatingColumn] = useState<string | null>(null);
  const [deletingColumn, setDeletingColumn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canEdit =
    selectedEnv === "local" &&
    (onUpdateColumn || onAddColumn || onDeleteColumn);

  const toggleRow = (columnName: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(columnName)) {
      newExpanded.delete(columnName);
    } else {
      newExpanded.add(columnName);
    }
    setExpandedRows(newExpanded);
  };

  const startEdit = (column: ColumnDefinition) => {
    setEditingColumn({
      originalName: column.name,
      name: column.name,
      type: column.type,
      nullable: column.nullable,
      defaultValue: column.defaultValue,
    });
  };

  const cancelEdit = () => {
    setEditingColumn(null);
    setError(null);
  };

  const handleDeleteColumn = async (columnName: string) => {
    if (!onDeleteColumn) return;
    setDeletingColumn(columnName);
    try {
      await onDeleteColumn(columnName);
      setEditingColumn(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete column");
    } finally {
      setDeletingColumn(null);
    }
  };

  const handleAddColumn = async () => {
    if (!onAddColumn) return;
    try {
      await onAddColumn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add column");
    }
  };

  const saveEdit = async (originalName: string) => {
    if (!editingColumn || !onUpdateColumn) return;

    setUpdatingColumn(originalName);
    setError(null);

    try {
      await onUpdateColumn(originalName, {
        name: editingColumn.name,
        type: editingColumn.type,
        nullable: editingColumn.nullable,
        defaultValue: editingColumn.defaultValue,
      });
      setEditingColumn(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update column");
    } finally {
      setUpdatingColumn(null);
    }
  };

  return (
    <div className="w-full">
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        {canEdit && (
          <button
            onClick={handleAddColumn}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm font-medium"
            title="Add new column to table"
          >
            <Plus size={16} />
            Add Column
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-12 px-4 py-3 text-left text-xs font-semibold text-gray-700"></th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">
                Column Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">
                Data Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">
                Col #
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">
                Collation
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">
                Not Null
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">
                Default
              </th>
              {canEdit && (
                <th className="w-20 px-4 py-3 text-left text-xs font-semibold text-gray-700">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {table.columns.map((column, index) => {
              const isExpanded = expandedRows.has(column.name);
              const isEditing = editingColumn?.originalName === column.name;

              return (
                <React.Fragment key={column.name}>
                  {/* Main Row */}
                  <tr
                    className={`border-b border-gray-200 transition ${
                      isEditing ? "bg-indigo-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleRow(column.name)}
                        className="p-1 hover:bg-gray-200 rounded transition"
                        title="Show/hide details"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {column.isPrimaryKey && (
                          <Key className="w-4 h-4 text-yellow-600" />
                        )}
                        {column.isForeignKey && (
                          <Link className="w-4 h-4 text-blue-600" />
                        )}
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingColumn?.name || ""}
                            onChange={(e) =>
                              setEditingColumn({
                                ...editingColumn!,
                                name: e.target.value,
                              })
                            }
                            className="px-2 py-1 border border-indigo-300 rounded font-mono text-sm"
                          />
                        ) : (
                          <span className="font-mono text-sm">
                            {column.name}
                            {column._isProposed && (
                              <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-green-100 text-green-800 rounded uppercase font-bold tracking-wider">
                                New
                              </span>
                            )}
                            {column._isProposedEdit && (
                              <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-yellow-100 text-yellow-800 rounded uppercase font-bold tracking-wider">
                                Edited
                              </span>
                            )}
                            {column._isPendingDelete && (
                              <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-red-100 text-red-800 rounded uppercase font-bold tracking-wider">
                                Pending Drop
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingColumn?.type || ""}
                          onChange={(e) =>
                            setEditingColumn({
                              ...editingColumn!,
                              type: e.target.value,
                            })
                          }
                          className="px-2 py-1 border border-indigo-300 rounded font-mono text-sm"
                        />
                      ) : (
                        <span className="font-mono text-sm text-gray-600">
                          {column.type}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {column.ordinalPosition || index + 1}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {column.collation || "default"}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="checkbox"
                          checked={!editingColumn?.nullable}
                          onChange={(e) =>
                            setEditingColumn({
                              ...editingColumn!,
                              nullable: !e.target.checked,
                            })
                          }
                          className="w-4 h-4"
                        />
                      ) : (
                        <span className="text-sm">
                          {!column.nullable ? (
                            <span className="text-amber-600 font-medium">
                              YES
                            </span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingColumn?.defaultValue || ""}
                          onChange={(e) =>
                            setEditingColumn({
                              ...editingColumn!,
                              defaultValue: e.target.value || null,
                            })
                          }
                          placeholder="null"
                          className="px-2 py-1 border border-indigo-300 rounded font-mono text-sm w-full"
                        />
                      ) : (
                        <span className="font-mono text-sm text-gray-600">
                          {column.defaultValue || "—"}
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-center">
                        {isEditing ? (
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => saveEdit(column.name)}
                              disabled={updatingColumn === column.name}
                              className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                              title="Save changes"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteColumn(column.name)}
                              disabled={deletingColumn === column.name}
                              className="p-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                              title="Delete column"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                              title="Cancel editing"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(column)}
                            className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                            title="Edit column"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>

                  {/* Expanded Details Row */}
                  {isExpanded && (
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <td colSpan={canEdit ? 8 : 7} className="px-4 py-4">
                        <div className="space-y-6">
                          {/* Column Info Section */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900 mb-3">
                              Column Information
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-gray-500">Position</p>
                                <p className="font-mono font-semibold text-gray-900">
                                  {column.ordinalPosition || index + 1}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500">Type</p>
                                <p className="font-mono font-semibold text-gray-900">
                                  {column.type}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500">Nullable</p>
                                <p className="font-semibold text-gray-900">
                                  {column.nullable ? "Yes" : "No"}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500">Collation</p>
                                <p className="font-mono text-gray-900">
                                  {column.collation || "default"}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Type Specifics */}
                          {(column.charMaxLength ||
                            column.numericPrecision) && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 mb-2">
                                Type Details
                              </h4>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                {column.charMaxLength && (
                                  <div>
                                    <p className="text-gray-500">Max Length</p>
                                    <p className="font-semibold text-gray-900">
                                      {column.charMaxLength}
                                    </p>
                                  </div>
                                )}
                                {column.numericPrecision && (
                                  <div>
                                    <p className="text-gray-500">Precision</p>
                                    <p className="font-semibold text-gray-900">
                                      {column.numericPrecision}
                                    </p>
                                  </div>
                                )}
                                {column.numericScale !== undefined &&
                                  column.numericScale !== null && (
                                    <div>
                                      <p className="text-gray-500">Scale</p>
                                      <p className="font-semibold text-gray-900">
                                        {column.numericScale}
                                      </p>
                                    </div>
                                  )}
                              </div>
                            </div>
                          )}

                          {/* Constraints & Relations */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900 mb-2">
                              Constraints & Relations
                            </h4>
                            <div className="space-y-2 text-sm">
                              {column.isPrimaryKey && (
                                <div className="flex items-center gap-2 text-yellow-700 bg-yellow-50 px-3 py-2 rounded">
                                  <Key className="w-4 h-4" />
                                  <span>Primary Key</span>
                                </div>
                              )}
                              {column.isForeignKey && (
                                <div className="flex items-center gap-2 text-blue-700 bg-blue-50 px-3 py-2 rounded">
                                  <Link className="w-4 h-4" />
                                  <span>
                                    Foreign Key — References a related table
                                  </span>
                                </div>
                              )}
                              {!column.isPrimaryKey && !column.isForeignKey && (
                                <p className="text-gray-500 italic">
                                  No special constraints
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Default Value */}
                          {column.defaultValue && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 mb-2">
                                Default Value
                              </h4>
                              <code className="block bg-gray-100 px-3 py-2 rounded font-mono text-sm text-gray-900">
                                {column.defaultValue}
                              </code>
                            </div>
                          )}

                          {/* Indexes */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900 mb-2">
                              Indexes
                            </h4>
                            {table.indexes.some((idx) =>
                              idx.columns.includes(column.name),
                            ) ? (
                              <div className="space-y-1 text-sm">
                                {table.indexes
                                  .filter((idx) =>
                                    idx.columns.includes(column.name),
                                  )
                                  .map((idx) => (
                                    <div
                                      key={idx.name}
                                      className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded"
                                    >
                                      <span className="font-mono text-gray-900">
                                        {idx.name}
                                      </span>
                                      {idx.unique && (
                                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                                          UNIQUE
                                        </span>
                                      )}
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <p className="text-gray-500 italic text-sm">
                                No indexes on this column
                              </p>
                            )}
                          </div>

                          {/* Foreign Keys */}
                          {table.foreignKeys.some(
                            (fk) => fk.column === column.name,
                          ) && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 mb-2">
                                Foreign Key References
                              </h4>
                              <div className="space-y-2">
                                {table.foreignKeys
                                  .filter((fk) => fk.column === column.name)
                                  .map((fk) => (
                                    <div
                                      key={fk.constraintName}
                                      className="px-3 py-2 bg-white border border-gray-200 rounded text-sm"
                                    >
                                      <p className="text-gray-500">
                                        {fk.constraintName}
                                      </p>
                                      <p className="font-mono text-gray-900">
                                        {fk.referencedTable}.
                                        {fk.referencedColumn}
                                      </p>
                                      <p className="text-gray-600 text-xs mt-1">
                                        On Delete: {fk.onDelete}
                                      </p>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}

                          {/* Note about features */}
                          <div className="bg-blue-50 border border-blue-200 px-3 py-2 rounded text-xs text-blue-700">
                            <p>
                              <strong>Note:</strong> Triggers, policies, and
                              permissions will be shown in detail views. Column
                              editing available in local environment only.
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {table.columns.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No columns in this table</p>
        </div>
      )}
    </div>
  );
};
