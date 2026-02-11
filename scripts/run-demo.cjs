const { spawn } = require("node:child_process");

const port =
  process.env.DEMO_PORT ||
  String(4300 + Math.floor(Math.random() * 300));
const apiBaseUrl = `http://localhost:${port}`;
const env = { ...process.env, PORT: port, API_BASE_URL: apiBaseUrl };

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
    const demo = spawn("npm", ["run", "demo"], {
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
