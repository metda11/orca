<#
.SYNOPSIS
  One-click start of this Orca fork: activates Node 24 (via fnm, or an installed Node 24 if fnm is missing) for this session, then builds and starts.

.DESCRIPTION
  Passes all arguments to config/scripts/local-fork/start-local-fork.ps1
  (e.g. -Mode Packaged, -SkipInstall, -SkipBuild). The global Node install stays untouched.

.EXAMPLE
  .\start.ps1
.EXAMPLE
  .\start.ps1 -Mode Packaged
#>
$ErrorActionPreference = 'Stop'

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
  if ($LASTEXITCODE -ne 0) { throw 'Could not activate Node 24 with fnm.' }
} else {
  # Why: without fnm, fall back to an installed Node 24 (PATH first, then the winget LTS folder) instead of failing.
  $nodeMajor = { param($exe) if ($exe) { [int](((& $exe -v) -replace '^v', '').Split('.')[0]) } else { 0 } }
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ((& $nodeMajor $node.Source) -ne 24) {
    $node24 = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\OpenJS.NodeJS*\node-v24*-win-x64" -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending | Select-Object -First 1
    if (-not $node24) {
      throw "Neither fnm nor Node 24 found. Install fnm with 'winget install --id Schniz.fnm -e' and rerun."
    }
    $env:PATH = "$($node24.FullName);$env:PATH"
  }
  Write-Host "fnm not found; using Node $(node -v)." -ForegroundColor Yellow
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  $pnpmVersion = ((Get-Content (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).packageManager -replace '^pnpm@', '') -replace '\+.*$', ''
  npm install -g "pnpm@$pnpmVersion"
  if ($LASTEXITCODE -ne 0) { throw "Could not install pnpm@$pnpmVersion." }
}

if (-not $env:VCINSTALLDIR) {
  # Why: node-gyp's PowerShell VS lookup fails on this machine; a VS dev shell sets VCINSTALLDIR so it is skipped.
  $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
  $vsPath = if (Test-Path $vswhere) {
    & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  }
  if (-not $vsPath) {
    throw "No Visual Studio C++ build tools found. Install them with: winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override `"--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended`""
  }
  # Why: Launch-VsDevShell calls vswhere by name, which is not on PATH by default.
  $env:PATH = "$(Split-Path $vswhere);$env:PATH"
  & (Join-Path $vsPath 'Common7\Tools\Launch-VsDevShell.ps1') -Arch amd64 -HostArch amd64 -SkipAutomaticLocation | Out-Null
  if (-not $env:VCINSTALLDIR) { throw "VS dev shell did not set VCINSTALLDIR ($vsPath)." }
}

& (Join-Path $PSScriptRoot 'config\scripts\local-fork\start-local-fork.ps1') @args
