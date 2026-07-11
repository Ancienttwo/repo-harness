$ErrorActionPreference = "Stop"

$PackageName = "repo-harness"
$PackageVersion = if ($env:REPO_HARNESS_VERSION) { $env:REPO_HARNESS_VERSION } else { "latest" }
$MinimumBunVersion = [Version]"1.1.35"
$BunInstall = if ($env:BUN_INSTALL) { $env:BUN_INSTALL } else { Join-Path $HOME ".bun" }
$BunBin = Join-Path $BunInstall "bin"
$OriginalPath = $env:PATH

function Add-BunToPath {
  if (Test-Path $BunBin) {
    $env:PATH = "$BunBin$([System.IO.Path]::PathSeparator)$env:PATH"
  }
}

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-BunVersion {
  if (-not (Test-Command "bun")) {
    return $null
  }
  $RawVersion = (& bun --version 2>$null)
  if ($RawVersion -match '^(\d+)\.(\d+)\.(\d+)') {
    return [Version]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
  }
  return $null
}

if ($env:REPO_HARNESS_DRY_RUN -eq "1") {
  Write-Host "DRY RUN: would ensure Bun >= $MinimumBunVersion, install $PackageName@$PackageVersion, and verify repo-harness --version."
  exit 0
}

Add-BunToPath

$BunVersion = Get-BunVersion
if ($null -eq $BunVersion -or $BunVersion -lt $MinimumBunVersion) {
  $BunAction = if ($null -eq $BunVersion) { "Installing" } else { "Upgrading" }
  Write-Host "$BunAction Bun runtime to >= $MinimumBunVersion..."
  Invoke-RestMethod https://bun.sh/install.ps1 | Invoke-Expression
  Add-BunToPath
}

$BunVersion = Get-BunVersion
if ($null -eq $BunVersion -or $BunVersion -lt $MinimumBunVersion) {
  $FoundBunVersion = if ($null -eq $BunVersion) { "unknown" } else { $BunVersion.ToString() }
  throw "Bun >= $MinimumBunVersion is required (found: $FoundBunVersion)."
}

$PackageSpec = "$PackageName@$PackageVersion"
Write-Host "Installing $PackageSpec with Bun..."
& bun add -g $PackageSpec

Add-BunToPath
if (-not (Test-Command "repo-harness")) {
  throw "repo-harness is not on PATH after installation."
}

$Version = (& repo-harness --version)
if (-not $Version) {
  throw "repo-harness installed, but version readback failed."
}

Write-Host "repo-harness $Version installed."
Write-Host ""
Write-Host "Next:"
Write-Host "  repo-harness install"
Write-Host "  repo-harness adopt --dry-run"

$PathSep = [System.IO.Path]::PathSeparator
if ("$PathSep$OriginalPath$PathSep" -notlike "*$PathSep$BunBin$PathSep*") {
  Write-Host ""
  Write-Host "To use repo-harness in new shells, add to your PATH:"
  Write-Host "  $BunBin"
}
