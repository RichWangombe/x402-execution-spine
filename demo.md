# Demo script

## Goal

Show one workflow that verifies payment, executes steps, settles USDC, and produces proof artifacts.

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

For a real testnet settlement:

```bash
npm run run:live
```

Live demo output prints:
- `402 issued`
- `payment verified`
- `settlement submitted`
- `txHash`

Live proof file:
- `data/proofs/<workflowId>.json`
