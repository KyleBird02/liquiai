import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { liquibaseAPI } from "@/api";
import { ChangesetDefinition, ProposedChange } from "@/types";

const ChangesetReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [changesets, setChangesets] = useState<ChangesetDefinition[]>([]);
  const [proposedChanges, setProposedChanges] = useState<ProposedChange[]>([]);
  const [selectedChanges, setSelectedChanges] = useState<string[]>([]);
  const [startId, setStartId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"select" | "review">("select");

  // Load session and proposed changes
  useEffect(() => {
    loadSession();
    loadProposedChanges();
  }, []);

  const loadSession = async () => {
    try {
      const result = await liquibaseAPI.getSession();
      setSession(result);
    } catch (err) {
      setError("Failed to load session");
    }
  };

  const loadProposedChanges = async () => {
    try {
      // Get proposed changes from Phase 1
      // For now, we'll fetch from the changes API
      const result = await fetch("/api/changes");
      const data = await result.json();
      if (data.changes) {
        setProposedChanges(data.changes);
      }
    } catch (err) {
      console.error("Failed to load proposed changes", err);
    }
  };

  const handleChangeSelection = (changeId: string, checked: boolean) => {
    if (checked) {
      setSelectedChanges((prev) => [...prev, changeId]);
    } else {
      setSelectedChanges((prev) => prev.filter((id) => id !== changeId));
    }
  };

  const handleGenerateChangesets = async () => {
    setError(null);
    setLoading(true);

    try {
      // Step 1: Get last changeset ID from GitHub
      const idResult = await liquibaseAPI.getLastChangesetId();

      if (idResult.error) {
        setError(
          "Failed to fetch last changeset ID from GitHub: " + idResult.error,
        );
        return;
      }

      const nextId = idResult.nextNumber;
      const appPrefix = idResult.appPrefix || session.targetApplication;
      const startChangesetId = `${appPrefix}-${nextId}`;
      setStartId(startChangesetId);

      // Step 2: Add selected proposed changes to session
      const selectedProposedChanges = proposedChanges.filter((c) =>
        selectedChanges.includes(c.id),
      );

      if (selectedProposedChanges.length === 0) {
        setError("Please select at least one change to generate changesets");
        return;
      }

      const addResult = await liquibaseAPI.addProposedChanges(
        selectedProposedChanges,
      );

      if (addResult.error) {
        setError("Failed to add proposed changes: " + addResult.error);
        return;
      }

      // Step 3: Generate batch of changesets
      const genResult = await liquibaseAPI.generateBatch(startChangesetId);

      if (genResult.error) {
        setError("Failed to generate changesets: " + genResult.error);
        return;
      }

      setChangesets(genResult.changesets);
      setStep("review");
    } catch (err: any) {
      setError("Error: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToPreview = () => {
    navigate("/phase2/preview");
  };

  if (step === "select") {
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
                {proposedChanges.map((change) => (
                  <label
                    key={change.id}
                    className="flex items-start p-4 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedChanges.includes(change.id)}
                      onChange={(e) =>
                        handleChangeSelection(change.id, e.target.checked)
                      }
                      className="mt-1 h-4 w-4 text-blue-600 rounded"
                    />
                    <div className="ml-3 flex-1">
                      <p className="font-medium text-gray-900">
                        {change.type}
                        {change.payload?.tableName &&
                          ` - ${change.payload.tableName}`}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        ID: {change.id}
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
                    onClick={handleGenerateChangesets}
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
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Review Generated Changesets
        </h1>
        <p className="text-gray-600 mb-8">
          Starting from changeset ID: {startId}
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {changesets.map((changeset) => (
            <ChangesetCard key={changeset.id} changeset={changeset} />
          ))}
        </div>

        <div className="mt-8 flex gap-4">
          <button
            onClick={() => {
              setStep("select");
              setChangesets([]);
              setSelectedChanges([]);
            }}
            className="flex-1 bg-gray-300 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-400 font-medium"
          >
            Back
          </button>
          <button
            onClick={handleProceedToPreview}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 font-medium"
          >
            Preview Files & Create PR
          </button>
        </div>
      </div>
    </div>
  );
};

// Changeset card component
const ChangesetCard: React.FC<{ changeset: ChangesetDefinition }> = ({
  changeset,
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900">
            {changeset.id}
          </h3>
          <p className="text-sm text-gray-600">
            Author: {changeset.author} | Type: {changeset.changeType}
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          {expanded ? "Hide" : "Show"} Details
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
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
              <h4 className="font-medium text-gray-900 mb-2">XML Content</h4>
              <pre className="bg-gray-100 p-4 rounded text-xs overflow-x-auto">
                {changeset.xmlContent}
              </pre>
            </div>
          )}

          {changeset.changeType === "sql" && changeset.sqlFileContent && (
            <div className="mb-4">
              <h4 className="font-medium text-gray-900 mb-2">SQL File</h4>
              <p className="text-sm text-gray-600 mb-2">
                Path: {changeset.sqlFilePath}
              </p>
              <pre className="bg-gray-100 p-4 rounded text-xs overflow-x-auto">
                {changeset.sqlFileContent}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChangesetReviewPage;
