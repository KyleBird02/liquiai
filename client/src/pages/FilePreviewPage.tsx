import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { githubAPI } from "@/api";
import { GitHubFileChange } from "@/types";

const FilePreviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState<GitHubFileChange[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);

  useEffect(() => {
    loadPreview();
  }, []);

  const loadPreview = async () => {
    try {
      const result = await githubAPI.previewFiles();

      if (result.error) {
        setError(result.error);
        return;
      }

      setFiles(result.files);
      setSummary(result.summary);
    } catch (err: any) {
      setError("Failed to load file preview: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Loading preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded">
            {error}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => navigate("/phase2/changesets")}
              className="bg-gray-300 text-gray-800 py-2 px-4 rounded hover:bg-gray-400"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentFile = files[selectedFileIndex];

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Preview Files to Commit
        </h1>
        <p className="text-gray-600 mb-8">
          Review all files that will be committed to the Liquibase repository
        </p>

        {/* Summary */}
        <div className="mb-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Total Files</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary?.totalFiles}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Changesets</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary?.changesetCount}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Application</p>
              <p className="text-lg font-semibold text-gray-900">
                {summary?.applicationPath}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Sprint</p>
              <p className="text-lg font-semibold text-gray-900">
                {summary?.sprintFolder}
              </p>
            </div>
          </div>
        </div>

        {/* File selector and preview */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* File list */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Files ({files.length})
            </h3>
            <div className="space-y-2">
              {files.map((file, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedFileIndex(index)}
                  className={`block w-full text-left p-3 rounded text-sm font-medium truncate ${
                    selectedFileIndex === index
                      ? "bg-blue-100 text-blue-900 border border-blue-300"
                      : "hover:bg-gray-100 text-gray-700"
                  }`}
                  title={file.path}
                >
                  {file.path.split("/").pop()}
                </button>
              ))}
            </div>
          </div>

          {/* File preview */}
          {currentFile && (
            <div className="lg:col-span-3 bg-white rounded-lg shadow-md p-6 flex flex-col">
              <div className="mb-4 pb-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {currentFile.path}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Message: {currentFile.message}
                </p>
              </div>

              <div className="flex-1 overflow-auto">
                <pre className="bg-gray-900 text-gray-100 p-4 rounded text-xs font-mono leading-relaxed">
                  {currentFile.content}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-8 flex gap-4">
          <button
            onClick={() => navigate("/phase2/changesets")}
            className="flex-1 bg-gray-300 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-400 font-medium"
          >
            Back to Changesets
          </button>
          <button
            onClick={() => navigate("/phase2/create-pr")}
            className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 font-medium"
          >
            Continue to PR Creation
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilePreviewPage;
