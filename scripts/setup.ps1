# PowerShell Script for Setting Up PulseWard Hospital Management System

# This script automates the setup of the PulseWard Hospital Management System environment.
# It installs necessary dependencies, sets up the project structure, and prepares the environment for development.

# Define the project root directory
$projectRoot = "C:\Path\To\PulseWard-HMS"

# Function to install Node.js dependencies
function Install-NodeDependencies {
    Write-Host "Installing Node.js dependencies..."
    cd "$projectRoot"
    npm install
}

# Function to set up Python virtual environments for services
function Setup-PythonEnvironments {
    Write-Host "Setting up Python virtual environments for services..."
    $services = @(
        "api-gateway",
        "auth-service",
        "patient-service",
        "appointment-service",
        "ehr-service",
        "billing-service",
        "pharmacy-service",
        "lab-service",
        "notification-service",
        "ai-project-manager-agent"
    )

    foreach ($service in $services) {
        $servicePath = Join-Path -Path $projectRoot -ChildPath "services\$service"
        if (Test-Path $servicePath) {
            Write-Host "Setting up virtual environment for $service..."
            cd $servicePath
            uv venv --python 3.13 .venv
            .\.venv\Scripts\Activate.ps1
            uv pip install -e .
        }
    }
}

# Function to validate the setup
function Validate-Setup {
    Write-Host "Validating the setup..."
    # Add validation logic here (e.g., checking if services are running)
}

# Main script execution
Install-NodeDependencies
Setup-PythonEnvironments
Validate-Setup

Write-Host "Setup completed successfully!"