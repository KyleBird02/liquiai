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
import { useAlertContext } from "@/hooks/AlertContext";
import {
  SchemaViewer,
  CreateTableModal,
  ColumnDetailsTab,
  AddColumnModal,
  AIAssistantModal,
} from "@/components/index";
import { Loader2, Plus, Zap, Upload } from "lucide-react";

interface DBConfig {
  dev: string;
  local: string;
}

export const SchemaPage: React.FC = () => {
  const alertContext = useAlertContext();
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
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [isSQLUploadOpen, setIsSQLUploadOpen] = useState(false);
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
        alertContext.success("Success", "Table created successfully!");
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
    const connectionString = config?.local;
    if (!connectionString) {
      setError("No local connection string available");
      return;
    }

    alertContext.confirm(
      "Revert Change",
      "Are you sure you want to revert this change in your local database? This action cannot be undone.",
      async () => {
        try {
          const result = (await changesAPI.revertChange(
            changeId,
            connectionString,
          )) as any;
          if (result && !("error" in result)) {
            alertContext.success("Success", "Change reverted successfully!");
            loadProposedChanges();
            handleEnvChange("local");
          } else {
            setError(result.error || "Failed to revert change");
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to revert change",
          );
        }
      },
    );
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

    // Extract foreignKey if present
    const foreignKey = (updates as any).foreignKey;
    const { foreignKey: _, ...columnUpdates } = updates as any;

    // Create the ALTER_TABLE payload
    const payload: AlterTablePayload = {
      tableName: selectedTable,
      schema,
    };

    // Add column modifications only if there are actual column changes
    const columnKeys = Object.keys(columnUpdates);
    if (columnKeys.length > 0 || foreignKey) {
      const modifiedColumn: ColumnDefinition = {
        ...originalColumn,
        ...columnUpdates,
      };

      // If adding a foreign key, mark the column as a foreign key
      if (foreignKey) {
        modifiedColumn.isForeignKey = true;
      }

      const columnModification: ColumnModification = {
        columnName: originalColumn.name,
        oldDefinition: originalColumn,
        newDefinition: modifiedColumn,
      };

      payload.modifiedColumns = [columnModification];
    }

    // Add foreign key if being added
    if (foreignKey) {
      payload.addedForeignKeys = [foreignKey];
    }

    try {
      // Propose the change instead of applying it directly
      const response = await changesAPI.proposeChange("ALTER_TABLE", payload);

      if (response && "error" in response) {
        throw new Error(response.error);
      }

      // Reload proposed changes to show the new one
      await loadProposedChanges();

      // Show success message
      alertContext.success(
        "Column Update Proposed",
        "Review it in the Changes tab.",
      );
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
      alertContext.success("Column Added", "Review it in the Changes tab.");
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

    const payload: AlterTablePayload = {
      tableName: selectedTable,
      schema,
      removedColumns: [columnToDelete],
    };

    alertContext.confirm(
      "Delete Column",
      `Are you sure you want to delete column "${columnName}"? This will result in a DROP COLUMN operation.`,
      async () => {
        try {
          // Propose the change instead of applying it directly
          const response = await changesAPI.proposeChange(
            "ALTER_TABLE",
            payload,
          );

          if (response && "error" in response) {
            throw new Error(response.error);
          }

          // Reload proposed changes to show the new one
          await loadProposedChanges();

          // Show success message
          alertContext.success(
            "Column Deletion Proposed",
            "Review it in the Changes tab.",
          );
        } catch (err) {
          throw err;
        }
      },
    );
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
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-4xl font-bold text-gray-900">Schema Explorer</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSQLUploadOpen(true)}
              disabled={loading}
              className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              <span>Execute SQL</span>
            </button>
            <button
              onClick={() => setIsAIAssistantOpen(true)}
              disabled={loading}
              className="flex items-center justify-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <Zap className="w-4 h-4" />
              <span>AI Assistant</span>
            </button>
          </div>
        </div>

        {/* Database Selection */}
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200 mb-6">
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

            {/* Create Table & AI Assistant Buttons */}
            <div className="col-span-1 md:col-span-1 space-y-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                &nbsp;
              </label>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                <span>Create Table</span>
              </button>
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
                availableTables={
                  snapshot
                    ? [...snapshot.tables, ...proposedTables]
                    : proposedTables
                }
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

      {/* AI Assistant Modal */}
      <AIAssistantModal
        isOpen={isAIAssistantOpen}
        onClose={() => setIsAIAssistantOpen(false)}
        onSuccess={() => {
          loadProposedChanges();
          alertContext.success(
            "Success",
            "Tables created successfully! Check the Changes page to review.",
          );
        }}
      />

      {/* SQL Upload Modal */}
      <SQLUploadModal
        isOpen={isSQLUploadOpen}
        onClose={() => setIsSQLUploadOpen(false)}
        connectionString={selectedEnv === "dev" ? config?.dev : config?.local}
        onSuccess={() => {
          loadProposedChanges();
          handleEnvChange(selectedEnv);
          alertContext.success(
            "Success",
            "SQL executed successfully! Schema and data refreshed.",
          );
        }}
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

// SQL Upload Modal Component
interface SQLUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionString?: string;
  onSuccess: () => void;
}

const SQLUploadModal: React.FC<SQLUploadModalProps> = ({
  isOpen,
  onClose,
  connectionString,
  onSuccess,
}) => {
  const [sqlInput, setSqlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alertContext = useAlertContext();

  const handleExecute = async () => {
    if (!sqlInput.trim()) {
      setError("Please enter SQL to create a proposed change");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/changes/from-sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlInput }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        setError(result.error || "Failed to create proposed change");
        return;
      }

      alertContext.success(
        "Success",
        "SQL change proposal created! Review it in the Changes page.",
      );
      setSqlInput("");
      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create proposed change",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-96 flex flex-col">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">
            Create SQL Proposal
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            SQL Statement
          </label>
          <textarea
            value={sqlInput}
            onChange={(e) => setSqlInput(e.target.value)}
            disabled={loading}
            placeholder="Enter your SQL here. This will be added as a proposed change..."
            className="w-full h-40 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm disabled:bg-gray-100"
          />

          {error && (
            <div className="mt-4 rounded-md bg-red-50 p-3 border border-red-200">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExecute}
            disabled={loading || !sqlInput.trim()}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating..." : "Create Proposal"}
          </button>
        </div>
      </div>
    </div>
  );
};
