import React, { useState, useEffect } from "react";
import { Database, AlertCircle } from "lucide-react";
import { useDatabaseConnection } from "@/hooks/index";
import { schemaAPI } from "@/api/index";

interface ConnectionFormProps {
  onConnected: () => void;
}

export const ConnectionForm: React.FC<ConnectionFormProps> = ({
  onConnected,
}) => {
  const [connectionString, setConnString] = useState("");
  const [configLoaded, setConfigLoaded] = useState(false);
  const { connect, loading, error, isConnected } = useDatabaseConnection();

  useEffect(() => {
    schemaAPI
      .getConfig()
      .then((config) => {
        console.log("Config loaded:", config);
        if (config && config.dev) {
          setConnString(config.dev);
        } else if (config?.error) {
          console.error("Config error:", config.error);
        }
        setConfigLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load config:", err);
        setConfigLoaded(true);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitting connection with:", connectionString);
    if (!connectionString.trim()) {
      alert("Please enter a connection string");
      return;
    }
    const success = await connect(connectionString);
    if (success) {
      onConnected();
    }
  };

  return (
    <div className="bg-white shadow sm:rounded-lg p-6 max-w-2xl mx-auto w-full">
      <div className="mb-6 flex items-center">
        <Database className="h-6 w-6 text-indigo-600 mr-2" />
        <h2 className="text-lg font-medium text-gray-900">
          Database Connection
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="connectionString"
            className="block text-sm font-medium text-gray-700"
          >
            PostgreSQL Connection String
          </label>
          <div className="mt-1">
            <input
              type="text"
              name="connectionString"
              id="connectionString"
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
              placeholder="postgresql://user:password@localhost:5432/dbname"
              value={connectionString}
              onChange={(e) => setConnString(e.target.value)}
              required
            />
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Enter the connection string for your DEV database. Tool operates in
            read-only mode during exploration.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertCircle
                  className="h-5 w-5 text-red-400"
                  aria-hidden="true"
                />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Connection Failed
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {isConnected && (
          <div className="rounded-md bg-green-50 p-4">
            <div className="flex pb-2">
              <p className="text-sm font-medium text-green-800">
                Successfully connected!
              </p>
            </div>
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading || !configLoaded}
            className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
              loading || !configLoaded ? "opacity-75 cursor-not-allowed" : ""
            }`}
          >
            {!configLoaded
              ? "Loading config..."
              : loading
                ? "Connecting..."
                : "Connect to Database"}
          </button>
        </div>
      </form>
    </div>
  );
};
