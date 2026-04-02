import net from "node:net";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const httpServer = require("http-server");

const preferredPort = Number(process.env.PATIENT_PORT || "4183");
const distRoot = path.resolve("./apps/patient-portal/dist");

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
    throw new Error(`No free patient-portal port found after trying from ${preferredPort}`);
  }
  return findPort(start + 1, retriesLeft - 1);
}

async function start() {
  if (!fs.existsSync(distRoot)) {
    throw new Error(
      "Patient portal build output not found. Run 'npm run build:patient' before 'npm run start:patient'."
    );
  }

  const port = await findPort(preferredPort, 20);
  if (port !== preferredPort) {
    console.log(`Patient portal port ${preferredPort} in use, starting on ${port}`);
  }

  const server = httpServer.createServer({
    root: distRoot,
    cache: 3600,
    cors: false,
    showDir: false,
    autoIndex: true,
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Patient portal running on http://127.0.0.1:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start patient portal", error);
  process.exit(1);
});
