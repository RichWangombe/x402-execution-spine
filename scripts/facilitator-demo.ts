import "dotenv/config";
import { CronosNetwork, Contract } from "@crypto.com/facilitator-client";
import { Facilitator } from "@crypto.com/facilitator-client/dist/lib/client/index.js";
import { ethers } from "ethers";

const apiBase = process.env.API_BASE_URL ?? "http://localhost:4000";
const chainId = Number(process.env.CRONOS_CHAIN_ID ?? 338);
const privateKey = process.env.FACILITATOR_PRIVATE_KEY;
const receiver = process.env.FACILITATOR_RECEIVER;
const rpcUrl = process.env.CRONOS_RPC_URL;
const amountBaseUnits = process.env.FACILITATOR_AMOUNT_BASE_UNITS ?? "1000000";
const facilitatorUrl = process.env.X402_FACILITATOR_URL;

if (!privateKey || !receiver || !rpcUrl) {
  throw new Error(
    "FACILITATOR_PRIVATE_KEY, FACILITATOR_RECEIVER, and CRONOS_RPC_URL are required"
  );
}

const network =
  chainId === 25 ? CronosNetwork.CronosMainnet : CronosNetwork.CronosTestnet;
const asset = chainId === 25 ? Contract.USDCe : Contract.DevUSDCe;

const provider = new ethers.JsonRpcProvider(rpcUrl);
const signer = new ethers.Wallet(privateKey, provider);
const facilitator = new Facilitator({ network, baseUrl: facilitatorUrl });

const paymentHeader = await facilitator.generatePaymentHeader({
  to: receiver,
  value: amountBaseUnits,
  asset,
  signer
});

const paymentRequirements = facilitator.generatePaymentRequirements({
  payTo: receiver,
  asset,
  description: "x402 execution spine facilitator demo",
  maxAmountRequired: amountBaseUnits,
  mimeType: "application/json",
  maxTimeoutSeconds: 300
});

const instruction = {
  workflowId: `wf-facilitator-${Date.now()}`,
  agentId: "agent-facilitator",
  steps: [
    {
      stepId: "step-check",
      type: "action",
      action: "risk-check",
      parameters: { policy: "facilitator-demo", delayMs: 200 }
    }
  ],
  settlement: {
    token: "USDC",
    amount: "1.00",
    recipient: receiver,
    chainId,
    memo: "facilitator demo",
    paymentHeader,
    paymentRequirements,
    x402Version: 1
  }
};

const response = await fetch(`${apiBase}/execute`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "Idempotency-Key": `facilitator-${Date.now()}`
  },
  body: JSON.stringify(instruction)
});

const body = await response.json();
if (!response.ok) {
  throw new Error(body?.error ?? "Request failed");
}

console.log(JSON.stringify(body, null, 2));
