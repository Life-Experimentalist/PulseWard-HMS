import net from "node:net";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const httpServer = require("http-server");

const preferredPort = Number(process.env.OPERATIONS_PORT || "4182");
const distRoot = path.resolve("./apps/operations-dashboard/dist");

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "0.0.0.0");
  });
}

async function findPort(start, retriesLeft) {
  const available = await isPortAvailable(start);
  if (available) {
    return start;
  }
  if (retriesLeft <= 0) {
    throw new Error(`No free operations-dashboard port found after trying from ${preferredPort}`);
  }
  return findPort(start + 1, retriesLeft - 1);
}

async function start() {
  if (!fs.existsSync(distRoot)) {
    throw new Error(
      "Operations dashboard build output not found. Run 'pnpm run build:operations' before 'pnpm run start:operations'."
    );
  }

  const port = await findPort(preferredPort, 20);
  if (port !== preferredPort) {
    console.log(`Operations dashboard port ${preferredPort} in use, starting on ${port}`);
  }

  const server = httpServer.createServer({
    root: distRoot,
    cache: 3600,
    cors: false,
    showDir: false,
    autoIndex: true,
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Operations dashboard running on http://127.0.0.1:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start operations dashboard", error);
  process.exit(1);
});

