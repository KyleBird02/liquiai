#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Test script for Liquibase CLI setup on Windows
    
.DESCRIPTION
    Validates that all required credentials are set and runs a dry-run CLI test
    
.PARAMETER DryRun
    If $true, run without creating a PR (default: $true)
    
.PARAMETER App
    Application name (default: "trade-service")
    
.PARAMETER Sprint
    Sprint name (default: "sprint-42")
    
.PARAMETER Author
    Author name (default: "kyle")
    
.EXAMPLE
    .\test-cli-setup.ps1
    
.EXAMPLE
    .\test-cli-setup.ps1 -App myapp -Sprint sprint-50 -Author myname -DryRun:$false
#>

param(
    [bool]$DryRun = $true,
    [string]$App = "trade-service",
    [string]$Sprint = "sprint-42",
    [string]$Author = "kyle"
)

$ErrorActionPreference = "Stop"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Liquibase CLI Setup Test" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# ============ Check .env file ============
Write-Host "1. Checking for .env file..." -ForegroundColor Yellow

$envPath = Join-Path (Split-Path $PSScriptRoot) ".env"
if (Test-Path $envPath) {
    Write-Host "   ✓ Found .env at: $envPath" -ForegroundColor Green
    # Load .env file
    $envContent = Get-Content $envPath | Where-Object { $_ -match '^\s*[^#=]+=[^=]+$' }
    foreach ($line in $envContent) {
        $parts = $line -split '=', 2
        if ($parts.Count -eq 2) {
            $key = $parts[0].Trim()
            $value = $parts[1].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
    Write-Host "   ✓ Loaded environment variables from .env" -ForegroundColor Green
} else {
    Write-Host "   �  No .env file found. You can copy .env.example to .env" -ForegroundColor Yellow
}

# ============ Check required credentials ============
Write-Host ""
Write-Host "2. Checking required credentials..." -ForegroundColor Yellow

$requiredVars = @(
    "OPENROUTER_API_KEY",
    "OPENROUTER_MODEL",
    "GITHUB_TOKEN",
    "GITHUB_REPO_OWNER",
    "GITHUB_REPO_NAME",
    "DEV_DB_CONNECTION_STRING"
)

$missingVars = @()
foreach ($var in $requiredVars) {
    $value = [Environment]::GetEnvironmentVariable($var)
    if ($value) {
        $display = if ($var -match "API_KEY|TOKEN") { $value.Substring(0, 10) + "..." } else { $value }
        Write-Host "   ✓ $var = $display" -ForegroundColor Green
    } else {
        Write-Host "   ✗ $var (MISSING)" -ForegroundColor Red
        $missingVars += $var
    }
}

if ($missingVars.Count -gt 0) {
    Write-Host ""
    Write-Host "❌ Missing required environment variables:" -ForegroundColor Red
    foreach ($var in $missingVars) {
        Write-Host "   - $var" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Please set them in your .env file or environment. See CLI_SETUP.md for details." -ForegroundColor Yellow
    exit 1
}

# ============ Check CLI build ============
Write-Host ""
Write-Host "3. Checking CLI build..." -ForegroundColor Yellow

$cliPath = Join-Path $PSScriptRoot "cli"
$distPath = Join-Path $cliPath "dist"

if (Test-Path $distPath) {
    Write-Host "   ✓ CLI dist folder exists" -ForegroundColor Green
} else {
    Write-Host "   ℹ CLI not built yet. Building now..." -ForegroundColor Cyan
    Push-Location $cliPath
    npm run build
    Pop-Location
    Write-Host "   ✓ CLI built successfully" -ForegroundColor Green
}

# ============ Run test ============
Write-Host ""
Write-Host "4. Running CLI test..." -ForegroundColor Yellow

$args = @(
    "./dist/index.js",
    "schema",
    "--app", $App,
    "--sprint", $Sprint,
    "--author", $Author,
    "--change", "add nullable settlement_date DATE column to trades table"
)

if ($DryRun) {
    $args += "--dry-run"
    Write-Host "   Running in DRY-RUN mode (no PR will be created)" -ForegroundColor Cyan
} else {
    Write-Host "   Running in LIVE mode (PR will be created)" -ForegroundColor Yellow
    Write-Host "   Press Ctrl+C to cancel..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
}

Push-Location $cliPath
Write-Host ""
Write-Host "Command: node $($args -join ' ')" -ForegroundColor Gray
Write-Host ""

try {
    node @args
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ CLI test passed!" -ForegroundColor Green
        if ($DryRun) {
            Write-Host ""
            Write-Host "✓ Dry-run completed successfully. Ready to create real PRs!" -ForegroundColor Green
        }
    } else {
        Write-Host ""
        Write-Host "✗ CLI test failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "✗ Error running CLI: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Test Complete" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Review the changeset output above" -ForegroundColor White
Write-Host "  2. Try a real PR: .\test-cli-setup.ps1 -DryRun `$false" -ForegroundColor White
Write-Host "  3. See CLI_SETUP.md for more examples" -ForegroundColor White
