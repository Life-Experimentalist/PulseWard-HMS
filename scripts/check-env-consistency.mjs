import fs from "node:fs";
import path from "node:path";

function parseEnvKeys(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const keys = [];

  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) {
      keys.push(match[1]);
    }
  });

  const grouped = new Map();
  keys.forEach((key) => {
    grouped.set(key, (grouped.get(key) || 0) + 1);
  });

  const duplicates = [...grouped.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));

  return {
    keySet: new Set(keys),
    duplicates,
  };
}

function toSortedArray(set) {
  return [...set].sort((a, b) => a.localeCompare(b));
}

function diff(referenceSet, otherSet) {
  return toSortedArray(new Set([...referenceSet].filter((item) => !otherSet.has(item))));
}

function printList(title, items) {
  if (items.length === 0) {
    console.log(`${title}: none`);
    return;
  }

  console.log(`${title}:`);
  items.forEach((item) => console.log(`- ${item}`));
}

const root = process.cwd();
const envPath = path.join(root, ".env");
const envExamplePath = path.join(root, ".env.example");

if (!fs.existsSync(envPath) || !fs.existsSync(envExamplePath)) {
  console.error("Missing .env or .env.example in repository root.");
  process.exit(1);
}

const env = parseEnvKeys(envPath);
const envExample = parseEnvKeys(envExamplePath);

const missingInEnv = diff(envExample.keySet, env.keySet);
const extraInEnv = diff(env.keySet, envExample.keySet);

console.log("PulseWard env consistency check");
console.log(`.env keys: ${env.keySet.size}`);
console.log(`.env.example keys: ${envExample.keySet.size}`);

printList("Missing in .env", missingInEnv);
printList("Extra in .env", extraInEnv);

const duplicateLines = [];
env.duplicates.forEach(({ key, count }) => duplicateLines.push(`.env: ${key} x${count}`));
envExample.duplicates.forEach(({ key, count }) =>
  duplicateLines.push(`.env.example: ${key} x${count}`)
);

if (duplicateLines.length > 0) {
  console.log("Duplicate keys:");
  duplicateLines.forEach((line) => console.log(`- ${line}`));
} else {
  console.log("Duplicate keys: none");
}

if (missingInEnv.length > 0 || extraInEnv.length > 0 || duplicateLines.length > 0) {
  process.exit(1);
}

console.log("Environment files are key-consistent.");
