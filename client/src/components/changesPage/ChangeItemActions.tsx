import React, { useEffect, useState } from "react";
import { ProposedChange } from "@/types/index";
import { changesAPI } from "@/api/index";
import { Loader2 } from "lucide-react";
import { PayloadRenderer } from "./PayloadRenderer";

interface ChangeItemActionsProps {
  change: ProposedChange;
}

export const ChangeItemActions: React.FC<ChangeItemActionsProps> = ({
  change,
}) => {
  const [activeTab, setActiveTab] = useState<"details" | "sql">("details");
  const [sqlPreview, setSqlPreview] = useState<string>("");
  const [loadingSql, setLoadingSql] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSql, setEditedSql] = useState<string>("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (activeTab === "sql" && !sqlPreview) {
      setLoadingSql(true);
      changesAPI
        .getSqlPreview(change.id)
        .then((result: any) => {
          if (result && !("error" in result)) {
            setSqlPreview(result.sql || "-- SQL preview not available");
            setEditedSql(result.sql || "-- SQL preview not available");
          } else {
            setSqlPreview("-- Failed to generate SQL preview");
            setEditedSql("-- Failed to generate SQL preview");
          }
        })
        .catch(() => {
          setSqlPreview("-- Failed to fetch SQL preview");
          setEditedSql("-- Failed to fetch SQL preview");
        })
        .finally(() => {
          setLoadingSql(false);
        });
    }
  }, [activeTab, change.id, sqlPreview]);

  const handleSaveEdit = async () => {
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const result = await changesAPI.updateSql(change.id, editedSql);
      if (result && !("error" in result)) {
        setSqlPreview(editedSql);
        setSaveSuccess(true);
        setTimeout(() => {
          setIsEditing(false);
          setSaveSuccess(false);
        }, 1000);
      } else {
        setSaveError(result?.error || "Failed to save changes");
      }
    } catch (err: any) {
      setSaveError(err.message || "Failed to save changes");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedSql(sqlPreview);
    setSaveError(null);
    setSaveSuccess(false);
  };

  return (
    <div className="flex flex-col">
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium ${activeTab === "details" ? "text-indigo-600 border-b-2 border-indigo-600" : "text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
          onClick={() => setActiveTab("details")}
        >
          Details
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium ${activeTab === "sql" ? "text-indigo-600 border-b-2 border-indigo-600" : "text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
          onClick={() => setActiveTab("sql")}
        >
          SQL
        </button>
      </div>
      <div className="p-4 bg-white border border-t-0 border-gray-200">
        {activeTab === "details" ? (
          <PayloadRenderer type={change.type} payload={change.payload} />
        ) : (
          <div className="flex flex-col gap-3">
            {!isEditing && (
              <button
                onClick={() => {
                  setIsEditing(true);
                  setEditedSql(sqlPreview);
                }}
                className="self-end text-blue-600 hover:text-blue-800 font-medium text-sm"
              >
                Edit
              </button>
            )}

            {isEditing ? (
              <div className="space-y-3">
                <textarea
                  value={editedSql}
                  onChange={(e) => setEditedSql(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-xs"
                />

                {saveError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
                    {saveError}
                  </div>
                )}

                {saveSuccess && (
                  <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">
                    ✓ Changes saved successfully
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    onClick={handleSaveEdit}
                    disabled={saveLoading}
                    className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400 font-medium transition"
                  >
                    {saveLoading ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={saveLoading}
                    className="flex-1 bg-gray-300 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-400 disabled:bg-gray-300 font-medium transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded p-4 text-sm font-mono text-gray-800 overflow-x-auto whitespace-pre-wrap">
                {loadingSql ? (
                  <div className="flex items-center space-x-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading SQL...</span>
                  </div>
                ) : (
                  sqlPreview
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
