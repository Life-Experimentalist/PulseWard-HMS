# Automated Visual Assets

This folder contains generated visual outputs from architecture Mermaid diagrams.

## How It Works

- Source docs in `docs/**/*.md` can include Mermaid blocks.
- Script `scripts/generate-mermaid-visuals.mjs` extracts each Mermaid block.
- SVG outputs are produced in `docs/visuals/generated`.
- Source `.mmd` files are stored in `docs/visuals/source`.
- `docs/visuals/manifest.json` tracks generated files.

## Local Generation

```powershell
pnpm visuals:generate
```

## CI Generation

Workflow: `.github/workflows/visuals.yml`

On each push/PR affecting docs, CI publishes generated visuals as workflow artifacts.
