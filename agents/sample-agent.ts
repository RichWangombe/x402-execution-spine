import "dotenv/config";

const apiBase = process.env.API_BASE_URL ?? "http://localhost:4000";

const instruction = {
  workflowId: "wf-demo-001",
  agentId: "agent-sample",
  steps: [
    {
      stepId: "step-quote",
      type: "action",
      action: "price-quote",
      parameters: { symbol: "CRO/USDC", delayMs: 250 }
    },
    {
      stepId: "step-route",
      type: "action",
      action: "route-order",
      parameters: { venue: "VVS", delayMs: 250 }
    }
  ],
  settlement: {
    token: "USDC",
    amount: "25.00",
    recipient: "0x0000000000000000000000000000000000000001",
    chainId: 338,
    memo: "demo settlement"
  },
  permissionId: "perm-mock-001"
};

async function run(): Promise<void> {
  const response = await fetch(`${apiBase}/execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
