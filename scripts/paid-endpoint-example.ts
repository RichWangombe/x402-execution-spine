import "dotenv/config";
import express from "express";
import { withX402 } from "../backend/product/with-x402.js";

const port = Number(process.env.EXAMPLE_PORT ?? 4010);
const recipient =
  process.env.FACILITATOR_RECEIVER ??
  "0x0000000000000000000000000000000000000002";
const chainId = Number(process.env.CRONOS_CHAIN_ID ?? 338);

const app = express();
app.use(express.json({ limit: "128kb" }));

app.post(
  "/paid/research",
  withX402(
    async (_req, res) => {
      const execution = res.locals.x402Execution;
      res.status(200).json({
        data: {
          insight: "agent workflow settled successfully"
        },
        payment: execution
      });
    },
    {
      settlement: {
        amount: "1.00",
        recipient,
        chainId,
        memo: "paid endpoint example"
      }
    }
  )
);

app.listen(port, () => {
  console.log(`paid endpoint example listening on http://localhost:${port}`);
});
