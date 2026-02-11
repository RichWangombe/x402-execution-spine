# Demo script

## Goal

Show a single multi-step workflow that verifies permission, executes two steps, settles USDC, and writes an audit record.

## Steps

1. Start the orchestrator:

```bash
npm run dev
```

2. Trigger the demo flow:

```bash
npm run demo
```

3. Inspect the audit ledger:

```bash
type data\\audit.jsonl
```

## Expected output

The demo prints a JSON response with:
- `executionId`
- `status` (completed)
- `settlement.txHash`
- `auditRecordId`

Switch to facilitator mode by setting `X402_MODE=facilitator` and providing real facilitator credentials.

The demo includes an `Idempotency-Key` header and a retryable step (`parameters.retries`).
