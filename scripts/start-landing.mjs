import net from "node:net";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const httpServer = require("http-server");

const preferredPort = Number(process.env.LANDING_PORT || "4173");

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
    throw new Error(`No free landing port found after trying from ${preferredPort}`);
  }
  return findPort(start + 1, retriesLeft - 1);
}

async function start() {
  const port = await findPort(preferredPort, 20);
  if (port !== preferredPort) {
    console.log(`Landing port ${preferredPort} in use, starting on ${port}`);
  }

  const server = httpServer.createServer({
    root: "./apps/landing-page",
    cache: 3600,
    cors: false,
    showDir: true,
    autoIndex: true,
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Landing demo running on http://127.0.0.1:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start landing demo", error);
  process.exit(1);
});
