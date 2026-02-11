const { spawn } = require("node:child_process");

const port = process.env.LIVE_DEMO_PORT || "4012";
const apiBaseUrl = `http://localhost:${port}`;
const env = {
  ...process.env,
  X402_MODE: "facilitator",
  PORT: port,
  API_BASE_URL: apiBaseUrl,
  CRONOS_CHAIN_ID: process.env.CRONOS_CHAIN_ID || "338",
  ENFORCE_TESTNET: "true"
};
const dev = spawn("npm", ["run", "dev"], { stdio: "inherit", shell: true, env });

const shutdown = () => {
  if (!dev.killed) {
    dev.kill("SIGTERM");
  }
};

let demoStarted = false;

const waitForServer = async () => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Dev server did not become ready in time");
};

waitForServer()
  .then(() => {
    demoStarted = true;
    const demo = spawn("npm", ["run", "demo:live"], {
      stdio: "inherit",
      shell: true,
      env
    });
    demo.on("exit", (code) => {
      shutdown();
      process.exit(code ?? 0);
    });
  })
  .catch((error) => {
    console.error(error.message);
    shutdown();
    process.exit(1);
  });

dev.on("exit", (code) => {
  if (!demoStarted) {
    console.error(`Dev server exited early (${code ?? "unknown"})`);
    process.exit(1);
  }
});

process.on("SIGINT", () => {
  shutdown();
  process.exit(1);
});

process.on("exit", () => {
  shutdown();
});
