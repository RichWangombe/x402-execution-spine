# x402 Execution Spine

A programmable execution and settlement layer that lets AI agents run multi-step financial workflows and settle value autonomously on Cronos using x402.

## Why x402 is required

x402 supplies permissioned, programmatic settlement so an agent can execute workflows and settle USDC without manual sign-off. The facilitator flow provides a durable permission reference that the orchestrator can verify before any settlement happens.

## Architecture (four layers)

1. Execution Orchestrator: receives workflow instructions, validates permissions, executes steps, enforces deterministic ordering.
2. x402 Settlement Layer: verifies permission and settles USDC on Cronos via the facilitator SDK.
3. Agent Interface: minimal JSON instruction schema over a REST endpoint.
4. Audit Ledger: append-only JSONL ledger of every workflow, step, and settlement event.

## Canonical workflow

1. Agent submits a workflow instruction.
2. Orchestrator verifies the x402 permission.
3. Steps execute sequentially.
4. USDC settlement is submitted.
5. Audit record is written and tx hash returned.

## Idempotency and retries

- Supply `Idempotency-Key` to deduplicate repeated submissions.
- Steps can include `parameters.retries` (integer) to retry on transient failures.

## Running locally

Prereqs: Node 18+.

```bash
npm install
npm run dev
```

In a second terminal:

```bash
npm run demo
```

The response includes executionId, auditRecordId, and a txHash (mock mode).

## Environment

Copy `.env.example` to `.env` and adjust values. The defaults run in mock mode.

Key vars:

- `X402_MODE=mock|facilitator`
- `X402_FACILITATOR_URL` for facilitator mode (SDK uses network-aware defaults)
- `CRONOS_CHAIN_ID` (338 testnet, 25 mainnet)
- `AUDIT_LOG_PATH` for the JSONL audit ledger
- `IDEMPOTENCY_LOG_PATH` for the idempotency JSONL store
- `CRONOS_RPC_URL` for facilitator signing
- `FACILITATOR_PRIVATE_KEY` signer used to generate the payment header
- `FACILITATOR_RECEIVER` recipient for USDCe settlement
- `FACILITATOR_AMOUNT_BASE_UNITS` amount for the facilitator demo (default 1 USDCe)

## Facilitator mode inputs

When `X402_MODE=facilitator`, the `settlement` object must include:

- `paymentHeader`: Base64-encoded EIP-3009 payment header
- `paymentRequirements`: X402 payment requirements object
- `x402Version`: optional, defaults to 1

These are passed directly to `verifyPayment` and `settlePayment` on the Cronos Facilitator SDK.

You can generate a valid header + requirements and submit them with:

```bash
npm run demo:facilitator
```

To run the server and facilitator demo in one command:

```bash
node scripts/run-facilitator-demo.cjs
```

## Audit ledger

The ledger lives at `AUDIT_LOG_PATH` (default `./data/audit.jsonl`). Each line is a JSON record containing the workflowId, agentId, event type, and settlement metadata.

## Cronos alignment

This spine is designed for Cronos EVM with x402 settlement, USDC flows, and Crypto.com infrastructure integration. It is intentionally minimal and infrastructure-first.

## Circle feedback (what worked / what did not)

Worked:
- Deterministic step sequencing with append-only audit trails.
- Mock mode for reliable demos and repeatable outputs.

Did not:
- Facilitator client method names may need adjustment to match the current SDK.
- Production deployment and wallet custody are not included in this prototype.

## Repo structure

```
backend/
  orchestrator/
  audit/
agents/
scripts/
```

See `demo.md` for the demo script.
