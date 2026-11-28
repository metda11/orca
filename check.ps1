<#
.SYNOPSIS
  Prüft die Fork-Bereiche (Agent-Profile, Claude-Plugins, Automations, unsere RPC-Teile, Settings): Typecheck und Tests.

.DESCRIPTION
  Aktiviert wie start.ps1 Node 24 per fnm für diese Sitzung. Vitest läuft mit
  --exclude '.claude/**', sonst zieht es .claude/worktrees mit und läuft in Out-of-Memory.

.PARAMETER SkipTypecheck
  Nur die Tests.

.PARAMETER Lint
  Zusätzlich pnpm run lint (bekannter Upstream-Rest: verify:localization-extraction).

.PARAMETER SkipInstall
  Kein pnpm install, auch wenn node_modules fehlt.

.EXAMPLE
  .\check.ps1
.EXAMPLE
  .\check.ps1 -SkipTypecheck
#>
[CmdletBinding()]
param(
  [switch]$SkipTypecheck,
  [switch]$Lint,
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$fnm = Get-Command fnm -ErrorAction SilentlyContinue
if (-not $fnm) {
  # Why: winget adds fnm to PATH only for new shells.
  $fnm = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Schniz.fnm*\fnm.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1
}
if ($fnm) {
  $fnmPath = if ($fnm -is [System.Management.Automation.CommandInfo]) { $fnm.Source } else { $fnm.FullName }
  & $fnmPath env --shell powershell | Out-String | Invoke-Expression
  & $fnmPath use 24 --install-if-missing
  if ($LASTEXITCODE -ne 0) { throw 'Node 24 ließ sich mit fnm nicht aktivieren.' }
}
foreach ($tool in 'node', 'pnpm') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "$tool nicht im PATH. Erst .\start.ps1 laufen lassen, das richtet Node und pnpm ein."
  }
}

function Invoke-Step {
  param([string]$Title, [scriptblock]$Run)
  Write-Host "> $Title" -ForegroundColor Cyan
  & $Run
  if ($LASTEXITCODE -ne 0) { throw "$Title fehlgeschlagen (Exit $LASTEXITCODE)" }
}

if (-not $SkipInstall -and -not (Test-Path -LiteralPath 'node_modules')) {
  Invoke-Step 'pnpm install' { pnpm install }
}

if (-not $SkipTypecheck) {
  Invoke-Step 'pnpm run typecheck' { pnpm run typecheck }
}

if ($Lint) {
  Write-Host '> pnpm run lint (bekannter Upstream-Rest: verify:localization-extraction)' -ForegroundColor Cyan
  pnpm run lint
  if ($LASTEXITCODE -ne 0) { Write-Warning "Lint meldet Fehler (Exit $LASTEXITCODE), siehe oben." }
}

Invoke-Step 'vitest (Fork-Bereiche)' {
  npx vitest run --config config/vitest.config.ts --exclude '.claude/**' `
    src/main/automations src/main/claude src/shared/agent-profile `
    src/main/runtime/rpc/methods/claude-plugins src/main/runtime/rpc/methods/automations `
    src/main/runtime/rpc/methods/agent-launch src/main/runtime/rpc/methods/lazy-rpc-method-registry.test.ts `
    src/shared/settings
}

Write-Host 'Alle Prüfungen grün.' -ForegroundColor Green
