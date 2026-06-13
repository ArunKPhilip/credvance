<#
Usage: run this from the repo root in PowerShell:
  .\scripts\load-firebase-creds.ps1 -Path 'F:\cred vance\secrets\service-account.json'

This will set `FIREBASE_SERVICE_ACCOUNT_JSON` in the current session and restart the backend dev server.
#>
param(
  [Parameter(Mandatory=$true)]
  [string]$Path
)

if (-not (Test-Path $Path)) {
  Write-Error "File not found: $Path"
  exit 1
}

$json = Get-Content -Raw $Path
$env:FIREBASE_SERVICE_ACCOUNT_JSON = $json
Write-Host "FIREBASE_SERVICE_ACCOUNT_JSON set for this session."

Write-Host "Restarting backend dev server..."
npx kill-port 4000
npm run dev:api
