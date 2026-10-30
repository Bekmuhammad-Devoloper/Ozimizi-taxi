# MOVIY TAXI — production deploy from PowerShell.
#   .\deploy\deploy.ps1          # web apps + backend
#   .\deploy\deploy.ps1 apk      # + rebuild and publish both Android APKs
# Runs deploy/deploy.sh with Git Bash (plain `bash` in PowerShell is the WSL launcher).
param([string]$Mode = "")

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$candidates = @(
  "C:\Program Files\Git\bin\bash.exe",
  "C:\Program Files (x86)\Git\bin\bash.exe",
  "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
)
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if ($git) { $candidates += (Join-Path (Split-Path (Split-Path $git -Parent) -Parent) "bin\bash.exe") }
$bash = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $bash) { Write-Error "Git Bash topilmadi. Git for Windows o'rnating: https://git-scm.com/download/win"; exit 1 }

$script = Join-Path $here "deploy.sh"
& $bash -lc ("bash '" + ($script -replace '\\', '/') + "' " + $Mode)
exit $LASTEXITCODE
