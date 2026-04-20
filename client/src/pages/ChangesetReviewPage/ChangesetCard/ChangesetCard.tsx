import React, { useState } from "react";
import SyntaxHighlighter from "react-syntax-highlighter";
import { docco } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { liquibaseAPI } from "@/api";
import { ChangesetDefinition } from "@/types";

interface ChangesetCardProps {
  changeset: ChangesetDefinition;
  onUpdate: (updated: ChangesetDefinition) => void;
}

export const ChangesetCard: React.FC<ChangesetCardProps> = ({
  changeset,
  onUpdate,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedComment, setEditedComment] = useState(changeset.comment || "");
  const [changeType, setChangeType] = useState(changeset.changeType);
  const [editedXml, setEditedXml] = useState(changeset.xmlContent);
  const [editedSql, setEditedSql] = useState(changeset.sqlFileContent || "");
  const [editedSqlPath, setEditedSqlPath] = useState(
    changeset.sqlFilePath || "",
  );
  const [activeTab, setActiveTab] = useState<"xml" | "sql">("xml");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const replaceSqlFilePathInXml = (
    sourceXml: string,
    previousPath: string,
    nextPath: string,
  ): string => {
    if (!sourceXml || !nextPath) return sourceXml;

    if (previousPath) {
      const escapedPrevious = previousPath.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      const exactPattern = new RegExp(
        `(<sqlFile[^>]*\\bpath=")${escapedPrevious}(")`,
        "g",
      );
      const replacedExact = sourceXml.replace(exactPattern, `$1${nextPath}$2`);
      if (replacedExact !== sourceXml) {
        return replacedExact;
      }
    }

    return sourceXml.replace(
      /(<sqlFile[^>]*\bpath=")([^"]+)(")/,
      `$1${nextPath}$3`,
    );
  };

  const handleSaveEdit = async () => {
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const result = await liquibaseAPI.updateChangeset(changeset.id, {
        comment: editedComment || null,
        changeType,
        xmlContent: editedXml,
        sqlFileContent: editedSql || null,
        sqlFilePath: editedSqlPath || null,
      });
      if (result && !result.error) {
        onUpdate(result.changeset);
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
      console.error("Failed to update changeset", err);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedComment(changeset.comment || "");
    setChangeType(changeset.changeType);
    setEditedXml(changeset.xmlContent);
    setEditedSql(changeset.sqlFileContent || "");
    setEditedSqlPath(changeset.sqlFilePath || "");
    setSaveError(null);
    setSaveSuccess(false);
  };

  if (isEditing) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Edit Changeset
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Comment (optional)
            </label>
            <input
              type="text"
              value={editedComment}
              onChange={(e) => setEditedComment(e.target.value)}
              placeholder="Optional comment for this changeset"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Format
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={changeType === "xml"}
                  onChange={() => setChangeType("xml")}
                  className="h-4 w-4 text-blue-600"
                />
                <span className="ml-2 text-sm text-gray-700">Inline XML</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={changeType === "sql"}
                  onChange={() => setChangeType("sql")}
                  className="h-4 w-4 text-blue-600"
                />
                <span className="ml-2 text-sm text-gray-700">SQL File</span>
              </label>
            </div>
          </div>

          {changeType === "xml" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                XML Content
              </label>
              <textarea
                value={editedXml}
                onChange={(e) => setEditedXml(e.target.value)}
                rows={10}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-xs"
              />
            </div>
          )}

          {changeType === "sql" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SQL File Path
                </label>
                <input
                  type="text"
                  value={editedSqlPath}
                  onChange={(e) => {
                    const nextPath = e.target.value;
                    const previousPath = editedSqlPath;
                    setEditedSqlPath(nextPath);
                    setEditedXml((currentXml) =>
                      replaceSqlFilePathInXml(
                        currentXml,
                        previousPath,
                        nextPath,
                      ),
                    );
                  }}
                  placeholder="e.g. trade-service/sprint-1/my_change.sql"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SQL Content
                </label>
                <textarea
                  value={editedSql}
                  onChange={(e) => setEditedSql(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-xs"
                />
              </div>
            </div>
          )}

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
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900">
              {changeset.id}
            </h3>
            {changeset.edited && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
                Edited
              </span>
            )}
            {changeset.reviews && changeset.reviews.length > 0 && (
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  changeset.reviews.some((r) => r.severity === "high")
                    ? "bg-red-100 text-red-800"
                    : changeset.reviews.some((r) => r.severity === "medium")
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-blue-100 text-blue-800"
                }`}
              >
                {changeset.reviews.length} Warning
                {changeset.reviews.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Author: {changeset.author} | Type: {changeset.changeType}
          </p>
          {changeset.comment && (
            <p className="text-sm text-blue-600 mt-1">
              Comment: {changeset.comment}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            {expanded ? "Hide" : "Show"} Details
          </button>
          <button
            onClick={() => {
              setIsEditing(true);
              setExpanded(true);
            }}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Edit
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          {changeset.reviews && changeset.reviews.length > 0 && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded">
              <h4 className="text-red-800 font-semibold mb-2">
                AI Review Warnings
              </h4>
              <ul className="space-y-2 text-sm">
                {changeset.reviews.map((review, idx) => (
                  <li key={idx} className="flex flex-col">
                    <span
                      className={`font-semibold ${
                        review.severity === "high"
                          ? "text-red-600"
                          : review.severity === "medium"
                            ? "text-yellow-600"
                            : "text-blue-600"
                      }`}
                    >
                      {review.severity.toUpperCase()}
                    </span>
                    <span className="text-gray-700">{review.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mb-4">
            <h4 className="font-medium text-gray-900 mb-2">Summary</h4>
            <p className="text-sm text-gray-600">
              Change Type: <strong>{changeset.change.type}</strong>
            </p>
            {changeset.change.payload?.tableName && (
              <p className="text-sm text-gray-600">
                Table: <strong>{changeset.change.payload.tableName}</strong>
              </p>
            )}
          </div>

          {changeset.changeType === "xml" && (
            <div className="mb-4">
              <h4 className="font-medium text-gray-900 mb-2">Changeset XML</h4>
              <SyntaxHighlighter
                language="xml"
                style={docco}
                className="rounded text-xs overflow-x-auto"
              >
                {changeset.xmlContent}
              </SyntaxHighlighter>
            </div>
          )}

          {changeset.changeType === "sql" && changeset.sqlFileContent && (
            <div className="space-y-4">
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                  <button
                    onClick={() => setActiveTab("xml")}
                    className={`${
                      activeTab === "xml"
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                  >
                    Changeset XML
                  </button>
                  <button
                    onClick={() => setActiveTab("sql")}
                    className={`${
                      activeTab === "sql"
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                  >
                    SQL File
                  </button>
                </nav>
              </div>

              {activeTab === "xml" && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">
                    Changeset XML (references SQL file)
                  </h4>
                  <SyntaxHighlighter
                    language="xml"
                    style={docco}
                    className="rounded text-xs overflow-x-auto"
                  >
                    {changeset.xmlContent}
                  </SyntaxHighlighter>
                </div>
              )}

              {activeTab === "sql" && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">
                    SQL File Content
                  </h4>
                  <p className="text-sm text-gray-600 mb-2">
                    Path:{" "}
                    <code className="bg-gray-100 px-2 py-1 rounded">
                      {changeset.sqlFilePath}
                    </code>
                  </p>
                  <SyntaxHighlighter
                    language="sql"
                    style={docco}
                    className="rounded text-xs overflow-x-auto"
                  >
                    {changeset.sqlFileContent}
                  </SyntaxHighlighter>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
