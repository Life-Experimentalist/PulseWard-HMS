param(
    [switch]$SkipNpmInstall,
    [switch]$NoBuild,
    [switch]$SkipComposeUp
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

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw 'npm is not installed or not available in PATH.'
    }

    Invoke-CheckedCommand -Description 'Docker engine connectivity check' -Command {
        docker info --format '{{.ServerVersion}}' | Out-Null
    }

    Invoke-CheckedCommand -Description 'Docker Compose availability check' -Command {
        docker compose version | Out-Null
    }

    if (-not $SkipNpmInstall) {
        Write-Host 'Installing root dependencies with npm ci...'
        Invoke-CheckedCommand -Description 'npm ci (root)' -Command {
            npm ci
        }

        Write-Host 'Installing app dependencies...'
        Invoke-CheckedCommand -Description 'npm run install:apps' -Command {
            npm run install:apps
        }
    }
    else {
        Write-Host 'Skipping npm installs because -SkipNpmInstall was provided.'
    }

    $envExamplePath = Join-Path $projectRoot '.env.example'
    $envPath = Join-Path $projectRoot '.env'
    if ((Test-Path $envExamplePath) -and -not (Test-Path $envPath)) {
        Copy-Item $envExamplePath $envPath
        Write-Host '.env was missing; created from .env.example.'
    }

    if (-not $SkipComposeUp) {
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
        Write-Host 'Skipping docker compose startup because -SkipComposeUp was provided.'
    }

    Write-Host ''
    Write-Host 'Setup completed successfully.'
    Write-Host 'Next commands:'
    Write-Host '  npm run start:auth'
    Write-Host '  npm run start:notification'
    Write-Host '  npm run start:appointment'
    Write-Host '  npm run start:operations:dev'
    Write-Host '  npm run test:smoke'
}
finally {
    Pop-Location
}