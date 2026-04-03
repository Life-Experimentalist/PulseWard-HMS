param(
    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'

Write-Host 'Starting PulseWard demo stack...'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is not installed or not available in PATH.'
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Description,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Command
    )

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed (exit code: $LASTEXITCODE). Ensure Docker Desktop is running and the Linux engine is available."
    }
}

Invoke-CheckedCommand -Description 'Docker engine connectivity check' -Command {
    docker info --format '{{.ServerVersion}}' | Out-Null
}

Invoke-CheckedCommand -Description 'Docker Compose availability check' -Command {
    docker compose version | Out-Null
}

if ($NoBuild) {
    Invoke-CheckedCommand -Description 'Docker Compose startup' -Command {
        docker compose up -d
    }
}
else {
    Invoke-CheckedCommand -Description 'Docker Compose startup (with build)' -Command {
        docker compose up --build -d
    }
}

Invoke-CheckedCommand -Description 'Docker Compose status check' -Command {
    docker compose ps
}

Write-Host 'Demo stack is running. Use pnpm demo:down to stop.'
