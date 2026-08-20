#!/usr/bin/env node
// Contract coverage check — asserts that the OpenAPI spec and the runtime
// gateway agree on exactly which (method, path) operations exist.
//
//   node scripts/check-contract-coverage.mjs           # report only
//   node scripts/check-contract-coverage.mjs --strict   # exit 1 on any drift
//
// The gateway is a single Hono app whose routes are all registered as
// `app.<method>('<path>', ...)`. The spec lives beside it in openapi.yaml.
// Rather than pull in a YAML dependency, we read the two files directly:
// route registrations from app.js and the `paths:` block from openapi.yaml.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const APP = join(ROOT, "services", "api-gateway", "app.js");
const SPEC = join(ROOT, "services", "api-gateway", "openapi.yaml");

const METHODS = ["get", "post", "put", "patch", "delete"];

// `:param` (Hono) and `{param}` (OpenAPI) are the same operation — normalize
// both to `{param}` so they compare equal.
const normalize = (path) => path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");

function runtimeRoutes(source) {
  const routes = new Set();
  const re = /\bapp\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    routes.add(`${m[1].toUpperCase()} ${normalize(m[2])}`);
  }
  return routes;
}

// Targeted parse of the OpenAPI `paths:` block. Path keys sit at two-space
// indent and start with `/`; method keys sit at four-space indent and are one
// of the known HTTP verbs. We stop at the next top-level key (e.g. components).
function specRoutes(source) {
  const routes = new Set();
  const lines = source.split(/\r?\n/);
  let inPaths = false;
  let currentPath = null;
  for (const line of lines) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (!inPaths) continue;
    if (/^\S/.test(line)) break; // next top-level key ends the paths block

    const pathMatch = line.match(/^ {2}(\/\S*):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    const methodMatch = line.match(/^ {4}([a-z]+):\s*$/);
    if (methodMatch && currentPath && METHODS.includes(methodMatch[1])) {
      routes.add(`${methodMatch[1].toUpperCase()} ${normalize(currentPath)}`);
    }
  }
  return routes;
}

function diff(a, b) {
  return [...a].filter((x) => !b.has(x)).sort();
}

const strict = process.argv.includes("--strict");
const runtime = runtimeRoutes(readFileSync(APP, "utf8"));
const spec = specRoutes(readFileSync(SPEC, "utf8"));

const undocumented = diff(runtime, spec); // implemented but not in the spec
const phantom = diff(spec, runtime); // in the spec but not implemented

console.log(`Contract coverage — api-gateway`);
console.log(`  runtime routes : ${runtime.size}`);
console.log(`  documented     : ${spec.size}`);

if (undocumented.length) {
  console.log(`\n  Implemented but NOT documented (${undocumented.length}):`);
  for (const r of undocumented) console.log(`    - ${r}`);
}
if (phantom.length) {
  console.log(`\n  Documented but NOT implemented (${phantom.length}):`);
  for (const r of phantom) console.log(`    - ${r}`);
}

if (!undocumented.length && !phantom.length) {
  console.log(`\n  OK — spec and runtime are in full parity.`);
  process.exit(0);
}

if (strict) {
  console.error(
    `\n  FAIL — ${undocumented.length + phantom.length} mismatch(es) in --strict mode.`
  );
  process.exit(1);
}
console.log(`\n  (non-strict) mismatches reported but not failing.`);
