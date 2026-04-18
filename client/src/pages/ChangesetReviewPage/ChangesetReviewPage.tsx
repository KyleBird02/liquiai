import React, { useState, useEffect } from "react";
import { liquibaseAPI } from "@/api";
import { ChangesetDefinition, ProposedChange } from "@/types";
import { SelectionStep } from "./SelectionStep/SelectionStep";
import { ReviewStep } from "./ReviewStep/ReviewStep";

const ChangesetReviewPage: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [changesets, setChangesets] = useState<ChangesetDefinition[]>([]);
  const [proposedChanges, setProposedChanges] = useState<ProposedChange[]>([]);
  const [selectedChanges, setSelectedChanges] = useState<string[]>([]);
  const [startId, setStartId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"select" | "review">("select");

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

    setLoading(true);
    try {
      const result = await liquibaseAPI.aggregateChangesets(finalAggregateId);
      if (result.error) {
        setError("Failed to aggregate: " + result.error);
      } else {
        setChangesets(result.changesets);
      }
    } catch (err: any) {
      setError("Error aggregating changesets: " + err.message);
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
        onGenerateChangesets={handleGenerateChangesets}
      />
    );
  }

  return (
    <ReviewStep
      changesets={changesets}
      startId={startId}
      loading={loading}
      error={error}
      onBack={() => {
        setStep("select");
        setChangesets([]);
        setSelectedChanges([]);
      }}
      onAggregate={handleAggregate}
      onUpdate={(updated) => {
        setChangesets((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c)),
        );
      }}
    />
  );
};

export default ChangesetReviewPage;
