$ErrorActionPreference = 'Stop'

Write-Host 'Stopping PulseWard demo stack...'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is not installed or not available in PATH.'
}

$null = docker compose version
docker compose down --remove-orphans

Write-Host 'Demo stack has been stopped.'
