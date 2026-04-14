import React, { useEffect, useState } from "react";
import {
  SchemaSnapshot,
  TableDefinition,
  ProposedChange,
  ColumnModification,
  AlterTablePayload,
  ColumnDefinition,
} from "@/types/index";
import { schemaAPI, changesAPI } from "@/api/index";
import {
  SchemaViewer,
  CreateTableModal,
  ColumnDetailsTab,
  AddColumnModal,
} from "@/components/index";
import { Loader2, Plus, Zap } from "lucide-react";

interface DBConfig {
  dev: string;
  local: string;
}

export const SchemaPage: React.FC = () => {
  const [config, setConfig] = useState<DBConfig | null>(null);
  const [selectedEnv, setSelectedEnv] = useState<"dev" | "local">("local");
  const [snapshot, setSnapshot] = useState<SchemaSnapshot | null>(null);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [activeTab, setActiveTab] = useState<
    "relationships" | "data" | "schema"
  >("schema");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAddColumnModalOpen, setIsAddColumnModalOpen] = useState(false);
  const [proposedChanges, setProposedChanges] = useState<ProposedChange[]>([]);
  const [proposedTables, setProposedTables] = useState<TableDefinition[]>([]);

  // Load configuration on mount
  useEffect(() => {
    schemaAPI.getConfig().then((cfg) => {
      if (cfg && !("error" in cfg)) {
        setConfig(cfg as DBConfig);
      }
    });

    // Load proposed changes
    loadProposedChanges();
  }, []);

  // Load local schema on mount after config is available
  useEffect(() => {
    if (config?.local && selectedEnv === "local" && !snapshot) {
      handleEnvChange("local");
    }
  }, [config]);

  // Load proposed changes from backend
  const loadProposedChanges = async () => {
    try {
      const result = (await changesAPI.listChanges()) as any;
      if (result && !("error" in result)) {
        const changes = result.changes || [];
        setProposedChanges(changes);

        // Extract proposed tables
        const proposed = changes
          .filter((c: ProposedChange) => c.type === "CREATE_TABLE")
          .map((c: ProposedChange) => ({
            name: (c.payload as any).tableName,
            schema: (c.payload as any).schema,
            columns: (c.payload as any).columns,
            indexes: [],
            foreignKeys: (c.payload as any).foreignKeys || [],
            primaryKey: (c.payload as any).primaryKey || [],
          }));
        setProposedTables(proposed);
      }
    } catch (err) {
      console.error("Failed to load proposed changes:", err);
    }
  };

  const handleTableCreated = (response: any) => {
    loadProposedChanges();
    // Optionally select the newly created table
    if (response && response.change) {
      const newTableName = response.change.payload.tableName;
      setSelectedTable(newTableName);
    }
  };

  const handleApplyChange = async (changeId: string) => {
    const connectionString =
      selectedEnv === "dev" ? config?.dev : config?.local;
    if (!connectionString) {
      setError("No connection string available");
      return;
    }

    try {
      const result = (await changesAPI.applyChange(
        changeId,
        connectionString,
      )) as any;
      if (result && !("error" in result)) {
        alert("Table created successfully!");
        loadProposedChanges();
        // Refresh schema
        handleEnvChange(selectedEnv);
      } else {
        setError(result.error || "Failed to apply change");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply change");
    }
  };

  const handleRevertChange = async (changeId: string) => {
    if (
      !confirm(
        "Are you sure you want to revert this change in your local database?",
      )
    )
      return;
    const connectionString = config?.local;
    if (!connectionString) {
      setError("No local connection string available");
      return;
    }

    try {
      const result = (await changesAPI.revertChange(
        changeId,
        connectionString,
      )) as any;
      if (result && !("error" in result)) {
        alert("Change reverted successfully!");
        loadProposedChanges();
        handleEnvChange("local");
      } else {
        setError(result.error || "Failed to revert change");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revert change");
    }
  };

  const handleUpdateColumn = async (
    columnName: string,
    updates: Partial<ColumnDefinition>,
  ) => {
    const selectedTableObj = getDisplayTable();

    if (selectedTableObj.name === "") {
      throw new Error("Table not found");
    }

    const schema = selectedTableObj.schema || "public";

    // Find the original column
    const originalColumn = selectedTableObj.columns.find(
      (c) => c.name === columnName,
    );
    if (!originalColumn) {
      throw new Error("Column not found");
    }

    // Create the modified column with the updates
    const modifiedColumn: ColumnDefinition = {
      ...originalColumn,
      ...updates,
    };

    // Create a ColumnModification record
    const columnModification: ColumnModification = {
      columnName: originalColumn.name,
      oldDefinition: originalColumn,
      newDefinition: modifiedColumn,
    };

    // Create the ALTER_TABLE payload
    const payload: AlterTablePayload = {
      tableName: selectedTable,
      schema,
      modifiedColumns: [columnModification],
    };

    try {
      // Propose the change instead of applying it directly
      const response = await changesAPI.proposeChange("ALTER_TABLE", payload);

      if (response && "error" in response) {
        throw new Error(response.error);
      }

      // Reload proposed changes to show the new one
      await loadProposedChanges();

      // Show success message
      alert(`Column update proposed! Review it in the Changes tab.`);
    } catch (err) {
      throw err;
    }
  };

  const handleAddColumn = async (
    newColumn: ColumnDefinition,
    foreignKey?: any,
  ) => {
    const selectedTableObj = getDisplayTable();

    if (selectedTableObj.name === "") {
      throw new Error("Table not found");
    }

    const schema = selectedTableObj.schema || "public";

    // Create the ALTER_TABLE payload
    const payload: AlterTablePayload = {
      tableName: selectedTable,
      schema,
      addedColumns: [newColumn],
      addedForeignKeys: foreignKey ? [foreignKey] : undefined,
    };

    try {
      // Propose the change instead of applying it directly
      const response = await changesAPI.proposeChange("ALTER_TABLE", payload);

      if (response && "error" in response) {
        throw new Error(response.error);
      }

      // Reload proposed changes to show the new one
      await loadProposedChanges();
      setIsAddColumnModalOpen(false);

      // Show success message
      alert(`Column added! Review it in the Changes tab.`);
    } catch (err) {
      throw err;
    }
  };

  const handleDeleteColumn = async (columnName: string) => {
    const selectedTableObj = getDisplayTable();

    if (selectedTableObj.name === "") {
      throw new Error("Table not found");
    }

    const schema = selectedTableObj.schema || "public";

    // Find the column to delete
    const columnToDelete = selectedTableObj.columns.find(
      (c) => c.name === columnName,
    );

    if (!columnToDelete) {
      throw new Error("Column not found");
    }

    // Confirm before deleting
    if (
      !confirm(
        `Are you sure you want to delete column "${columnName}"? This will result in a DROP COLUMN operation.`,
      )
    ) {
      return;
    }

    // Create the ALTER_TABLE payload
    const payload: AlterTablePayload = {
      tableName: selectedTable,
      schema,
      removedColumns: [columnToDelete],
    };

    try {
      // Propose the change instead of applying it directly
      const response = await changesAPI.proposeChange("ALTER_TABLE", payload);

      if (response && "error" in response) {
        throw new Error(response.error);
      }

      // Reload proposed changes to show the new one
      await loadProposedChanges();

      // Show success message
      alert(`Column deletion proposed! Review it in the Changes tab.`);
    } catch (err) {
      throw err;
    }
  };

  // Fetch schema when environment changes
  const handleEnvChange = async (env: "dev" | "local") => {
    setSelectedEnv(env);
    setSelectedTable("");
    setLoading(true);
    setError(null);

    try {
      const connectionString = env === "dev" ? config?.dev : config?.local;
      if (!connectionString) {
        setError("Connection string not found");
        return;
      }

      const result = (await schemaAPI.captureSnapshot(connectionString)) as any;
      if (result && "error" in result) {
        setError(result.error);
      } else if (result) {
        setSnapshot(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schema");
    } finally {
      setLoading(false);
    }
  };

  const getDisplayTable = (): TableDefinition => {
    let baseTable = snapshot?.tables.find((t) => t.name === selectedTable) ||
      proposedTables.find((t) => t.name === selectedTable) || {
        name: "",
        schema: "",
        columns: [],
        indexes: [],
        foreignKeys: [],
        primaryKey: [],
      };

    if (!selectedTable) return baseTable;

    // Deep copy to apply modifications non-destructively
    const displayTable = {
      ...baseTable,
      columns: [...baseTable.columns],
      foreignKeys: [...baseTable.foreignKeys],
    };

    // Apply pending ALTER_TABLE changes
    const pendingAlters = proposedChanges.filter(
      (c) => c.type === "ALTER_TABLE" && c.payload.tableName === selectedTable,
    );

    pendingAlters.forEach((change) => {
      if (change.payload.addedColumns) {
        change.payload.addedColumns.forEach((ac: any) => {
          displayTable.columns.push({ ...ac, _isProposed: true });
        });
      }
      if (change.payload.removedColumns) {
        change.payload.removedColumns.forEach((rc: any) => {
          const idx = displayTable.columns.findIndex((c) => c.name === rc.name);
          if (idx >= 0)
            displayTable.columns[idx] = {
              ...displayTable.columns[idx],
              _isPendingDelete: true,
            };
        });
      }
      if (change.payload.modifiedColumns) {
        change.payload.modifiedColumns.forEach((mc: any) => {
          const idx = displayTable.columns.findIndex(
            (c) => c.name === mc.columnName,
          );
          if (idx >= 0) {
            displayTable.columns[idx] = {
              ...displayTable.columns[idx],
              ...mc.newDefinition,
              _isProposedEdit: true,
            };
          }
        });
      }
      if (change.payload.addedForeignKeys) {
        change.payload.addedForeignKeys.forEach((fk: any) => {
          displayTable.foreignKeys.push(fk);
        });
      }
    });

    return displayTable;
  };

  // Get dependencies for selected table
  const getTableWithDependencies = (): TableDefinition[] => {
    if (!selectedTable) return [];

    const displayTable = getDisplayTable();
    if (displayTable.name === "") return [];

    const selected = displayTable;

    // Get tables that this table references (outgoing FKs)
    const referencedTables = new Set<string>();
    selected.foreignKeys.forEach((fk) => {
      referencedTables.add(fk.referencedTable);
    });

    // Get tables that reference this table (incoming FKs)
    const dependentTables = new Set<string>();
    snapshot?.tables.forEach((table) => {
      table.foreignKeys.forEach((fk) => {
        if (fk.referencedTable === selectedTable) {
          dependentTables.add(table.name);
        }
      });
    });

    // Return selected table + dependencies
    const result = [selected];
    referencedTables.forEach((name) => {
      const table = snapshot?.tables.find((t) => t.name === name);
      if (table) result.push(table);
    });
    dependentTables.forEach((name) => {
      const table = snapshot?.tables.find((t) => t.name === name);
      if (table && !result.find((t) => t.name === name)) result.push(table);
    });

    return result;
  };

  return (
    <div className="px-4 py-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">
          Schema Explorer
        </h1>

        {/* Database Selection */}
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

            {/* Table Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Table
              </label>
              <select
                value={selectedTable}
                onChange={(e) => setSelectedTable(e.target.value)}
                disabled={(!snapshot && proposedTables.length === 0) || loading}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">-- Select a table --</option>
                {snapshot?.tables.map((table) => (
                  <option key={table.name} value={table.name}>
                    {table.name}
                  </option>
                ))}
                {proposedTables.length > 0 && (
                  <optgroup label="Proposed Tables">
                    {proposedTables.map((table) => (
                      <option key={`proposed-${table.name}`} value={table.name}>
                        ✨ {table.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {loading && (
            <div className="mt-4 flex items-center space-x-2">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              <span className="text-gray-600">Loading schema...</span>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={() => handleEnvChange(selectedEnv)}
                className="mt-2 text-sm font-medium text-red-600 hover:text-red-500"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Schema Viewer */}
      {selectedTable &&
      (snapshot || proposedTables.find((t) => t.name === selectedTable)) ? (
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 border-b p-4 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {selectedTable}
                {proposedTables.find((t) => t.name === selectedTable) && (
                  <span className="ml-2 text-sm text-yellow-600 font-normal">
                    (Proposed)
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Environment: {selectedEnv === "dev" ? "Development" : "Local"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {selectedEnv === "local" &&
                proposedTables.find((t) => t.name === selectedTable) && (
                  <button
                    onClick={() => {
                      const change = proposedChanges.find(
                        (c) => (c.payload as any).tableName === selectedTable,
                      );
                      if (change) {
                        handleApplyChange(change.id);
                      }
                    }}
                    className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Apply to Database</span>
                  </button>
                )}
              {selectedEnv === "local" &&
                !proposedTables.find((t) => t.name === selectedTable) && (
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Table</span>
                  </button>
                )}
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b px-4">
            <div className="flex space-x-8">
              <button
                onClick={() => setActiveTab("schema")}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "schema"
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Schema
              </button>
              <button
                onClick={() => setActiveTab("data")}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "data"
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Data
              </button>
              <button
                onClick={() => setActiveTab("relationships")}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "relationships"
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Relationships
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === "relationships" && (
              <SchemaViewer tables={getTableWithDependencies()} />
            )}
            {activeTab === "schema" && (
              <ColumnDetailsTab
                table={getDisplayTable()}
                selectedEnv={selectedEnv}
                onUpdateColumn={
                  selectedEnv === "local" ? handleUpdateColumn : undefined
                }
                onAddColumn={
                  selectedEnv === "local"
                    ? () => Promise.resolve(setIsAddColumnModalOpen(true))
                    : undefined
                }
                onDeleteColumn={
                  selectedEnv === "local" ? handleDeleteColumn : undefined
                }
              />
            )}
            {activeTab === "data" &&
              !proposedTables.find((t) => t.name === selectedTable) && (
                <TableDataViewer
                  tableName={selectedTable}
                  connectionString={
                    selectedEnv === "dev" ? config?.dev : config?.local
                  }
                />
              )}
            {activeTab === "data" &&
              proposedTables.find((t) => t.name === selectedTable) && (
                <div className="text-center py-12">
                  <p className="text-gray-500">
                    No data yet - this is a proposed table. Apply it to the
                    database first.
                  </p>
                </div>
              )}
          </div>
        </div>
      ) : snapshot && !selectedTable && proposedTables.length === 0 ? (
        <div className="bg-blue-50 rounded-lg p-8 text-center">
          <p className="text-gray-700">
            Select a table from the dropdown above to view it and its
            dependencies
          </p>
        </div>
      ) : (
        <div></div>
      )}

      {/* Create Table Modal */}
      <CreateTableModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        connectionString={
          selectedEnv === "dev" ? config?.dev || "" : config?.local || ""
        }
        onTableCreated={handleTableCreated}
        snapshot={snapshot || undefined}
        proposedTables={proposedTables}
      />

      {/* Add Column Modal */}
      <AddColumnModal
        isOpen={isAddColumnModalOpen}
        onClose={() => setIsAddColumnModalOpen(false)}
        onAdd={handleAddColumn}
        tableName={selectedTable}
        availableTables={[...(snapshot?.tables || []), ...proposedTables]}
      />
    </div>
  );
};

// Table Data Viewer Component
interface TableDataViewerProps {
  tableName: string;
  connectionString?: string;
}

const TableDataViewer: React.FC<TableDataViewerProps> = ({
  tableName,
  connectionString,
}) => {
  const [data, setData] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!connectionString) return;

    const fetchData = async () => {
      setDataLoading(true);
      setDataError(null);
      try {
        const result = (await schemaAPI.getTableData(
          tableName,
          connectionString,
        )) as any;
        if (result && "error" in result) {
          setDataError(result.error);
        } else {
          setData(result?.rows || []);
        }
      } catch (err) {
        setDataError(
          err instanceof Error ? err.message : "Failed to load table data",
        );
      } finally {
        setDataLoading(false);
      }
    };

    fetchData();
  }, [tableName, connectionString]);

  if (dataLoading) {
    return (
      <div className="flex items-center space-x-2">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
        <span className="text-gray-600">Loading data...</span>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="bg-red-50 p-4 rounded-md">
        <p className="text-red-700 text-sm">{dataError}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No data in this table</p>
      </div>
    );
  }

  // Get column names from first row
  const columns = Object.keys(data[0]);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.slice(0, 50).map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td
                  key={`${idx}-${col}`}
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                >
                  {row[col] !== null && row[col] !== undefined
                    ? String(row[col]).substring(0, 100)
                    : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 50 && (
        <div className="mt-4 text-sm text-gray-500">
          Showing first 50 of {data.length} rows
        </div>
      )}
    </div>
  );
};
