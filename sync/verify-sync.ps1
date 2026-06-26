<#
.SYNOPSIS
  Verify SHA-256 checksums match between Claude canonical and Cursor global copy.
#>
param(
  [string]$Source = $(if ($env:DESIGN_TO_VUE_SKILL_ROOT) { $env:DESIGN_TO_VUE_SKILL_ROOT } else { Join-Path $env:USERPROFILE '.claude\skills\design-to-vue' }),
  [string]$Dest   = "$env:USERPROFILE\.cursor\skills\design-to-vue"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $Source)) { Write-Error "Claude source missing: $Source"; exit 1 }
if (-not (Test-Path $Dest))   { Write-Error "Cursor dest missing: $Dest"; exit 2 }

$checksumFile = Join-Path $Source "sync\checksum.txt"
if (-not (Test-Path $checksumFile)) {
  Write-Error "checksum.txt missing; run sync-to-cursor.ps1 first"
  exit 4
}

$lines = Get-Content $checksumFile | Where-Object { $_ -and -not $_.StartsWith("#") }
$failures = @()
foreach ($line in $lines) {
  $parts = $line -split "\s+", 2
  if ($parts.Count -ne 2) { continue }
  $expectedHash = $parts[0]
  $relPath      = $parts[1]
  if ($relPath -eq 'sync\checksum.txt') { continue }

  foreach ($base in @($Source, $Dest)) {
    $full = Join-Path $base $relPath
    if (-not (Test-Path $full)) {
      $failures += "MISSING: $full"
      continue
    }
    $actual = (Get-FileHash $full -Algorithm SHA256).Hash
    if ($actual -ne $expectedHash) {
      $failures += "MISMATCH: $full`n  expected: $expectedHash`n  actual:   $actual"
    }
  }
}

if ($failures.Count -gt 0) {
  Write-Host "verify-sync FAILED:" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  exit 4
}

Write-Host "verify-sync OK: Claude and Cursor design-to-vue are identical." -ForegroundColor Green
exit 0
