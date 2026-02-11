import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { CronosNetwork, Contract } from "@crypto.com/facilitator-client";
import { Facilitator } from "@crypto.com/facilitator-client/dist/lib/client/index.js";
import { ethers } from "ethers";

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
    settlementProof?: Record<string, unknown>;
  };
};

const apiBase = process.env.API_BASE_URL ?? "http://localhost:4000";
const chainId = Number(process.env.CRONOS_CHAIN_ID ?? 338);
const privateKey = process.env.FACILITATOR_PRIVATE_KEY;
const receiver = process.env.FACILITATOR_RECEIVER;
const rpcUrl = process.env.CRONOS_RPC_URL ?? "https://evm-t3.cronos.org/";
const amountBaseUnits = process.env.FACILITATOR_AMOUNT_BASE_UNITS ?? "1000000";
const facilitatorUrl = process.env.X402_FACILITATOR_URL;

if (chainId !== 338) {
  throw new Error(
    `demo-live is testnet-only. Expected CRONOS_CHAIN_ID=338, got ${chainId}`
  );
}

if (!privateKey || !receiver) {
  throw new Error("FACILITATOR_PRIVATE_KEY and FACILITATOR_RECEIVER are required");
}

const network = CronosNetwork.CronosTestnet;
const asset = Contract.DevUSDCe;
const provider = new ethers.JsonRpcProvider(rpcUrl);
const signer = new ethers.Wallet(privateKey, provider);
const facilitator = new Facilitator({ network, baseUrl: facilitatorUrl });

const paymentHeader = await facilitator.generatePaymentHeader({
  to: receiver,
  value: amountBaseUnits,
  asset,
  signer: signer as unknown as never
});

const paymentRequirements = facilitator.generatePaymentRequirements({
  payTo: receiver,
  asset,
  description: "x402 execution spine live demo",
  maxAmountRequired: amountBaseUnits,
  mimeType: "application/json",
  maxTimeoutSeconds: 300,
  resource: "/execute"
});

if (paymentRequirements.network !== CronosNetwork.CronosTestnet) {
  throw new Error(
    `Unexpected requirement network: ${paymentRequirements.network}. Expected cronos-testnet`
  );
}

const verifyRequest = facilitator.buildVerifyRequest(paymentHeader, paymentRequirements);

console.log("402 issued");
const verifyResult = await facilitator.verifyPayment(verifyRequest);
if (!verifyResult.isValid) {
  throw new Error(`Facilitator verify failed: ${verifyResult.invalidReason ?? "unknown"}`);
}
console.log("payment verified");

const workflowId = `wf-live-${Date.now()}`;
const idempotencyKey = `live-${Date.now()}`;
const instruction = {
  workflowId,
  agentId: "agent-live",
  steps: [
    {
      stepId: "step-policy-check",
      type: "action",
      action: "risk-check",
      parameters: { policy: "live-demo", delayMs: 100 }
    }
  ],
  settlement: {
    token: "USDC",
    amount: "1.00",
    recipient: receiver,
    chainId,
    memo: "live demo settlement",
    paymentHeader,
    paymentRequirements,
    x402Version: 1
  }
};

const response = await fetch(`${apiBase}/execute`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "Idempotency-Key": idempotencyKey
  },
  body: JSON.stringify(instruction)
});

const body = (await response.json()) as ExecuteResponse | { error?: string };
if (!response.ok) {
  throw new Error((body as { error?: string }).error ?? "Execution request failed");
}

const result = body as ExecuteResponse;
if (!result.settlement?.txHash) {
  throw new Error("Execution completed without txHash");
}

console.log("settlement submitted");
console.log(`txHash ${result.settlement.txHash}`);

const proof = {
  workflowId,
  idempotencyKey,
  requirement: paymentRequirements,
  verifyResponse: verifyResult,
  settlementResponse: result.settlement?.settlementProof ?? result.settlement,
  txHash: result.settlement.txHash,
  explorerUrl: result.settlement.explorerUrl
};

await writeProofFile(workflowId, proof);
console.log(`proof saved data/proofs/${workflowId}.json`);

function writeProofFile(workflowIdValue: string, payload: Record<string, unknown>) {
  const dir = path.resolve("data", "proofs");
  const target = path.join(dir, `${workflowIdValue}.json`);
  return fs.mkdir(dir, { recursive: true }).then(() =>
    fs.writeFile(target, JSON.stringify(payload, null, 2), "utf8")
  );
}
