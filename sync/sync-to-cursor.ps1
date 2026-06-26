<#
.SYNOPSIS
  Sync design-to-vue skill from Claude canonical source to Cursor global copy.
.EXITCODE
  0 success | 1 source missing | 2 dest mkdir failed | 3 copy failed | 5 reverse drift
#>
param(
  [string]$SrcPath = $(if ($env:DESIGN_TO_VUE_SKILL_ROOT) { $env:DESIGN_TO_VUE_SKILL_ROOT } else { Join-Path $env:USERPROFILE '.claude\skills\design-to-vue' }),
  [string]$DstPath = "$env:USERPROFILE\.cursor\skills\design-to-vue",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $SrcPath)) {
  Write-Error "Source not found: $SrcPath"
  exit 1
}

try {
  if (-not (Test-Path $DstPath)) {
    New-Item -ItemType Directory -Path $DstPath -Force | Out-Null
  }
} catch {
  Write-Error "Failed to create dest: $_"
  exit 2
}

$excludeDirs = @('.git', 'node_modules')

function Get-RelFiles($root) {
  Get-ChildItem -Path $root -Recurse -File |
    Where-Object {
      $rel = $_.FullName.Substring($root.Length).TrimStart('\')
      -not ($excludeDirs | Where-Object { $rel -like "$_\*" -or $rel -like "*\$_\*" })
    } |
    ForEach-Object { $_.FullName.Substring($root.Length).TrimStart('\') }
}

$srcFiles = Get-RelFiles $SrcPath
$dstFiles = if (Test-Path $DstPath) { Get-RelFiles $DstPath } else { @() }

$reverseDrift = $dstFiles | Where-Object { $srcFiles -notcontains $_ -and $_ -ne 'sync\checksum.txt' }
if ($reverseDrift.Count -gt 0) {
  Write-Warning "Reverse drift detected (files in Cursor not in Claude source):"
  $reverseDrift | ForEach-Object { Write-Warning "  $_" }
  Write-Warning "Merge to Claude source first, or run sync-to-claude.ps1."
  exit 5
}

if (-not $DryRun) {
  $xd = ($excludeDirs | ForEach-Object { "/XD"; $_ }) -join ' '
  cmd /c "robocopy `"$SrcPath`" `"$DstPath`" /MIR /XD .git node_modules /NFL /NDL /NJH /NJS /NC /NS /NP"
  $rc = $LASTEXITCODE
  if ($rc -ge 8) {
    Write-Error "robocopy failed with code $rc"
    exit 3
  }
}

$checksumPath = Join-Path $SrcPath "sync\checksum.txt"
$lines = @("# design-to-vue SHA-256 checksums", "# generated: $(Get-Date -Format o)", "# canonical: ~/.claude/skills/design-to-vue", "")
$srcFiles | Where-Object { $_ -ne 'sync\checksum.txt' } | Sort-Object | ForEach-Object {
  $full = Join-Path $SrcPath $_
  if (Test-Path $full) {
    $hash = (Get-FileHash $full -Algorithm SHA256).Hash
    $lines += "$hash  $_"
  }
}
if (-not $DryRun) {
  $syncDir = Join-Path $SrcPath "sync"
  if (-not (Test-Path $syncDir)) { New-Item -ItemType Directory -Path $syncDir -Force | Out-Null }
  Set-Content -Path $checksumPath -Value $lines -Encoding UTF8
  $destChecksum = Join-Path $DstPath "sync\checksum.txt"
  $destSyncDir = Split-Path $destChecksum -Parent
  if (-not (Test-Path $destSyncDir)) { New-Item -ItemType Directory -Path $destSyncDir -Force | Out-Null }
  Set-Content -Path $destChecksum -Value $lines -Encoding UTF8
}

Write-Host "Sync OK: $($srcFiles.Count) files mirrored Claude -> Cursor."

if (-not $DryRun) {
  $verifyScript = Join-Path (Split-Path $PSCommandPath -Parent) "verify-sync.ps1"
  if (Test-Path $verifyScript) {
    & $verifyScript
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
}

exit 0
