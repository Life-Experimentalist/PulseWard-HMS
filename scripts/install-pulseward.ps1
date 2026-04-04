param(
    [string]$RepositoryUrl = 'https://github.com/Life-Experimentalist/PulseWard-HMS.git',
    [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git is required but was not found in PATH.'
}

$defaultPath = Join-Path $HOME 'PulseWard-HMS'
$destination = Read-Host "Install path (default: $defaultPath)"
if ([string]::IsNullOrWhiteSpace($destination)) {
    $destination = $defaultPath
}

$tenantKey = Read-Host 'Tenant key (default: citycare-hospital)'
if ([string]::IsNullOrWhiteSpace($tenantKey)) {
    $tenantKey = 'citycare-hospital'
}

if (-not (Test-Path $destination)) {
    Write-Host "Cloning repository into $destination"
    git clone $RepositoryUrl $destination
    if ($LASTEXITCODE -ne 0) {
        throw 'git clone failed.'
    }
}

Push-Location $destination
try {
    Write-Host 'Syncing repository...'
    git fetch origin
    if ($LASTEXITCODE -ne 0) {
        throw 'git fetch failed.'
    }

    git checkout $Branch
    if ($LASTEXITCODE -ne 0) {
        throw "git checkout $Branch failed."
    }

    git pull origin $Branch
    if ($LASTEXITCODE -ne 0) {
        throw "git pull origin $Branch failed."
    }

    Write-Host 'Running bootstrap setup...'
    & (Join-Path $destination 'scripts/bootstrap-local.ps1') -TenantKey $tenantKey
    if ($LASTEXITCODE -ne 0) {
        throw 'bootstrap-local.ps1 failed.'
    }
}
finally {
    Pop-Location
}

Write-Host 'PulseWard installation completed.'
Write-Host "Path: $destination"
