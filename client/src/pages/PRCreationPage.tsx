import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { executionAPI, githubAPI, liquibaseAPI } from "@/api";
import { ChangesetDefinition, ExecutionResult } from "@/types";
import { Loader2, Sparkles } from "lucide-react";

const PRCreationPage: React.FC = () => {
  const navigate = useNavigate();
  const [changesets, setChangesets] = useState<ChangesetDefinition[]>([]);
  const [formData, setFormData] = useState({
    prTitle: "",
    prDescription: "",
  });
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [prResult, setPrResult] = useState<any>(null);
  const [execution, setExecution] = useState<ExecutionResult | null>(null);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);

  useEffect(() => {
    loadChangesets();
    loadExecutionStatus();
    void githubAPI.preparePRAppendix();
  }, []);

  const loadExecutionStatus = async () => {
    try {
      const result = await executionAPI.getStatus();
      if ((result as any)?.error) {
        setExecutionError((result as any).error);
        return;
      }

      setExecution(result as ExecutionResult);
    } catch (err: any) {
      setExecutionError(
        "Failed to load execution status: " + (err.message || "Unknown error"),
      );
    }
  };

  const runExecutionFlow = async () => {
    setExecutionError(null);
    setExecutionLoading(true);

    try {
      const syncResult = await executionAPI.syncLocal();
      if ((syncResult as any)?.error) {
        setExecution(syncResult as ExecutionResult);
        setExecutionError((syncResult as any).error);
        return;
      }

      setExecution(syncResult as ExecutionResult);

      const validateResult = await executionAPI.validate();
      if ((validateResult as any)?.error) {
        setExecution(validateResult as ExecutionResult);
        setExecutionError((validateResult as any).error);
        return;
      }

      setExecution(validateResult as ExecutionResult);

      const runResult = await executionAPI.run();
      setExecution(runResult as ExecutionResult);

      if ((runResult as any)?.error) {
        setExecutionError((runResult as any).error);
      }
    } catch (err: any) {
      setExecutionError(
        "Validate & Run failed: " + (err.message || "Unknown error"),
      );
    } finally {
      setExecutionLoading(false);
    }
  };

  const handleForceUnlock = async () => {
    setExecutionError(null);
    setExecutionLoading(true);

    try {
      const result = await executionAPI.forceUnlock();
      if ((result as any)?.error) {
        setExecutionError((result as any).error);
        return;
      }

      setExecution(result as ExecutionResult);
    } catch (err: any) {
      setExecutionError(
        "Force unlock failed: " + (err.message || "Unknown error"),
      );
    } finally {
      setExecutionLoading(false);
    }
  };

  const stepState = {
    sync:
      execution?.status === "syncing"
        ? "running"
        : execution?.syncResult?.status === "success"
          ? "success"
          : execution?.status === "failed" &&
              execution?.syncResult?.status === "failed"
            ? "failed"
            : "pending",
    validate:
      execution?.status === "validating"
        ? "running"
        : execution?.validateResult?.passed
          ? "success"
          : execution?.validateResult && !execution.validateResult.passed
            ? "failed"
            : "pending",
    execute:
      execution?.status === "running"
        ? "running"
        : execution?.status === "success"
          ? "success"
          : execution?.status === "failed" && execution?.validateResult?.passed
            ? "failed"
            : "pending",
  } as const;

  const loadChangesets = async () => {
    try {
      const result = await liquibaseAPI.listChangesets();
      if (result && !result.error) {
        setChangesets(result.changesets || []);
      }
    } catch (err) {
      console.error("Failed to load changesets", err);
    }
  };

  const handleGenerateContent = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await githubAPI.generatePRText();
      if (result.error) {
        setError(result.error);
        return;
      }
      setFormData({
        prTitle: result.title || "",
        prDescription: result.description || "",
      });
    } catch (err: any) {
      setError(
        "Failed to generate PR content: " + (err.message || "Unknown error"),
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await githubAPI.createPR(
        formData.prTitle,
        formData.prDescription,
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      setPrResult(result);
      setSuccess(true);
    } catch (err: any) {
      setError("Failed to create PR: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  if (success && prResult) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              PR Created Successfully! 🎉
            </h1>
            <p className="text-gray-600 mb-8">
              Your changesets have been committed and a pull request has been
              created.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8 text-left">
              <h3 className="font-semibold text-gray-900 mb-4">
                Pull Request Details
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-600">PR Number</p>
                  <p className="font-mono text-lg text-gray-900">
                    #{prResult.pr?.prNumber}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">PR URL</p>
                  <a
                    href={prResult.pr?.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 font-medium break-all"
                  >
                    {prResult.pr?.prUrl}
                  </a>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <a
                href={prResult.pr?.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 font-medium"
              >
                Open PR in GitHub
              </a>

              <button
                onClick={() => navigate("/liquibase/setup")}
                className="block w-full bg-gray-300 text-gray-800 py-3 px-4 rounded-md hover:bg-gray-400 font-medium"
              >
                Start New Migration
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Create Pull Request
        </h1>
        <p className="text-gray-600 mb-8">
          Enter PR title and description to create the pull request in the
          Liquibase repository
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="mb-6 bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Validate & Run Locally
              </h2>
              <p className="text-sm text-gray-600">
                PR creation is unlocked only after Sync, Validate, and Execute
                all succeed.
              </p>
            </div>
            <button
              type="button"
              onClick={runExecutionFlow}
              disabled={executionLoading || changesets.length === 0}
              className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 font-medium"
            >
              {executionLoading ? "Running..." : "Validate & Run Locally"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="rounded border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Sync</p>
              <p className="font-semibold text-gray-900 capitalize">
                {stepState.sync}
              </p>
            </div>
            <div className="rounded border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Validate</p>
              <p className="font-semibold text-gray-900 capitalize">
                {stepState.validate}
              </p>
            </div>
            <div className="rounded border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Execute</p>
              <p className="font-semibold text-gray-900 capitalize">
                {stepState.execute}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded border border-gray-200 p-3 mb-3">
            <div>
              <p className="text-xs text-gray-500">PR Status</p>
              <p className="font-semibold text-gray-900">
                {execution?.prUnlocked ? "Unlocked" : "Locked"}
              </p>
            </div>
            {execution?.canForceUnlock && (
              <button
                type="button"
                onClick={handleForceUnlock}
                disabled={executionLoading}
                className="bg-amber-600 text-white py-1.5 px-3 rounded-md hover:bg-amber-700 disabled:bg-gray-400 text-sm font-medium"
              >
                Force Unlock
              </button>
            )}
          </div>

          {execution?.validateResult && !execution.validateResult.passed && (
            <div className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              <p className="font-semibold mb-1">Validation errors</p>
              <ul className="list-disc pl-5 space-y-1">
                {execution.validateResult.errors.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {executionError && (
            <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {executionError}
            </div>
          )}

          {execution?.changesetResults &&
            execution.changesetResults.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-gray-900 mb-2">
                  Changeset execution
                </p>
                <div className="space-y-2 max-h-44 overflow-auto pr-1">
                  {execution.changesetResults.map((result) => (
                    <div
                      key={result.changesetId}
                      className="rounded border border-gray-200 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-gray-800">
                          {result.changesetId}
                        </span>
                        <span className="capitalize text-gray-700">
                          {result.status}
                        </span>
                      </div>
                      {result.errorMessage && (
                        <p className="mt-1 text-xs text-red-700">
                          {result.errorMessage}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-lg shadow-md p-8 space-y-6"
        >
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={handleGenerateContent}
              disabled={generating || changesets.length === 0}
              className="flex items-center space-x-2 text-sm text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-md disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>{generating ? "Generating..." : "Auto-fill with AI"}</span>
            </button>
          </div>

          <div>
            <label
              htmlFor="prTitle"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              PR Title
            </label>
            <input
              id="prTitle"
              name="prTitle"
              type="text"
              value={formData.prTitle}
              onChange={handleChange}
              placeholder="e.g., Add settlement columns to trades table"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Summary of changes for the PR
            </p>
          </div>

          <div>
            <label
              htmlFor="prDescription"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              PR Description
            </label>
            <p className="text-xs text-blue-600 mb-2">
              ✓ Auto-generated from changesets — edit freely
            </p>
            <textarea
              id="prDescription"
              name="prDescription"
              value={formData.prDescription}
              onChange={handleChange}
              placeholder={`## Changeset Summary\n\n- Added settlement_date column to trades table\n- Impact: Trades, Trade Amendments\n\n## Migration Details\n\nThese changes support the upcoming settlement feature.`}
              required
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Markdown supported. Include context about the changes.
            </p>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => navigate("/liquibase/preview")}
              className="flex-1 bg-gray-300 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-400 font-medium"
            >
              Back to Preview
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                !formData.prTitle ||
                !formData.prDescription ||
                !execution?.prUnlocked
              }
              className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400 font-medium transition-colors"
            >
              {loading
                ? "Creating PR..."
                : execution?.prUnlocked
                  ? "Create Pull Request"
                  : "Create Pull Request (Locked)"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PRCreationPage;
