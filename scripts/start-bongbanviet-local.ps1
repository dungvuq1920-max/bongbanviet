$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Port = 3001
$Url = "http://localhost:$Port/local.html"
$TempDir = Join-Path $ProjectRoot 'temp'
$OutLog = Join-Path $TempDir 'local-server-3001.out.log'
$ErrLog = Join-Path $TempDir 'local-server-3001.err.log'

New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

function Test-LocalServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

if (-not (Test-LocalServer)) {
  $runningNode = Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq 'node.exe' -and
      $_.CommandLine -match [regex]::Escape($ProjectRoot) -and
      $_.CommandLine -match 'server\.js'
    } |
    Select-Object -First 1

  if (-not $runningNode) {
    Start-Process `
      -FilePath 'cmd.exe' `
      -ArgumentList '/c', 'set PORT=3001&&npm run dev' `
      -WorkingDirectory $ProjectRoot `
      -RedirectStandardOutput $OutLog `
      -RedirectStandardError $ErrLog `
      -WindowStyle Hidden | Out-Null
  }

  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    if (Test-LocalServer) { break }
    Start-Sleep -Milliseconds 500
  }
}

Start-Process $Url
