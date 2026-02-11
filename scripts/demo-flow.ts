import "dotenv/config";

const apiBase = process.env.API_BASE_URL ?? "http://localhost:4000";

const instruction = {
  workflowId: "wf-demo-002",
  agentId: "agent-demo",
  steps: [
    {
      stepId: "step-validate",
      type: "action",
      action: "risk-check",
      parameters: { policy: "low-volatility", delayMs: 200, retries: 1 }
    },
    {
      stepId: "step-execute",
      type: "action",
      action: "execute-order",
      parameters: { venue: "Cronos", delayMs: 200 }
    }
  ],
  settlement: {
    token: "USDC",
    amount: "10.00",
    recipient: "0x0000000000000000000000000000000000000002",
    chainId: 338,
    memo: "demo flow"
  },
  permissionId: "perm-mock-002"
};

async function run(): Promise<void> {
  const response = await fetch(`${apiBase}/execute`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": "demo-flow-002"
    },
    body: JSON.stringify(instruction)
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error ?? "Request failed");
  }

  console.log(JSON.stringify(body, null, 2));
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  process.exit(1);
});
