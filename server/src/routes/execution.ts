import { Router, Request, Response } from "express";
import { sessionManager } from "../services/session";
import { localApplyService } from "../services/local-apply.js";
import { ChangesetExecutionResult, ExecutionResult } from "../types/index";

const router = Router();

const buildPendingChangesetResults = (): ChangesetExecutionResult[] => {
  const session = sessionManager.getSession();
  return (session.changesets || []).map((changeset) => ({
    changesetId: changeset.id,
    status: "pending",
    errorMessage: null,
    executedAt: null,
  }));
};

const getCurrentExecutionResult = (): ExecutionResult => {
  const current = sessionManager.getExecutionResult();
  if (current.changesetResults.length > 0) {
    return current;
  }

  return {
    ...current,
    changesetResults: buildPendingChangesetResults(),
  };
};

router.get("/status", (req: Request, res: Response) => {
  try {
    return res.json(getCurrentExecutionResult());
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || "Failed to get execution status",
    });
  }
});

router.post("/sync-local", async (req: Request, res: Response) => {
  try {
    let current = getCurrentExecutionResult();
    current = {
      ...current,
      status: "syncing",
      prUnlocked: false,
      syncResult: null,
      changesetResults: buildPendingChangesetResults(),
    };
    sessionManager.setExecutionResult(current);

    await localApplyService.syncLocalToDev();

    const lockStatus = await localApplyService.detectLockStatus();

    current = {
      ...current,
      status: "idle",
      syncResult: {
        status: "success",
        changesetsBehind: 0,
        errorMessage: null,
      },
      lockStatus,
      canForceUnlock: lockStatus === "locked",
    };

    sessionManager.setExecutionResult(current);
    return res.json(current);
  } catch (error: any) {
    const current = {
      ...getCurrentExecutionResult(),
      status: "failed" as const,
      prUnlocked: false,
      syncResult: {
        status: "failed" as const,
        changesetsBehind: 0,
        errorMessage: error.message || "Failed syncing local DB",
      },
      canForceUnlock: false,
    };

    sessionManager.setExecutionResult(current);

    return res.status(500).json({
      ...current,
      error: error.message || "Failed syncing local DB",
    });
  }
});

router.post("/validate", async (req: Request, res: Response) => {
  try {
    const session = sessionManager.getSession();

    if (!session.changesets || session.changesets.length === 0) {
      return res.status(400).json({ error: "No changesets to validate" });
    }

    let current = getCurrentExecutionResult();
    current = {
      ...current,
      status: "validating",
      prUnlocked: false,
      validateResult: null,
    };
    sessionManager.setExecutionResult(current);

    const validateResult = await localApplyService.validateChangesets(
      session.changesets,
    );

    current = {
      ...current,
      status: validateResult.passed ? "idle" : "failed",
      validateResult,
      prUnlocked: false,
    };

    sessionManager.setExecutionResult(current);
    if (!validateResult.passed) {
      return res.status(400).json(current);
    }

    return res.json(current);
  } catch (error: any) {
    const current = {
      ...getCurrentExecutionResult(),
      status: "failed" as const,
      prUnlocked: false,
      validateResult: {
        passed: false,
        errors: [error.message || "Validation failed"],
      },
    };

    sessionManager.setExecutionResult(current);
    return res.status(500).json({
      ...current,
      error: error.message || "Validation failed",
    });
  }
});

router.post("/run", async (req: Request, res: Response) => {
  try {
    const session = sessionManager.getSession();

    if (!session.changesets || session.changesets.length === 0) {
      return res.status(400).json({ error: "No changesets to execute" });
    }

    let current = getCurrentExecutionResult();
    if (current.validateResult && !current.validateResult.passed) {
      return res.status(400).json({
        ...current,
        error: "Validation failed. Fix errors before execution.",
      });
    }

    const runningResults = buildPendingChangesetResults().map((result) => ({
      ...result,
      status: "running" as const,
    }));

    current = {
      ...current,
      status: "running",
      prUnlocked: false,
      changesetResults: runningResults,
    };
    sessionManager.setExecutionResult(current);

    await localApplyService.runChangesetsOnLocal(session.changesets);

    const executedAt = new Date().toISOString();
    const successResults = runningResults.map((result) => ({
      ...result,
      status: "success" as const,
      executedAt,
    }));

    current = {
      ...current,
      status: "success",
      changesetResults: successResults,
      prUnlocked: true,
    };

    sessionManager.setExecutionResult(current);
    return res.json(current);
  } catch (error: any) {
    const executedAt = new Date().toISOString();
    const failedResults = buildPendingChangesetResults().map(
      (result, index) => ({
        ...result,
        status: index === 0 ? ("failed" as const) : ("skipped" as const),
        errorMessage:
          index === 0
            ? error.message || "Execution failed"
            : "Skipped after failure",
        executedAt: index === 0 ? executedAt : null,
      }),
    );

    const current = {
      ...getCurrentExecutionResult(),
      status: "failed" as const,
      prUnlocked: false,
      changesetResults: failedResults,
    };

    sessionManager.setExecutionResult(current);
    return res.status(500).json({
      ...current,
      error: error.message || "Execution failed",
    });
  }
});

router.post("/force-unlock", async (req: Request, res: Response) => {
  try {
    await localApplyService.forceUnlock();

    const current = {
      ...getCurrentExecutionResult(),
      lockStatus: "free" as const,
      canForceUnlock: false,
    };

    sessionManager.setExecutionResult(current);
    return res.json(current);
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || "Failed to force unlock",
    });
  }
});

export default router;
