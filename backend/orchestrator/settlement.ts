import crypto from "node:crypto";
import {
  CronosNetwork,
  X402EventType,
  type VerifyRequest
} from "@crypto.com/facilitator-client";
import {
  Facilitator,
} from "@crypto.com/facilitator-client/dist/lib/client/index.js";
import { SettlementPlan } from "./workflow.js";

export type SettlementMode = "mock" | "facilitator";

export type SettlementConfig = {
  mode: SettlementMode;
  facilitatorUrl?: string;
  apiKey?: string;
  chainId: number;
};

export type PermissionCheckInput = {
  workflowId: string;
  agentId: string;
  permissionId?: string;
  settlement: SettlementPlan;
};

export type PermissionCheckResult = {
  approved: boolean;
  permissionId: string;
  reason?: string;
};

export type SettlementContext = {
  workflowId: string;
  agentId: string;
  permissionId?: string;
};

export type SettlementResult = {
  txHash: string;
  chainId: number;
  network: "cronos";
  status: "submitted" | "confirmed";
};

export type SettlementAdapter = {
  verifyPermission: (input: PermissionCheckInput) => Promise<PermissionCheckResult>;
  settlePayment: (
    plan: SettlementPlan,
    context: SettlementContext
  ) => Promise<SettlementResult>;
};

export async function createSettlementAdapter(
  config: SettlementConfig
): Promise<SettlementAdapter> {
  if (config.mode === "facilitator") {
    return createFacilitatorAdapter(config);
  }

  return createMockAdapter(config);
}

function createMockAdapter(config: SettlementConfig): SettlementAdapter {
  return {
    verifyPermission: async (input) => ({
      approved: true,
      permissionId: input.permissionId ?? `mock-${input.workflowId}`
    }),
    settlePayment: async (plan, context) => {
      const hashInput = `${context.workflowId}:${plan.amount}:${plan.recipient}`;
      const txHash = `0x${crypto
        .createHash("sha256")
        .update(hashInput)
        .digest("hex")
        .slice(0, 64)}`;

      return {
        txHash,
        chainId: plan.chainId,
        network: "cronos",
        status: "submitted"
      };
    }
  };
}

async function createFacilitatorAdapter(
  config: SettlementConfig
): Promise<SettlementAdapter> {
  const network =
    config.chainId === 25 ? CronosNetwork.CronosMainnet : CronosNetwork.CronosTestnet;

  const client = new Facilitator({
    network,
    baseUrl: config.facilitatorUrl
  });

  return {
    verifyPermission: async (input) => {
      const request = buildVerifyRequest(input.settlement);
      const response = await client.verifyPayment(request);
      return {
        approved: response.isValid,
        permissionId: input.permissionId ?? `verified-${input.workflowId}`,
        reason: response.invalidReason ?? undefined
      };
    },
    settlePayment: async (plan, context) => {
      const request = buildVerifyRequest(plan);
      const response = await client.settlePayment(request);
      const txHash = response?.txHash ?? "";
      if (!txHash) {
        throw new Error("Facilitator settlement did not return txHash");
      }

      const status =
        response.event === X402EventType.PaymentSettled ? "confirmed" : "submitted";

      return {
        txHash,
        chainId: plan.chainId,
        network: "cronos",
        status
      };
    }
  };
}

function buildVerifyRequest(plan: SettlementPlan): VerifyRequest {
  if (!plan.paymentHeader) {
    throw new Error("settlement.paymentHeader is required in facilitator mode");
  }
  if (!plan.paymentRequirements) {
    throw new Error("settlement.paymentRequirements is required in facilitator mode");
  }
  const x402Version = plan.x402Version ?? 1;
  const paymentRequirements =
    plan.paymentRequirements as unknown as VerifyRequest["paymentRequirements"];

  return {
    x402Version,
    paymentHeader: plan.paymentHeader,
    paymentRequirements
  };
}
