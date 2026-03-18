import { useState, useCallback } from "react";
import type { SchemaSnapshot, ProposedChange } from "@/types/index";
import { schemaAPI, changesAPI } from "@/api/index";

// Helper function to check if result is an error object
function isError(result: unknown): result is { error: string } {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as any).error === "string"
  );
}

/**
 * Hook for managing schema state and operations
 */
export const useSchema = () => {
  const [snapshot, setSnapshot] = useState<SchemaSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (connectionString: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await schemaAPI.connect(connectionString);
      if (isError(result)) {
        setError(result.error);
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const captureSnapshot = useCallback(async (database?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = (await schemaAPI.captureSnapshot(database)) as
        | SchemaSnapshot
        | { error: string };
      if ("error" in result) {
        setError(result.error);
        return null;
      }
      setSnapshot(result);
      return result;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to capture snapshot",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const getCurrentSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = (await schemaAPI.getCurrentSnapshot()) as
        | SchemaSnapshot
        | { error: string };
      if ("error" in result) {
        setError(result.error);
        return null;
      }
      setSnapshot(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get snapshot");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    snapshot,
    loading,
    error,
    connect,
    captureSnapshot,
    getCurrentSnapshot,
  };
};

/**
 * Hook for managing proposed changes
 */
export const useProposedChanges = () => {
  const [changes, setChanges] = useState<ProposedChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await changesAPI.listChanges();
      if (isError(result)) {
        setError(result.error);
        return [];
      }
      setChanges(result.changes || []);
      return result.changes || [];
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list changes");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const get = useCallback(async (changeId: string) => {
    try {
      const result = await changesAPI.getChange(changeId);
      if (isError(result)) {
        setError(result.error);
        return null;
      }
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get change");
      return null;
    }
  }, []);

  const propose = useCallback(
    async (type: string, payload: any) => {
      setLoading(true);
      setError(null);
      try {
        const result = await changesAPI.proposeChange(type, payload);
        if (isError(result)) {
          setError(result.error);
          return null;
        }
        setChanges([...changes, result.change]);
        return result;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to propose change",
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [changes],
  );

  const apply = useCallback(
    async (changeId: string, connectionString?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await changesAPI.applyChange(changeId, connectionString);
        if (isError(result)) {
          setError(result.error);
          return false;
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to apply change");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const remove = useCallback(
    async (changeId: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await changesAPI.deleteChange(changeId);
        if (isError(result)) {
          setError(result.error);
          return false;
        }
        setChanges(changes.filter((c) => c.id !== changeId));
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete change",
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [changes],
  );

  return {
    changes,
    loading,
    error,
    list,
    get,
    propose,
    apply,
    remove,
  };
};

/**
 * Hook for managing database connection state
 */
export const useDatabaseConnection = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionString, setConnectionString] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (connStr: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await schemaAPI.connect(connStr);
      if (isError(result)) {
        setError(result.error);
        return false;
      }
      setIsConnected(true);
      setConnectionString(connStr);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    isConnected,
    connectionString,
    loading,
    error,
    connect,
  };
};
