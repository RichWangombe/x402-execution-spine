import type { Request, RequestHandler } from "express";
import type { WorkflowStep } from "../orchestrator/workflow.js";

type ExecuteResponse = {
  workflowId: string;
  executionId: string;
  status: "completed" | "failed";
  permissionId: string;
  idempotencyKey: string;
  settlement?: {
    txHash: string;
    chainId: number;
    network: "cronos";
    status: "submitted" | "confirmed";
    explorerUrl?: string;
  };
};

type SettlementConfig = {
  amount: string;
  recipient: string;
  chainId: number;
  memo?: string;
};

export type WithX402Options = {
  spineBaseUrl?: string;
  settlement: SettlementConfig;
  agentId?: string | ((req: Request) => string);
  buildSteps?: (req: Request) => WorkflowStep[];
  workflowId?: (req: Request) => string;
  idempotencyKey?: (req: Request) => string;
  paymentHeaderHeader?: string;
  paymentRequirementsHeader?: string;
};

export function withX402(
  handler: RequestHandler,
  options: WithX402Options
): RequestHandler {
  const spineBaseUrl = options.spineBaseUrl ?? "http://localhost:4000";
  const paymentHeaderHeader = options.paymentHeaderHeader ?? "x-payment-header";
  const paymentRequirementsHeader =
    options.paymentRequirementsHeader ?? "x-payment-requirements";

  return async (req, res, next) => {
    try {
      const paymentHeader = readHeader(req, paymentHeaderHeader);
      const paymentRequirementsRaw = readHeader(req, paymentRequirementsHeader);
      const paymentRequirements = JSON.parse(paymentRequirementsRaw) as Record<
        string,
        unknown
      >;

      const workflowId =
        options.workflowId?.(req) ??
        `wf-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const idempotencyKey =
        options.idempotencyKey?.(req) ??
        `${workflowId}:${req.method}:${req.path}:${req.ip ?? "unknown"}`;

      const steps = options.buildSteps?.(req) ?? [
        {
          stepId: "step-handler",
          type: "action",
          action: `${req.method.toLowerCase()}-${safePath(req.path)}`
        }
      ];

      const agentId =
        typeof options.agentId === "function"
          ? options.agentId(req)
          : options.agentId ?? "agent-http";

      const instruction = {
        workflowId,
        agentId,
        steps,
        settlement: {
          token: "USDC",
          amount: options.settlement.amount,
          recipient: options.settlement.recipient,
          chainId: options.settlement.chainId,
          memo: options.settlement.memo,
          paymentHeader,
          paymentRequirements,
          x402Version: 1
        }
      };

      const executeResponse = await fetch(`${spineBaseUrl}/execute`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(instruction)
      });

      const executeBody = (await executeResponse.json()) as
        | ExecuteResponse
        | { error?: string };
      if (!executeResponse.ok) {
        const message =
          (executeBody as { error?: string }).error ?? "x402 execute failed";
        res.status(402).json({ error: message });
        return;
      }

      res.locals.x402Execution = executeBody;
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function readHeader(req: Request, name: string): string {
  const value = req.header(name);
  if (!value) {
    throw new Error(`${name} header is required`);
  }
  return value;
}

function safePath(pathname: string): string {
  return pathname.replace(/[^\w-]/g, "_").slice(0, 80);
}
