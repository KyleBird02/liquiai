import React, { useState } from "react";
import { X, Plus, Trash2, ChevronDown } from "lucide-react";
import {
  ColumnDefinition,
  CreateTablePayload,
  ForeignKeyDefinition,
  SchemaSnapshot,
  TableDefinition,
} from "../types";
import { changesAPI } from "../api";

interface CreateTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionString: string;
  onTableCreated?: (change: any) => void;
  snapshot?: SchemaSnapshot;
  proposedTables?: TableDefinition[];
}

export const CreateTableModal: React.FC<CreateTableModalProps> = ({
  isOpen,
  onClose,
  connectionString,
  onTableCreated,
  snapshot,
  proposedTables = [],
}) => {
  const [mode, setMode] = useState<"form" | "sql">("form");
  const [tableName, setTableName] = useState("");
  const [schema, setSchema] = useState("public");
  const [columns, setColumns] = useState<ColumnDefinition[]>([
    {
      name: "id",
      type: "INTEGER",
      nullable: false,
      defaultValue: null,
      isPrimaryKey: true,
    },
  ]);
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyDefinition[]>([]);
  const [sqlText, setSqlText] = useState("");
  const [Loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedColumn, setExpandedColumn] = useState<number | null>(null);
  const [columnKeyTypes, setColumnKeyTypes] = useState<
    Record<number, "none" | "primary" | "foreign">
  >({
    0: "primary",
  });
  const [columnFKRefs, setColumnFKRefs] = useState<
    Record<number, { table?: string; column?: string; onDelete?: string }>
  >({});

  const availableTables = [...(snapshot?.tables || []), ...proposedTables].map(
    (t) => ({ name: t.name, schema: t.schema }),
  );

  const handleAddColumn = () => {
    const newColumn: ColumnDefinition = {
      name: `column_${columns.length}`,
      type: "VARCHAR(255)",
      nullable: true,
      defaultValue: null,
      isPrimaryKey: false,
    };
    const newIndex = columns.length;
    setColumns([...columns, newColumn]);
    setColumnKeyTypes({ ...columnKeyTypes, [newIndex]: "none" });
    setColumnFKRefs({ ...columnFKRefs, [newIndex]: { onDelete: "RESTRICT" } });
  };

  const handleRemoveColumn = (index: number) => {
    setColumns(columns.filter((_, i) => i !== index));
    const newKeyTypes = { ...columnKeyTypes };
    const newFKRefs = { ...columnFKRefs };
    delete newKeyTypes[index];
    delete newFKRefs[index];
    setColumnKeyTypes(newKeyTypes);
    setColumnFKRefs(newFKRefs);
  };

  const handleColumnChange = (
    index: number,
    field: keyof ColumnDefinition,
    value: any,
  ) => {
    const newColumns = [...columns];
    if (field === "nullable" || field === "isPrimaryKey") {
      newColumns[index][field] = value === "true" || value === true;
    } else {
      (newColumns[index][field] as any) = value;
    }
    setColumns(newColumns);
  };

  const handleKeyTypeChange = (
    index: number,
    keyType: "none" | "primary" | "foreign",
  ) => {
    setColumnKeyTypes({ ...columnKeyTypes, [index]: keyType });

    const newColumns = [...columns];
    newColumns[index].isPrimaryKey = keyType === "primary";
    setColumns(newColumns);

    if (keyType === "foreign") {
      newColumns[index].isPrimaryKey = false;
      setColumns(newColumns);
    }
  };

  const handleFKTableChange = (index: number, tableName: string) => {
    setColumnFKRefs({
      ...columnFKRefs,
      [index]: { ...columnFKRefs[index], table: tableName },
    });
  };

  const handleFKColumnChange = (index: number, columnName: string) => {
    setColumnFKRefs({
      ...columnFKRefs,
      [index]: { ...columnFKRefs[index], column: columnName },
    });
  };

  const handleFKConstraintChange = (index: number, constraint: string) => {
    setColumnFKRefs({
      ...columnFKRefs,
      [index]: { ...columnFKRefs[index], onDelete: constraint },
    });
  };

  const getColumnsForTable = (tableName: string): string[] => {
    const table = availableTables.find((t) => t.name === tableName);
    if (!table) return [];

    const foundTable =
      snapshot?.tables.find((t) => t.name === tableName) ||
      proposedTables.find((t) => t.name === tableName);

    return foundTable?.columns.map((c) => c.name) || [];
  };

  const handlePropose = async () => {
    if (!tableName.trim()) {
      setError("Table name is required");
      return;
    }

    if (mode === "form" && columns.length === 0) {
      setError("At least one column is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const constraintForeignKeys: ForeignKeyDefinition[] = [];
      const updatedColumns = [...columns];

      Object.entries(columnFKRefs).forEach(([indexStr, ref]) => {
        const index = parseInt(indexStr);
        if (columnKeyTypes[index] === "foreign" && ref.table && ref.column) {
          updatedColumns[index].isForeignKey = true;

          constraintForeignKeys.push({
            constraintName: `fk_${tableName}_${columns[index].name}`,
            column: columns[index].name,
            referencedTable: ref.table,
            referencedColumn: ref.column,
            onDelete: ref.onDelete || "RESTRICT",
          });
        }
      });

      const payload: CreateTablePayload = {
        tableName,
        schema,
        columns: mode === "form" ? updatedColumns : [],
        primaryKey: updatedColumns
          .filter((c) => c.isPrimaryKey)
          .map((c) => c.name),
        foreignKeys:
          constraintForeignKeys.length > 0 ? constraintForeignKeys : undefined,
      };

      const response = await changesAPI.proposeChange("CREATE_TABLE", payload);

      if (onTableCreated) {
        onTableCreated(response);
      }

      // Reset form
      setTableName("");
      setColumns([
        {
          name: "id",
          type: "INTEGER",
          nullable: false,
          defaultValue: null,
          isPrimaryKey: true,
        },
      ]);
      setForeignKeys([]);
      setSqlText("");
      setColumnKeyTypes({ 0: "primary" });
      setColumnFKRefs({});
      setExpandedColumn(null);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to propose table");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold">Create New Table</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b px-6 pt-4">
          <button
            onClick={() => setMode("form")}
            className={`px-4 py-2 font-medium transition ${
              mode === "form"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Form Builder
          </button>
          <button
            onClick={() => setMode("sql")}
            className={`px-4 py-2 font-medium transition ${
              mode === "sql"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            SQL Editor
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
              {error}
            </div>
          )}

          {mode === "form" ? (
            <div className="space-y-4">
              {/* Schema and Table Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Schema
                  </label>
                  <input
                    type="text"
                    value={schema}
                    onChange={(e) => setSchema(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="public"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Table Name
                  </label>
                  <input
                    type="text"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="my_table"
                  />
                </div>
              </div>

              {/* Columns */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Columns
                  </label>
                  <button
                    onClick={handleAddColumn}
                    className="flex items-center gap-2 px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm"
                  >
                    <Plus size={16} />
                    Add Column
                  </button>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {columns.map((col, idx) => (
                    <div
                      key={idx}
                      className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden"
                    >
                      {/* Main Row */}
                      <div className="flex gap-2 items-end p-3">
                        <button
                          onClick={() =>
                            setExpandedColumn(
                              expandedColumn === idx ? null : idx,
                            )
                          }
                          className="p-1 hover:bg-gray-200 rounded transition"
                        >
                          <ChevronDown
                            size={16}
                            className={`transition-transform ${
                              expandedColumn === idx ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        <input
                          type="text"
                          value={col.name}
                          onChange={(e) =>
                            handleColumnChange(idx, "name", e.target.value)
                          }
                          placeholder="Column name"
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        <select
                          value={col.type}
                          onChange={(e) =>
                            handleColumnChange(idx, "type", e.target.value)
                          }
                          className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="INTEGER">INTEGER</option>
                          <option value="VARCHAR(255)">VARCHAR(255)</option>
                          <option value="TEXT">TEXT</option>
                          <option value="BOOLEAN">BOOLEAN</option>
                          <option value="TIMESTAMP">TIMESTAMP</option>
                          <option value="DECIMAL">DECIMAL</option>
                          <option value="DATE">DATE</option>
                          <option value="UUID">UUID</option>
                          <option value="BIGINT">BIGINT</option>
                          <option value="SMALLINT">SMALLINT</option>
                          <option value="FLOAT">FLOAT</option>
                          <option value="DOUBLE">DOUBLE</option>
                          <option value="NUMERIC">NUMERIC</option>
                        </select>

                        <label className="flex items-center gap-1 text-sm whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={col.nullable}
                            onChange={(e) =>
                              handleColumnChange(
                                idx,
                                "nullable",
                                e.target.checked,
                              )
                            }
                            className="rounded"
                          />
                          Nullable
                        </label>

                        <button
                          onClick={() => handleRemoveColumn(idx)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded transition"
                          disabled={columns.length === 1}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {/* Expanded Details */}
                      {expandedColumn === idx && (
                        <div className="border-t border-gray-200 bg-white p-4 space-y-4">
                          {/* Key Type Selection */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Key Type
                            </label>
                            <div className="flex gap-3">
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="radio"
                                  name={`keytype-${idx}`}
                                  value="none"
                                  checked={columnKeyTypes[idx] === "none"}
                                  onChange={(e) =>
                                    handleKeyTypeChange(
                                      idx,
                                      e.target.value as
                                        | "none"
                                        | "primary"
                                        | "foreign",
                                    )
                                  }
                                />
                                None
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="radio"
                                  name={`keytype-${idx}`}
                                  value="primary"
                                  checked={columnKeyTypes[idx] === "primary"}
                                  onChange={(e) =>
                                    handleKeyTypeChange(
                                      idx,
                                      e.target.value as
                                        | "none"
                                        | "primary"
                                        | "foreign",
                                    )
                                  }
                                />
                                Primary Key
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="radio"
                                  name={`keytype-${idx}`}
                                  value="foreign"
                                  checked={columnKeyTypes[idx] === "foreign"}
                                  onChange={(e) =>
                                    handleKeyTypeChange(
                                      idx,
                                      e.target.value as
                                        | "none"
                                        | "primary"
                                        | "foreign",
                                    )
                                  }
                                />
                                Foreign Key
                              </label>
                            </div>
                          </div>

                          {/* Default Value */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Default Value (optional)
                            </label>
                            <input
                              type="text"
                              value={col.defaultValue || ""}
                              onChange={(e) =>
                                handleColumnChange(
                                  idx,
                                  "defaultValue",
                                  e.target.value || null,
                                )
                              }
                              placeholder="e.g., 0, 'active', uuid_generate_v4()"
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Leave empty for no default. Use expressions like
                              CURRENT_TIMESTAMP or function calls.
                            </p>
                          </div>

                          {/* Foreign Key Selection */}
                          {columnKeyTypes[idx] === "foreign" && (
                            <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-3">
                              <label className="block text-sm font-medium text-gray-700">
                                Referenced Table
                              </label>
                              <select
                                value={columnFKRefs[idx]?.table || ""}
                                onChange={(e) =>
                                  handleFKTableChange(idx, e.target.value)
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">-- Select a table --</option>
                                {availableTables.map((table) => (
                                  <option key={table.name} value={table.name}>
                                    {table.schema}.{table.name}
                                  </option>
                                ))}
                              </select>

                              {columnFKRefs[idx]?.table && (
                                <>
                                  <label className="block text-sm font-medium text-gray-700">
                                    Referenced Column
                                  </label>
                                  <select
                                    value={columnFKRefs[idx]?.column || ""}
                                    onChange={(e) =>
                                      handleFKColumnChange(idx, e.target.value)
                                    }
                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="">
                                      -- Select a column --
                                    </option>
                                    {getColumnsForTable(
                                      columnFKRefs[idx]?.table || "",
                                    ).map((colName) => (
                                      <option key={colName} value={colName}>
                                        {colName}
                                      </option>
                                    ))}
                                  </select>

                                  <label className="block text-sm font-medium text-gray-700 mt-3">
                                    On Delete Constraint
                                  </label>
                                  <select
                                    value={
                                      columnFKRefs[idx]?.onDelete || "RESTRICT"
                                    }
                                    onChange={(e) =>
                                      handleFKConstraintChange(
                                        idx,
                                        e.target.value,
                                      )
                                    }
                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="RESTRICT">
                                      RESTRICT (Default)
                                    </option>
                                    <option value="CASCADE">CASCADE</option>
                                    <option value="SET NULL">SET NULL</option>
                                    <option value="SET DEFAULT">
                                      SET DEFAULT
                                    </option>
                                    <option value="NO ACTION">NO ACTION</option>
                                  </select>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SQL Statement
              </label>
              <textarea
                value={sqlText}
                onChange={(e) => setSqlText(e.target.value)}
                placeholder="CREATE TABLE public.my_table (...)"
                className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Footer */}
          <div className="flex gap-3 justify-end mt-6 pt-6 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handlePropose}
              disabled={Loading}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 transition"
            >
              {Loading ? "Proposing..." : "Propose Table"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
