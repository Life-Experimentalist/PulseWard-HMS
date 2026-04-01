import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const docsDir = path.join(repoRoot, "docs");
const sourceDir = path.join(docsDir, "visuals", "source");
const outputDir = path.join(docsDir, "visuals", "generated");
const manifestPath = path.join(docsDir, "visuals", "manifest.json");

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "visuals") {
        continue;
      }
      files.push(...walk(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

function sanitizeName(input) {
  return input.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

rmSync(sourceDir, { recursive: true, force: true });
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(sourceDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });

const markdownFiles = walk(docsDir);
const manifest = [];
let diagramsFound = 0;

for (const filePath of markdownFiles) {
  const content = readFileSync(filePath, "utf8");
  const regex = /```mermaid\s*([\s\S]*?)```/g;
  let match;
  let index = 1;

  while ((match = regex.exec(content)) !== null) {
    diagramsFound += 1;
    const mermaidBody = match[1].trim();
    const relative = path.relative(docsDir, filePath).replace(/\\/g, "/");
    const baseName = sanitizeName(relative.replace(/\//g, "__").replace(/\.md$/, ""));
    const stem = `${baseName}__diagram_${index}`;
    const mmdFile = path.join(sourceDir, `${stem}.mmd`);
    const svgFile = path.join(outputDir, `${stem}.svg`);

    writeFileSync(mmdFile, `${mermaidBody}\n`, "utf8");

    execSync(
      `npx -y @mermaid-js/mermaid-cli@11.4.2 -i "${mmdFile}" -o "${svgFile}" -t neutral -b white`,
      {
        stdio: "inherit",
      }
    );

    manifest.push({
      sourceMarkdown: relative,
      diagramIndex: index,
      sourceMmd: path.relative(repoRoot, mmdFile).replace(/\\/g, "/"),
      outputSvg: path.relative(repoRoot, svgFile).replace(/\\/g, "/"),
    });

    index += 1;
  }
}

writeFileSync(
  manifestPath,
  JSON.stringify(
    { generatedAt: new Date().toISOString(), diagramsFound, items: manifest },
    null,
    2
  ),
  "utf8"
);

console.log(`Generated ${manifest.length} visual(s) from ${diagramsFound} Mermaid block(s).`);
