param(
    [Alias('SkipNpmInstall')]
    [switch]$SkipInstall,
    [switch]$NoBuild,
    [switch]$SkipComposeUp,
    [switch]$ComposeAllServices
)

$ErrorActionPreference = 'Stop'

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Description,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Command
    )

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed (exit code: $LASTEXITCODE)."
    }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot

try {
    Write-Host 'PulseWard setup started...'
    Write-Host "Project root: $projectRoot"

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker is not installed or not available in PATH.'
    }

    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
            throw 'pnpm is not available and corepack is missing. Install Node.js 22+ and enable corepack.'
        }

        Write-Host 'pnpm not found. Enabling corepack and activating pnpm 9.15.0...'
        Invoke-CheckedCommand -Description 'corepack enable' -Command {
            corepack enable
        }
        Invoke-CheckedCommand -Description 'corepack prepare pnpm@9.15.0 --activate' -Command {
            corepack prepare pnpm@9.15.0 --activate
        }
    }

    Invoke-CheckedCommand -Description 'Docker engine connectivity check' -Command {
        docker info --format '{{.ServerVersion}}' | Out-Null
    }

    Invoke-CheckedCommand -Description 'Docker Compose availability check' -Command {
        docker compose version | Out-Null
    }

    if (-not $SkipInstall) {
        Write-Host 'Installing workspace dependencies with pnpm...'
        Invoke-CheckedCommand -Description 'pnpm install --frozen-lockfile' -Command {
            pnpm install --frozen-lockfile
        }
    }
    else {
        Write-Host 'Skipping dependency installation because -SkipInstall was provided.'
    }

    $envExamplePath = Join-Path $projectRoot '.env.example'
    $envPath = Join-Path $projectRoot '.env'
    if ((Test-Path $envExamplePath) -and -not (Test-Path $envPath)) {
        Copy-Item $envExamplePath $envPath
        Write-Host '.env was missing; created from .env.example.'
    }

    if (-not $SkipComposeUp) {
        if ($ComposeAllServices) {
            Write-Host 'Compose mode: full stack (all services)'
            if ($NoBuild) {
                Invoke-CheckedCommand -Description 'docker compose up -d' -Command {
                    docker compose up -d
                }
            }
            else {
                Invoke-CheckedCommand -Description 'docker compose up --build -d' -Command {
                    docker compose up --build -d
                }
            }

            Invoke-CheckedCommand -Description 'docker compose ps' -Command {
                docker compose ps
            }
        }
        else {
            Write-Host 'Compose mode: local-core (Postgres + Mongo only)'
            Invoke-CheckedCommand -Description 'docker compose up -d pulseward-postgres pulseward-mongo' -Command {
                docker compose up -d pulseward-postgres pulseward-mongo
            }
            Invoke-CheckedCommand -Description 'docker compose ps pulseward-postgres pulseward-mongo' -Command {
                docker compose ps pulseward-postgres pulseward-mongo
            }
            Write-Host 'Tip: Use -ComposeAllServices only when Dockerfiles exist for every service in docker-compose.yml.'
        }
    }
    else {
        Write-Host 'Skipping docker compose startup because -SkipComposeUp was provided.'
    }

    Write-Host ''
    Write-Host 'Setup completed successfully.'
    Write-Host 'Next commands:'
    Write-Host '  pnpm run start:auth'
    Write-Host '  pnpm run start:notification'
    Write-Host '  pnpm run start:appointment'
    Write-Host '  pnpm run start:operations:dev'
    Write-Host '  pnpm run test:smoke'
}
finally {
    Pop-Location
}
