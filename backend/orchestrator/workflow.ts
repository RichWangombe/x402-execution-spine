export type WorkflowInstruction = {
  workflowId: string;
  agentId: string;
  createdAt: string;
  permissionId?: string;
  steps: WorkflowStep[];
  settlement: SettlementPlan;
};

export type WorkflowStep = {
  stepId: string;
  type: "action";
  action: string;
  parameters?: Record<string, unknown>;
};

export type SettlementPlan = {
  token: "USDC";
  amount: string;
  recipient: string;
  chainId: number;
  memo?: string;
  paymentHeader?: string;
  paymentRequirements?: Record<string, unknown>;
  x402Version?: number;
};

export function validateWorkflowInstruction(input: unknown): WorkflowInstruction {
  if (!isRecord(input)) {
    throw new Error("Instruction payload must be an object");
  }

  const workflowId = readString(input, "workflowId");
  const agentId = readString(input, "agentId");
  const createdAt =
    typeof input.createdAt === "string" && input.createdAt.length > 0
      ? input.createdAt
      : new Date().toISOString();

  const stepsRaw = readArray(input, "steps");
  const steps: WorkflowStep[] = stepsRaw.map((step, index) => {
    if (!isRecord(step)) {
      throw new Error(`steps[${index}] must be an object`);
    }

    const stepId = readString(step, "stepId");
    const type = readString(step, "type");
    if (type !== "action") {
      throw new Error(`steps[${index}].type must be 'action'`);
    }

    const action = readString(step, "action");
    const parameters = readOptionalRecord(step, "parameters");

    return {
      stepId,
      type: "action",
      action,
      parameters
    };
  });

  const settlementRaw = readRecord(input, "settlement");
  const token = readString(settlementRaw, "token");
  if (token !== "USDC") {
    throw new Error("settlement.token must be USDC");
  }

  const amount = readString(settlementRaw, "amount");
  const recipient = readString(settlementRaw, "recipient");
  const chainId = readNumber(settlementRaw, "chainId");
  const memo =
    typeof settlementRaw.memo === "string" ? settlementRaw.memo : undefined;
  const paymentHeader = readOptionalString(settlementRaw, "paymentHeader");
  const paymentRequirements = readOptionalRecord(
    settlementRaw,
    "paymentRequirements"
  );
  const x402Version = readOptionalNumber(settlementRaw, "x402Version");

  const permissionId =
    typeof input.permissionId === "string" && input.permissionId.length > 0
      ? input.permissionId
      : undefined;

  return {
    workflowId,
    agentId,
    createdAt,
    permissionId,
    steps,
    settlement: {
      token: "USDC",
      amount,
      recipient,
      chainId,
      memo,
      paymentHeader,
      paymentRequirements,
      x402Version
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const value = record[key];
  if (!isRecord(value)) {
    throw new Error(`${key} must be an object`);
  }
  return value;
}

function readOptionalRecord(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`${key} must be an object when provided`);
  }
  return value;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${key} must be a number`);
  }
  return value;
}

function readOptionalNumber(
  record: Record<string, unknown>,
  key: string
): number | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${key} must be a number when provided`);
  }
  return value;
}

function readArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${key} must be a non-empty array`);
  }
  return value;
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string when provided`);
  }
  return value;
}
