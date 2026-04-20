import React, { useState, useRef, useEffect } from "react";
import { Loader2, X, CheckCircle } from "lucide-react";
import { changesAPI } from "@/api/index";

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (changeIds: string[]) => void;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [userInput, setUserInput] = useState("");
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [continueNeeded, setContinueNeeded] = useState(false);
  const [allTablesComplete, setAllTablesComplete] = useState(false);
  const [createdTableNames, setCreatedTableNames] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversationHistory, loading]);

  if (!isOpen) return null;

  const handleSubmit = async (message: string) => {
    if (!message.trim()) return;

    const newHistory = [
      ...conversationHistory,
      { role: "user" as const, content: message },
    ];
    setConversationHistory(newHistory);
    setUserInput("");
    setLoading(true);
    setError(null);

    try {
      const result = await changesAPI.askAIAssistant(newHistory);

      if (result && !("error" in result)) {
        if (result.assistantMessage) {
          setConversationHistory([
            ...newHistory,
            { role: "assistant", content: result.assistantMessage },
          ]);
        }

        // Track flags from response
        setContinueNeeded(result.continueNeeded || false);
        setAllTablesComplete(result.allTablesComplete || false);

        if (result.changeIds && result.changeIds.length > 0) {
          setCreatedTableNames([...createdTableNames, ...result.changeIds]);

          if (result.allTablesComplete) {
            setConversationHistory([]);
            setUserInput("");
            setContinueNeeded(false);
            setAllTablesComplete(false);
            onSuccess([...createdTableNames, ...result.changeIds]);
            onClose();
          }
        }
      } else {
        setError(result?.error || "Failed to process request");
      }
    } catch (err: any) {
      setError(err.message || "Failed to process request");
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    handleSubmit("Please continue with the next tables.");
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">AI Schema Assistant</h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-indigo-500 p-1 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conversation */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {conversationHistory.length === 0 && (
            <div className="text-center text-gray-500">
              <p className="mb-2">
                Describe the tables/structure you want to create, or data you
                want to insert.
              </p>
              <p className="text-sm">
                Example: "Create users and posts tables, then add 2 seed users".
              </p>
            </div>
          )}

          {conversationHistory.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs px-4 py-2 rounded-lg ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-900"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Status Message */}
        {allTablesComplete && (
          <div className="border-t border-gray-200 bg-green-50 px-6 py-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-700">
              All tables created successfully! Close to proceed.
            </span>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-gray-200 p-6">
          {continueNeeded && !allTablesComplete && (
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
              <p>
                <strong>More tables needed:</strong> Click "Continue" to create
                the remaining dependent tables, or type a new description.
              </p>
            </div>
          )}

          <div className="flex gap-2 mb-3">
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  handleSubmit(userInput);
                }
              }}
              placeholder={
                continueNeeded && !allTablesComplete
                  ? "Or type more details..."
                  : "Describe what you want to create..."
              }
              rows={3}
              disabled={loading || allTablesComplete}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 font-mono text-sm"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            {continueNeeded && !allTablesComplete ? (
              <>
                <button
                  onClick={handleContinue}
                  disabled={loading}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition"
                >
                  {loading ? "Creating..." : "Continue →"}
                </button>
                <button
                  onClick={() => handleSubmit(userInput)}
                  disabled={loading || !userInput.trim()}
                  className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition"
                >
                  {loading ? "Processing..." : "Send"}
                </button>
              </>
            ) : (
              <button
                onClick={() => handleSubmit(userInput)}
                disabled={loading || !userInput.trim() || allTablesComplete}
                className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition"
              >
                {loading ? "Processing..." : "Send"}
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 font-medium transition"
            >
              Close
            </button>
          </div>

          <p className="text-xs text-gray-500 mt-2">
            Tip: Press Ctrl+Enter to send
          </p>
        </div>
      </div>
    </div>
  );
};
