import { access, mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import {
  Liquibase,
  LiquibaseConfig,
  POSTGRESQL_DEFAULT_CONFIG,
} from "liquibase";
import { ChangesetDefinition } from "../types";

interface LocalApplyStep {
  name: string;
  status: "success" | "failed";
  detail: string;
}

interface LocalApplyExecutionResult {
  success: boolean;
  summary: string;
  steps: LocalApplyStep[];
}

interface ChangesetValidateResult {
  passed: boolean;
  errors: string[];
}

interface LocalDbConfig {
  jdbcUrl: string;
  username: string;
  password: string;
}

interface ExecutionWorkspace {
  tempDir: string;
  changelogFilePath: string;
}

class LocalApplyService {
  private readonly serverRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
  );

  private getConnectionStrings() {
    const devConnectionString = process.env.DEV_DB_CONNECTION_STRING;
    const localConnectionString = process.env.LOCAL_DB_CONNECTION_STRING;

    if (!devConnectionString)
      throw new Error("DEV_DB_CONNECTION_STRING is missing");
    if (!localConnectionString)
      throw new Error("LOCAL_DB_CONNECTION_STRING is missing");

    return { devConnectionString, localConnectionString };
  }

  private toLocalDbConfig(connectionString: string): LocalDbConfig {
    const parsed = new URL(connectionString);

    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
      throw new Error(`Unsupported protocol: ${parsed.protocol}`);
    }

    const host = parsed.hostname;
    const port = parsed.port || "5432";
    const dbName = parsed.pathname.replace(/^\//, "");

    if (!host || !dbName) {
      throw new Error("Connection string must include host and database name");
    }

    const username = decodeURIComponent(parsed.username || "");
    const password = decodeURIComponent(parsed.password || "");

    if (!username) throw new Error("Connection string must include username");

    const query = parsed.searchParams.toString();
    const jdbcUrl = `jdbc:postgresql://${host}:${port}/${dbName}${query ? `?${query}` : ""}`;

    return { jdbcUrl, username, password };
  }

  private async resolveJdbcDriverPath(): Promise<string | null> {
    const fromEnv = process.env.LIQUIBASE_JDBC_DRIVER_PATH?.trim();
    if (fromEnv) {
      const resolved = resolve(fromEnv);
      await access(resolved);
      return resolved;
    }
    return null;
  }

  private async buildLiquibaseConfig(
    changelogFilePath: string,
    dbConfig: LocalDbConfig,
  ): Promise<LiquibaseConfig> {
    const jdbcDriverPath = await this.resolveJdbcDriverPath();

    const config: LiquibaseConfig = {
      ...POSTGRESQL_DEFAULT_CONFIG,
      changeLogFile: changelogFilePath,
      url: dbConfig.jdbcUrl,
      username: dbConfig.username,
      password: dbConfig.password,
      driver: "org.postgresql.Driver",
    };

    if (jdbcDriverPath) {
      config.classpath = jdbcDriverPath;
    }

    return config;
  }

  private async createExecutionWorkspace(
    changesets: ChangesetDefinition[],
  ): Promise<ExecutionWorkspace> {
    const tempDir = await mkdtemp(resolve(tmpdir(), "liquiai-"));
    const changelogFilePath = resolve(tempDir, "changelog.xml");

    for (const changeset of changesets) {
      const sqlFiles = changeset.sqlFiles?.length
        ? changeset.sqlFiles
        : changeset.changeType === "sql" &&
            changeset.sqlFilePath &&
            changeset.sqlFileContent
          ? [{ path: changeset.sqlFilePath, content: changeset.sqlFileContent }]
          : [];

      for (const sqlFile of sqlFiles) {
        const safePath = this.resolveSafePath(tempDir, sqlFile.path);
        await mkdir(dirname(safePath), { recursive: true });
        await writeFile(safePath, sqlFile.content ?? "", "utf8");
      }
    }

    // Write master changelog
    const changelog = this.buildMasterChangelog(changesets);
    await writeFile(changelogFilePath, changelog, "utf8");

    return { tempDir, changelogFilePath };
  }

  private resolveSafePath(tempDir: string, relativePath: string): string {
    const normalized = relativePath
      .replace(/\\/g, "/")
      .replace(/^\.\//, "")
      .trim();

    if (!normalized) throw new Error("SQL file path cannot be empty");
    if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) {
      throw new Error(`SQL file path must be relative: ${relativePath}`);
    }

    const parts = normalized.split("/").filter(Boolean);
    if (parts.some((p) => p === "." || p === "..")) {
      throw new Error(
        `SQL file path cannot contain '.' or '..': ${relativePath}`,
      );
    }

    const absolute = resolve(tempDir, ...parts);
    if (!absolute.startsWith(tempDir)) {
      throw new Error(`Resolved path escapes temp directory: ${relativePath}`);
    }

    return absolute;
  }

  private buildMasterChangelog(changesets: ChangesetDefinition[]): string {
    const body = changesets
      .map((c) => c.xmlContent.trim())
      .filter(Boolean)
      .join("\n\n");

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<databaseChangeLog",
      '  xmlns="http://www.liquibase.org/xml/ns/dbchangelog"',
      '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
      '  xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-latest.xsd">',
      body,
      "</databaseChangeLog>",
      "",
    ].join("\n");
  }

  /**
   * Runs work inside a temp workspace, always cleaning up on exit.
   */
  private async withWorkspace<T>(
    changesets: ChangesetDefinition[],
    work: (
      workspace: ExecutionWorkspace,
      dbConfig: LocalDbConfig,
    ) => Promise<T>,
  ): Promise<T> {
    const { localConnectionString } = this.getConnectionStrings();
    const dbConfig = this.toLocalDbConfig(localConnectionString);
    const workspace = await this.createExecutionWorkspace(changesets);

    try {
      return await work(workspace, dbConfig);
    } finally {
      await rm(workspace.tempDir, { recursive: true, force: true });
    }
  }

  async syncLocalToDev(): Promise<void> {
    const { devConnectionString, localConnectionString } =
      this.getConnectionStrings();
    const dbConfig = this.toLocalDbConfig(localConnectionString);

    const devChangelogPath = process.env.DEV_CHANGELOG_FILE_PATH;
    if (!devChangelogPath) {
      throw new Error(
        "DEV_CHANGELOG_FILE_PATH is required for sync — set it to the path of the DEV changeset.xml",
      );
    }

    const jdbcDriverPath = await this.resolveJdbcDriverPath();

    const config: LiquibaseConfig = {
      ...POSTGRESQL_DEFAULT_CONFIG,
      changeLogFile: devChangelogPath,
      url: dbConfig.jdbcUrl,
      username: dbConfig.username,
      password: dbConfig.password,
      driver: "org.postgresql.Driver",
    };

    if (jdbcDriverPath) config.classpath = jdbcDriverPath;

    const instance = new Liquibase(config);

    await instance.update({});
  }

  async validateChangesets(
    changesets: ChangesetDefinition[],
  ): Promise<ChangesetValidateResult> {
    try {
      await this.withWorkspace(changesets, async (workspace, dbConfig) => {
        const config = await this.buildLiquibaseConfig(
          workspace.changelogFilePath,
          dbConfig,
        );
        const instance = new Liquibase(config);
        await instance.validate();
      });

      return { passed: true, errors: [] };
    } catch (error: any) {
      const raw = String(error?.message ?? "Liquibase validation failed");
      const errors = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-20);

      return { passed: false, errors: errors.length ? errors : [raw] };
    }
  }

  /**
   * Returns how many changesets in the batch are pending (not yet applied)
   * on the local DB. Useful for the UI status indicator.
   */
  async getPendingCount(changesets: ChangesetDefinition[]): Promise<number> {
    try {
      const output = await this.withWorkspace(
        changesets,
        async (workspace, dbConfig) => {
          const config = await this.buildLiquibaseConfig(
            workspace.changelogFilePath,
            dbConfig,
          );
          const instance = new Liquibase(config);
          return await instance.status();
        },
      );

      // Liquibase status output includes a line like "3 changesets have not been applied"
      const match = String(output).match(/(\d+)\s+change\s*set/i);
      return match ? parseInt(match[1], 10) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Checks whether the DATABASECHANGELOGLOCK table is currently locked
   * on the local DB. Does not require a Liquibase changelog.
   */
  async detectLockStatus(): Promise<"free" | "locked"> {
    const { localConnectionString } = this.getConnectionStrings();
    const client = new Client({ connectionString: localConnectionString });
    await client.connect();

    try {
      const tableCheck = await client.query(
        "SELECT to_regclass('public.databasechangeloglock') AS tbl",
      );

      if (!tableCheck.rows[0]?.tbl) return "free";

      const result = await client.query(
        "SELECT locked FROM public.databasechangeloglock WHERE id = 1",
      );

      return result.rows[0]?.locked ? "locked" : "free";
    } finally {
      await client.end();
    }
  }

  /**
   * Releases the Liquibase lock on the local DB.
   * Tries the official releaseLocks() command first, falls back to a
   * direct SQL UPDATE if Liquibase itself can't acquire the lock to release it.
   */
  async forceUnlock(changesets: ChangesetDefinition[]): Promise<void> {
    try {
      await this.withWorkspace(changesets, async (workspace, dbConfig) => {
        const config = await this.buildLiquibaseConfig(
          workspace.changelogFilePath,
          dbConfig,
        );
        const instance = new Liquibase(config);
        await instance.releaseLocks();
      });
    } catch {
      // Fallback: direct SQL if Liquibase itself is locked out
      const { localConnectionString } = this.getConnectionStrings();
      const client = new Client({ connectionString: localConnectionString });
      await client.connect();

      try {
        const tableCheck = await client.query(
          "SELECT to_regclass('public.databasechangeloglock') AS tbl",
        );

        if (!tableCheck.rows[0]?.tbl) return;

        await client.query(
          `UPDATE public.databasechangeloglock
           SET locked = FALSE, lockgranted = NULL, lockedby = NULL
           WHERE id = 1`,
        );
      } finally {
        await client.end();
      }
    }
  }

  /**
   * Full local execution flow:
   * 1. Sync local DB to DEV baseline via Liquibase update()
   * 2. Validate the generated changeset batch
   * 3. Apply the changeset batch to local DB
   *
   * PR generation is only unlocked when this returns success: true.
   */
  async applyChangesetsToLocal(
    changesets: ChangesetDefinition[],
  ): Promise<LocalApplyExecutionResult> {
    const steps: LocalApplyStep[] = [];

    try {
      // Step 1 — sync local to DEV baseline
      await this.syncLocalToDev();
      steps.push({
        name: "sync-local-to-dev",
        status: "success",
        detail: "Local DB synced to DEV baseline via Liquibase",
      });

      // Step 2 — validate the changeset batch
      const validation = await this.validateChangesets(changesets);
      if (!validation.passed) {
        throw new Error(
          validation.errors.join("\n") || "Liquibase validation failed",
        );
      }
      steps.push({
        name: "validate-changesets",
        status: "success",
        detail: "Changeset batch passed Liquibase validation",
      });

      // Step 3 — apply changesets to local
      await this.withWorkspace(changesets, async (workspace, dbConfig) => {
        const config = await this.buildLiquibaseConfig(
          workspace.changelogFilePath,
          dbConfig,
        );
        const instance = new Liquibase(config);
        await instance.update({});
      });
      steps.push({
        name: "apply-changesets",
        status: "success",
        detail: `Applied ${changesets.length} changeset(s) to local DB`,
      });

      return {
        success: true,
        summary: "All steps completed — PR generation unlocked",
        steps,
      };
    } catch (error: any) {
      const failedStep =
        steps.length === 0
          ? "sync-local-to-dev"
          : steps.length === 1
            ? "validate-changesets"
            : "apply-changesets";

      steps.push({
        name: failedStep,
        status: "failed",
        detail: error?.message ?? "Unknown failure",
      });

      return {
        success: false,
        summary: error?.message ?? "Local execution failed",
        steps,
      };
    }
  }
}

export const localApplyService = new LocalApplyService();
