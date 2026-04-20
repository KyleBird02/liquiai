import React, { useState, useEffect } from "react";
import { liquibaseAPI } from "@/api";
import { ChangesetDefinition, ProposedChange } from "@/types";
import { SelectionStep } from "./SelectionStep/SelectionStep";
import { ReviewStep } from "./ReviewStep/ReviewStep";
import { useNavigate } from "react-router-dom";

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
  const [showSqlMergeModal, setShowSqlMergeModal] = useState(false);
  const [pendingAggregateId, setPendingAggregateId] = useState<string | null>(
    null,
  );
  const [preflightStale, setPreflightStale] = useState(false);

  useEffect(() => {
    loadSession();
    loadProposedChanges();
  }, []);

  const loadSession = async () => {
    try {
      const result = await liquibaseAPI.getSession();
      setSession(result);

      if (result.changesets && result.changesets.length > 0) {
        setChangesets(result.changesets);
        setPreflightStale(false);
        if (result.proposedChanges && result.proposedChanges.length > 0) {
          setSelectedChanges(result.proposedChanges.map((c: any) => c.id));
        }
        setStartId(result.changesets[0]?.id || "");
        setStep("review");
      }
    } catch (err) {
      setError("Failed to load session");
    }
  };

  const loadProposedChanges = async () => {
    try {
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

  const handleToggleSelectAll = () => {
    if (selectedChanges.length === proposedChanges.length) {
      setSelectedChanges([]);
      return;
    }

    setSelectedChanges(proposedChanges.map((c) => c.id));
  };

  const handleReorderChangesets = async (orderedIds: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const result =
        await liquibaseAPI.reorderAndRenumberChangesets(orderedIds);
      if (result?.error) {
        setError(result.error);
        return;
      }

      if (result?.changesets) {
        setChangesets(result.changesets);
        setPreflightStale(true);
      }
      if (result?.startId) {
        setStartId(result.startId);
      }
    } catch (err: any) {
      setError(
        "Failed to reorder changesets: " + (err.message || "Unknown error"),
      );
    } finally {
      setLoading(false);
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

      const genResult = await liquibaseAPI.generateBatch(startChangesetId);

      if (genResult.error) {
        setError("Failed to generate changesets: " + genResult.error);
        return;
      }

      setChangesets(genResult.changesets);
      setPreflightStale(false);
      setStep("review");
    } catch (err: any) {
      setError("Error: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleAggregate = async () => {
    let minId = "";
    let minNum = Infinity;

    for (const cs of changesets) {
      const match = cs.id.match(/^([a-zA-Z-]+)-(\d+)$/);
      if (match) {
        const num = parseInt(match[2], 10);
        if (num < minNum) {
          minNum = num;
          minId = cs.id;
        }
      }
    }

    const finalAggregateId = minId || changesets[0]?.id || "aggregated-1";

    setPendingAggregateId(finalAggregateId);
    setShowSqlMergeModal(true);
  };

  const runAggregate = async (sqlMergeMode: "single" | "multiple") => {
    if (!pendingAggregateId) {
      setShowSqlMergeModal(false);
      return;
    }

    setLoading(true);
    try {
      const result = await liquibaseAPI.aggregateChangesets(
        pendingAggregateId,
        sqlMergeMode,
      );
      if (result.error) {
        setError("Failed to aggregate: " + result.error);
      } else {
        setChangesets(result.changesets);
        setPreflightStale(true);
      }
    } catch (err: any) {
      setError("Error aggregating changesets: " + err.message);
    } finally {
      setLoading(false);
      setShowSqlMergeModal(false);
      setPendingAggregateId(null);
    }
  };

  const handleRetriggerPreflight = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await liquibaseAPI.retriggerPreflight();
      if (result?.error) {
        setError("Failed to retrigger preflight: " + result.error);
        return;
      }

      if (result?.changesets) {
        setChangesets(result.changesets);
      }
      setPreflightStale(false);
    } catch (err: any) {
      setError(
        "Failed to retrigger preflight: " + (err.message || "Unknown error"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToPreview = async () => {
    setError(null);

    if (!preflightStale) {
      navigate("/liquibase/preview");
      return;
    }

    setLoading(true);
    try {
      const result = await liquibaseAPI.retriggerPreflight();
      if (result?.error) {
        setError("Failed to retrigger preflight: " + result.error);
        return;
      }

      if (result?.changesets) {
        setChangesets(result.changesets);
      }
      setPreflightStale(false);
      navigate("/liquibase/preview");
    } catch (err: any) {
      setError(
        "Failed to retrigger preflight: " + (err.message || "Unknown error"),
      );
    } finally {
      setLoading(false);
    }
  };

  if (step === "select") {
    return (
      <SelectionStep
        proposedChanges={proposedChanges}
        selectedChanges={selectedChanges}
        loading={loading}
        error={error}
        onChangeSelection={handleChangeSelection}
        onToggleSelectAll={handleToggleSelectAll}
        onGenerateChangesets={handleGenerateChangesets}
      />
    );
  }

  return (
    <>
      <ReviewStep
        changesets={changesets}
        startId={startId}
        loading={loading}
        error={error}
        preflightStale={preflightStale}
        onBack={() => {
          setStep("select");
          setChangesets([]);
          setSelectedChanges([]);
          setPreflightStale(false);
        }}
        onAggregate={handleAggregate}
        onReorder={handleReorderChangesets}
        onRetriggerPreflight={handleRetriggerPreflight}
        onProceed={handleProceedToPreview}
        onUpdate={(updated) => {
          setChangesets((prev) =>
            prev.map((c) => (c.id === updated.id ? updated : c)),
          );
        }}
      />

      {showSqlMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                SQL Merge Options
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Choose how SQL files should be handled when combining
                changesets.
              </p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <button
                onClick={() => runAggregate("single")}
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-2.5 px-4 rounded-md hover:bg-indigo-700 disabled:bg-gray-400 font-medium transition"
              >
                Combine SQL Files
              </button>
              <button
                onClick={() => runAggregate("multiple")}
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 font-medium transition"
              >
                Keep Separate
              </button>
              <button
                onClick={() => {
                  if (!loading) {
                    setShowSqlMergeModal(false);
                    setPendingAggregateId(null);
                  }
                }}
                disabled={loading}
                className="w-full bg-gray-200 text-gray-800 py-2.5 px-4 rounded-md hover:bg-gray-300 disabled:bg-gray-200 font-medium transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChangesetReviewPage;
