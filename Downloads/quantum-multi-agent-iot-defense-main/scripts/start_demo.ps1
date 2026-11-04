$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot "backend"
$frontendRoot = Join-Path $projectRoot "frontend"

Start-Process -FilePath (Get-Command python).Source `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000" `
    -WorkingDirectory $backendRoot -WindowStyle Hidden
Start-Process -FilePath (Get-Command npm.cmd).Source `
    -ArgumentList "run", "dev" -WorkingDirectory $frontendRoot -WindowStyle Hidden

Write-Host "FarmFlow backend: http://127.0.0.1:8000"
Write-Host "FarmFlow SOC:     http://127.0.0.1:3000"
