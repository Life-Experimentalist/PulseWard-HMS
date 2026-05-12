$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Get-NotificationServicePort {
    $portValue = $env:NOTIFICATION_SERVICE_PORT
    if ([string]::IsNullOrWhiteSpace($portValue)) {
        $portValue = $env:PORT
    }

    if ([string]::IsNullOrWhiteSpace($portValue)) {
        return 5102
    }

    $parsedPort = 0
    if (-not [int]::TryParse($portValue, [ref]$parsedPort)) {
        return 5102
    }

    if ($parsedPort -lt 1 -or $parsedPort -gt 65535) {
        return 5102
    }

    return $parsedPort
}

function Get-ListeningProcessIdForPort {
    param(
        [int]$Port
    )

    try {
        $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($null -eq $listeners) {
            return $null
        }

        $listener = $listeners | Select-Object -First 1
        if ($null -eq $listener) {
            return $null
        }

        return [int]$listener.OwningProcess
    }
    catch {
        return $null
    }
}

function Get-ProcessDetails {
    param(
        [int]$ProcessId
    )

    $name = "unknown"
    $commandLine = ""

    try {
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
        $name = $process.ProcessName
    }
    catch {
    }

    try {
        $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
        $commandLine = [string]$cim.CommandLine
    }
    catch {
    }

    return @{
        Name        = $name
        CommandLine = $commandLine
    }
}

function Test-IsNotificationServiceProcess {
    param(
        [string]$CommandLine
    )

    $value = [string]$CommandLine
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $false
    }

    return ($value -match "services[\\/]+notification-service[\\/]+src")
}

$port = Get-NotificationServicePort
$existingPid = Get-ListeningProcessIdForPort -Port $port

if ($null -ne $existingPid) {
    $details = Get-ProcessDetails -ProcessId $existingPid
    $isSameService = Test-IsNotificationServiceProcess -CommandLine $details.CommandLine

    if ($isSameService) {
        Write-Host "Notification Service appears to already be running on port $port (PID $existingPid)."
        Write-Host "Process: $($details.Name)"
        $answer = Read-Host "Stop existing Notification Service and continue here? (Y/N)"

        if ($answer -match "^(?i)y(es)?$") {
            Stop-Process -Id $existingPid -Force -ErrorAction Stop
            Write-Host "Stopped PID $existingPid. Continuing startup..."
        }
        else {
            Write-Host "Keeping existing service process. Startup cancelled."
            exit 0
        }
    }
    else {
        Write-Error (
            "Port {0} is in use by a different process (PID {1}, Name {2}). " +
            "This script will not terminate non-notification-service processes.\nCommandLine: {3}"
        ) -f $port, $existingPid, $details.Name, ($details.CommandLine -replace "\r?\n", " ")
        exit 1
    }
}

Write-Host "Starting Notification Service on port $port..."
& node "services/notification-service/src"
exit $LASTEXITCODE
