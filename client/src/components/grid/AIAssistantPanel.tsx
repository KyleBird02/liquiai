import React, { useState } from "react";
import { GridConfig } from "../../types";

interface AIAssistantPanelProps {
  gridConfig: GridConfig;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  gridConfig,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSuggestWidths = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/grid/ai/suggest-widths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns: gridConfig.columns }),
      });
      const suggestions = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: "Suggest widths",
        },
        {
          role: "assistant",
          content: `Width suggestions:\n${suggestions.map((s: any) => `- ${s.columnName}: ${s.suggestedWidth}px (${s.confidence} confidence, ${s.dataPoints} data points)`).join("\n")}`,
        },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestHeaders = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/grid/ai/suggest-headers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns: gridConfig.columns }),
      });
      const suggestions = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: "Suggest headers",
        },
        {
          role: "assistant",
          content: `Header suggestions:\n${suggestions.map((s: any) => `- ${s.columnName}: "${s.suggestedHeaderName}" (current: "${s.currentHeaderName}")`).join("\n")}`,
        },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleChat = async () => {
    if (!input.trim()) return;

    try {
      setLoading(true);
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: input,
        },
      ]);

      const response = await fetch("/api/grid/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gridConfig,
          messages: [
            ...messages,
            {
              role: "user",
              content: input,
            },
          ],
        }),
      });

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.content,
        },
      ]);
      setInput("");
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-2 p-2 bg-gray-50 rounded">
        {messages.length === 0 ? (
          <div className="text-gray-500 text-sm p-2">
            <p className="mb-2">Quick actions:</p>
            <button
              onClick={handleSuggestWidths}
              disabled={loading}
              className="block w-full text-left px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 rounded mb-1 disabled:opacity-50"
            >
              📏 Suggest widths
            </button>
            <button
              onClick={handleSuggestHeaders}
              disabled={loading}
              className="block w-full text-left px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 rounded disabled:opacity-50"
            >
              📝 Suggest headers
            </button>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={msg.role === "user" ? "text-right" : ""}>
              <div
                className={`inline-block px-3 py-1 rounded text-sm ${
                  msg.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-800"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="space-y-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleChat()}
          placeholder="Ask for help..."
          disabled={loading}
          className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:border-blue-400 disabled:opacity-50"
        />
        <button
          onClick={handleChat}
          disabled={loading || !input.trim()}
          className="w-full bg-blue-500 text-white px-2 py-1 text-sm rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
};

export default AIAssistantPanel;
