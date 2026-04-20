import {
  Phase2Session,
  ProposedChange,
  ChangesetDefinition,
} from "../types/index";
import { v4 as uuidv4 } from "uuid";

/**
 * Session manager for Phase 2 workflow
 * Stores session state in memory for a single developer session
 * In production, this would use Redis or a database
 */
class SessionManager {
  private sessions: Map<string, Phase2Session> = new Map();

  /**
   * Create or get a session for the current request context
   * For now, uses a default session ID since this is single-user PoC
   */
  private getSessionId(): string {
    return "default-session";
  }

  /**
   * Initialize a Phase 2 session with user inputs
   */
  initSession(
    author: string,
    targetApplication: string,
    targetSprint: string,
    branchName?: string,
  ): Phase2Session {
    const sessionId = this.getSessionId();
    const existing = this.sessions.get(sessionId);

    // If changing application or sprint, we should clear changesets because they belong to the old target
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
   * Add proposed changes to the current session
   */
  addProposedChanges(changes: ProposedChange[]): Phase2Session {
    const sessionId = this.getSessionId();
    const session = this.getSession();

    session.proposedChanges.push(...changes);
    session.prReviewerAppendix = undefined;
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Replace proposed changes in the current session
   */
  setProposedChanges(changes: ProposedChange[]): Phase2Session {
    const sessionId = this.getSessionId();
    const session = this.getSession();

    session.proposedChanges = [...changes];
    session.prReviewerAppendix = undefined;
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Add generated changesets to the current session
   */
  addChangesets(changesets: ChangesetDefinition[]): Phase2Session {
    const sessionId = this.getSessionId();
    const session = this.getSession();

    session.changesets.push(...changesets);
    session.prReviewerAppendix = undefined;
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Update a single changeset in the session
   */
  updateChangeset(
    changesetId: string,
    updates: Partial<ChangesetDefinition>,
  ): Phase2Session {
    const sessionId = this.getSessionId();
    const session = this.getSession();

    const index = session.changesets.findIndex((cs) => cs.id === changesetId);
    if (index !== -1) {
      session.changesets[index] = {
        ...session.changesets[index],
        ...updates,
        edited: true,
      };
      session.prReviewerAppendix = undefined;
    }

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Replace changesets in session (for aggregation, etc)
   */
  setChangesets(changesets: ChangesetDefinition[]): Phase2Session {
    const sessionId = this.getSessionId();
    const session = this.getSession();

    session.changesets = [...changesets];
    session.prReviewerAppendix = undefined;
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Store batch metadata for PR creation
   */
  setBatch(batch: any): Phase2Session {
    const sessionId = this.getSessionId();
    const session = this.getSession();

    session.batch = batch;
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Clear the current session
   */
  clearSession(): void {
    const sessionId = this.getSessionId();
    this.sessions.delete(sessionId);
  }

  /**
   * Clear all sessions (useful for testing)
   */
  clearAllSessions(): void {
    this.sessions.clear();
  }
}

export const sessionManager = new SessionManager();
