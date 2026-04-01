param(
    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'

Write-Host 'Starting PulseWard demo stack...'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is not installed or not available in PATH.'
}

$null = docker compose version

if ($NoBuild) {
    docker compose up -d
}
else {
    docker compose up --build -d
}

docker compose ps

Write-Host 'Demo stack is running. Use pnpm demo:down to stop.'
