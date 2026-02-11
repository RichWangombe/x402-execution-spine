import crypto from "node:crypto";
import { AuditLedger } from "../audit/ledger.js";
import { SettlementPlan, WorkflowInstruction, WorkflowStep } from "./workflow.js";
import { SettlementResult } from "./settlement.js";

export type StepResult = {
  stepId: string;
  action: string;
  status: "completed" | "failed";
  attempts: number;
  startedAt: string;
  finishedAt: string;
  output?: Record<string, unknown>;
  error?: string;
};

export type ExecutionResult = {
  workflowId: string;
  executionId: string;
  status: "completed" | "failed";
  stepResults: StepResult[];
  settlement?: SettlementResult;
  startedAt: string;
  finishedAt: string;
  auditRecordId: string;
};

export type ExecuteAction = (
  step: WorkflowStep,
  instruction: WorkflowInstruction
) => Promise<Record<string, unknown>>;

export type ExecutionDeps = {
  ledger: AuditLedger;
  executeAction: ExecuteAction;
  settlePayment: (
    plan: SettlementPlan,
    context: { workflowId: string; agentId: string; permissionId?: string }
  ) => Promise<SettlementResult>;
};

export async function executeWorkflow(
  instruction: WorkflowInstruction,
  deps: ExecutionDeps
): Promise<ExecutionResult> {
  const executionId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const stepResults: StepResult[] = [];
  let status: "completed" | "failed" = "completed";
  let failureMessage: string | undefined;

  await deps.ledger.append({
    workflowId: instruction.workflowId,
    agentId: instruction.agentId,
    event: "workflow_started",
    data: { executionId, steps: instruction.steps.length }
  });

  for (const step of instruction.steps) {
    const stepStartedAt = new Date().toISOString();
    const maxRetries = readRetryCount(step);
    let attempt = 0;
    let stepCompleted = false;
    let lastError: string | undefined;

    try {
      while (!stepCompleted && attempt <= maxRetries) {
        attempt += 1;
        try {
          const output = await deps.executeAction(step, instruction);
          const stepFinishedAt = new Date().toISOString();
          const result: StepResult = {
            stepId: step.stepId,
            action: step.action,
            status: "completed",
            attempts: attempt,
            startedAt: stepStartedAt,
            finishedAt: stepFinishedAt,
            output
          };

          stepResults.push(result);
          await deps.ledger.append({
            workflowId: instruction.workflowId,
            agentId: instruction.agentId,
            event: "step_completed",
            data: result
          });
          stepCompleted = true;
        } catch (error) {
          lastError = formatError(error);
          if (attempt <= maxRetries) {
            await deps.ledger.append({
              workflowId: instruction.workflowId,
              agentId: instruction.agentId,
              event: "step_retry",
              data: { stepId: step.stepId, attempt, error: lastError }
            });
          }
        }
      }
    } catch (error) {
      lastError = formatError(error);
    }

    if (!stepCompleted) {
      const stepFinishedAt = new Date().toISOString();
      const message = lastError ?? "Unknown error";
      const result: StepResult = {
        stepId: step.stepId,
        action: step.action,
        status: "failed",
        attempts: attempt,
        startedAt: stepStartedAt,
        finishedAt: stepFinishedAt,
        error: message
      };

      stepResults.push(result);
      await deps.ledger.append({
        workflowId: instruction.workflowId,
        agentId: instruction.agentId,
        event: "step_failed",
        data: result
      });

      status = "failed";
      failureMessage = message;
      break;
    }
  }

  let settlement: SettlementResult | undefined;
  if (status === "completed") {
    settlement = await deps.settlePayment(instruction.settlement, {
      workflowId: instruction.workflowId,
      agentId: instruction.agentId,
      permissionId: instruction.permissionId
    });

    await deps.ledger.append({
      workflowId: instruction.workflowId,
      agentId: instruction.agentId,
      event: "settlement_submitted",
      data: settlement
    });
  }

  const finishedAt = new Date().toISOString();
  const finalRecord = await deps.ledger.append({
    workflowId: instruction.workflowId,
    agentId: instruction.agentId,
    event: status === "completed" ? "workflow_completed" : "workflow_failed",
    data: { executionId, reason: failureMessage }
  });

  return {
    workflowId: instruction.workflowId,
    executionId,
    status,
    stepResults,
    settlement,
    startedAt,
    finishedAt,
    auditRecordId: finalRecord.recordId
  };
}

export async function defaultExecuteAction(
  step: WorkflowStep
): Promise<Record<string, unknown>> {
  const delayMsRaw = step.parameters?.["delayMs"];
  const delayMs = typeof delayMsRaw === "number" ? delayMsRaw : 0;
  if (delayMs > 0) {
    await sleep(delayMs);
  }

  return {
    ok: true,
    action: step.action
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readRetryCount(step: WorkflowStep): number {
  const retriesRaw = step.parameters?.["retries"];
  if (typeof retriesRaw !== "number" || Number.isNaN(retriesRaw)) {
    return 0;
  }
  return Math.max(0, Math.floor(retriesRaw));
}
