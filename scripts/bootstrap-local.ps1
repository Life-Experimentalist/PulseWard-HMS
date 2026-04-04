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

    $maxAttempts = 6
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        try {
            Set-Content -Path $FilePath -Value $lines
            return
        }
        catch {
            if ($attempt -eq $maxAttempts) {
                throw
            }

            Start-Sleep -Milliseconds 250
        }
    }
}

function Get-EnvValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter(Mandatory = $true)]
        [string]$Key
    )

    if (-not (Test-Path $FilePath)) {
        return ''
    }

    $escapedKey = [Regex]::Escape($Key)
    $line = Get-Content -Path $FilePath | Where-Object { $_ -match "^$escapedKey=" } | Select-Object -First 1
    if (-not $line) {
        return ''
    }

    return ($line -replace "^$escapedKey=", '')
}

function Read-YesNo {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Prompt,
        [bool]$DefaultYes = $true
    )

    $suffix = if ($DefaultYes) { '[Y/n]' } else { '[y/N]' }
    $value = Read-Host "$Prompt $suffix"
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultYes
    }

    $normalized = $value.Trim().ToLowerInvariant()
    return $normalized -eq 'y' -or $normalized -eq 'yes'
}

function ConvertTo-CompactJsonString {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Value
    )

    return ($Value | ConvertTo-Json -Compress -Depth 16)
}

function Get-TelegramChatCandidates {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BotToken
    )

    $url = "https://api.telegram.org/bot$BotToken/getUpdates"
    $response = Invoke-RestMethod -Method Get -Uri $url
    if (-not $response.ok -or -not $response.result) {
        return @()
    }

    $seen = @{}
    $candidates = @()

    foreach ($update in $response.result) {
        $chat = $null
        if ($update.message -and $update.message.chat) {
            $chat = $update.message.chat
        }
        elseif ($update.channel_post -and $update.channel_post.chat) {
            $chat = $update.channel_post.chat
        }
        elseif ($update.my_chat_member -and $update.my_chat_member.chat) {
            $chat = $update.my_chat_member.chat
        }

        if (-not $chat -or -not $chat.id) {
            continue
        }

        $id = [string]$chat.id
        if ($seen.ContainsKey($id)) {
            continue
        }

        $displayName = if ($chat.title) {
            [string]$chat.title
        }
        elseif ($chat.username) {
            [string]$chat.username
        }
        else {
            ([string]$chat.first_name + ' ' + [string]$chat.last_name).Trim()
        }

        $seen[$id] = $true
        $candidates += [PSCustomObject]@{
            Id = $id
            Type = [string]$chat.type
            Name = $displayName
            Username = [string]$chat.username
        }
    }

    return $candidates
}

