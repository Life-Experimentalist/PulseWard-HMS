# Validate.ps1

# This script is intended to validate the project setup for the PulseWard Hospital Management System.
# It checks for the presence of required files and directories, ensuring that the environment is correctly configured.

# Define the required directories and files
$requiredDirectories = @(
    "apps",
    "services",
    "packages",
    "contracts",
    "docs",
    "governance",
    "security",
    "infra",
    "scripts"
)

$requiredFiles = @(
    ".env.example",
    "docker-compose.yml",
    "package.json",
    "pnpm-workspace.yaml",
    "README.md"
)

# Function to check for required directories
function Check-Directories {
    foreach ($dir in $requiredDirectories) {
        if (-Not (Test-Path $dir)) {
            Write-Host "Missing directory: $dir" -ForegroundColor Red
        } else {
            Write-Host "Directory exists: $dir" -ForegroundColor Green
        }
    }
}

# Function to check for required files
function Check-Files {
    foreach ($file in $requiredFiles) {
        if (-Not (Test-Path $file)) {
            Write-Host "Missing file: $file" -ForegroundColor Red
        } else {
            Write-Host "File exists: $file" -ForegroundColor Green
        }
    }
}

# Run the validation checks
Check-Directories
Check-Files

# Additional validation logic can be added here as needed
Write-Host "Validation complete." -ForegroundColor Cyan