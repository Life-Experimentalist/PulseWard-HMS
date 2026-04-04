param(
    [string]$BaseUrl = "http://localhost:5103/api/v1"
)

$ErrorActionPreference = 'Stop'

function Invoke-DemoRequest {
    param(
        [string]$Method,
        [string]$Url,
        [object]$Body
    )

    if ($null -eq $Body) {
        return Invoke-RestMethod -Method $Method -Uri $Url -ContentType 'application/json'
    }

    $payload = $Body | ConvertTo-Json -Depth 8
    return Invoke-RestMethod -Method $Method -Uri $Url -ContentType 'application/json' -Body $payload
}

Write-Host "Running OPD rudimentary demo against: $BaseUrl"

try {
    $null = Invoke-RestMethod -Method 'GET' -Uri "$BaseUrl/appointments" -ContentType 'application/json'
}
catch {
    Write-Host "Unable to reach appointment-service at $BaseUrl"
    Write-Host 'Start appointment-service first with: pnpm run start:appointment'
    Write-Host 'If using Docker mapped port, run with: -BaseUrl "http://localhost:8083/api/v1"'
    exit 1
}

$tenantKey = 'citycare-hospital'
$patientId = 'demo-patient-001'
$clinicianId = 'demo-clinician-001'

$opdCreateBody = @{
    actorRole         = 'frontdesk'
    tenantKey         = $tenantKey
    patientId         = $patientId
    clinicianId       = $clinicianId
    visitReason       = 'fever and follow-up consultation'
    triageLevel       = 'high'
    visitType         = 'walk-in'
    requestedDateTime = [DateTime]::UtcNow.AddMinutes(30).ToString('o')
    notes             = 'Demo intake created from PowerShell runner'
    createAppointment = $true
}

$opdCreate = Invoke-DemoRequest -Method 'POST' -Url "$BaseUrl/opd/entries" -Body $opdCreateBody
$opdEntryId = $opdCreate.opdEntry.id
$appointmentId = $opdCreate.appointmentDraft.id

Write-Host "Created OPD intake: $opdEntryId"
Write-Host "Created appointment draft: $appointmentId"

$opdList = Invoke-DemoRequest -Method 'GET' -Url "$BaseUrl/opd/entries?tenantKey=$tenantKey&triageLevel=high&limit=10" -Body $null
Write-Host "Filtered OPD entries returned: $($opdList.returned)"

try {
    $blockedUpdateBody = @{
        actorRole = 'patient'
        status    = 'completed'
    }

    $null = Invoke-DemoRequest -Method 'PUT' -Url "$BaseUrl/appointments/$appointmentId" -Body $blockedUpdateBody
    Write-Host 'Expected role-blocked update but request unexpectedly succeeded.'
}
catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 403) {
        Write-Host 'Role-scoped access check verified: patient update was blocked (403).'
    }
    else {
        throw
    }
}

$allowedUpdateBody = @{
    actorRole = 'operations'
    status    = 'scheduled'
}

$allowedUpdate = Invoke-DemoRequest -Method 'PUT' -Url "$BaseUrl/appointments/$appointmentId" -Body $allowedUpdateBody
Write-Host "Allowed update succeeded. Appointment status: $($allowedUpdate.status)"

Write-Host 'OPD rudimentary demo completed successfully.'

