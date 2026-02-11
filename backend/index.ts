import "dotenv/config";
import express from "express";
import pino from "pino";
import { AuditLedger } from "./audit/ledger.js";
import { IdempotencyStore } from "./orchestrator/idempotency-store.js";
import { ensurePermission } from "./orchestrator/permissions.js";
import {
  executeWorkflow,
  defaultExecuteAction,
  type ExecutionResult
} from "./orchestrator/execute.js";
import { createSettlementAdapter, SettlementMode } from "./orchestrator/settlement.js";
import { validateWorkflowInstruction } from "./orchestrator/workflow.js";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

const app = express();
app.use(express.json({ limit: "256kb" }));

const port = Number(process.env.PORT ?? 4000);
const auditLogPath = process.env.AUDIT_LOG_PATH ?? "./data/audit.jsonl";
const idempotencyLogPath =
  process.env.IDEMPOTENCY_LOG_PATH ?? "./data/idempotency.jsonl";

const settlementMode = (process.env.X402_MODE ?? "mock") as SettlementMode;
const settlementConfig = {
  mode: settlementMode,
  facilitatorUrl: process.env.X402_FACILITATOR_URL,
  apiKey: process.env.X402_API_KEY,
  chainId: Number(process.env.CRONOS_CHAIN_ID ?? 338)
};

const ledger = new AuditLedger({ filePath: auditLogPath });
const settlementAdapterPromise = createSettlementAdapter(settlementConfig);
const idempotencyStore = new IdempotencyStore({ filePath: idempotencyLogPath });

app.post("/execute", async (req, res) => {
  try {
    const instruction = validateWorkflowInstruction(req.body);
    const settlementAdapter = await settlementAdapterPromise;

    const idempotencyKey =
      req.header("Idempotency-Key") ??
      `${instruction.workflowId}:${instruction.permissionId ?? "none"}`;
    const cached = await idempotencyStore.get(idempotencyKey);
    if (cached) {
      if (
        cached.workflowId !== instruction.workflowId ||
        cached.agentId !== instruction.agentId
      ) {
        res.status(409).json({ error: "Idempotency-Key collision detected" });
        return;
      }

      await ledger.append({
        workflowId: instruction.workflowId,
        agentId: instruction.agentId,
        event: "workflow_idempotent_hit",
        data: { idempotencyKey, executionId: cached.response.executionId }
      });
      res.status(200).json({
        ...cached.response,
        permissionId: cached.permissionId,
        idempotencyKey
      });
      return;
    }

    const permission = await ensurePermission(
      {
        workflowId: instruction.workflowId,
        agentId: instruction.agentId,
        permissionId: instruction.permissionId,
        settlement: instruction.settlement
      },
      settlementAdapter.verifyPermission
    );

    instruction.permissionId = permission.permissionId;
    await ledger.append({
      workflowId: instruction.workflowId,
      agentId: instruction.agentId,
      event: "permission_verified",
      data: { permissionId: permission.permissionId, settlement: instruction.settlement }
    });

    const result = await executeWorkflow(instruction, {
      ledger,
      executeAction: defaultExecuteAction,
      settlePayment: settlementAdapter.settlePayment
    });

    await idempotencyStore.set({
      idempotencyKey,
      workflowId: instruction.workflowId,
      agentId: instruction.agentId,
      permissionId: permission.permissionId,
      createdAt: new Date().toISOString(),
      response: result
    });

    res
      .status(200)
      .json({ ...result, permissionId: permission.permissionId, idempotencyKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log.error({ err: error }, "execution failed");
    res.status(400).json({ error: message });
  }
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.listen(port, () => {
  log.info({ port, settlementMode }, "x402 execution spine listening");
});
