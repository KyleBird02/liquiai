import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { githubAPI } from "@/api";

const PRCreationPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    prTitle: "",
    prDescription: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [prResult, setPrResult] = useState<any>(null);

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
                onClick={() => navigate("/phase2/setup")}
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

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-lg shadow-md p-8 space-y-6"
        >
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
              onClick={() => navigate("/phase2/preview")}
              className="flex-1 bg-gray-300 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-400 font-medium"
            >
              Back to Preview
            </button>
            <button
              type="submit"
              disabled={loading || !formData.prTitle || !formData.prDescription}
              className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400 font-medium transition-colors"
            >
              {loading ? "Creating PR..." : "Create Pull Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PRCreationPage;
