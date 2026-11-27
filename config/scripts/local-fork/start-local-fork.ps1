<#
.SYNOPSIS
  Builds this Orca fork from the current checkout and starts it on Windows.

.DESCRIPTION
  -Mode Dev (default): runs `pnpm dev`. Uses the isolated dev profile (%APPDATA%\orca-dev),
  so it can run next to an installed Orca. Ends with Ctrl+C.

  -Mode Packaged: runs `pnpm build:unpack` and starts dist\win-unpacked\Orca.exe.
  This is the real packaged app and shares the profile of the installed Orca (%APPDATA%\orca),
  so every running Orca must be closed first; otherwise the launch only focuses the running one.

.PARAMETER Mode
  Dev or Packaged.

.PARAMETER SkipInstall
  Skips `pnpm install`, even when node_modules is missing or older than pnpm-lock.yaml.

.PARAMETER SkipBuild
  Packaged only: starts the existing dist\win-unpacked\Orca.exe without rebuilding.

.EXAMPLE
  pwsh config/scripts/local-fork/start-local-fork.ps1
.EXAMPLE
  pwsh config/scripts/local-fork/start-local-fork.ps1 -Mode Packaged
#>
[CmdletBinding()]
param(
  [ValidateSet('Dev', 'Packaged')]
  [string]$Mode = 'Dev',
  [switch]$SkipInstall,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
Set-Location $repoRoot

function Invoke-Step {
  param([string]$Title, [string[]]$PnpmArgs)
  Write-Host "`n==> $Title (pnpm $($PnpmArgs -join ' '))" -ForegroundColor Cyan
  & pnpm @PnpmArgs
  if ($LASTEXITCODE -ne 0) {
    throw "'pnpm $($PnpmArgs -join ' ')' failed with exit code $LASTEXITCODE."
  }
}

# --- Prerequisites ---------------------------------------------------------
$packageJson = Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$wantedNodeMajor = [int]($packageJson.engines.node -replace '[^\d].*$', '')
$wantedPnpm = ($packageJson.packageManager -replace '^pnpm@', '') -replace '\+.*$', ''

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js not found. Install Node $wantedNodeMajor (e.g. 'fnm install $wantedNodeMajor; fnm use $wantedNodeMajor')."
}
$nodeMajor = [int]((node --version) -replace '^v(\d+).*$', '$1')
if ($nodeMajor -ne $wantedNodeMajor) {
  Write-Warning "Node $(node --version) is active, the repo expects Node $wantedNodeMajor. Native modules may fail to build (fix: 'fnm use $wantedNodeMajor')."
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw "pnpm not found. Install it with 'npm install -g pnpm@$wantedPnpm' and rerun."
}
$pnpmVersion = (pnpm --version).Trim()
if ($pnpmVersion -ne $wantedPnpm) {
  Write-Warning "pnpm $pnpmVersion is active, the repo pins pnpm $wantedPnpm."
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$commit = (git rev-parse --short HEAD).Trim()
$dirty = if (git status --porcelain) { ' (uncommitted changes included)' } else { '' }
Write-Host "Orca fork: $branch @ $commit$dirty, mode $Mode" -ForegroundColor Green

# --- Dependencies ----------------------------------------------------------
# Why: pnpm writes node_modules\.modules.yaml even when postinstall fails, so track success separately.
$installStamp = Join-Path $repoRoot 'node_modules\.local-fork-install-ok'
$lockFile = Join-Path $repoRoot 'pnpm-lock.yaml'
$needsInstall = -not (Test-Path $installStamp) -or
  ((Get-Item $lockFile).LastWriteTimeUtc -gt (Get-Item $installStamp).LastWriteTimeUtc)
if ($needsInstall -and -not $SkipInstall) {
  # Why: postinstall rebuilds native modules (node-pty etc.) and needs the VS C++ build tools.
  Invoke-Step 'Install dependencies' @('install', '--frozen-lockfile')
  Set-Content -Path $installStamp -Value (Get-Date -Format o)
}

# --- Build and start -------------------------------------------------------
if ($Mode -eq 'Dev') {
  Invoke-Step 'Start dev build (Ctrl+C to quit)' @('dev')
  return
}

$exePath = Join-Path $repoRoot 'dist\win-unpacked\Orca.exe'
# Why: same appId and profile as the installed Orca; its single-instance lock would swallow this launch.
$running = Get-Process -Name 'Orca' -ErrorAction SilentlyContinue
if ($running) {
  $paths = ($running | ForEach-Object { $_.Path } | Where-Object { $_ } | Sort-Object -Unique) -join "`n  "
  throw "Orca is running and shares the packaged profile. Close it first, then rerun:`n  $paths"
}

if (-not $SkipBuild) {
  Invoke-Step 'Build packaged app (typecheck, native, electron-builder --dir)' @('build:unpack')
}
if (-not (Test-Path $exePath)) {
  throw "Packaged app not found at $exePath. Run without -SkipBuild."
}

Write-Host "`n==> Starting $exePath" -ForegroundColor Cyan
Write-Warning 'The packaged fork still checks the upstream update feed (stablyai/orca). Accepting an update there replaces the fork with upstream.'
Start-Process -FilePath $exePath -WorkingDirectory (Split-Path $exePath)
