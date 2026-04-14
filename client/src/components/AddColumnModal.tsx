import React, { useState } from "react";
import { X, Trash2 } from "lucide-react";
import {
  ColumnDefinition,
  ForeignKeyDefinition,
  TableDefinition,
} from "../types";

interface AddColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (
    column: ColumnDefinition,
    foreignKey?: ForeignKeyDefinition,
  ) => Promise<void>;
  tableName: string;
  availableTables: TableDefinition[];
}

export const AddColumnModal: React.FC<AddColumnModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  tableName,
  availableTables,
}) => {
  const [name, setName] = useState("");
  const [type, setType] = useState("VARCHAR(255)");
  const [nullable, setNullable] = useState(true);
  const [defaultValue, setDefaultValue] = useState("");

  const [isForeign, setIsForeign] = useState(false);
  const [fkTable, setFkTable] = useState("");
  const [fkColumn, setFkColumn] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getColumnsForTable = (tName: string): string[] => {
    const table = availableTables.find((t) => t.name === tName);
    return table ? table.columns.map((c) => c.name) : [];
  };

  const handleAdd = async () => {
    if (!name.trim()) {
      setError("Column name is required");
      return;
    }

    if (isForeign && (!fkTable || !fkColumn)) {
      setError("Please select referenced table and column for foreign key");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const newColumn: ColumnDefinition = {
        name,
        type,
        nullable,
        defaultValue: defaultValue.trim() || null,
        isPrimaryKey: false,
      };

      let foreignKey: ForeignKeyDefinition | undefined;
      if (isForeign && fkTable && fkColumn) {
        foreignKey = {
          constraintName: `fk_${tableName}_${name}`,
          column: name,
          referencedTable: fkTable,
          referencedColumn: fkColumn,
          onDelete: "RESTRICT",
        };
      }

      await onAdd(newColumn, foreignKey);

      // Reset
      setName("");
      setType("VARCHAR(255)");
      setNullable(true);
      setDefaultValue("");
      setIsForeign(false);
      setFkTable("");
      setFkColumn("");
    } catch (err: any) {
      setError(err.message || "Failed to add column");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">Add Column to {tableName}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm mb-4">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Column Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. status"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          </div>

          <div className="flex items-center space-x-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={nullable}
                onChange={(e) => setNullable(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Nullable
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isForeign}
                onChange={(e) => setIsForeign(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Foreign Key
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Value
            </label>
            <input
              type="text"
              value={defaultValue}
              onChange={(e) => setDefaultValue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="e.g. 'active', 0, CURRENT_TIMESTAMP"
            />
          </div>

          {isForeign && (
            <div className="bg-blue-50 p-4 rounded border border-blue-100 space-y-3 mt-4">
              <h4 className="text-sm font-semibold text-blue-800">
                Foreign Key Settings
              </h4>
              <div>
                <label className="block text-xs font-medium text-blue-700 mb-1">
                  Referenced Table
                </label>
                <select
                  value={fkTable}
                  onChange={(e) => setFkTable(e.target.value)}
                  className="w-full px-3 py-2 border border-blue-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select a table --</option>
                  {availableTables.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {fkTable && (
                <div>
                  <label className="block text-xs font-medium text-blue-700 mb-1">
                    Referenced Column
                  </label>
                  <select
                    value={fkColumn}
                    onChange={(e) => setFkColumn(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select a column --</option>
                    {getColumnsForTable(fkTable).map((colName) => (
                      <option key={colName} value={colName}>
                        {colName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add Column"}
          </button>
        </div>
      </div>
    </div>
  );
};
