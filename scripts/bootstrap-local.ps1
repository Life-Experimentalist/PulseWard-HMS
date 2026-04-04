param(
    [string]$TenantKey = 'citycare-hospital',
    [switch]$NonInteractive,
    [switch]$NoBuild,
    [switch]$SkipComposeUp
)

$ErrorActionPreference = 'Stop'

function New-JwtSecret {
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Set-EnvValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter(Mandatory = $true)]
        [string]$Key,
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string]$Value
    )

    $escapedKey = [Regex]::Escape($Key)
    $lines = Get-Content -Path $FilePath -ErrorAction SilentlyContinue

    if (-not $lines) {
        $lines = @()
    }

    $replaced = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^$escapedKey=") {
            $lines[$i] = "$Key=$Value"
            $replaced = $true
            break
        }
    }

    if (-not $replaced) {
        $lines += "$Key=$Value"
    }

    Set-Content -Path $FilePath -Value $lines
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot

try {
    $envExamplePath = Join-Path $projectRoot '.env.example'
    $envPath = Join-Path $projectRoot '.env'

    if (-not (Test-Path $envExamplePath)) {
        throw '.env.example was not found in the project root.'
    }

    if (-not (Test-Path $envPath)) {
        Copy-Item $envExamplePath $envPath
        Write-Host '.env created from .env.example'
    }

    if (-not $NonInteractive) {
        $tenantInput = Read-Host "Tenant key (default: $TenantKey)"
        if (-not [string]::IsNullOrWhiteSpace($tenantInput)) {
            $TenantKey = $tenantInput.Trim()
        }
    }

    if ([string]::IsNullOrWhiteSpace($TenantKey)) {
        throw 'Tenant key cannot be empty.'
    }

    $jwtSecret = New-JwtSecret

    Set-EnvValue -FilePath $envPath -Key 'DB_HOST' -Value 'localhost'
    Set-EnvValue -FilePath $envPath -Key 'DB_PORT' -Value '5432'
    Set-EnvValue -FilePath $envPath -Key 'DB_NAME' -Value 'pulseward'
    Set-EnvValue -FilePath $envPath -Key 'DB_USER' -Value 'pulseward_local'
    Set-EnvValue -FilePath $envPath -Key 'DB_PASSWORD' -Value 'change_me_local_only'

    Set-EnvValue -FilePath $envPath -Key 'PLATFORM_DEFAULT_TENANT_KEY' -Value $TenantKey
    Set-EnvValue -FilePath $envPath -Key 'PULSEWARD_STRICT_TENANT_KEY' -Value $TenantKey
    Set-EnvValue -FilePath $envPath -Key 'JWT_SECRET' -Value $jwtSecret

    if (-not $NonInteractive) {
        $emailPassword = Read-Host 'EMAIL_PASSWORD (leave blank to keep current value)'
        if (-not [string]::IsNullOrWhiteSpace($emailPassword)) {
            Set-EnvValue -FilePath $envPath -Key 'EMAIL_PASSWORD' -Value $emailPassword.Trim()
        }

        $integrationKeys = @(
            'INTEGRATION_TELEGRAM_CREDENTIALS',
            'INTEGRATION_EMAIL_SMTP_CREDENTIALS',
            'INTEGRATION_WEBHOOK_SIGNING_SECRET',
            'INTEGRATION_WHATSAPP_CREDENTIALS',
            'INTEGRATION_GOOGLE_CALENDAR_CREDENTIALS',
            'INTEGRATION_APPLE_CALENDAR_CREDENTIALS',
            'INTEGRATION_OUTLOOK_CALENDAR_CREDENTIALS',
            'INTEGRATION_ICS_CREDENTIALS'
        )

        Write-Host ''
        Write-Host 'Paste integration JSON values one-by-one. Leave blank to keep existing values.'

        foreach ($key in $integrationKeys) {
            $value = Read-Host "$key"
            if (-not [string]::IsNullOrWhiteSpace($value)) {
                Set-EnvValue -FilePath $envPath -Key $key -Value $value.Trim()
            }
        }
    }

    $defaultConfigPath = Join-Path $projectRoot 'config/integrations/default-integration-config.json'
    $tenantConfigPath = Join-Path $projectRoot "config/integrations/$TenantKey.integration.json"

    $tenantConfig = Get-Content -Path $defaultConfigPath -Raw | ConvertFrom-Json
    $tenantConfig.tenantKey = $TenantKey

    $tenantConfig | ConvertTo-Json -Depth 32 | Set-Content -Path $tenantConfigPath

    Write-Host ''
    Write-Host "Tenant config written to: $tenantConfigPath"
    Write-Host 'Running strict integration validation...'

    pnpm run integrations:validate
    if ($LASTEXITCODE -ne 0) {
        throw 'Integration validation failed after tenant bootstrap.'
    }

    $setupParams = @{}
    if ($NoBuild) {
        $setupParams.NoBuild = $true
    }
    if ($SkipComposeUp) {
        $setupParams.SkipComposeUp = $true
    }

    & (Join-Path $projectRoot 'scripts/setup.ps1') @setupParams
    if ($LASTEXITCODE -ne 0) {
        throw 'scripts/setup.ps1 failed.'
    }

    Write-Host ''
    Write-Host 'Bootstrap completed successfully.'
    Write-Host "Default tenant key: $TenantKey"
    Write-Host 'JWT_SECRET was generated and written to .env'
    Write-Host 'Strict tenant mode is enabled through PULSEWARD_STRICT_TENANT_KEY'
}
finally {
    Pop-Location
}
