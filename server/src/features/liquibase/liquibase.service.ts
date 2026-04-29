import { sessionManager } from "../../services/session";
import {
  ChangesetDefinition,
  Phase2Session,
  ProposedChange,
} from "../../types";
import { LiquibaseGeneratorService } from "./generator.service";

export class LiquibaseService {
  private sessions: Map<string, Phase2Session> = new Map();

  private generator: LiquibaseGeneratorService;

  constructor() {
    this.generator = new LiquibaseGeneratorService(
      process.env.LIQUIBASE_CHANGESET_AUTHOR || "liquiai",
    );
  }

  /**
   * Create or get a session for the current request context
   * For now, uses a default session ID since this is single-user PoC
   */
  private getSessionId(): string {
    return "default-session";
  }

  private replaceSqlFilePathInXml(
    sourceXml: string,
    oldPath: string | null,
    nextPath: string,
  ): string {
    if (!sourceXml || !nextPath) {
      return sourceXml;
    }

    if (oldPath) {
      const escapedOld = oldPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const exactPattern = new RegExp(
        `(<sqlFile[^>]*\\bpath=")${escapedOld}(")`,
        "g",
      );
      const replacedExact = sourceXml.replace(exactPattern, `$1${nextPath}$2`);
      if (replacedExact !== sourceXml) {
        return replacedExact;
      }
    }

    return sourceXml.replace(
      /(<sqlFile[^>]*\bpath=")([^"]+)(")/,
      `$1${nextPath}$3`,
    );
  }

  async initWorkspace(
    author: string,
    targetApplication: string,
    targetSprint: string,
    branchName?: string,
  ): Promise<Phase2Session> {
    const sessionId = this.getSessionId();
    const existing = this.sessions.get(sessionId);

    const clearChangesets =
      existing &&
      (existing.targetApplication !== targetApplication ||
        existing.targetSprint !== targetSprint);

    const session: Phase2Session = existing
      ? {
          ...existing,
          author,
          targetApplication,
          targetSprint,
          branchName,
          changesets: clearChangesets ? [] : existing.changesets,
          proposedChanges: clearChangesets ? [] : existing.proposedChanges,
        }
      : {
          author,
          targetApplication,
          targetSprint,
          branchName,
          proposedChanges: [],
          changesets: [],
        };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Get current session, or create an empty one if it doesn't exist
   */
  getSession(): Phase2Session {
    const sessionId = this.getSessionId();

    if (!this.sessions.has(sessionId)) {
      return {
        author: "",
        targetApplication: "",
        targetSprint: "",
        proposedChanges: [],
        changesets: [],
      };
    }

    return this.sessions.get(sessionId)!;
  }

  /**
   * Set proposed changes for the current session
   */
  async setProposedChanges(changes: ProposedChange[]): Promise<Phase2Session> {
    const sessionId = this.getSessionId();
    const session = this.getSession();

    session.proposedChanges = [...changes];
    session.prReviewerAppendix = undefined;
    this.sessions.set(sessionId, session);

    return session;
  }

  async processBatchGeneration(
    appPrefix: string,
    startNumber: number,
  ): Promise<ChangesetDefinition[]> {
    const session = this.getSession();

    if (
      !session.author ||
      !session.targetApplication ||
      !session.targetSprint
    ) {
      throw new Error("Session must be initialized before generating batch");
    }

    let currentNumber = startNumber;
    let changesets: ChangesetDefinition[] = [];

    for (const change of session.proposedChanges) {
      const nextId = `${appPrefix}-${currentNumber}`;
      currentNumber += 1;

      const changeset = this.generator.generateChangesetDefinition(
        change,
        nextId,
        session.targetApplication,
        session.targetSprint,
        session.author,
        null,
      );

      changesets.push(changeset);
    }

    changesets = await this.generator.reviewChangesets(changesets);

    sessionManager.setChangesets(changesets);

    return changesets;
  }

  async processChangesetUpdate(
    changesetId: string,
    rawUpdates: any,
  ): Promise<ChangesetDefinition> {
    const session = sessionManager.getSession();
    const changeset = session.changesets?.find((cs) => cs.id === changesetId);

    if (!changeset) {
      throw new Error(`Changeset ${changesetId} not found in session`);
    }

    const processedUpdates: any = {
      edited: true,
    };

    if (rawUpdates.xmlContent !== undefined)
      processedUpdates.xmlContent = rawUpdates.xmlContent;
    if (rawUpdates.sqlFileContent !== undefined)
      processedUpdates.sqlFileContent = rawUpdates.sqlFileContent;
    if (rawUpdates.comment !== undefined)
      processedUpdates.comment = rawUpdates.comment;
    if (rawUpdates.changeType !== undefined)
      processedUpdates.changeType = rawUpdates.changeType;

    if (rawUpdates.sqlFilePath !== undefined) {
      processedUpdates.sqlFilePath = rawUpdates.sqlFilePath;

      if (changeset.sqlFiles && changeset.sqlFiles.length > 0) {
        processedUpdates.sqlFiles = changeset.sqlFiles.map((file, index) =>
          index === 0 ? { ...file, path: rawUpdates.sqlFilePath } : file,
        );
      }

      if (rawUpdates.sqlFilePath) {
        const xmlSource =
          processedUpdates.xmlContent !== undefined
            ? processedUpdates.xmlContent
            : changeset.xmlContent;

        processedUpdates.xmlContent = this.replaceSqlFilePathInXml(
          xmlSource,
          changeset.sqlFilePath,
          rawUpdates.sqlFilePath,
        );
      }
    }

    if (rawUpdates.sqlFiles !== undefined) {
      processedUpdates.sqlFiles = rawUpdates.sqlFiles.map((file: any) => ({
        path: String(file?.path || ""),
        content: String(file?.content || ""),
      }));

      if (processedUpdates.sqlFiles.length > 0) {
        processedUpdates.sqlFilePath = processedUpdates.sqlFiles[0].path;
        processedUpdates.sqlFileContent = processedUpdates.sqlFiles[0].content;
      } else {
        processedUpdates.sqlFilePath = null;
        processedUpdates.sqlFileContent = null;
      }
    }

    sessionManager.updateChangeset(changesetId, processedUpdates);

    return sessionManager
      .getSession()
      .changesets.find((cs: ChangesetDefinition) => cs.id === changesetId);
  }
}
