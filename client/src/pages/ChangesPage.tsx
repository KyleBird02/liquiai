import React, { useEffect, useState } from "react";
import { useProposedChanges } from "@/hooks/index";
import { liquibaseAPI, schemaAPI } from "@/api/index";
import { ProposedChange, ValidationError } from "@/types/index";
import { Loader2, Trash2, Copy } from "lucide-react";

interface DBConfig {
  dev: string;
  local: string;
}

export const ChangesPage: React.FC = () => {
  const { changes, loading, error, list, apply, remove } = useProposedChanges();
  const [xmlResult, setXmlResult] = useState<string | null>(null);
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

  const handleGenerateXml = async (change: ProposedChange) => {
    try {
      const result = await liquibaseAPI.generateChangeset(change);
      if ("error" in result) {
        console.error(result.error);
        return;
      }
      setXmlResult(result.xml);
    } catch (e) {
      console.error(e);
    }
  };

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
        alert("Change applied successfully!");
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

  const handleDelete = async (changeId: string) => {
    if (!window.confirm("Are you sure you want to delete this change?")) {
      return;
    }

    setDeleting(changeId);
    try {
      const result = await remove(changeId);
      if (result) {
        alert("Change deleted successfully");
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
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      change.status === "validated"
                        ? "bg-green-100 text-green-800"
                        : change.status === "rejected"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {change.status}
                  </span>
                  <span className="font-mono font-medium">{change.type}</span>
                </div>
                <div className="text-sm text-gray-500">
                  {new Date(change.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="p-4">
                <pre className="text-sm bg-gray-50 p-4 rounded text-gray-800 overflow-x-auto">
                  {JSON.stringify(change.payload, null, 2)}
                </pre>

                {change.validationResult && (
                  <div className="mt-4 border-t pt-4">
                    <h4 className="font-semibold text-gray-700 mb-2">
                      Validation Status
                    </h4>
                    <p>
                      Passed: {change.validationResult.passed ? "Yes" : "No"}
                    </p>
                    {change.validationResult.errors.length > 0 && (
                      <ul className="text-red-600 space-y-1 mt-2 list-disc pl-5">
                        {change.validationResult.errors.map(
                          (e: ValidationError, i: number) => (
                            <li key={i}>{e.message}</li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                )}

                <div className="mt-6 flex space-x-3 border-t pt-4">
                  <button
                    onClick={() => handleGenerateXml(change)}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition"
                  >
                    <Copy className="w-4 h-4" />
                    Generate Liquibase XML
                  </button>
                  <button
                    onClick={() => handleApply(change.id)}
                    disabled={change.status !== "validated" || applying}
                    className={`inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white transition ${
                      change.status === "validated" && !applying
                        ? "bg-indigo-600 hover:bg-indigo-700"
                        : "bg-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {applying ? "Applying..." : "Apply to Database"}
                  </button>
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
            </div>
          ))}

          {xmlResult && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">Generated Changeset</h3>
                  <button
                    onClick={() => setXmlResult(null)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    Close
                  </button>
                </div>
                <div className="flex-1 overflow-auto bg-gray-900 rounded p-4">
                  <pre className="text-gray-100 text-sm">{xmlResult}</pre>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(xmlResult);
                      alert("Copied to clipboard!");
                    }}
                    className="bg-indigo-600 text-white px-4 py-2 rounded"
                  >
                    Copy to Clipboard
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