function Resolve-TelegramChatId {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BotToken
    )

    try {
        $candidates = Get-TelegramChatCandidates -BotToken $BotToken
    }
    catch {
        Write-Host "Could not query Telegram getUpdates: $($_.Exception.Message)"
        return ''
    }

    if ($candidates.Count -eq 0) {
        Write-Host 'No Telegram chat was detected yet for this bot.'
        Write-Host 'Send /start or any message to your bot from the target account, then press Enter to retry.'
        [void](Read-Host 'Press Enter to retry now')
        try {
            $candidates = Get-TelegramChatCandidates -BotToken $BotToken
        }
        catch {
            Write-Host "Retry failed: $($_.Exception.Message)"
            return ''
        }
    }

    if ($candidates.Count -eq 0) {
        return ''
    }

    if ($candidates.Count -eq 1) {
        Write-Host "Detected Telegram chat automatically: $($candidates[0].Id) [$($candidates[0].Type)] $($candidates[0].Name)"
        return $candidates[0].Id
    }

    Write-Host 'Multiple Telegram chats found. Choose one:'
    for ($index = 0; $index -lt $candidates.Count; $index++) {
        $item = $candidates[$index]
        Write-Host ("  {0}) {1} [{2}] {3}" -f ($index + 1), $item.Id, $item.Type, $item.Name)
    }

    $selected = Read-Host 'Enter number, or press Enter to type chat id manually'
    if ([string]::IsNullOrWhiteSpace($selected)) {
        return ''
    }

    $number = 0
    if ([int]::TryParse($selected, [ref]$number)) {
        if ($number -ge 1 -and $number -le $candidates.Count) {
            return $candidates[$number - 1].Id
        }
    }

    return ''
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

    $existingJwtSecret = Get-EnvValue -FilePath $envPath -Key 'JWT_SECRET'
    $replaceJwtSecret = $true
    if (-not $NonInteractive -and -not [string]::IsNullOrWhiteSpace($existingJwtSecret)) {
        $replaceJwtSecret = Read-YesNo -Prompt 'Generate and replace JWT_SECRET now?' -DefaultYes $true
    }

    $jwtSecret = ''
    if ($replaceJwtSecret) {
        $jwtSecret = New-JwtSecret
    }

    Set-EnvValue -FilePath $envPath -Key 'DB_HOST' -Value 'localhost'
    Set-EnvValue -FilePath $envPath -Key 'DB_PORT' -Value '5432'
    Set-EnvValue -FilePath $envPath -Key 'DB_NAME' -Value 'pulseward'
    Set-EnvValue -FilePath $envPath -Key 'DB_USER' -Value 'pulseward_local'
    Set-EnvValue -FilePath $envPath -Key 'DB_PASSWORD' -Value 'change_me_local_only'

    Set-EnvValue -FilePath $envPath -Key 'PLATFORM_DEFAULT_TENANT_KEY' -Value $TenantKey
    Set-EnvValue -FilePath $envPath -Key 'PULSEWARD_STRICT_TENANT_KEY' -Value $TenantKey
    if ($replaceJwtSecret) {
        Set-EnvValue -FilePath $envPath -Key 'JWT_SECRET' -Value $jwtSecret
    }

    if (-not $NonInteractive) {
        Write-Host ''
        Write-Host 'Strict tenant mode:'
        Write-Host '  PLATFORM_DEFAULT_TENANT_KEY = default active tenant for local flows.'
        Write-Host '  PULSEWARD_STRICT_TENANT_KEY = only this tenant config is allowed during strict validation.'

        $emailPassword = Read-Host 'EMAIL_PASSWORD (leave blank to keep current value)'
        if (-not [string]::IsNullOrWhiteSpace($emailPassword)) {
            Set-EnvValue -FilePath $envPath -Key 'EMAIL_PASSWORD' -Value $emailPassword.Trim()
        }

        Write-Host ''
        Write-Host 'Integration credential setup (optional unless you use that channel):'

        if (Read-YesNo -Prompt 'Configure Telegram now? (Recommended for demo)' -DefaultYes $true) {
            Write-Host 'Expected bot token format: 123456789:AA...'
            $telegramBotToken = Read-Host 'Telegram bot token'
            if (-not [string]::IsNullOrWhiteSpace($telegramBotToken)) {
                $detectedChatId = Resolve-TelegramChatId -BotToken $telegramBotToken.Trim()
                if ([string]::IsNullOrWhiteSpace($detectedChatId)) {
                    Write-Host 'Could not auto-detect Telegram chat id.'
                    Write-Host 'Expected chat id example: 8654870262 (private) or -1001234567890 (group/channel)'
                    $detectedChatId = Read-Host 'Enter chat id manually, or leave blank to keep existing chat id'
                    if ([string]::IsNullOrWhiteSpace($detectedChatId)) {
                        $existingTelegramRaw = Get-EnvValue -FilePath $envPath -Key 'INTEGRATION_TELEGRAM_CREDENTIALS'
                        try {
                            $existingTelegram = $existingTelegramRaw | ConvertFrom-Json
                            $detectedChatId = [string]$existingTelegram.chatId
                        }
                        catch {
                            $detectedChatId = ''
                        }
                    }
                }

                $telegramPayload = ConvertTo-CompactJsonString -Value ([PSCustomObject]@{
                    botToken = $telegramBotToken.Trim()
                    chatId = [string]$detectedChatId
                })
                Set-EnvValue -FilePath $envPath -Key 'INTEGRATION_TELEGRAM_CREDENTIALS' -Value $telegramPayload
            }
        }

        Write-Host ''
        Write-Host 'INTEGRATION_WEBHOOK_SIGNING_SECRET (optional)'
        Write-Host '  Purpose: HMAC secret used to verify webhook payload signatures and prevent spoofed requests.'
        Write-Host '  Expected JSON: {"signingSecret":"a-long-random-secret"}'
        $webhookSecret = Read-Host 'Webhook signing secret value (leave blank to keep current)'
        if (-not [string]::IsNullOrWhiteSpace($webhookSecret)) {
            $webhookPayload = ConvertTo-CompactJsonString -Value ([PSCustomObject]@{
                signingSecret = $webhookSecret.Trim()
            })
            Set-EnvValue -FilePath $envPath -Key 'INTEGRATION_WEBHOOK_SIGNING_SECRET' -Value $webhookPayload
        }

        $integrationPrompts = @(
            [PSCustomObject]@{
                Key = 'INTEGRATION_EMAIL_SMTP_CREDENTIALS'
                Description = 'Optional unless email channel is enabled.'
                Example = '{"host":"smtp.gmail.com","port":587,"secure":false,"user":"your@email.com","pass":"app-password","from":"your@email.com"}'
            },
            [PSCustomObject]@{
                Key = 'INTEGRATION_WHATSAPP_CREDENTIALS'
                Description = 'Optional unless WhatsApp Cloud API is enabled.'
                Example = '{"accessToken":"...","phoneNumberId":"...","senderNumber":"..."}'
            },
            [PSCustomObject]@{
                Key = 'INTEGRATION_GOOGLE_CALENDAR_CREDENTIALS'
                Description = 'Optional unless Google Calendar integration is enabled.'
                Example = '{"accessToken":"...","calendarId":"primary"}'
            },
            [PSCustomObject]@{
                Key = 'INTEGRATION_APPLE_CALENDAR_CREDENTIALS'
                Description = 'Optional unless Apple bridge integration is enabled.'
                Example = '{"bridgeEndpoint":"https://...","apiKey":"optional"}'
            },
            [PSCustomObject]@{
                Key = 'INTEGRATION_OUTLOOK_CALENDAR_CREDENTIALS'
                Description = 'Optional unless Outlook integration is enabled.'
                Example = '{"accessToken":"...","userId":"..."}'
            },
            [PSCustomObject]@{
                Key = 'INTEGRATION_ICS_CREDENTIALS'
                Description = 'Optional unless ICS bridge integration is enabled.'
                Example = '{"bridgeEndpoint":"https://...","apiKey":"optional"}'
            }
        )

        foreach ($prompt in $integrationPrompts) {
            Write-Host ''
            Write-Host "$($prompt.Key)"
            Write-Host "  $($prompt.Description)"
            Write-Host "  Expected JSON: $($prompt.Example)"
            $value = Read-Host 'Enter JSON (leave blank to keep current)'
            if (-not [string]::IsNullOrWhiteSpace($value)) {
                try {
                    [void]($value.Trim() | ConvertFrom-Json)
                    Set-EnvValue -FilePath $envPath -Key $prompt.Key -Value $value.Trim()
                }
                catch {
                    Write-Warning "$($prompt.Key) was skipped because the value is not valid JSON."
                }
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
    if ($replaceJwtSecret) {
        Write-Host 'JWT_SECRET was generated and written to .env'
    }
    else {
        Write-Host 'JWT_SECRET was left unchanged in .env'
    }
    Write-Host 'Strict tenant mode is enabled through PULSEWARD_STRICT_TENANT_KEY'
}
finally {
    Pop-Location
}
