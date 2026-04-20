import React from "react";
import { useNavigate } from "react-router-dom";
import { ChangesetDefinition } from "@/types";
import { ChangesetCard } from "../ChangesetCard/ChangesetCard";

interface ReviewStepProps {
  changesets: ChangesetDefinition[];
  startId: string;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onAggregate: () => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
  onUpdate: (updated: ChangesetDefinition) => void;
}

export const ReviewStep: React.FC<ReviewStepProps> = ({
  changesets,
  startId,
  loading,
  error,
  onBack,
  onAggregate,
  onReorder,
  onUpdate,
}) => {
  const navigate = useNavigate();
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  const handleDrop = async (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }

    const reordered = [...changesets];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    setDragIndex(null);
    await onReorder(reordered.map((c) => c.id));
  };

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

        {changesets.length > 0 && (
          <div className="mb-8">
            {(() => {
              const highSeverity = changesets.reduce(
                (count, cs) =>
                  count +
                  (cs.reviews?.filter((r) => r.severity === "high").length ||
                    0),
                0,
              );
              const mediumSeverity = changesets.reduce(
                (count, cs) =>
                  count +
                  (cs.reviews?.filter((r) => r.severity === "medium").length ||
                    0),
                0,
              );
              const lowSeverity = changesets.reduce(
                (count, cs) =>
                  count +
                  (cs.reviews?.filter((r) => r.severity === "low").length || 0),
                0,
              );
              const totalWarnings = highSeverity + mediumSeverity + lowSeverity;

              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* High Severity */}
                  {highSeverity > 0 && (
                    <div className="bg-white border-l-4 border-red-500 rounded-lg p-4 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-gray-600 text-sm font-medium">
                            Critical Issues
                          </p>
                          <p className="text-3xl font-bold text-red-600 mt-1">
                            {highSeverity}
                          </p>
                        </div>
                        <div className="text-3xl">🚨</div>
                      </div>
                    </div>
                  )}

                  {/* Medium Severity */}
                  {mediumSeverity > 0 && (
                    <div className="bg-white border-l-4 border-yellow-500 rounded-lg p-4 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-gray-600 text-sm font-medium">
                            Warnings
                          </p>
                          <p className="text-3xl font-bold text-yellow-600 mt-1">
                            {mediumSeverity}
                          </p>
                        </div>
                        <div className="text-3xl">⚠️</div>
                      </div>
                    </div>
                  )}

                  {/* Low Severity */}
                  {lowSeverity > 0 && (
                    <div className="bg-white border-l-4 border-blue-500 rounded-lg p-4 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-gray-600 text-sm font-medium">
                            Info
                          </p>
                          <p className="text-3xl font-bold text-blue-600 mt-1">
                            {lowSeverity}
                          </p>
                        </div>
                        <div className="text-3xl">ℹ️</div>
                      </div>
                    </div>
                  )}

                  {/* No issues case */}
                  {totalWarnings === 0 && (
                    <div className="md:col-span-3 bg-white border-l-4 border-green-500 rounded-lg p-4 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-gray-600 text-sm font-medium">
                            All Clear
                          </p>
                          <p className="text-lg font-semibold text-green-600 mt-1">
                            No issues detected
                          </p>
                        </div>
                        <div className="text-3xl">✅</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        <div className="space-y-4">
          {changesets.map((changeset, index) => (
            <div
              key={changeset.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void handleDrop(index)}
              className={`rounded-lg transition ${
                dragIndex === index
                  ? "opacity-60 ring-2 ring-blue-300"
                  : "opacity-100"
              }`}
              title="Drag to reorder"
            >
              <div className="text-xs text-gray-500 mb-1 ml-2">
                Drag to reorder
              </div>
              <ChangesetCard
                changeset={changeset}
                onUpdate={(updated) => {
                  onUpdate(updated);
                }}
              />
            </div>
          ))}
        </div>

        <div className="mt-8 flex gap-4">
          <button
            onClick={onBack}
            className="flex-1 bg-gray-300 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-400 font-medium"
          >
            Back
          </button>
          {changesets.length > 1 && (
            <button
              onClick={onAggregate}
              disabled={loading}
              className="flex-1 bg-yellow-600 text-white py-2 px-4 rounded-md hover:bg-yellow-700 disabled:bg-gray-400 font-medium"
            >
              {loading ? "Combining..." : "Combine All Changesets"}
            </button>
          )}
          <button
            onClick={() => navigate("/liquibase/preview")}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 font-medium"
          >
            Preview Files & Create PR
          </button>
        </div>
      </div>
    </div>
  );
};
