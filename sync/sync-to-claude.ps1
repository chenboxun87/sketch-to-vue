<#
.SYNOPSIS
  Sync design-to-vue from Cursor global back to Claude canonical (use when edited on Cursor side).
#>
param(
  [string]$SrcPath = "$env:USERPROFILE\.cursor\skills\design-to-vue",
  [string]$DstPath = "$env:USERPROFILE\.claude\skills\design-to-vue",
  [switch]$DryRun
)

$scriptDir = Split-Path $PSCommandPath -Parent
& (Join-Path $scriptDir "sync-to-cursor.ps1") -SrcPath $SrcPath -DstPath $DstPath -DryRun:$DryRun
exit $LASTEXITCODE
