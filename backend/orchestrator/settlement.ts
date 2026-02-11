import crypto from "node:crypto";
import {
  Contract,
  CronosNetwork,
  X402EventType,
  type X402SettleResponse,
  type X402VerifyResponse,
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
  verification?: {
    request: VerifyRequest;
    response: X402VerifyResponse | { isValid: boolean; invalidReason: string | null };
  };
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
  explorerUrl?: string;
  settlementProof?: {
    request: VerifyRequest;
    response: X402SettleResponse | Record<string, unknown>;
  };
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
    verifyPermission: async (input) => {
      const request = maybeBuildVerifyRequest(input.settlement, config.chainId);
      return {
        approved: true,
        permissionId: input.permissionId ?? `mock-${input.workflowId}`,
        verification: {
          request:
            request ??
            buildMockVerifyRequest(config.chainId),
          response: { isValid: true, invalidReason: null }
        }
      };
    },
    settlePayment: async (plan, context) => {
      const hashInput = `${context.workflowId}:${plan.amount}:${plan.recipient}`;
      const txHash = `0x${crypto
        .createHash("sha256")
        .update(hashInput)
        .digest("hex")
        .slice(0, 64)}`;
      const request = maybeBuildVerifyRequest(plan, config.chainId);

      return {
        txHash,
        chainId: plan.chainId,
        network: "cronos",
        status: "submitted",
        explorerUrl: buildExplorerUrl(plan.chainId, txHash),
        settlementProof: {
          request:
            request ??
            buildMockVerifyRequest(config.chainId),
          response: {
            event: "payment.mock_submitted",
            txHash
          }
        }
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
      const request = buildVerifyRequest(input.settlement, config.chainId);
      const response = await client.verifyPayment(request);
      return {
        approved: response.isValid,
        permissionId: input.permissionId ?? `verified-${input.workflowId}`,
        reason: response.invalidReason ?? undefined,
        verification: {
          request,
          response
        }
      };
    },
    settlePayment: async (plan, context) => {
      const request = buildVerifyRequest(plan, config.chainId);
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
        status,
        explorerUrl: buildExplorerUrl(plan.chainId, txHash),
        settlementProof: {
          request,
          response
        }
      };
    }
  };
}

function buildVerifyRequest(plan: SettlementPlan, chainId: number): VerifyRequest {
  if (!plan.paymentHeader) {
    throw new Error("settlement.paymentHeader is required in facilitator mode");
  }
  if (!plan.paymentRequirements) {
    throw new Error("settlement.paymentRequirements is required in facilitator mode");
  }
  const x402Version = plan.x402Version ?? 1;
  const paymentRequirements =
    plan.paymentRequirements as unknown as VerifyRequest["paymentRequirements"];
  assertNetworkAlignment(paymentRequirements.network, chainId);

  return {
    x402Version,
    paymentHeader: plan.paymentHeader,
    paymentRequirements
  };
}

function maybeBuildVerifyRequest(
  plan: SettlementPlan,
  chainId: number
): VerifyRequest | undefined {
  if (!plan.paymentHeader || !plan.paymentRequirements) {
    return undefined;
  }
  return buildVerifyRequest(plan, chainId);
}

function assertNetworkAlignment(
  requirementNetwork: string,
  chainId: number
): void {
  const expected =
    chainId === 25 ? CronosNetwork.CronosMainnet : CronosNetwork.CronosTestnet;
  if (requirementNetwork !== expected) {
    throw new Error(
      `paymentRequirements.network must be ${expected} for chainId ${chainId}`
    );
  }
}

function buildExplorerUrl(chainId: number, txHash: string): string | undefined {
  if (chainId === 338) {
    return `https://explorer.cronos.org/testnet/tx/${txHash}`;
  }
  if (chainId === 25) {
    return `https://explorer.cronos.org/tx/${txHash}`;
  }
  return undefined;
}

function buildMockVerifyRequest(chainId: number): VerifyRequest {
  const network =
    chainId === 25 ? CronosNetwork.CronosMainnet : CronosNetwork.CronosTestnet;

  return {
    x402Version: 1,
    paymentHeader: "mock-header",
    paymentRequirements: {
      scheme: "exact",
      network,
      payTo: "0x0000000000000000000000000000000000000000",
      asset: chainId === 25 ? Contract.USDCe : Contract.DevUSDCe,
      description: "mock payment requirement",
      mimeType: "application/json",
      maxAmountRequired: "0",
      maxTimeoutSeconds: 300
    } as unknown as VerifyRequest["paymentRequirements"]
  };
}
