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

  async revertChange(changeId: string, connectionString?: string) {
    try {
      const body: any = {};
      if (connectionString) {
        body.connectionString = connectionString;
      }
      const response = await apiClient.post(
        `/changes/${changeId}/revert`,
        body,
      );
      return response.data;
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
   * Update a specific changeset (comment, changeType, xmlContent, sqlFileContent)
   */
  async updateChangeset(
    changesetId: string,
    updates: {
      comment?: string | null;
      changeType?: "xml" | "sql";
      xmlContent?: string;
      sqlFileContent?: string | null;
    },
  ) {
    try {
      const response = await apiClient.put(
        `/liquibase/changeset/${changesetId}`,
        updates,
      );
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Aggregate changesets into a single file
   */
  async aggregateChangesets(aggregatedId: string) {
    try {
      const response = await apiClient.post("/liquibase/aggregate", {
        aggregatedId,
      });
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

  // Phase 2 - Liquibase Changeset Management

  /**
   * Initialize Phase 2 session with user inputs
   */
  async initSession(
    author: string,
    targetApplication: string,
    targetSprint: string,
    branchName?: string,
  ) {
    try {
      const response = await apiClient.post("/liquibase/init", {
        author,
        targetApplication,
        targetSprint,
        branchName,
      });
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Get current Phase 2 session
   */
  async getSession() {
    try {
      const response = await apiClient.get("/liquibase/session");
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Add proposed changes to session
   */
  async addProposedChanges(changes: ProposedChange[]) {
    try {
      const response = await apiClient.post("/liquibase/add-proposed-changes", {
        changes,
      });
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Get the last changeset ID from GitHub
   */
  async getLastChangesetId() {
    try {
      const response = await apiClient.get("/liquibase/last-changeset-id");
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Generate batch of changesets from all proposed changes
   */
  async generateBatch(startId: string) {
    try {
      const response = await apiClient.post("/liquibase/generate-batch", {
        startId,
      });
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Clear current session
   */
  async clearSession() {
    try {
      const response = await apiClient.post("/liquibase/clear-session");
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },
};

// GitHub endpoints (Phase 2)
export const githubAPI = {
  /**
   * Preview all files that would be committed
   */
  async previewFiles() {
    try {
      const response = await apiClient.get("/github/preview");
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Create a GitHub PR with all changesets
   */
  async createPR(prTitle: string, prDescription: string) {
    try {
      const response = await apiClient.post("/github/create-pr", {
        prTitle,
        prDescription,
      });
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Generate simple PR title and description using LLM
   */
  async generatePRText() {
    try {
      const response = await apiClient.get("/github/generate-pr-text");
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Get GitHub API rate limit status
   */
  async getRateLimit() {
    try {
      const response = await apiClient.get("/github/rate-limit");
      return response.data;
    } catch (error) {
      return handleError(error as AxiosError);
    }
  },

  /**
   * Get application root directories
   */
  async getApplications() {
    try {
      const response = await apiClient.get("/github/applications");
      return response.data.applications || [];
    } catch (error) {
      return [];
    }
  },

  /**
   * Get sprint directories
   */
  async getSprints(application: string) {
    try {
      const response = await apiClient.get(
        `/github/sprints?application=${application}`,
      );
      return response.data.sprints || [];
    } catch (error) {
      return [];
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
  github: githubAPI,
  healthCheck,
};
