import axios, { AxiosError } from "axios";
import type {
  SchemaSnapshot,
  ProposedChange,
  SchemaDiff,
  ValidationResult,
} from "@/types/index";

const API_BASE = "/api";

// Create axios instance with base URL
const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

// Error handler
const handleError = (error: AxiosError) => {
  if (error.response) {
    return error.response.data;
  }
  return { error: error.message };
};

// Schema endpoints
export const schemaAPI = {
  /**
   * Get default database configurations
   */
  async getConfig() {
    try {
      const response = await apiClient.get("/schema/config");
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Test and establish database connection
   */
  async connect(connectionString: string) {
    try {
      const response = await apiClient.post("/schema/connect", {
        connectionString,
      });
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Capture current database schema snapshot
   * @param connectionStringOrDb - Either a full connection string or database name
   */
  async captureSnapshot(connectionStringOrDb?: string) {
    try {
      const params: any = {};
      if (connectionStringOrDb) {
        // If it looks like a connection string (contains ://) use it as connectionString
        if (connectionStringOrDb.includes("://")) {
          params.connectionString = connectionStringOrDb;
        } else {
          // Otherwise treat as database name
          params.database = connectionStringOrDb;
        }
      }
      const response = await apiClient.get("/schema/snapshot", { params });
      return response.data as SchemaSnapshot;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Get the most recently captured snapshot
   */
  async getCurrentSnapshot() {
    try {
      const response = await apiClient.get("/schema/snapshot");
      return response.data as SchemaSnapshot;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * List all tables in current snapshot
   */
  async listTables() {
    try {
      const response = await apiClient.get("/schema/tables");
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Get data from a specific table
   */
  async getTableData(tableName: string, connectionString: string) {
    try {
      const response = await apiClient.get("/schema/table/data", {
        params: {
          table: tableName,
          connectionString,
        },
      });
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Get a specific table definition
   */
  async getTable(schema: string, name: string) {
    try {
      const response = await apiClient.get(`/schema/tables/${schema}/${name}`);
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Update a column in a table (local database only)
   */
  async updateColumn(
    schema: string,
    tableName: string,
    columnName: string,
    updates: {
      name?: string;
      type?: string;
      nullable?: boolean;
      defaultValue?: string | null;
    },
    connectionString: string,
  ) {
    try {
      const response = await apiClient.post(
        `/schema/tables/${schema}/${tableName}/columns/${columnName}`,
        {
          updates,
          connectionString,
        },
      );
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },
};

// Changes endpoints
export const changesAPI = {
  /**
   * Propose a new change
   */
  async proposeChange(type: string, payload: any) {
    try {
      const response = await apiClient.post("/changes/propose", {
        type,
        payload,
      });
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * List all proposed changes in session
   */
  async listChanges() {
    try {
      const response = await apiClient.get("/changes");
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Get a specific change by ID
   */
  async getChange(changeId: string) {
    try {
      const response = await apiClient.get(`/changes/${changeId}`);
      return response.data as ProposedChange;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Apply a validated change to database
   */
  async applyChange(changeId: string, connectionString?: string) {
    try {
      const body: any = {};
      if (connectionString) {
        body.connectionString = connectionString;
      }
      const response = await apiClient.post(`/changes/${changeId}/apply`, body);
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Discard a proposed change
   */
  async deleteChange(changeId: string) {
    try {
      const response = await apiClient.delete(`/changes/${changeId}`);
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Clear all proposed changes
   */
  async clearAll() {
    try {
      const response = await apiClient.post("/changes/clear");
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },
};

// Liquibase endpoints
export const liquibaseAPI = {
  /**
   * Generate Liquibase changeset XML and SQL preview
   */
  async generateChangeset(change: ProposedChange, changesetId?: string) {
    try {
      const response = await apiClient.post("/liquibase/generate", {
        change,
        changesetId,
      });
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * List all generated changesets
   */
  async listChangesets() {
    try {
      const response = await apiClient.get("/liquibase/changesets");
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Get a specific changeset
   */
  async getChangeset(changesetId: string) {
    try {
      const response = await apiClient.get(
        `/liquibase/changesets/${changesetId}`,
      );
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Download changeset as XML file
   */
  async downloadXML(changesetId: string) {
    try {
      const response = await apiClient.get(
        `/liquibase/changesets/${changesetId}/xml`,
      );
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Get SQL preview
   */
  async getSQLPreview(changesetId: string) {
    try {
      const response = await apiClient.get(
        `/liquibase/changesets/${changesetId}/sql`,
      );
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },
};

// Health check
export const healthCheck = async () => {
  try {
    const response = await apiClient.get("/health");
    return response.data;
  } catch (error) {
    return { error: "Health check failed" };
  }
};

export default {
  schema: schemaAPI,
  changes: changesAPI,
  liquibase: liquibaseAPI,
  healthCheck,
};
