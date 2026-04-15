import React, { useEffect, useState } from "react";
import { useProposedChanges } from "@/hooks/index";
import { useAlertContext } from "@/hooks/AlertContext";
import { schemaAPI, changesAPI } from "@/api/index";
import { ProposedChange } from "@/types/index";
import { Loader2, Trash2 } from "lucide-react";
import { ChangeItemActions } from "./ChangeItemActions/ChangeItemActions";

interface DBConfig {
  dev: string;
  local: string;
}

export const ChangesPage: React.FC = () => {
  const { changes, loading, error, list, apply, remove } = useProposedChanges();
  const alertContext = useAlertContext();
  const [config, setConfig] = useState<DBConfig | null>(null);
  const [applying, setApplying] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    list();
    // Load config for connection strings
    schemaAPI.getConfig().then((cfg) => {
      if (cfg && !("error" in cfg)) {
        setConfig(cfg as DBConfig);
      }
    });
  }, [list]);

  const handleApply = async (changeId: string) => {
    if (!config?.local) {
      setApplyError("Local database connection not configured");
      return;
    }

    setApplying(true);
    setApplyError(null);
    try {
      const result = await apply(changeId, config.local);
      if (!result) {
        setApplyError("Failed to apply change");
      } else {
        alertContext.success("Success", "Change applied successfully!");
        list(); // Refresh the changes list
      }
    } catch (err) {
      setApplyError(
        err instanceof Error ? err.message : "Failed to apply change",
      );
    } finally {
      setApplying(false);
    }
  };

  const handleRevert = async (changeId: string) => {
    if (!config?.local) {
      setApplyError("Local database connection not configured");
      return;
    }

    alertContext.confirm(
      "Revert Change",
      "Are you sure you want to revert this applied change locally? This action cannot be undone.",
      async () => {
        setApplying(true);
        setApplyError(null);
        try {
          const result = await changesAPI.revertChange(changeId, config.local);
          if (!(result as any).success) {
            setApplyError((result as any).error || "Failed to revert change");
          } else {
            alertContext.success("Success", "Change reverted successfully!");
            list(); // Refresh the list
          }
        } catch (err) {
          setApplyError(
            err instanceof Error ? err.message : "Failed to revert change",
          );
        } finally {
          setApplying(false);
        }
      },
    );
  };

  const handleDelete = async (changeId: string) => {
    alertContext.confirm(
      "Delete Change",
      "Are you sure you want to delete this change? This action cannot be undone.",
      async () => {
        setDeleting(changeId);
        try {
          const result = await remove(changeId);
          if (result) {
            alertContext.success("Success", "Change deleted successfully");
            list(); // Refresh the list
          } else {
            setApplyError("Failed to delete change");
          }
        } catch (err) {
          setApplyError(
            err instanceof Error ? err.message : "Failed to delete change",
          );
        } finally {
          setDeleting(null);
        }
      },
    );
  };

  return (
    <div className="px-4 py-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Proposed Changes</h1>
      </div>

      {applyError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {applyError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center space-x-2">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          <span>Loading changes...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 p-4 rounded-md text-red-700">{error}</div>
      ) : changes.length === 0 ? (
        <div className="text-gray-500 border border-dashed border-gray-300 p-12 text-center rounded-lg">
          No proposed changes yet. Head over to the Schema tab to propose a
          change.
        </div>
      ) : (
        <div className="space-y-6">
          {changes.map((change: ProposedChange) => (
            <div
              key={change.id}
              className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden"
            >
              <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-medium text-gray-700 bg-white border border-gray-300 px-2 py-1 rounded shadow-sm">
                    {change.type}
                  </span>
                  {change.edited && (
                    <span className="px-2 py-1 text-xs font-medium rounded bg-orange-100 text-orange-800">
                      Edited
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  {new Date(change.createdAt).toLocaleString()}
                </div>
              </div>
              <ChangeItemActions change={change} />

              <div className="px-4 py-3 flex space-x-3 border-t bg-white">
                {change.appliedLocally ? (
                  <button
                    onClick={() => handleRevert(change.id)}
                    disabled={applying || change.type === "DROP_TABLE"}
                    className={`inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white transition ${
                      !applying && change.type !== "DROP_TABLE"
                        ? "bg-orange-600 hover:bg-orange-700"
                        : "bg-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {applying ? "Reverting..." : "Revert Local DB"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleApply(change.id)}
                    disabled={applying}
                    className={`inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white transition ${
                      !applying
                        ? "bg-indigo-600 hover:bg-indigo-700"
                        : "bg-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {applying ? "Applying..." : "Apply to Local DB"}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(change.id)}
                  disabled={deleting === change.id}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 transition disabled:opacity-50"
                  title="Delete this proposed change"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleting === change.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
